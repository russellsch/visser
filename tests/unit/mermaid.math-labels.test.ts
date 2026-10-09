import { describe, expect, it } from 'vitest';
import { MermaidParseError } from '@mermaid-js/parser';
import { extractPieMathLabels, LocatedPieMathError, type LocatedPieMathExpression } from '../../packages/core/src/mermaid/math-labels.ts';

const expressions = (parts: readonly { kind: string }[]): LocatedPieMathExpression[] =>
  parts.filter((part): part is LocatedPieMathExpression => part.kind === 'math');

describe('pie grammar math labels', () => {
  it('locates title, accessibility and slice math in original BOM/CRLF/Unicode bytes, ignoring comments', async () => {
    const source = '\uFEFFpie showData\r\n%% comment $$\\bad$$\r\n title Café 😀 $$x$$\r\n accTitle: α $$a$$\r\n'
      + ' accDescr {first β $$b$$\r\n second $$c$$}\r\n "γ 😀 $$d$$" : -1.5\r\n';
    const result = await extractPieMathLabels(source);
    expect(result.records.map(record => [record.role, record.value])).toEqual([
      ['title', 'Café 😀 $$x$$'], ['accTitle', 'α $$a$$'], ['accDescr', 'first β $$b$$\nsecond $$c$$'], ['section.label', 'γ 😀 $$d$$'],
    ]);
    const math = result.records.flatMap(record => expressions(record.parts));
    expect(math.map(part => [part.tex, part.sourceStart, part.startByte])).toEqual([
      ['x', 51, 56], ['a', 71, 77], ['b', 97, 104], ['c', 112, 119], ['d', 127, 137],
    ]);
    expect(result.total.occurrences).toBe(5);
    for (const record of result.records) {
      expect(source.slice(record.sourceStart, record.sourceEnd)).toBe(Buffer.from(source, 'utf8').subarray(record.startByte, record.endByte).toString());
      for (const part of expressions(record.parts)) {
        expect(source.slice(part.sourceStart, part.sourceEnd)).toBe(part.rawSource);
        expect(Buffer.from(source, 'utf8').subarray(part.startByte, part.endByte).toString()).toBe(part.rawSource);
        expect(part.startLine).toBeGreaterThan(1);
      }
    }
  });

  it('keeps and budgets overwritten root fields while marking only last values active', async () => {
    const source = 'pie\n title first $$x$$\n title second $$y$$\n accTitle: first $$a$$\n accTitle: second $$b$$\n'
      + " 'one $$q$$': 1\n 'one $$q$$': -2\n";
    const result = await extractPieMathLabels(source, { svgBytes: 0, elementCount: 0, occurrences: 2 });
    expect(result.records.map(record => [record.role, record.value, record.active])).toEqual([
      ['title', 'first $$x$$', false], ['title', 'second $$y$$', true],
      ['accTitle', 'first $$a$$', false], ['accTitle', 'second $$b$$', true],
      ['section.label', 'one $$q$$', true], ['section.label', 'one $$q$$', true],
    ]);
    expect(result.total.occurrences).toBe(8);
    expect(expressions(result.records[4]!.parts)[0]!.sourceStart).toBeLessThan(expressions(result.records[5]!.parts)[0]!.sourceStart);
  });

  it('maps a dedented rendered fence back to its indented authored body', async () => {
    const original = '  pie\r\n   "😀 $$x$$": 1\r\n';
    const rendered = 'pie\n "😀 $$x$$": 1\n';
    const result = await extractPieMathLabels(original, undefined, rendered);
    const part = expressions(result.records[0]!.parts)[0]!;
    expect(part.rawSource).toBe('$$x$$');
    expect(Buffer.from(original, 'utf8').subarray(part.startByte, part.endByte).toString()).toBe('$$x$$');
  });

  it('maps converted TeX to the original token even when the parser normalizes spaces', async () => {
    const source = 'pie\n title Ratio $$x  y$$\n "first": 1\n';
    const result = await extractPieMathLabels(source);
    const part = expressions(result.records[0]!.parts)[0]!;
    expect(part.tex).toBe('x y');
    expect(part.source).toBe('$$x y$$');
    expect(part.rawSource).toBe('$$x  y$$');
    expect(source.slice(part.sourceStart, part.sourceEnd)).toBe(part.rawSource);
  });

  it('fails closed on pie grammar errors and unmatched delimiters', async () => {
    await expect(extractPieMathLabels('pie\n unquoted : 1\n')).rejects.toBeInstanceOf(MermaidParseError);
    let failure: unknown;
    const source = 'pie\r\n "unmatched $$x": 1\r\n';
    try { await extractPieMathLabels(source); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(LocatedPieMathError);
    const error = failure as LocatedPieMathError;
    expect(error.message).toMatch(/unmatched/);
    expect(error.startLine).toBe(2);
    expect(source.slice(error.sourceStart, error.sourceEnd)).toBe('$$');
  });

  it('locates malformed TeX in original bytes and rejects content-changing rendered input', async () => {
    const source = 'pie\r\n%% ignore $$\\bad$$\r\n "😀 $$\\notacommand{x}$$": 1\r\n';
    let failure: unknown;
    try { await extractPieMathLabels(source); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(LocatedPieMathError);
    const error = failure as LocatedPieMathError;
    expect(error.code).toBe('E_MATH_INVALID');
    expect(error.startLine).toBe(3);
    expect(source.slice(error.sourceStart, error.sourceEnd)).toBe('$$\\notacommand{x}$$');
    expect(Buffer.from(source, 'utf8').subarray(error.startByte, error.endByte).toString()).toBe('$$\\notacommand{x}$$');
    await expect(extractPieMathLabels('pie\n "$$x$$": 1\n', undefined, 'pie\n "$$y$$": 1\n'))
      .rejects.toMatchObject({ code: 'E_MATH_INVALID', startLine: 1 });
  });
});
