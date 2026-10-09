import { describe, expect, it } from 'vitest';
import { addStateMathCosts, LocatedStateMathError, mapStateMathInput, maxStateMathCost, validateStateMathRecords } from '../../packages/core/src/mermaid/state-math.ts';
import { EMPTY_MATH_RESOURCE_TOTAL } from '../../packages/core/src/math/policy.ts';
import type { StateLabelRecord, StateLabels, StateStatement } from '../../packages/core/src/mermaid/state-labels.ts';
import type { StateProvenanceResult } from '../../packages/core/src/mermaid/state-provenance.ts';
import { MermaidSourceCoordinates } from '../../packages/core/src/mermaid/source-coordinates.ts';
import { ProvenanceText } from '../../packages/core/src/mermaid/source-provenance.ts';

function setup(values: readonly [StateLabelRecord['role'], string][]) {
  const original = values.map(value => value[1]).join('\n'); const root = ProvenanceText.identity(original); const coordinates = new MermaidSourceCoordinates(original);
  let at = 0; const statement: StateStatement = {};
  const records = values.map(([role, text], index) => {
    const mappedValue = root.slice(at, at + text.length); at += text.length + 1;
    const location = coordinates.locateRange(mappedValue, 0, mappedValue.length);
    return { recordIndex:index + 1, role, semanticValue:text, mappedValue, intervals:location.intervals, synthetic:location.synthetic, statement } as StateLabelRecord;
  });
  const labels: StateLabels = { records, root:[statement], parserSource:original };
  const provenance = (variants = new Map<number, readonly ProvenanceText[]>(), promoted: readonly number[] = []): StateProvenanceResult =>
    ({nodes:new Map(), edges:new Map(), recordVariants:variants, promotedImplicitRecordIndices:promoted});
  return { original, labels, provenance, root };
}

describe('state authored math ledger', () => {
  it('keeps overwritten explicit records and distinct equal authored occurrences', () => {
    const f = setup([['state.description', '$$x$$'], ['state.description', '$$x$$'], ['transition', '$$y$$']]);
    const result = validateStateMathRecords(f.original, f.labels, f.provenance(), value => value);
    expect(result.records.map(record => record.recordIndex)).toEqual([1, 2, 3]);
    expect(result.total.occurrences).toBe(3);
    expect(result.records[0]!.parts.find(part => part.kind === 'math')!.origins[0]!.startByte)
      .not.toBe(result.records[1]!.parts.find(part => part.kind === 'math')!.origins[0]!.startByte);
  });

  it('ignores unpromoted machine IDs and validates promoted implicit IDs', () => {
    const f = setup([['state.implicit', String.raw`$$\unsupportedVisserCommand$$`], ['note', 'plain']]);
    expect(validateStateMathRecords(f.original, f.labels, f.provenance()).records.map(record => record.role)).toEqual(['note']);
    expect(() => validateStateMathRecords(f.original, f.labels, f.provenance(new Map(), [1]), value => value)).toThrow(LocatedStateMathError);
  });

  it('rejects invalid sanitizer-decoded and overwritten variant math at the raw field location', () => {
    const f = setup([['state.description', '😀 $$x$$'], ['state.description', 'plain']]);
    const bad = f.root.slice(0, '😀 $$x$$'.length).replace(0, '😀 $$x$$'.length, String.raw`😀 $$\unsupportedVisserCommand$$`);
    expect(() => validateStateMathRecords(f.original, f.labels, f.provenance(new Map([[1, [bad]]])), value => value)).toThrow(LocatedStateMathError);
    try { validateStateMathRecords(f.original, f.labels, f.provenance(new Map([[1, [bad]]])), value => value); } catch (error) {
      const located = error as LocatedStateMathError;
      expect(located.recordIndex).toBe(1); expect(located.startByte).toBe(0); expect(located.intervals[0]!.rawSource).toBe('😀 $$x$$');
    }
  });

  it('maps shared slash collapse, BR splitting, accessibility indentation and formula-only entity restoration', () => {
    const f = setup([['state.description', String.raw`$$\begin{matrix}a&b` + '\\\\\\\\' + String.raw`c&d\end{matrix}$$<br/>$$x &lt; y$$`], ['accDescr', 'one\n  $$z$$']]);
    const result = validateStateMathRecords(f.original, f.labels, f.provenance(), value => value);
    expect(result.total.occurrences).toBe(3);
    const state = result.records[0]!;
    expect(state.mappedInput.text).toContain('a&b\\\\c&d');
    expect(state.parts.filter(part => part.kind === 'math').map(part => part.tex)).toEqual(['\\begin{matrix}a&b\\\\c&d\\end{matrix}', 'x < y']);
    expect(result.records[1]!.mappedInput.text).toBe('one\n$$z$$');
  });

  it('uses componentwise maximum cost across per-record variants without summing variants', () => {
    const f = setup([['note', '$$x$$']]);
    const more = f.root.slice(0, '$$x$$'.length).replace(0, '$$x$$'.length, '$$x$$ $$y$$');
    const result = validateStateMathRecords(f.original, f.labels, f.provenance(new Map([[1, [more]]])), value => value);
    expect(result.records[0]!.variants).toHaveLength(2);
    expect(result.records[0]!.cost.occurrences).toBe(2);
    expect(result.total.occurrences).toBe(2);
  });

  it('rejects unknown variant indexes and promoted non-implicit records', () => {
    const f = setup([['note', '$$x$$']]);
    expect(() => validateStateMathRecords(f.original, f.labels, f.provenance(new Map([[99, []]])), value => value)).toThrow(/unknown record 99/);
    expect(() => validateStateMathRecords(f.original, f.labels, f.provenance(new Map(), [1]), value => value)).toThrow(/non-implicit/);
  });

  it('does not decode entities outside existing equations', () => {
    const mapped = ProvenanceText.identity('outside &lt; $$x &lt; y$$');
    expect(mapStateMathInput(mapped, 'note', value => value).text).toBe('outside &lt; $$x < y$$');
  });

  it('rejects invalid resource vectors before componentwise aggregation', () => {
    expect(() => addStateMathCosts(EMPTY_MATH_RESOURCE_TOTAL, { svgBytes: -1, elementCount: 0, occurrences: 0 })).toThrow(/nonnegative/);
    expect(() => maxStateMathCost([{ svgBytes: 0, elementCount: Number.NaN, occurrences: 0 }])).toThrow(/safe integer/);
  });
});
