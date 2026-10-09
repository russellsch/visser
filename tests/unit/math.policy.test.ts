import { describe, expect, it } from 'vitest';
import { EMPTY_MATH_RESOURCE_TOTAL, insertedMathCost, MATH_INSERTION_ATTRIBUTE_BYTES, MATH_FINGERPRINT_INPUTS, MATH_LIMITS, MATH_SVG_GEOMETRY, MathPolicyError, reserveMathOccurrences } from '../../packages/core/src/math/policy.ts';
import { convertMath } from '../../packages/core/src/math/engine.ts';

describe('math occurrence budget @M11', () => {
  it('reserves runtime decoration before accepting repeated converted SVG', () => {
    const conversion = convertMath('x x x x x x x x x x', false);
    const count = Math.floor(MATH_LIMITS.documentSvgBytes / conversion.svgBytes);
    expect(count).toBeLessThanOrEqual(MATH_LIMITS.documentOccurrences);
    expect(count * conversion.elementCount).toBeLessThanOrEqual(MATH_LIMITS.documentElements);
    expect(() => reserveMathOccurrences(EMPTY_MATH_RESOURCE_TOTAL, conversion, count)).not.toThrow();
    expect(() => reserveMathOccurrences(EMPTY_MATH_RESOURCE_TOTAL, insertedMathCost(conversion), count)).toThrow(/document budget/);
    expect(insertedMathCost(conversion).svgBytes - conversion.svgBytes).toBe(MATH_INSERTION_ATTRIBUTE_BYTES);
    expect(MATH_FINGERPRINT_INPUTS.insertionAttributeBytes).toBe(MATH_INSERTION_ATTRIBUTE_BYTES);
  });
  it('pins the dimension, depth, and font-unit policy into the renderer fingerprint', () => {
    expect(MATH_LIMITS.maxDimensionEm).toBe(4096);
    expect(MATH_LIMITS.svgDepth).toBe(128);
    expect(MATH_FINGERPRINT_INPUTS.maxDimensionEm).toBe(MATH_LIMITS.maxDimensionEm);
    expect(MATH_FINGERPRINT_INPUTS.svgDepth).toBe(MATH_LIMITS.svgDepth);
    expect(MATH_FINGERPRINT_INPUTS.svgUnitsPerEx).toBe(MATH_SVG_GEOMETRY.unitsPerEx);
  });
  it('counts repeated occurrences rather than unique expression keys', () => {
    const cost = { svgBytes: 2000, elementCount: 10 };
    const first = reserveMathOccurrences(EMPTY_MATH_RESOURCE_TOTAL, cost, 700);
    const second = reserveMathOccurrences(first, cost, 300);
    expect(second).toEqual({ svgBytes: 2_000_000, elementCount: 10_000, occurrences: 1000 });
    expect(() => reserveMathOccurrences(second, cost, 1)).toThrow(MathPolicyError);
  });

  it('accepts exact aggregate caps and rejects one unit above each cap', () => {
    expect(reserveMathOccurrences(EMPTY_MATH_RESOURCE_TOTAL,
      { svgBytes: MATH_LIMITS.expressionSvgBytes, elementCount: MATH_LIMITS.expressionElements }, 1))
      .toEqual({ svgBytes: MATH_LIMITS.expressionSvgBytes, elementCount: MATH_LIMITS.expressionElements, occurrences: 1 });
    const bytesNear = { svgBytes: MATH_LIMITS.documentSvgBytes - 1, elementCount: 0, occurrences: 1 };
    expect(reserveMathOccurrences(bytesNear, { svgBytes: 1, elementCount: 0 }, 1).svgBytes).toBe(MATH_LIMITS.documentSvgBytes);
    expect(() => reserveMathOccurrences(bytesNear, { svgBytes: 2, elementCount: 0 }, 1)).toThrow(/document budget/);
    const nodesNear = { svgBytes: 0, elementCount: MATH_LIMITS.documentElements - 1, occurrences: 1 };
    expect(reserveMathOccurrences(nodesNear, { svgBytes: 0, elementCount: 1 }, 1).elementCount).toBe(MATH_LIMITS.documentElements);
    expect(() => reserveMathOccurrences(nodesNear, { svgBytes: 0, elementCount: 2 }, 1)).toThrow(/document budget/);
  });

  it('rejects invalid counts and per-expression values', () => {
    expect(() => reserveMathOccurrences(EMPTY_MATH_RESOURCE_TOTAL, { svgBytes: 1, elementCount: 1 }, -1)).toThrow(/nonnegative/);
    expect(() => reserveMathOccurrences(EMPTY_MATH_RESOURCE_TOTAL, { svgBytes: Number.MAX_SAFE_INTEGER, elementCount: 1 }, 1)).toThrow(/output budget/);
    expect(() => reserveMathOccurrences(EMPTY_MATH_RESOURCE_TOTAL, { svgBytes: 1, elementCount: MATH_LIMITS.expressionElements + 1 }, 1)).toThrow(/output budget/);
  });
});
