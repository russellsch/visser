import { describe, expect, it } from 'vitest';
import { ProvenanceText } from '../../packages/core/src/mermaid/source-provenance.ts';
import { decodeSequenceMetadata } from '../../packages/core/src/mermaid/sequence-metadata.ts';
// @ts-expect-error Mermaid's pinned package chunk has no TypeScript declarations
import { load, JSON_SCHEMA } from 'mermaid/dist/chunks/mermaid.core/chunk-LNGE3PJU.mjs';

const decode = (text: string) => decodeSequenceMetadata({ rawValue: text, mappedRawValue: ProvenanceText.identity(text) });
const upstream = (text: string): unknown => load(text.includes('\n') ? `${text}\n` : `{\n${text}\n}`, { schema: JSON_SCHEMA });

describe('sequence metadata alias decoding', () => {
  it('matches the pinned single-line and multiline JSON_SCHEMA wrappers', () => {
    for (const source of ['alias: "Alice", type: actor', 'alias: >-\n  Alice\n  Bob']) {
      expect(decode(source).value).toEqual(upstream(source));
    }
    expect(decode('alias: "Alice"').alias?.mappedValue?.text).toBe('Alice');
  });

  it('maps escaped and nonliteral dollar delimiters to their full authored escape spans', () => {
    const source = String.raw`alias: "\u0024\u0024x\u0024\u0024"`;
    const alias = decode(source).alias!;
    expect(alias.value).toBe('$$x$$');
    expect(alias.mappedValue?.text).toBe('$$x$$');
    const span = alias.mappedValue!.mapRange(0, 2);
    expect(span).toEqual({ synthetic: false, intervals: [{ start: 8, end: 20 }] });
    expect(source.slice(span.intervals[0]!.start, span.intervals[0]!.end)).toBe(String.raw`\u0024\u0024`);
  });

  it('uses the anchor definition for value provenance while retaining alias-use identity', () => {
    const source = 'base: &name "$$x$$", alias: *name';
    const alias = decode(source).alias!;
    expect(alias.trace.kind).toBe('alias');
    expect(alias.value).toBe('$$x$$');
    expect(alias.mappedValue?.mapRange(0, 5).intervals).toEqual([{ start: 13, end: 18 }]);
    expect(alias.trace.raw.intervals.map(span => source.slice(span.start, span.end))).toEqual(['*name']);
  });

  it('retains folded block source breaks without inventing character offsets', () => {
    const source = 'alias: >-\n  $$x\n  + y$$';
    const alias = decode(source).alias!;
    expect(alias.mappedValue?.text).toBe('$$x + y$$');
    const fold = alias.mappedValue!.mapRange(3, 4);
    expect(fold.synthetic).toBe(false);
    expect(fold.intervals.map(span => source.slice(span.start, span.end))).toEqual(['\n']);
  });

  it('returns no alias candidate for falsy values or type-only metadata', () => {
    for (const source of ['alias: false', 'alias: 0', 'alias: null', 'alias: ""', 'type: actor']) {
      expect(decode(source).alias).toBeUndefined();
      expect(decode(source).value).toEqual(upstream(source));
    }
  });

  it('preserves truthy typed aliases without selecting an array item or coercing a number', () => {
    for (const source of ['alias: ["$$x$$", "$$y$$"]', 'alias: 42', 'alias: true', 'alias: {name: "$$x$$"}']) {
      const result = decode(source);
      expect(result.value).toEqual(upstream(source));
      expect(result.alias).toBeDefined();
      expect(result.alias!.value).toEqual((result.value as Record<string, unknown>)['alias']);
      expect(result.alias!.mappedValue).toBeUndefined();
    }
  });

  it('rejects provenance disagreement and malformed YAML', () => {
    expect(() => decodeSequenceMetadata({ rawValue: 'alias: A', mappedRawValue: ProvenanceText.identity('alias: B') }))
      .toThrow(/token and provenance disagree/);
    expect(() => decode('alias: [unclosed')).toThrow();
  });
});
