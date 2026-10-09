// Validate grammar-owned sequence fields and retain original authored spans.
// This is an authored-occurrence foundation, not an activated family adapter:
// effective DB reconciliation and extra rendered-copy budgets remain required.
import { EMPTY_MATH_RESOURCE_TOTAL, MathPolicyError, type MathResourceTotal } from '../math/policy.ts';
import { extractSequenceLabels, type SequenceLabelRecord } from './sequence-labels.ts';
import { MermaidSourceCoordinates, type LocatedSourceInterval } from './source-coordinates.ts';
import { normalizeMermaidSource } from './rules.ts';
import { validateMermaidMathLabel, type MermaidMathExpression, type MermaidMathText } from './math.ts';
import { sequenceMathTextReplacements } from './sequence-text.ts';

export type SequenceMathExpression = MermaidMathExpression & {
  origins: readonly LocatedSourceInterval[];
  synthetic: boolean;
};
export type SequenceMathRecord = Omit<SequenceLabelRecord, 'mappedValue' | 'intervals' | 'synthetic'> & {
  renderedValue: string;
  parts: readonly (MermaidMathText | SequenceMathExpression)[];
};
export class LocatedSequenceMathError extends MathPolicyError {
  readonly intervals: readonly LocatedSourceInterval[];
  readonly synthetic: boolean;
  readonly startLine: number | undefined;
  readonly startByte: number | undefined;
  readonly endByte: number | undefined;
  constructor(error: MathPolicyError, record: SequenceLabelRecord) {
    super(error.code, `sequence ${record.role}${record.ownerId ? ` ${record.ownerId}` : ''}: ${error.message}`);
    this.name = 'LocatedSequenceMathError';
    this.intervals = Object.freeze(record.intervals.map(interval => Object.freeze({ ...interval })));
    this.synthetic = record.synthetic;
    this.startLine = this.intervals[0]?.startLine;
    this.startByte = this.intervals[0]?.startByte;
    this.endByte = this.intervals[0]?.endByte;
  }
}

export async function extractSequenceMath(
  original: string, initial: MathResourceTotal = EMPTY_MATH_RESOURCE_TOTAL,
  rendered: string = normalizeMermaidSource(original),
): Promise<{ records: SequenceMathRecord[]; total: MathResourceTotal }> {
  const extracted = await extractSequenceLabels(original, rendered);
  const coordinates = new MermaidSourceCoordinates(original);
  const records: SequenceMathRecord[] = [];
  let total = initial;
  for (const record of extracted.records) {
    // Native sequence splits line-break tags before KaTeX. A tag splitting an
    // expression must fail validation rather than invent a cross-line formula.
    // Unlike flowchart, sequence never collapses doubled TeX backslashes.
    let mapped = record.mappedValue.replaceRegex(/<\/?br\s*\/?>/gi, () => '\n');
    if (['title', 'box', 'accTitle', 'accDescr'].includes(record.role)) {
      const chunks = [];
      let cursor = 0;
      for (const edit of sequenceMathTextReplacements(mapped.text)) {
        const reference = mapped.slice(edit.start, edit.end);
        chunks.push(mapped.slice(cursor, edit.start), reference.replace(0, reference.length, edit.text));
        cursor = edit.end;
      }
      chunks.push(mapped.slice(cursor, mapped.length));
      mapped = mapped.slice(0, 0).concatAll(chunks);
    }
    try {
      const checked = validateMermaidMathLabel(mapped.text, total);
      const parts = checked.parts.map(part => {
        if (part.kind === 'text') return part;
        const location = coordinates.locateRange(mapped, part.start, part.end);
        return { ...part, origins: location.intervals, synthetic: location.synthetic };
      });
      const { mappedValue: _mapped, intervals: _intervals, synthetic: _synthetic, ...identity } = record;
      records.push({ ...identity, renderedValue: mapped.text, parts });
      total = checked.total;
    } catch (error) {
      if (error instanceof MathPolicyError) throw new LocatedSequenceMathError(error, record);
      throw error;
    }
  }
  return { records, total };
}
