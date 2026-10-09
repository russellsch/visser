// Validate every authored XY field before visibility and source binding.
// Ignored bar labels use the same text normalization as line labels for authored
// validation; they do not acquire visible DB slots by being validated here.
import { EMPTY_MATH_RESOURCE_TOTAL, MathPolicyError, type MathResourceTotal } from '../math/policy.ts';
import { extractXYLabels, type XYLabelRecord, type XYLabels } from './xychart-labels.ts';
import { normalizeMermaidSource } from './rules.ts';
import { prepareSequenceSanitizer, sanitizeSequenceField } from './sequence-sanitize.ts';
import { MermaidSourceCoordinates, type LocatedSourceInterval } from './source-coordinates.ts';
import type { ProvenanceText } from './source-provenance.ts';
import { validateMermaidMathLabel, type MermaidMathExpression, type MermaidMathText } from './math.ts';
import { xychartDisplayTextReplacements, xychartMathTextReplacements } from './xychart-text.ts';

export type XYMathExpression = MermaidMathExpression & { origins: readonly LocatedSourceInterval[]; synthetic: boolean };
export type XYMathRecord = Readonly<{
  recordIndex: number; role: XYLabelRecord['role'];
  dbValue: string;
  validationInput: ProvenanceText;
  mappedInput: ProvenanceText;
  renderedValue: string;
  parts: readonly (MermaidMathText | XYMathExpression)[];
}>;
export type XYMath = Readonly<{ labels: XYLabels; records: readonly XYMathRecord[]; total: MathResourceTotal }>;

export class LocatedXYMathError extends MathPolicyError {
  readonly recordIndex: number;
  readonly intervals: readonly LocatedSourceInterval[];
  readonly synthetic: boolean;
  readonly startLine: number | undefined;
  readonly startByte: number | undefined;
  readonly endByte: number | undefined;
  constructor(error: MathPolicyError, record: XYLabelRecord) {
    super(error.code, `xychart ${record.role} record ${record.recordIndex}: ${error.message}`);
    this.name = 'LocatedXYMathError'; this.recordIndex = record.recordIndex;
    this.intervals = record.intervals; this.synthetic = record.synthetic;
    this.startLine = record.intervals[0]?.startLine;
    this.startByte = record.intervals[0]?.startByte;
    this.endByte = record.intervals[0]?.endByte;
  }
}

function applyEdits(value: ProvenanceText, edits: readonly { start: number; end: number; text: string }[]): ProvenanceText {
  const chunks: ProvenanceText[] = []; let cursor = 0;
  for (const edit of edits) {
    const span = value.slice(edit.start, edit.end);
    chunks.push(value.slice(cursor, edit.start), span.replace(0, span.length, edit.text)); cursor = edit.end;
  }
  return value.slice(0, 0).concatAll([...chunks, value.slice(cursor, value.length)]);
}

export function mapXYMathInput(value: ProvenanceText, role: XYLabelRecord['role']): ProvenanceText {
  return applyEdits(value, xychartMathTextReplacements(value.text, role));
}
export function mapXYDisplayInput(value: ProvenanceText, role: XYLabelRecord['role']): ProvenanceText {
  return applyEdits(value, xychartDisplayTextReplacements(value.text, role));
}

export async function extractXYMath(original: string, initial: MathResourceTotal = EMPTY_MATH_RESOURCE_TOTAL,
  rendered = normalizeMermaidSource(original)): Promise<XYMath> {
  const labels = await extractXYLabels(original, rendered);
  if (labels.records.some(record => record.semanticValue.includes('<'))) await prepareSequenceSanitizer();
  const coordinates = new MermaidSourceCoordinates(original);
  const records: XYMathRecord[] = [];
  let total = initial;
  for (const record of labels.records) try {
    const start = record.mappedValue.length - record.mappedValue.text.trimStart().length;
    const trimmed = record.mappedValue.slice(start, start + record.mappedValue.text.trim().length);
    let db = sanitizeSequenceField(trimmed);
    if (record.role === 'accTitle') db = db.slice(db.length - db.text.trimStart().length, db.length);
    if (record.role === 'accDescr') db = db.replaceRegex(/\n\s+/g, () => '\n');
    const validationInput = mapXYMathInput(db, record.role);
    const checked = validateMermaidMathLabel(validationInput.text, total);
    const mappedInput = mapXYDisplayInput(db, record.role);
    const displayed = mappedInput.text === validationInput.text ? checked : validateMermaidMathLabel(mappedInput.text, total);
    // Different plain break spelling must not introduce a new formula or
    // change its cost after the conservative fallback-barrier validation.
    if (JSON.stringify(displayed.total) !== JSON.stringify(checked.total)) throw new MathPolicyError('E_MATH_INVALID', 'xychart display and validation math costs differ');
    const parts = displayed.parts.map(part => {
      if (part.kind === 'text') return part;
      const location = coordinates.locateRange(mappedInput, part.start, part.end);
      return { ...part, origins: Object.freeze(location.intervals), synthetic: location.synthetic };
    });
    records.push(Object.freeze({ recordIndex: record.recordIndex, role: record.role, dbValue: db.text,
      validationInput, mappedInput, renderedValue: parts.map(part => part.source).join(''), parts: Object.freeze(parts) }));
    total = checked.total;
  } catch (error) {
    if (error instanceof MathPolicyError) throw new LocatedXYMathError(error, record);
    throw error;
  }
  return Object.freeze({ labels, records: Object.freeze(records), total });
}
