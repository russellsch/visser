import { describe, expect, it } from 'vitest';
import { ProvenanceText } from '../../packages/core/src/mermaid/source-provenance.ts';
import { MermaidSourceCoordinates } from '../../packages/core/src/mermaid/source-coordinates.ts';

const encoder = new TextEncoder();

describe('grammar source coordinates @M09', () => {
  it('maps BOM, Greek, astral Unicode and every line-ending form to original bytes', () => {
    const source = '\uFEFFα\r\n😀\rβ\n$$x$$';
    const coordinates = new MermaidSourceCoordinates(source);
    const positions = [0, 1, 2, 3, 4, 6, 7, 8, 9, source.length];
    const bytes = encoder.encode(source);
    for (const start of positions) for (const end of positions.filter(end => end >= start)) {
      const span = coordinates.locate({ start, end });
      expect(new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes.slice(span.startByte, span.endByte))).toBe(source.slice(start, end));
      expect(span.startByte).toBe(encoder.encode(source.slice(0, start)).length);
      expect(span.endByte).toBe(encoder.encode(source.slice(0, end)).length);
    }
    expect(coordinates.locate({ start: 4, end: 6 })).toMatchObject({ startLine: 2, endLine: 2, rawSource: '😀' });
    expect(coordinates.locate({ start: 7, end: 8 })).toMatchObject({ startLine: 3, rawSource: 'β' });
    expect(coordinates.locate({ start: 9, end: source.length })).toMatchObject({ startLine: 4, rawSource: '$$x$$' });
  });
  it('rejects surrogate halves and malformed original scalars instead of manufacturing bytes', () => {
    const coordinates = new MermaidSourceCoordinates('a😀b');
    expect(() => coordinates.locate({ start: 2, end: 3 })).toThrow(/splits a Unicode scalar/);
    expect(() => coordinates.locate({ start: 1, end: 2 })).toThrow(/splits a Unicode scalar/);
    for (const source of ['\ud800x', '\udc00', '\ud800']) expect(() => new MermaidSourceCoordinates(source)).toThrow(/unpaired/);
    for (const span of [{ start: -1, end: 0 }, { start: 0, end: 5 }, { start: 2, end: 1 }, { start: 0.5, end: 1 }]) {
      expect(() => coordinates.locate(span)).toThrow(/outside/);
    }
  });
  it('preserves deleted islands, replacement origins and synthetic text separately', () => {
    const original = 'α %% private\nβ';
    const input = ProvenanceText.identity(original);
    const mapped = input.slice(0, 1).concat(input.slice(original.length - 1, original.length)).replace(0, 1, 'alpha');
    const output = mapped.concat(mapped.synthetic('\n'));
    const located = new MermaidSourceCoordinates(original).locateRange(output, 0, output.length);
    expect(located.synthetic).toBe(true);
    expect(located.intervals.map(span => span.rawSource)).toEqual(['α', 'β']);
    expect(() => new MermaidSourceCoordinates('different').locateRange(output, 0, 1)).toThrow(/different/);
  });
});
