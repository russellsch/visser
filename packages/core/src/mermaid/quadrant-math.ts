// Authored validation only. Native DB reconciliation, visible copy planning
// and measured rendering must pass before the quadrant source guard is lifted.
import { EMPTY_MATH_RESOURCE_TOTAL, MathPolicyError, type MathResourceTotal } from '../math/policy.ts';
import { extractQuadrantLabels, type QuadrantLabelRecord, type QuadrantLabels } from './quadrant-labels.ts';
import { normalizeMermaidSource } from './rules.ts';
import { prepareSequenceSanitizer, sanitizeSequenceField } from './sequence-sanitize.ts';
import { MermaidSourceCoordinates, type LocatedSourceInterval } from './source-coordinates.ts';
import type { ProvenanceText } from './source-provenance.ts';
import { validateMermaidMathLabel, type MermaidMathExpression, type MermaidMathText } from './math.ts';
import { quadrantDisplayTextReplacements, quadrantMathTextReplacements } from './quadrant-text.ts';

export type QuadrantMathExpression = MermaidMathExpression & { origins: readonly LocatedSourceInterval[]; synthetic: boolean };
export type QuadrantMathRecord = Readonly<{
  recordIndex: number; role: QuadrantLabelRecord['role'];
  dbValue: string;
  validationInput: ProvenanceText;
  mappedInput: ProvenanceText;
  renderedValue: string;
  parts: readonly (MermaidMathText | QuadrantMathExpression)[];
}>;
export type QuadrantMath = Readonly<{ labels: QuadrantLabels; records: readonly QuadrantMathRecord[]; total: MathResourceTotal }>;

export class LocatedQuadrantMathError extends MathPolicyError {
  readonly recordIndex: number;
  readonly intervals: readonly LocatedSourceInterval[];
  readonly synthetic: boolean;
  readonly startLine: number | undefined;
  readonly startByte: number | undefined;
  readonly endByte: number | undefined;
  constructor(error: MathPolicyError, record: QuadrantLabelRecord) {
    super(error.code, `quadrant ${record.role} record ${record.recordIndex}: ${error.message}`);
    this.name = 'LocatedQuadrantMathError'; this.recordIndex = record.recordIndex;
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

export function mapQuadrantMathInput(value: ProvenanceText, role: QuadrantLabelRecord['role']): ProvenanceText {
  return applyEdits(value, quadrantMathTextReplacements(value.text, role));
}
export function mapQuadrantDisplayInput(value: ProvenanceText, role: QuadrantLabelRecord['role']): ProvenanceText {
  return applyEdits(value, quadrantDisplayTextReplacements(value.text, role));
}

export async function extractQuadrantMath(original: string, initial: MathResourceTotal = EMPTY_MATH_RESOURCE_TOTAL,
  rendered = normalizeMermaidSource(original)): Promise<QuadrantMath> {
  const labels = await extractQuadrantLabels(original, rendered);
  if (labels.records.some(record => record.semanticValue.includes('<'))) await prepareSequenceSanitizer();
  const coordinates = new MermaidSourceCoordinates(original);
  const records: QuadrantMathRecord[] = [];
  let total = initial;
  for (const record of labels.records) try {
    const start = record.mappedValue.length - record.mappedValue.text.trimStart().length;
    const trimmed = record.mappedValue.slice(start, start + record.mappedValue.text.trim().length);
    let db = sanitizeSequenceField(trimmed);
    if (record.role === 'accTitle') db = db.slice(db.length - db.text.trimStart().length, db.length);
    if (record.role === 'accDescr') db = db.replaceRegex(/\n\s+/g, () => '\n');
    const validationInput = mapQuadrantMathInput(db, record.role);
    const checked = validateMermaidMathLabel(validationInput.text, total);
    const mappedInput = mapQuadrantDisplayInput(db, record.role);
    const displayed = mappedInput.text === validationInput.text ? checked : validateMermaidMathLabel(mappedInput.text, total);
    // Different plain break spelling must not introduce a new formula or
    // change its cost after the conservative fallback-barrier validation.
    if (JSON.stringify(displayed.total) !== JSON.stringify(checked.total)) throw new MathPolicyError('E_MATH_INVALID', 'quadrant display and validation math costs differ');
    const parts = displayed.parts.map(part => {
      if (part.kind === 'text') return part;
      const location = coordinates.locateRange(mappedInput, part.start, part.end);
      return { ...part, origins: Object.freeze(location.intervals), synthetic: location.synthetic };
    });
    records.push(Object.freeze({ recordIndex: record.recordIndex, role: record.role, dbValue: db.text,
      validationInput, mappedInput, renderedValue: parts.map(part => part.source).join(''), parts: Object.freeze(parts) }));
    total = checked.total;
  } catch (error) {
    if (error instanceof MathPolicyError) throw new LocatedQuadrantMathError(error, record);
    throw error;
  }
  return Object.freeze({ labels, records: Object.freeze(records), total });
}
