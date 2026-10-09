import { describe, expect, it } from 'vitest';
import { parseJsonWithStringProvenance } from '../../packages/core/src/mermaid/json-provenance.ts';
import { ProvenanceText } from '../../packages/core/src/mermaid/source-provenance.ts';

const parse = (source: string) => parseJsonWithStringProvenance(ProvenanceText.identity(source));

describe('JSON string provenance', () => {
  it('keeps keys and nested string values in lexical order', () => {
    const source = '{"outer":{"first":"one","items":["two",{"last":"three"}]}}';
    const result = parse(source);
    expect(result.value).toEqual({ outer: { first: 'one', items: ['two', { last: 'three' }] } });
    expect(result.tokens.map(token => [token.kind, token.mappedValue.text]))
      .toEqual([['key', 'outer'], ['key', 'first'], ['value', 'one'], ['key', 'items'], ['value', 'two'], ['key', 'last'], ['value', 'three']]);
    for (const token of result.tokens) {
      const span = token.mappedValue.mapRange(0, token.mappedValue.length).intervals[0]!;
      expect(source.slice(span.start, span.end)).toBe(token.mappedValue.text);
    }
  });

  it('records enclosing depth while ignoring braces and brackets inside strings', () => {
    const result = parse('{"root":"{[]}","nested":{"root":"[]", "list":["{}"]}}');
    expect(result.tokens.map(token => [token.kind, token.mappedValue.text, token.depth])).toEqual([
      ['key', 'root', 1], ['value', '{[]}', 1],
      ['key', 'nested', 1], ['key', 'root', 2], ['value', '[]', 2],
      ['key', 'list', 2], ['value', '{}', 3],
    ]);
  });

  it('maps every standard JSON escape to its complete escape interval', () => {
    const source = '{"k\\\"\\\\\\/\\b\\f\\n\\r\\t\\u0041":"v\\uD83D\\uDE00"}';
    const result = parse(source);
    const key = result.tokens[0]!.mappedValue;
    const value = result.tokens[1]!.mappedValue;
    expect(key.text).toBe('k"\\/\b\f\n\r\tA');
    expect(value.text).toBe('v😀');
    expect(key.mapRange(1, 2).intervals).toEqual([{ start: source.indexOf('\\"'), end: source.indexOf('\\"') + 2 }]);
    expect(key.mapRange(key.length - 1, key.length).intervals).toEqual([{ start: source.indexOf('\\u0041'), end: source.indexOf('\\u0041') + 6 }]);
    const high = source.indexOf('\\uD83D');
    const low = source.indexOf('\\uDE00');
    expect(value.mapRange(1, 2).intervals).toEqual([{ start: high, end: high + 6 }]);
    expect(value.mapRange(2, 3).intervals).toEqual([{ start: low, end: low + 6 }]);
  });

  it('preserves lone surrogates and CRLF whitespace without losing UTF-16 spans', () => {
    const source = '{\r\n  "high":"\\uD800",\r\n  "low":"\\uDC00"\r\n}';
    const result = parse(source);
    expect(result.tokens.map(token => token.mappedValue.text)).toEqual(['high', '\uD800', 'low', '\uDC00']);
    for (const token of [result.tokens[1]!, result.tokens[3]!]) {
      expect(token.mappedValue.length).toBe(1);
      expect(token.mappedValue.mapRange(0, 1).synthetic).toBe(false);
      expect(token.mappedValue.mapRange(0, 1).intervals[0]!.end - token.mappedValue.mapRange(0, 1).intervals[0]!.start).toBe(6);
    }
  });

  it('retains duplicate keys and equal values even when JSON.parse overwrites them', () => {
    const source = '{"same":"value","same":"value","nested":{"same":"value"}}';
    const result = parse(source);
    expect(result.value).toEqual({ same: 'value', nested: { same: 'value' } });
    expect(result.tokens.map(token => [token.kind, token.mappedValue.text]))
      .toEqual([['key', 'same'], ['value', 'value'], ['key', 'same'], ['value', 'value'], ['key', 'nested'], ['key', 'same'], ['value', 'value']]);
    const values = result.tokens.filter(token => token.kind === 'value' && token.mappedValue.text === 'value');
    expect(values).toHaveLength(3);
    expect(values.map(token => token.mappedValue.mapRange(0, 5).intervals[0]!.start)).toEqual([
      source.indexOf('"value"') + 1,
      source.indexOf('"value"', source.indexOf('"value"') + 1) + 1,
      source.lastIndexOf('"value"') + 1,
    ]);
  });

  it('preserves synthetic provenance through decoded escapes', () => {
    const input = ProvenanceText.identity('seed').synthetic('{"key":"\\u0061"}');
    const result = parseJsonWithStringProvenance(input);
    const value = result.tokens.find(token => token.kind === 'value')!.mappedValue;
    expect(value.text).toBe('a');
    expect(value.mapRange(0, 1)).toEqual({ synthetic: true, intervals: [] });
  });

  it.each(['{"x":"unterminated}', '{"x":"\\x"}', '{"x":01}', '{"x":"ok",}'])('rejects malformed JSON explicitly: %s', source => {
    expect(() => parse(source)).toThrow(/JSON provenance: invalid JSON/);
  });
});
