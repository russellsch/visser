// These are bounded initial policy limits, not a promise to support every TeX
// expression that fits under the source cap. The caller must count every
// rendered occurrence, including alternate views and derived labels.
export const MATH_LIMITS = Object.freeze({
  expressionSourceBytes: 2048,
  expressionSvgBytes: 256 * 1024,
  expressionElements: 2048,
  svgDepth: 128,
  maxDimensionEm: 4096,
  documentSvgBytes: 8 * 1024 * 1024,
  documentElements: 50_000,
  documentOccurrences: 1000,
});

// Pinned SVG font units and emitted decimal precision, measured against all
// 14 correctness cases plus 1,000 distinct fractions in the W0 corpus.
export const MATH_SVG_GEOMETRY = Object.freeze({ unitsPerEx: 442, exDecimals: 3, viewBoxDecimals: 1 });

// Reserve the union of prose/native root attributes before publication. Each
// numeric spelling is bounded at insertion; units and markup are ASCII. Counting
// the full replacement width/height (without subtracting originals) deliberately
// overestimates the inserted tree and gives every delivery path the same charge.
export const MATH_INSERTION_NUMBER_CHARS = 25;
const numericAllowance = '0'.repeat(MATH_INSERTION_NUMBER_CHARS);
export const MATH_INSERTION_ATTRIBUTE_BYTES = (` width="${numericAllowance}em" height="${numericAllowance}em"` +
  ` style="vertical-align: ${numericAllowance}em;" x="0" y="0" data-vs-generated="" aria-hidden="true" focusable="false"`).length;

// Configuration-only portion of the release fingerprint. Release packaging
// additionally hashes the actual engine, policy, font, and bundle bytes.
export const MATH_FINGERPRINT_INPUTS = Object.freeze({
  engine: '@mathjax/src@4.1.3',
  font: '@mathjax/mathjax-tex-font@4.1.3',
  packages: 'base,ams',
  fontCache: 'none',
  inlineLinebreaks: false,
  emPx: 16,
  exPx: 8,
  containerWidthPx: 1280,
  sourceBytes: MATH_LIMITS.expressionSourceBytes,
  svgBytes: MATH_LIMITS.expressionSvgBytes,
  elements: MATH_LIMITS.expressionElements,
  svgDepth: MATH_LIMITS.svgDepth,
  maxDimensionEm: MATH_LIMITS.maxDimensionEm,
  svgUnitsPerEx: MATH_SVG_GEOMETRY.unitsPerEx,
  svgExDecimals: MATH_SVG_GEOMETRY.exDecimals,
  svgViewBoxDecimals: MATH_SVG_GEOMETRY.viewBoxDecimals,
  inkBounds: 'svg-conservative-union-v1',
  insertionAttributeBytes: MATH_INSERTION_ATTRIBUTE_BYTES,
});

export type MathResourceCost = Readonly<{ svgBytes: number; elementCount: number }>;
export type MathResourceTotal = Readonly<{ svgBytes: number; elementCount: number; occurrences: number }>;

/** Canonical charge for one converted SVG after runtime root decoration. */
export function insertedMathCost(cost: MathResourceCost): MathResourceCost {
  return { svgBytes: cost.svgBytes + MATH_INSERTION_ATTRIBUTE_BYTES, elementCount: cost.elementCount };
}

export class MathPolicyError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'MathPolicyError';
    this.code = code;
  }
}

function boundedInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new MathPolicyError('E_MATH_RESOURCE', `${field} must be a nonnegative safe integer`);
  }
}

export function reserveMathOccurrences(
  total: MathResourceTotal,
  cost: MathResourceCost,
  count: number,
): MathResourceTotal {
  boundedInteger(total.svgBytes, 'total.svgBytes');
  boundedInteger(total.elementCount, 'total.elementCount');
  boundedInteger(total.occurrences, 'total.occurrences');
  boundedInteger(cost.svgBytes, 'cost.svgBytes');
  boundedInteger(cost.elementCount, 'cost.elementCount');
  boundedInteger(count, 'count');
  if (total.svgBytes > MATH_LIMITS.documentSvgBytes ||
      total.elementCount > MATH_LIMITS.documentElements ||
      total.occurrences > MATH_LIMITS.documentOccurrences) {
    throw new MathPolicyError('E_MATH_DOCUMENT_LIMIT', 'Existing math total exceeds the document budget');
  }
  if (cost.svgBytes > MATH_LIMITS.expressionSvgBytes || cost.elementCount > MATH_LIMITS.expressionElements) {
    throw new MathPolicyError('E_MATH_EXPRESSION_LIMIT', 'Math expression exceeds its output budget');
  }
  // Subtraction comparisons avoid unsafe multiplication or integer overflow.
  if (count > MATH_LIMITS.documentOccurrences - total.occurrences ||
      count * cost.svgBytes > MATH_LIMITS.documentSvgBytes - total.svgBytes ||
      count * cost.elementCount > MATH_LIMITS.documentElements - total.elementCount) {
    throw new MathPolicyError('E_MATH_DOCUMENT_LIMIT', 'Math occurrences exceed the document budget');
  }
  return {
    svgBytes: total.svgBytes + count * cost.svgBytes,
    elementCount: total.elementCount + count * cost.elementCount,
    occurrences: total.occurrences + count,
  };
}

export const EMPTY_MATH_RESOURCE_TOTAL: MathResourceTotal = Object.freeze({ svgBytes: 0, elementCount: 0, occurrences: 0 });
