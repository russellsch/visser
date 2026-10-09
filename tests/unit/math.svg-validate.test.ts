import { describe, expect, it } from 'vitest';
import { convertMath } from '../../packages/core/src/math/engine.ts';
import type { MathConversion, MathSvgElement } from '../../packages/core/src/math/engine.ts';
import { MATH_LIMITS, MATH_SVG_GEOMETRY } from '../../packages/core/src/math/policy.ts';
import { validateMathConversionShape } from '../../packages/core/src/math/svg-validate.ts';
import { readFileSync } from 'node:fs';

const source = String.raw`\text{cost \$5}`;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const valid = () => clone(convertMath(source, false));
function recount(conversion: MathConversion): MathConversion {
  const encoder = new TextEncoder();
  const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let bytes = 0;
  let elements = 0;
  const walk = (node: MathSvgElement) => {
    elements++;
    const opening = `<${node.tag}${Object.entries(node.attrs).map(([name, value]) => ` ${name}="${escape(value)}"`).join('')}>`;
    bytes += encoder.encode(`${opening}</${node.tag}>`).length;
    node.children.forEach(walk);
  };
  walk(conversion.svg);
  conversion.svgBytes = bytes;
  conversion.elementCount = elements;
  return conversion;
}

function withWidth(widthEm: number): MathConversion {
  const conversion = valid();
  const widthEx = widthEm * 2;
  const viewBox = conversion.svg.attrs.viewBox!.split(' ');
  conversion.metrics.widthEm = widthEm;
  conversion.svg.attrs.width = `${widthEx}ex`;
  viewBox[2] = String(widthEx * MATH_SVG_GEOMETRY.unitsPerEx);
  conversion.svg.attrs.viewBox = viewBox.join(' ');
  return recount(conversion);
}

describe('math worker output boundary @M07 @M11', () => {
  it('validates a near-budget transform list without repeatedly scanning its suffix', () => {
    const conversion = valid();
    conversion.svg.children = [{ tag: 'g', attrs: { transform: 'translate(0)'.repeat(20000) }, children: conversion.svg.children }];
    recount(conversion);
    expect(conversion.svgBytes).toBeLessThan(MATH_LIMITS.expressionSvgBytes);
    expect(validateMathConversionShape(conversion, { tex: source, display: false })).toBe(conversion);
  });

  it('rejects escaping descendant ink even when metrics and resource counts agree', () => {
    const conversion = valid();
    conversion.svg.children.push({ tag: 'rect', attrs: { x: '100000', y: '0', width: '10', height: '10' }, children: [] });
    recount(conversion);
    expect(() => validateMathConversionShape(conversion, { tex: source, display: false })).toThrow(/ink escapes/);
  });

  it('accepts real JSON-transported SVG, including a no-ink space glyph', () => {
    const conversion = valid();
    expect(validateMathConversionShape(conversion, { tex: source, display: false })).toEqual(conversion);
    expect(JSON.stringify(conversion.svg)).toContain('"d":""');
  });

  it('rejects wrong expression, policy, metrics, and asserted resource counts', () => {
    const wrongSource = valid();
    expect(() => validateMathConversionShape(wrongSource, { tex: 'x', display: false })).toThrow(/source mismatch/);
    const wrongPolicy = valid() as unknown as { fingerprintInputs: Record<string, unknown> };
    wrongPolicy.fingerprintInputs.font = 'other';
    expect(() => validateMathConversionShape(wrongPolicy, { tex: source, display: false })).toThrow(/policy mismatch/);
    const wrongMetrics = valid();
    wrongMetrics.metrics.widthEm += 1;
    expect(() => validateMathConversionShape(wrongMetrics, { tex: source, display: false })).toThrow(/dimensions/);
    const wrongBytes = valid();
    wrongBytes.svgBytes--;
    expect(() => validateMathConversionShape(wrongBytes, { tex: source, display: false })).toThrow(/resource counts/);
    const wrongElements = valid();
    wrongElements.elementCount++;
    expect(() => validateMathConversionShape(wrongElements, { tex: source, display: false })).toThrow(/resource counts/);
  });

  it('rejects malformed or active SVG structure', () => {
    const missing = valid();
    missing.svg = {} as typeof missing.svg;
    expect(() => validateMathConversionShape(missing, { tex: source, display: false })).toThrow(/SVG node/);
    const script = valid();
    script.svg.children.push({ tag: 'script' as 'g', attrs: {}, children: [] });
    expect(() => validateMathConversionShape(script, { tex: source, display: false })).toThrow(/unsupported SVG element/);
    const href = valid();
    href.svg.attrs.href = 'https://example.test/';
    expect(() => validateMathConversionShape(href, { tex: source, display: false })).toThrow(/unsafe svg attribute/i);
    const style = valid();
    style.svg.attrs.style = 'background:url(https://example.test/)';
    expect(() => validateMathConversionShape(style, { tex: source, display: false })).toThrow(/unsafe svg attribute/i);
    const cycle = valid();
    cycle.svg.children.push(cycle.svg);
    expect(() => validateMathConversionShape(cycle, { tex: source, display: false })).toThrow(/nested SVG/);
  });

  it('accepts exact 4096 em width and rejects a finite value immediately above it', () => {
    const at = withWidth(MATH_LIMITS.maxDimensionEm);
    expect(validateMathConversionShape(at, { tex: source, display: false })).toBe(at);
    const above = withWidth(MATH_LIMITS.maxDimensionEm + 0.001);
    expect(() => validateMathConversionShape(above, { tex: source, display: false })).toThrow(/invalid geometry/);
  });

  it('accepts SVG nesting depth 128 and rejects depth 129 with honest byte/node counts', () => {
    const make = (depth: number) => {
      const conversion = valid();
      const path: MathSvgElement = { tag: 'path', attrs: { d: 'M0 0' }, children: [] };
      let nested = path;
      for (let i = 1; i < depth; i++) nested = { tag: 'g', attrs: {}, children: [nested] };
      conversion.svg.children = [nested];
      return recount(conversion);
    };
    const at = make(MATH_LIMITS.svgDepth);
    expect(at.elementCount).toBe(129);
    expect(validateMathConversionShape(at, { tex: source, display: false })).toBe(at);
    const above = make(MATH_LIMITS.svgDepth + 1);
    expect(above.elementCount).toBe(130);
    expect(() => validateMathConversionShape(above, { tex: source, display: false })).toThrow(/nesting limit/);
  });

  it('rejects finite viewBox magnitudes inconsistent with rounded SVG dimensions', () => {
    const hugeWidth = valid();
    const widthParts = hugeWidth.svg.attrs.viewBox!.split(' ');
    widthParts[2] = '1e300';
    hugeWidth.svg.attrs.viewBox = widthParts.join(' ');
    recount(hugeWidth);
    expect(() => validateMathConversionShape(hugeWidth, { tex: source, display: false })).toThrow(/viewBox differs/);
    const hugeOrigin = valid();
    const originParts = hugeOrigin.svg.attrs.viewBox!.split(' ');
    originParts[1] = '-1e300';
    hugeOrigin.svg.attrs.viewBox = originParts.join(' ');
    recount(hugeOrigin);
    expect(() => validateMathConversionShape(hugeOrigin, { tex: source, display: false })).toThrow(/viewBox differs/);
  });

  it('keeps every authored corpus formula valid in inline and display modes', () => {
    const cases = JSON.parse(readFileSync(new URL('../../docs/validation/math-rendering/correctness-corpus.json', import.meta.url), 'utf8'))
      .cases as Array<{ id: string; tex: string }>;
    expect(cases).toHaveLength(14);
    for (const { id, tex } of cases) for (const display of [false, true]) {
      const conversion = clone(convertMath(tex, display));
      expect(() => validateMathConversionShape(conversion, { tex, display }), id).not.toThrow();
    }
  });
});
