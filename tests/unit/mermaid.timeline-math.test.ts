import { describe, expect, it } from 'vitest';
import { extractTimelineMathLabels, LocatedTimelineMathError, type TimelineMathExpression } from '../../packages/core/src/mermaid/timeline-math.ts';

const math = (parts: readonly { kind: string }[]): TimelineMathExpression[] =>
  parts.filter((part): part is TimelineMathExpression => part.kind === 'math');

describe('pinned timeline grammar math fields', () => {
  it('captures all rendered and accessibility fields with original BOM/CRLF/Unicode spans', async () => {
    const lines = [
      'timeline LR',
      String.raw`%% hidden $$\bad$$`,
      String.raw`title old $$x$$`,
      String.raw`title New 😀 $$\frac{a}{b}$$ and $$x$$`,
      String.raw`accTitle: Alpha $$a$$`,
      String.raw`accDescr {First $$b$$`,
      String.raw`second $$c$$}`,
      String.raw`section β $$s$$`,
      String.raw`Task $$t$$`,
      String.raw`: event $$e$$`,
    ];
    const raw = `\uFEFF${lines.map(line => `  ${line}`).join('\r\n')}\r\n`;
    const rendered = `${lines.join('\n')}\n`;
    const result = await extractTimelineMathLabels(raw, undefined, rendered);
    expect(result.records.map(record => [record.role, record.value, record.active])).toEqual([
      ['title', 'old $$x$$', false],
      ['title', String.raw`New 😀 $$\frac{a}{b}$$ and $$x$$`, true],
      ['accTitle', 'Alpha $$a$$', true],
      ['accDescr', 'First $$b$$\nsecond $$c$$', true],
      ['section', 'β $$s$$', true],
      ['task', 'Task $$t$$', true],
      ['event', 'event $$e$$', true],
    ]);
    expect(result.total.occurrences).toBe(9);
    expect(result.records.at(-1)).toMatchObject({ sectionIndex: 0, taskIndex: 0, eventIndex: 0 });
    const bytes = Buffer.from(raw);
    for (const record of result.records) {
      expect(raw.slice(record.sourceStart, record.sourceEnd)).toBe(bytes.subarray(record.startByte, record.endByte).toString());
      for (const part of math(record.parts)) {
        expect(raw.slice(part.sourceStart, part.sourceEnd)).toBe(part.rawSource);
        expect(bytes.subarray(part.startByte, part.endByte).toString()).toBe(part.rawSource);
      }
    }
    expect(math(result.records[1]!.parts).map(part => part.tex)).toEqual([String.raw`\frac{a}{b}`, 'x']);
    expect(math(result.records[1]!.parts)[0]!.startByte).toBeLessThan(math(result.records[1]!.parts)[1]!.startByte);
  });

  it('keeps repeated sections, tasks and events in parser order with stable indices', async () => {
    const result = await extractTimelineMathLabels('timeline\nsection S $$x$$\nTask $$a$$\n: event $$q$$\n: event $$q$$\nsection S $$x$$\nTask $$b$$\n');
    expect(result.records.map(record => [record.role, record.sectionIndex, record.taskIndex, record.eventIndex])).toEqual([
      ['section', 0, undefined, undefined], ['task', 0, 0, undefined],
      ['event', 0, 0, 0], ['event', 0, 0, 1],
      ['section', 1, undefined, undefined], ['task', 1, 1, undefined],
    ]);
    expect(result.total.occurrences).toBe(6);
  });

  it('validates overwritten metadata and locates invalid math in original bytes', async () => {
    const raw = 'timeline\r\n title $$\\notacommand{x}$$\r\n title shown\r\n section A\r\n Task\r\n';
    let error: unknown;
    try { await extractTimelineMathLabels(raw); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(LocatedTimelineMathError);
    const located = error as LocatedTimelineMathError;
    expect(located.code).toBe('E_MATH_INVALID');
    expect(located.startLine).toBe(2);
    expect(Buffer.from(raw).subarray(located.startByte, located.endByte).toString()).toContain('notacommand');
  });

  it('fails closed on changed render content and malformed timeline grammar', async () => {
    await expect(extractTimelineMathLabels('timeline\nsection A\nTask $$x$$\n', undefined,
      'timeline\nsection B\nTask $$x$$\n')).rejects.toMatchObject({ code: 'E_MATH_INVALID' });
    await expect(extractTimelineMathLabels('timeline\naccDescr {unfinished\n')).rejects.toThrow();
  });
});
