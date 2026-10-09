// Shared process/browser boundary check. This file has no MathJax, Node, or DOM
// runtime import; worker output is data until this check succeeds.
import type { MathConversion, MathMetrics, MathSvgElement } from './engine.ts';
import { MATH_FINGERPRINT_INPUTS, MATH_LIMITS, MATH_SVG_GEOMETRY, MathPolicyError } from './policy.ts';
import { mathSvgInkBounds } from './svg-ink.ts';

const encoder = new TextEncoder();
const allowed: Record<MathSvgElement['tag'], ReadonlySet<string>> = {
  svg: new Set(['xmlns', 'width', 'height', 'role', 'focusable', 'viewBox']),
  g: new Set(['stroke', 'fill', 'stroke-width', 'transform', 'data-mml-node', 'data-mjx-texclass']),
  path: new Set(['data-c', 'd', 'transform', 'fill', 'stroke', 'stroke-width']),
  rect: new Set(['width', 'height', 'x', 'y', 'transform', 'fill', 'stroke', 'stroke-width']),
};
const numberPattern = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?';
const numberRe = new RegExp(`^${numberPattern}$`);
const exRe = new RegExp(`^(${numberPattern})ex$`);
const transformRe = /^(?:(?:translate|scale|rotate|matrix)\([0-9eE.,+\-\s]+\)\s*)+$/;
const pathRe = /^[MmLlHhVvCcSsQqTtAaZz0-9.eE,+\-\s]+$/;

function invalid(message: string): never {
  throw new MathPolicyError('E_MATH_INVALID', `Invalid math worker output: ${message}`);
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${name} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], name: string): void {
  const actual = Object.keys(value).sort();
  if (actual.length !== keys.length || actual.some((key, index) => key !== [...keys].sort()[index])) invalid(`${name} has unexpected fields`);
}

function finiteNumber(value: string, name: string): number {
  if (!numberRe.test(value)) invalid(`${name} is not numeric`);
  const number = Number(value);
  if (!Number.isFinite(number)) invalid(`${name} is not finite`);
  return number;
}

function exNumber(value: unknown, name: string): number {
  if (typeof value !== 'string') invalid(`${name} is missing`);
  const match = exRe.exec(value);
  if (!match?.[1]) invalid(`${name} must use ex units`);
  return finiteNumber(match[1], name);
}

const sizeQuantization = MATH_SVG_GEOMETRY.unitsPerEx * 10 ** -MATH_SVG_GEOMETRY.exDecimals / 2 +
  10 ** -MATH_SVG_GEOMETRY.viewBoxDecimals / 2 + 1e-6;
const baselineQuantization = MATH_SVG_GEOMETRY.unitsPerEx * 10 ** -MATH_SVG_GEOMETRY.exDecimals +
  10 ** -MATH_SVG_GEOMETRY.viewBoxDecimals / 2 + 1e-6;

/** Check the pinned font's viewBox against its rounded ex dimensions and em baseline. */
export function validateSvgGeometry(metrics: MathMetrics, attrs: Record<string, string>): void {
  const { widthEm, heightEm, depthEm, ascentEm } = metrics;
  if (![widthEm, heightEm, depthEm, ascentEm].every(v => typeof v === 'number' && Number.isFinite(v) && v <= MATH_LIMITS.maxDimensionEm) ||
      widthEm <= 0 || heightEm <= 0 || depthEm < 0 || ascentEm <= 0 ||
      Math.abs(heightEm - depthEm - ascentEm) > 1e-9) invalid('invalid geometry');
  const widthEx = exNumber(attrs.width, 'width');
  const heightEx = exNumber(attrs.height, 'height');
  if (Math.abs(widthEx / 2 - widthEm) > 1e-9 || Math.abs(heightEx / 2 - heightEm) > 1e-9) {
    invalid('metrics differ from SVG dimensions');
  }
  if (typeof attrs.viewBox !== 'string') invalid('missing SVG viewBox');
  const parts = attrs.viewBox.trim().split(/[\s,]+/);
  if (parts.length !== 4) invalid('wrong viewBox field count');
  const [x, y, width, height] = parts.map((part, index) => finiteNumber(part, `viewBox[${index}]`));
  if (width! <= 0 || height! <= 0) invalid('invalid viewBox extent');
  const scale = MATH_SVG_GEOMETRY.unitsPerEx;
  if (Math.abs(x!) > sizeQuantization ||
      Math.abs(width! - widthEx * scale) > sizeQuantization ||
      Math.abs(height! - heightEx * scale) > sizeQuantization ||
      Math.abs(y! + ascentEm * 2 * scale) > baselineQuantization ||
      Math.abs(y! + height! - depthEm * 2 * scale) > baselineQuantization) {
    invalid('viewBox differs from SVG dimensions or baseline');
  }
}

function checkAttribute(tag: MathSvgElement['tag'], name: string, value: unknown): void {
  if (typeof value !== 'string' || !allowed[tag].has(name)) invalid(`unsafe ${tag} attribute ${name}`);
  if (name === 'xmlns' && value !== 'http://www.w3.org/2000/svg') invalid('wrong SVG namespace');
  if (name === 'role' && value !== 'img') invalid('wrong SVG role');
  if (name === 'focusable' && value !== 'false') invalid('wrong SVG focusability');
  if (name === 'width' || name === 'height') {
    if (tag === 'svg') exNumber(value, name);
    else finiteNumber(value, name);
  }
  if (name === 'x' || name === 'y' || name === 'stroke-width') finiteNumber(value, name);
  if (name === 'viewBox') {
    const parts = value.trim().split(/[\s,]+/);
    if (parts.length !== 4) invalid('wrong viewBox field count');
    const values = parts.map((part, index) => finiteNumber(part, `viewBox[${index}]`));
    if (values[2]! <= 0 || values[3]! <= 0) invalid('invalid viewBox extent');
  }
  if ((name === 'stroke' || name === 'fill') && value !== 'none' && value !== 'currentColor') invalid('unsafe SVG color');
  if (name === 'transform' && !transformRe.test(value)) invalid('unsafe SVG transform');
  if (name === 'd' && value !== '' && !pathRe.test(value)) invalid('unsafe SVG path');
  if (name === 'data-c' && !/^[0-9A-F]+$/.test(value)) invalid('invalid glyph marker');
  if (name === 'data-mml-node' && !/^[A-Za-z][A-Za-z0-9]*$/.test(value)) invalid('invalid MathML marker');
  if (name === 'data-mjx-texclass' && !/^[A-Z]+$/.test(value)) invalid('invalid TeX class');
}

function xmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function walkSvg(value: unknown, depth: number, cost: { bytes: number; elements: number }): MathSvgElement {
  if (depth > MATH_LIMITS.svgDepth) invalid('SVG nesting limit exceeded');
  const node = record(value, 'SVG node');
  exactKeys(node, ['tag', 'attrs', 'children'], 'SVG node');
  const tag = node.tag;
  if (tag !== 'svg' && tag !== 'g' && tag !== 'path' && tag !== 'rect') invalid('unsupported SVG element');
  if (depth > 0 && tag === 'svg') invalid('nested SVG is unsupported');
  const attrs = record(node.attrs, 'SVG attrs');
  const children = node.children;
  if (!Array.isArray(children)) invalid('SVG children must be an array');
  cost.elements++;
  if (cost.elements > MATH_LIMITS.expressionElements) invalid('SVG element limit exceeded');
  let opening = `<${tag}`;
  for (const [name, attr] of Object.entries(attrs)) {
    checkAttribute(tag, name, attr);
    opening += ` ${name}="${xmlEscape(attr as string)}"`;
  }
  if (attrs['data-mml-node'] === 'merror') invalid('renderer error node');
  if (tag === 'svg') {
    for (const name of ['xmlns', 'width', 'height', 'role', 'focusable', 'viewBox']) {
      if (!(name in attrs)) invalid(`missing SVG ${name}`);
    }
  }
  if (tag === 'path' && !('d' in attrs)) invalid('path has no geometry');
  cost.bytes += encoder.encode(`${opening}></${tag}>`).length;
  if (cost.bytes > MATH_LIMITS.expressionSvgBytes) invalid('SVG byte limit exceeded');
  for (const child of children) walkSvg(child, depth + 1, cost);
  return node as unknown as MathSvgElement;
}

/** Count the final serialized tree, including viewport normalization wrappers. */
export function mathSvgResourceCost(svg: MathSvgElement): { bytes: number; elements: number } {
  const cost = { bytes: 0, elements: 0 };
  walkSvg(svg, 0, cost);
  return cost;
}

/** Recompute painted bounds; a worker cannot attest its own reservation. */
export function validateMathSvgInk(svg: MathSvgElement): void {
  const ink = mathSvgInkBounds(svg);
  if (!ink) return;
  const [x, y, width, height] = svg.attrs.viewBox!.trim().split(/[\s,]+/).map(Number);
  // Only floating-point transform arithmetic is tolerated, not glyph overhang.
  const epsilon = 1e-6;
  if (ink.left < x! - epsilon || ink.top < y! - epsilon ||
      ink.right > x! + width! + epsilon || ink.bottom > y! + height! + epsilon) {
    invalid('painted ink escapes SVG viewport');
  }
}

/** Throws if an IPC/browser-worker conversion is not exactly a bounded, safe SVG result. */
export function validateMathConversionShape(value: unknown, expected: { tex: string; display: boolean }): MathConversion {
  const conversion = record(value, 'conversion');
  exactKeys(conversion, ['source', 'display', 'svg', 'metrics', 'svgBytes', 'elementCount', 'fingerprintInputs'], 'conversion');
  if (conversion.source !== expected.tex || conversion.display !== expected.display ||
      typeof conversion.source !== 'string' || encoder.encode(conversion.source).length > MATH_LIMITS.expressionSourceBytes) invalid('source mismatch');
  const fingerprint = record(conversion.fingerprintInputs, 'fingerprint inputs');
  exactKeys(fingerprint, Object.keys(MATH_FINGERPRINT_INPUTS), 'fingerprint inputs');
  for (const [name, expectedValue] of Object.entries(MATH_FINGERPRINT_INPUTS)) {
    if (fingerprint[name] !== expectedValue) invalid('renderer policy mismatch');
  }
  const metrics = record(conversion.metrics, 'metrics');
  exactKeys(metrics, ['widthEm', 'heightEm', 'depthEm', 'ascentEm'], 'metrics');
  const { widthEm, heightEm, depthEm, ascentEm } = metrics;
  if (![widthEm, heightEm, depthEm, ascentEm].every(v => typeof v === 'number' && Number.isFinite(v))) invalid('invalid geometry');
  const cost = { bytes: 0, elements: 0 };
  const root = walkSvg(conversion.svg, 0, cost);
  if (root.tag !== 'svg') invalid('root is not SVG');
  validateSvgGeometry(metrics as unknown as MathMetrics, root.attrs);
  validateMathSvgInk(root);
  if (!Number.isSafeInteger(conversion.svgBytes) || conversion.svgBytes !== cost.bytes ||
      !Number.isSafeInteger(conversion.elementCount) || conversion.elementCount !== cost.elements) invalid('SVG resource counts differ');
  return value as MathConversion;
}
