// Authored-occurrence math accounting for state diagrams. This deliberately
// has no DB or renderer dependency; provenance reconciliation is its input.
import { EMPTY_MATH_RESOURCE_TOTAL, MathPolicyError, reserveMathOccurrences, type MathResourceTotal } from '../math/policy.ts';
import { validateMermaidMathLabel, type MermaidMathExpression, type MermaidMathText } from './math.ts';
import type { StateLabelRecord, StateLabels } from './state-labels.ts';
import type { StateProvenanceResult } from './state-provenance.ts';
import { MermaidSourceCoordinates, type LocatedSourceInterval } from './source-coordinates.ts';
import { ProvenanceText } from './source-provenance.ts';
import { mapSharedMermaidMathInput } from './flowchart-math.ts';
import { sequenceMathTextReplacements } from './sequence-text.ts';

export type StateMathExpression = MermaidMathExpression & { origins: readonly LocatedSourceInterval[]; synthetic: boolean };
export type StateMathCost = Readonly<{ svgBytes: number; elementCount: number; occurrences: number }>;
export type StateMathVariant = Readonly<{ input: ProvenanceText; parts: readonly (MermaidMathText | StateMathExpression)[]; cost: StateMathCost }>;
export type StateMathRecord = Readonly<{
  recordIndex: number; role: StateLabelRecord['role']; semanticValue: string;
  mappedInput: ProvenanceText; variants: readonly StateMathVariant[]; parts: readonly (MermaidMathText | StateMathExpression)[];
  cost: StateMathCost; intervals: readonly LocatedSourceInterval[]; synthetic: boolean;
}>;

export class LocatedStateMathError extends MathPolicyError {
  readonly intervals: readonly LocatedSourceInterval[];
  readonly synthetic: boolean;
  readonly startLine: number | undefined;
  readonly startByte: number | undefined;
  readonly endByte: number | undefined;
  readonly recordIndex: number;
  readonly stage: string;
  constructor(error: MathPolicyError, record: Pick<StateLabelRecord, 'recordIndex' | 'role' | 'intervals' | 'synthetic'>, stage: string) {
    super(error.code, `state ${record.role} record ${record.recordIndex} (${stage}): ${error.message}`);
    this.name = 'LocatedStateMathError'; this.recordIndex = record.recordIndex; this.stage = stage;
    this.intervals = Object.freeze(record.intervals.map(interval => Object.freeze({ ...interval })));
    this.synthetic = record.synthetic;
    this.startLine = this.intervals[0]?.startLine; this.startByte = this.intervals[0]?.startByte; this.endByte = this.intervals[0]?.endByte;
  }
}

const EXPLICIT = new Set<StateLabelRecord['role']>(['state.description', 'note', 'transition', 'accTitle', 'accDescr']);

/** Sum independently selected per-record costs and check the existing document limits. */
export function addStateMathCosts(total: MathResourceTotal, cost: StateMathCost): MathResourceTotal {
  reserveMathOccurrences(total, { svgBytes: 0, elementCount: 0 }, 0);
  reserveMathOccurrences(cost, { svgBytes: 0, elementCount: 0 }, 0);
  const next = { svgBytes: total.svgBytes + cost.svgBytes, elementCount: total.elementCount + cost.elementCount,
    occurrences: total.occurrences + cost.occurrences };
  if (!Number.isSafeInteger(next.svgBytes) || !Number.isSafeInteger(next.elementCount) || !Number.isSafeInteger(next.occurrences)) {
    throw new MathPolicyError('E_MATH_RESOURCE', 'state math total exceeds safe integer range');
  }
  reserveMathOccurrences(next, { svgBytes: 0, elementCount: 0 }, 0);
  return next;
}

export function maxStateMathCost(costs: readonly StateMathCost[]): StateMathCost;
export function maxStateMathCost(left: StateMathCost, right: StateMathCost): StateMathCost;
export function maxStateMathCost(first: readonly StateMathCost[] | StateMathCost, right?: StateMathCost): StateMathCost {
  const costs = Array.isArray(first) ? first : [first, right!];
  for (const cost of costs) reserveMathOccurrences(cost, { svgBytes: 0, elementCount: 0 }, 0);
  return Object.freeze(costs.reduce((max, cost) => ({ svgBytes: Math.max(max.svgBytes, cost.svgBytes),
    elementCount: Math.max(max.elementCount, cost.elementCount), occurrences: Math.max(max.occurrences, cost.occurrences) }),
    { svgBytes: 0, elementCount: 0, occurrences: 0 }));
}

/** Mirrors sanitizer serialization recovery only inside already-delimited equations. */
function restoreFormulaEntities(value: ProvenanceText): ProvenanceText {
  const chunks: ProvenanceText[] = []; let cursor = 0;
  for (const edit of sequenceMathTextReplacements(value.text)) {
    const part = value.slice(edit.start, edit.end);
    chunks.push(value.slice(cursor, edit.start), part.replace(0, part.length, edit.text)); cursor = edit.end;
  }
  chunks.push(value.slice(cursor, value.length));
  return value.slice(0, 0).concatAll(chunks);
}

/** Exact sanitizer→state DB→shared label transformation used for validation. */
export function mapStateMathInput(
  value: ProvenanceText, role: StateLabelRecord['role'], sanitize: (mapped: ProvenanceText) => ProvenanceText = value => value,
): ProvenanceText {
  let mapped = sanitize(value);
  if (role === 'accDescr') mapped = mapped.replaceRegex(/\n\s+/g, () => '\n');
  mapped = mapSharedMermaidMathInput(mapped);
  return restoreFormulaEntities(mapped);
}

function isEligible(record: StateLabelRecord, promoted: ReadonlySet<number>): boolean {
  return EXPLICIT.has(record.role) || (record.role === 'state.implicit' && promoted.has(record.recordIndex));
}
function variantCost(parts: readonly (MermaidMathText | StateMathExpression)[]): StateMathCost {
  return Object.freeze(parts.reduce((cost, part) => part.kind === 'math' ?
    { svgBytes: cost.svgBytes + part.mathmlBytes, elementCount: cost.elementCount + part.elementCount, occurrences: cost.occurrences + 1 } : cost,
  { svgBytes: 0, elementCount: 0, occurrences: 0 }));
}

export function validateStateMathRecords(
  original: string, labels: StateLabels, provenance: StateProvenanceResult,
  sanitize: (mapped: ProvenanceText) => ProvenanceText = value => value,
): { records: readonly StateMathRecord[]; total: MathResourceTotal } {
  const byIndex = new Map(labels.records.map(record => [record.recordIndex, record]));
  for (const [index] of provenance.recordVariants) if (!byIndex.has(index)) throw new MathPolicyError('E_MATH_INVALID', `state provenance variant has unknown record ${index}`);
  const promoted = new Set(provenance.promotedImplicitRecordIndices);
  for (const index of promoted) if (byIndex.get(index)?.role !== 'state.implicit') {
    throw new MathPolicyError('E_MATH_INVALID', `state provenance promoted non-implicit record ${index}`);
  }
  const coordinates = new MermaidSourceCoordinates(original);
  const records: StateMathRecord[] = [];
  let total = EMPTY_MATH_RESOURCE_TOTAL;
  for (const record of labels.records) {
    if (!isEligible(record, promoted)) continue;
    const values: readonly (readonly [ProvenanceText, (mapped: ProvenanceText) => ProvenanceText])[] = [
      [record.mappedValue, sanitize],
      ...(provenance.recordVariants.get(record.recordIndex) ?? []).map(value => [value, (mapped: ProvenanceText) => mapped] as const),
    ];
    const unique = new Map<string, ProvenanceText>();
    for (const [value, prepare] of values) {
      const mapped = mapStateMathInput(value, record.role, prepare);
      if (!unique.has(mapped.text)) unique.set(mapped.text, mapped);
    }
    const variants: StateMathVariant[] = [];
    for (const input of unique.values()) try {
      const checked = validateMermaidMathLabel(input.text, EMPTY_MATH_RESOURCE_TOTAL);
      const parts = checked.parts.map(part => {
        if (part.kind === 'text') return part;
        const location = coordinates.locateRange(input, part.start, part.end);
        return { ...part, origins: location.intervals, synthetic: location.synthetic };
      });
      variants.push(Object.freeze({ input, parts: Object.freeze(parts), cost: variantCost(parts) }));
    } catch (error) {
      if (error instanceof MathPolicyError) throw new LocatedStateMathError(error, record, 'math validation');
      throw error;
    }
    const cost = maxStateMathCost(variants.map(variant => variant.cost));
    try { total = addStateMathCosts(total, cost); }
    catch (error) {
      if (error instanceof MathPolicyError) throw new LocatedStateMathError(error, record, 'resource accounting');
      throw error;
    }
    const canonical = variants[0]!;
    records.push(Object.freeze({ recordIndex: record.recordIndex, role: record.role, semanticValue: record.semanticValue,
      mappedInput: canonical.input, variants: Object.freeze(variants), parts: canonical.parts, cost,
      intervals: record.intervals, synthetic: record.synthetic }));
  }
  return Object.freeze({ records: Object.freeze(records), total });
}
