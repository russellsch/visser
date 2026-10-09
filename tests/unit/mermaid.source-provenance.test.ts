import { describe, expect, it } from 'vitest';
import { ProvenanceText } from '../../packages/core/src/mermaid/source-provenance.ts';

describe('Mermaid source provenance', () => {
  it('maps copied UTF-16 units exactly, including surrogate halves and reordered slices', () => {
    const source = ProvenanceText.identity('A😀B');
    expect(source.length).toBe(4);
    expect(source.originAt(1)).toEqual({ kind: 'copy', intervals: [{ start: 1, end: 2 }], synthetic: false });
    expect(source.originAt(2)).toEqual({ kind: 'copy', intervals: [{ start: 2, end: 3 }], synthetic: false });
    expect(source.mapRange(1, 3)).toEqual({ intervals: [{ start: 1, end: 3 }], synthetic: false });
    const rearranged = source.slice(3, 4).concat(source.slice(0, 1));
    expect(rearranged.text).toBe('BA');
    expect(rearranged.mapRange(0, 2)).toEqual({
      intervals: [{ start: 3, end: 4 }, { start: 0, end: 1 }], synthetic: false,
    });
  });

  it('retains original coordinates after trimming a BOM and normalizing CRLF', () => {
    const source = ProvenanceText.identity('\uFEFFA\r\nB\rC');
    const normalized = source.slice(1, source.length).replaceRegex(/\r\n?|\n/g, () => '\n');
    expect(normalized.text).toBe('A\nB\nC');
    expect(normalized.originAt(0).intervals).toEqual([{ start: 1, end: 2 }]);
    expect(normalized.originAt(1)).toEqual({
      kind: 'replacement', intervals: [{ start: 2, end: 4 }], synthetic: false,
    });
    expect(normalized.originAt(3).intervals).toEqual([{ start: 5, end: 6 }]);
  });

  it('deletes leading and trailing space without contaminating surviving origins', () => {
    const source = ProvenanceText.identity('  alpha  beta  ');
    const trimmed = source.replaceRegex(/^ +| +$/g, () => '').replaceRegex(/ {2}/g, () => ' ');
    expect(trimmed.text).toBe('alpha beta');
    expect(trimmed.originAt(0).intervals).toEqual([{ start: 2, end: 3 }]);
    expect(trimmed.originAt(5)).toEqual({
      kind: 'replacement', intervals: [{ start: 7, end: 9 }], synthetic: false,
    });
    expect(trimmed.originAt(9).intervals).toEqual([{ start: 12, end: 13 }]);
    const withInternalDeletion = ProvenanceText.identity('abc').replace(1, 2, '');
    expect(withInternalDeletion.mapRange(0, 2).intervals).toEqual([
      { start: 0, end: 1 }, { start: 2, end: 3 },
    ]);
    expect(withInternalDeletion.replace(0, 2, 'XY').originAt(1)).toEqual({
      kind: 'replacement', intervals: [{ start: 0, end: 1 }, { start: 2, end: 3 }], synthetic: false,
    });
  });

  it('maps every unit of a length-changing escape to the full authored span through later transforms', () => {
    const escaped = ProvenanceText.identity('A & B').replaceRegex(/&/g, () => '&amp;');
    expect(escaped.text).toBe('A &amp; B');
    for (let i = 2; i < 7; i++) {
      expect(escaped.originAt(i)).toEqual({
        kind: 'replacement', intervals: [{ start: 2, end: 3 }], synthetic: false,
      });
    }
    const changed = escaped.replaceRegex(/amp/g, () => 'AMP');
    expect(changed.text).toBe('A &AMP; B');
    expect(changed.mapRange(3, 6)).toEqual({ intervals: [{ start: 2, end: 3 }], synthetic: false });
  });

  it('maps a folded multiline replacement to the complete removed range', () => {
    const folded = ProvenanceText.identity('one\r\n   two').replaceRegex(/\r\n   /g, () => ' ');
    expect(folded.text).toBe('one two');
    expect(folded.originAt(3)).toEqual({
      kind: 'replacement', intervals: [{ start: 3, end: 8 }], synthetic: false,
    });
  });

  it('marks synthetic prefixes, suffixes and insertions as unmappable', () => {
    const source = ProvenanceText.identity('abc');
    const wrapped = source.synthetic('>>').concat(source, source.synthetic('<<'));
    expect(wrapped.text).toBe('>>abc<<');
    expect(wrapped.mapRange(0, wrapped.length)).toEqual({
      intervals: [{ start: 0, end: 3 }], synthetic: true,
    });
    expect(wrapped.mapRange(0, 2)).toEqual({ intervals: [], synthetic: true });
    expect(source.replace(1, 1, { kind: 'synthetic', text: '!' }).originAt(1)).toEqual({
      kind: 'synthetic', intervals: [], synthetic: true,
    });
  });

  it('distinguishes repeated identical text by position, not substring search', () => {
    const output = ProvenanceText.identity('aa aa').replaceRegex(/aa/g, () => 'X');
    expect(output.text).toBe('X X');
    expect(output.originAt(0).intervals).toEqual([{ start: 0, end: 2 }]);
    expect(output.originAt(2).intervals).toEqual([{ start: 3, end: 5 }]);
  });

  it('allows precise mapped regex reordering without falsely assigning a replacement span', () => {
    const output = ProvenanceText.identity('ab').replaceRegex(/ab/g, (_match, matched) =>
      matched.slice(1, 2).concat(matched.slice(0, 1)));
    expect(output.text).toBe('ba');
    expect(output.originAt(0)).toEqual({ kind: 'copy', intervals: [{ start: 1, end: 2 }], synthetic: false });
    expect(output.originAt(1)).toEqual({ kind: 'copy', intervals: [{ start: 0, end: 1 }], synthetic: false });
    expect(output.mapRange(0, 2).intervals).toEqual([{ start: 1, end: 2 }, { start: 0, end: 1 }]);
  });

  it('rejects invalid ranges, ambiguous insertions, and foreign roots', () => {
    const source = ProvenanceText.identity('abc');
    const invalidRanges: Array<[number, number]> = [[-1, 0], [2, 1], [0, 4], [0.5, 1], [NaN, 1]];
    for (const [start, end] of invalidRanges) {
      expect(() => source.mapRange(start, end)).toThrow(RangeError);
      expect(() => source.slice(start, end)).toThrow(RangeError);
      expect(() => source.replace(start, end, 'x')).toThrow(RangeError);
    }
    expect(() => source.originAt(3)).toThrow(RangeError);
    expect(() => source.replace(1, 1, 'x')).toThrow(/explicitly synthetic/);
    expect(() => source.replaceRegex(/a/, () => 'x')).toThrow(/global/);
    const other = ProvenanceText.identity('abc');
    expect(() => source.concat(other)).toThrow(/different source/);
    expect(() => source.replace(0, 1, other.slice(0, 1))).toThrow(/different source/);
  });
});

it('maps a long replacement of disjoint islands once per shared origin run', () => {
  const source = ProvenanceText.identity('x '.repeat(16000));
  const islands = source.replaceRegex(/ /g, () => '');
  const replaced = islands.replace(0, islands.length, 'z'.repeat(16000));
  const result = replaced.mapRange(0, replaced.length);
  expect(result.synthetic).toBe(false);
  expect(result.intervals).toHaveLength(16000);
  expect(result.intervals[0]).toEqual({ start: 0, end: 1 });
  expect(result.intervals.at(-1)).toEqual({ start: 31998, end: 31999 });
});

it('concatenates source-sized iterables without argument spreading or losing origins', () => {
  const source = ProvenanceText.identity('a😀b'), empty = source.slice(0, 0);
  function* pieces() {
    for (let i = 0; i < 131072; i++) yield empty;
    yield source.slice(1, 3);
    yield source.synthetic(',');
    yield source.slice(0, 1);
  }
  const result = empty.concatAll(pieces());
  expect(result.text).toBe('😀,a');
  expect(result.mapRange(0, 2)).toEqual({intervals:[{start:1,end:3}],synthetic:false});
  expect(result.mapRange(2, 3).synthetic).toBe(true);
  expect(() => empty.concatAll([ProvenanceText.identity('x')])).toThrow(/different source/);
});
