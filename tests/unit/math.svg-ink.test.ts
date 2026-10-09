import { describe, expect, it } from 'vitest';
import type { MathSvgElement } from '../../packages/core/src/math/engine.ts';
import { mathSvgInkBounds } from '../../packages/core/src/math/svg-ink.ts';
import { MathPolicyError } from '../../packages/core/src/math/policy.ts';

const svg = (children: MathSvgElement[], attrs: Record<string, string> = {}): MathSvgElement => ({ tag: 'svg', attrs, children });
const path = (d: string, attrs: Record<string, string> = {}): MathSvgElement => ({ tag: 'path', attrs: { d, ...attrs }, children: [] });
const rect = (attrs: Record<string, string>): MathSvgElement => ({ tag: 'rect', attrs, children: [] });
const group = (children: MathSvgElement[], attrs: Record<string, string> = {}): MathSvgElement => ({ tag: 'g', attrs, children });

function boundsOf(tree: MathSvgElement) {
  const result = mathSvgInkBounds(tree);
  expect(result).toBeDefined();
  return result!;
}

describe('mathSvgInkBounds', () => {
  it('conservatively contains every path command, implicit repeats, and reflected controls', () => {
    const result = boundsOf(svg([path('M1 1 2 2 l3 0 H10 v2 C10 5 12 7 14 2 S18 -4 20 2 Q22 8 24 2 T28 2 A3 2 30 0 1 34 4 z')]));
    expect(result.left).toBeLessThanOrEqual(1);
    expect(result.top).toBeLessThanOrEqual(-4);
    expect(result.right).toBeGreaterThanOrEqual(34);
    expect(result.bottom).toBeGreaterThanOrEqual(8);
  });

  it('composes SVG transform lists with ancestor transforms and transforms rect corners', () => {
    const result = boundsOf(svg([group([rect({ x: '1', y: '2', width: '3', height: '4', transform: 'scale(2 3)' })], { transform: 'translate(10 20) rotate(90)' })]));
    expect(result.left).toBeCloseTo(-8);
    expect(result.top).toBeCloseTo(22);
    expect(result.right).toBeCloseTo(4);
    expect(result.bottom).toBeCloseTo(28);
  });

  it('supports matrix transforms and all relative command forms', () => {
    expect(mathSvgInkBounds(svg([path('M0 0 L1 1', { transform: 'matrix(2 0 0 3 4 5)' })]))).toEqual({ left: 4, top: 5, right: 6, bottom: 8 });
    const result = boundsOf(svg([path('m1 1 1 1 l1 0 h1 v1 c1 1 2 1 3 0 s2 -1 3 0 q1 1 2 0 t2 0 a1 1 0 0 1 2 0 z')]));
    expect(result.left).toBeLessThanOrEqual(1);
    expect(result.right).toBeGreaterThanOrEqual(16);
  });

  it('inherits paint and stroke width, while empty geometry and no paint contribute no phantom bounds', () => {
    const result = boundsOf(svg([group([path('M0 0 L10 0'), path('')], { fill: 'none', stroke: 'currentColor', 'stroke-width': '2' })]));
    expect(result).toEqual({ left: -4, top: -4, right: 14, bottom: 4 });
    expect(mathSvgInkBounds(svg([path(''), rect({ x: '0', y: '0', width: '2', height: '3', fill: 'none', stroke: 'none' })]))).toBeUndefined();
  });

  it('uses the root user coordinate system without applying its viewBox', () => {
    expect(mathSvgInkBounds(svg([rect({ x: '4', y: '5', width: '6', height: '7' })], { viewBox: '100 200 1 1' }))).toEqual({ left: 4, top: 5, right: 10, bottom: 12 });
  });

  it.each([
    svg([path('M0')]),
    svg([path('L0 0')]),
    svg([path('M,0 0')]),
    svg([path('M0 0 L1')]),
    svg([path('M0 0 A2 2 0 2 0 1 1')]),
    svg([path('M0 0 Z 1 2')]),
    svg([{ tag: 'svg', attrs: {}, children: [] }]),
    svg([group([path('M0 0')], { transform: 'translate(1,)' })]),
    svg([rect({ width: '-1', height: '1' })]),
    svg([path('M0 0', { 'stroke-width': '-1' })]),
    svg([path('M0 0', { transform: 'matrix(1 0 0 1 1e309 0)' })]),
  ])('rejects malformed, unsupported, or non-finite geometry', tree => {
    expect(() => mathSvgInkBounds(tree)).toThrow(MathPolicyError);
    expect(() => mathSvgInkBounds(tree)).toThrow(/E_MATH_INVALID|Invalid math SVG ink geometry/);
  });

  it('accepts compact adjacent arc flags while consuming the full arc command', () => {
    const result = boundsOf(svg([path('M0 0 A30 50 0 01162.55 162.45')]));
    expect(result.left).toBeLessThanOrEqual(0);
    expect(result.top).toBeLessThanOrEqual(0);
    expect(result.right).toBeGreaterThanOrEqual(162.55);
    expect(result.bottom).toBeGreaterThanOrEqual(162.45);
  });
});
