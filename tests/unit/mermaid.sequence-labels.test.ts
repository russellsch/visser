import { describe, expect, it } from 'vitest';
import { extractSequenceLabels, LocatedSequenceLabelError } from '../../packages/core/src/mermaid/sequence-labels.ts';

describe('pinned sequence grammar label collector', () => {
  it('collects actors, messages, notes, group and branch labels in authored order with DB message indices', async () => {
    const source = [
      'sequenceDiagram',
      'participant A as Alice $$a$$',
      'participant B as Bob',
      'A->>B: hello $$m$$',
      'Note over A,B: note $$n$$',
      'loop Repeat $$l$$',
      ' A->>B: inside',
      'end',
      'alt First $$x$$',
      ' A->>B: yes',
      'else Second $$y$$',
      ' B->>A: no',
      'end',
      'par In parallel $$p$$',
      ' A->>B: one',
      'and Other $$q$$',
      ' B->>A: two',
      'end',
      'critical Required $$c$$',
      ' A->>B: try',
      'option Recovery $$r$$',
      ' B->>A: recover',
      'end',
      'break Stop $$b$$',
      ' A->>B: halt',
      'end',
      '',
    ].join('\n');
    const { records } = await extractSequenceLabels(source);
    const authored = records.filter(record => record.role !== 'actor');
    expect(authored.filter(record => record.semanticValue.includes('$$')).map(record => [record.role, record.semanticValue])).toEqual([
      ['message', 'hello $$m$$'], ['note', 'note $$n$$'], ['loop', 'Repeat $$l$$'],
      ['alt', 'First $$x$$'], ['else', 'Second $$y$$'], ['par', 'In parallel $$p$$'],
      ['and', 'Other $$q$$'], ['critical', 'Required $$c$$'], ['option', 'Recovery $$r$$'], ['break', 'Stop $$b$$'],
    ]);
    expect(records.find(record => record.role === 'actor' && record.semanticValue === 'Alice $$a$$')).toMatchObject({ ownerId: 'A', active: true });
    expect(authored.every(record => record.messageIndex !== undefined)).toBe(true);
    expect(authored.filter(record => record.role === 'message').map(record => record.messageIdentity?.id))
      .toEqual(authored.filter(record => record.role === 'message').map(record => String(record.messageIndex)));
    expect(authored.find(record => record.role === 'message')?.messageIdentity).toMatchObject({
      id: '0', from: 'A', to: 'B', wrap: false,
    });
    for (const record of records) {
      expect(record.mappedValue.text).toBe(record.semanticValue);
      expect(record.synthetic).toBe(false);
      expect(record.intervals).toHaveLength(1);
      expect(source.slice(record.intervals[0]!.sourceStart, record.intervals[0]!.sourceEnd)).toBe(record.semanticValue);
    }
  });

  it('preserves copied math after participant and message wrap directives and trims', async () => {
    const source = 'sequenceDiagram\nparticipant A as :wrap:  Alice $$x$$  \nA->>A: :nowrap:  hello $$y$$  \n';
    const records = (await extractSequenceLabels(source)).records;
    const actor = records.find(record => record.role === 'actor' && record.active)!;
    const message = records.find(record => record.role === 'message')!;
    expect([actor.semanticValue, message.semanticValue]).toEqual(['Alice $$x$$', 'hello $$y$$']);
    expect(actor.intervals[0]!.rawSource).toBe('Alice $$x$$');
    expect(message.intervals[0]!.rawSource).toBe('hello $$y$$');
  });

  it('retains overwritten title, accessibility and participant values as inactive authored records', async () => {
    const source = 'sequenceDiagram\ntitle One $$x$$\ntitle Two $$y$$\naccTitle: First\naccTitle: Second\naccDescr: Old\naccDescr: New\nparticipant A as Earlier\nparticipant A as Later\n';
    const records = (await extractSequenceLabels(source)).records;
    expect(records.filter(record => ['title', 'accTitle', 'accDescr'].includes(record.role))
      .map(record => [record.role, record.semanticValue, record.active])).toEqual([
        ['title', 'One $$x$$', false], ['title', 'Two $$y$$', true],
        ['accTitle', 'First', false], ['accTitle', 'Second', true],
        ['accDescr', 'Old', false], ['accDescr', 'New', true],
      ]);
    expect(records.filter(record => record.role === 'actor').map(record => [record.semanticValue, record.active]))
      .toEqual([['Earlier', false], ['Later', true]]);
  });

  it('maps multiline accessibility descriptions through the common DB indentation normalization', async () => {
    const source = 'sequenceDiagram\naccDescr {\n  Hello $$x$$\n  World\n}\n';
    const record = (await extractSequenceLabels(source)).records.find(item => item.role === 'accDescr')!;
    expect(record.semanticValue).toBe('Hello $$x$$\nWorld');
    const match = record.semanticValue.indexOf('$$x$$');
    const formula = record.mappedValue.mapRange(match, match + 5);
    expect(formula.synthetic).toBe(false);
    expect(formula.intervals).toHaveLength(1);
    expect(source.slice(formula.intervals[0]!.start, formula.intervals[0]!.end)).toBe('$$x$$');
  });

  it('retains exact BOM, CRLF, Unicode and dedent byte coordinates while removing whole-line comments', async () => {
    const original = '\uFEFF  sequenceDiagram\r\n  %% hidden $$bad$$\r\n  participant A as 😀 $$x$$\r\n  A->>A: $$y$$\r\n';
    const rendered = 'sequenceDiagram\n%% hidden $$bad$$\nparticipant A as 😀 $$x$$\nA->>A: $$y$$\n';
    const { records, parserSource } = await extractSequenceLabels(original, rendered);
    expect(parserSource).not.toContain('hidden');
    const actor = records.find(record => record.role === 'actor' && record.active)!;
    const message = records.find(record => record.role === 'message')!;
    expect(actor.intervals[0]!.rawSource).toBe('😀 $$x$$');
    expect(message.intervals[0]!.rawSource).toBe('$$y$$');
    for (const record of [actor, message]) {
      const span = record.intervals[0]!;
      expect(span.startByte).toBe(new TextEncoder().encode(original.slice(0, span.sourceStart)).length);
      expect(span.endByte).toBe(new TextEncoder().encode(original.slice(0, span.sourceEnd)).length);
    }
  });

  it('keeps backticks as authored message text and does not collect math in ignored comments', async () => {
    const source = 'sequenceDiagram\n%% $$private$$\nparticipant A\nA->>A: `$$x$$`\n';
    const { records } = await extractSequenceLabels(source);
    expect(records.some(record => record.semanticValue.includes('private'))).toBe(false);
    const message = records.find(record => record.role === 'message')!;
    expect(message.semanticValue).toBe('`$$x$$`');
    expect(message.intervals[0]!.rawSource).toBe('`$$x$$`');
  });

  it.each([
    ['rgb(1,2,3)', 'Group $$x$$'], ['navy', 'Group $$x$$'], ['teal', 'Group $$x$$'],
    ['Group', 'Group $$x$$'],
  ])('maps box title after %s color interpretation', async (prefix, expected) => {
    const source = `sequenceDiagram\nbox ${prefix} ${prefix === 'Group' ? '$$x$$' : expected}\nparticipant A\nend\n`;
    const record = (await extractSequenceLabels(source)).records.find(item => item.role === 'box')!;
    expect(record.semanticValue).toBe(expected);
    expect(record.intervals[0]!.rawSource).toBe(expected);
    expect(record.boxIndex).toBe(0);
  });

  it('snapshots the DB box wrap and fill settings beside its title span', async () => {
    const source = 'sequenceDiagram\nbox teal :nowrap: Group $$x$$\nparticipant A\nend\n';
    const box = (await extractSequenceLabels(source)).records.find(record => record.role === 'box')!;
    expect(box.semanticValue).toBe('Group $$x$$');
    expect(box.boxIdentity).toEqual({ wrap: false, fill: 'teal' });
    expect(box.intervals[0]!.rawSource).toBe('Group $$x$$');
  });

  it('maps encoded YAML alias delimiters to original bytes and records the effective actor', async () => {
    const source = 'sequenceDiagram\nparticipant A@{ alias: "\\u0024\\u0024x\\u0024\\u0024" }\n';
    const records = (await extractSequenceLabels(source)).records;
    expect(records.map(record => [record.role, record.semanticValue, record.active])).toEqual([
      ['actor', 'A', false], ['actor.metadata', '$$x$$', true],
    ]);
    const alias = records[1]!;
    expect(alias.intervals[0]!.rawSource).toBe('\\u0024\\u0024x\\u0024\\u0024');
    expect(alias.actorIdentity).toMatchObject({ type: 'participant', wrap: false });
  });

  it('keeps suppressed and overwritten authored aliases for validation without selecting them', async () => {
    const source = [
      'sequenceDiagram',
      'participant A@{alias: "$$badOne$$"} as Alice',
      'participant A@{alias: "$$badTwo$$"} as A',
      'participant A@{alias: "$$good$$"}',
      '',
    ].join('\n');
    const records = (await extractSequenceLabels(source)).records;
    expect(records.filter(record => record.role === 'actor.metadata').map(record => [record.semanticValue, record.active]))
      .toEqual([['$$badOne$$', false], ['$$badTwo$$', false], ['$$good$$', true]]);
    expect(records.filter(record => record.role === 'actor').map(record => [record.semanticValue, record.active]))
      .toEqual([['Alice', false], ['A', false], ['A', false]]);
  });

  it('maps YAML aliases through anchors without claiming alias-use bytes contain decoded TeX', async () => {
    const source = 'sequenceDiagram\nparticipant A@{base: &text "$$x$$", alias: *text}\n';
    const record = (await extractSequenceLabels(source)).records.find(item => item.role === 'actor.metadata')!;
    expect(record.semanticValue).toBe('$$x$$');
    expect(record.active).toBe(true);
    expect(record.intervals[0]!.rawSource).toBe('$$x$$');
  });

  it('rejects a final typed alias but allows an explicit later label to supersede it', async () => {
    const typed = 'sequenceDiagram\nparticipant A@{alias: ["$$x$$", "$$y$$"]}\n';
    let failure: unknown;
    try { await extractSequenceLabels(typed); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(LocatedSequenceLabelError);
    const located = failure as LocatedSequenceLabelError;
    expect(located.message).toMatch(/unsupported array alias/);
    expect(located.startLine).toBe(2);
    expect(located.startByte).toBe(new TextEncoder().encode(typed.slice(0, typed.indexOf('["$$x$$"'))).length);
    expect(located.intervals[0]!.rawSource).toBe('["$$x$$", "$$y$$"]');
    const records = (await extractSequenceLabels(typed + 'participant A as Alice\n')).records;
    expect(records.filter(record => record.role === 'actor.metadata').map(record => [record.semanticValue, record.active, record.typedUnsupported]))
      .toEqual([['', false, true], ['$$x$$', false, undefined], ['$$y$$', false, undefined]]);
    expect(records.find(record => record.typedUnsupported)?.intervals[0]?.rawSource).toBe('["$$x$$", "$$y$$"]');
    expect(records.find(record => record.role === 'actor' && record.semanticValue === 'Alice')).toMatchObject({ active: true });
  });

  it('handles cyclic typed YAML aliases without serializing the DB value before supersession', async () => {
    const cyclic = 'sequenceDiagram\nparticipant A@{alias: &a [*a]}\n';
    let failure: unknown;
    try { await extractSequenceLabels(cyclic); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(LocatedSequenceLabelError);
    const located = failure as LocatedSequenceLabelError;
    expect(located.message).toMatch(/unsupported array alias/);
    expect(located.startLine).toBe(2);
    expect(located.intervals[0]!.rawSource).toBe('&a [*a]');

    const records = (await extractSequenceLabels(cyclic + 'participant A as Alice\n')).records;
    expect(records.find(record => record.typedUnsupported)).toMatchObject({ active: false, unsupportedAliasType: 'array' });
    expect(records.find(record => record.role === 'actor' && record.semanticValue === 'Alice')).toMatchObject({ active: true });
  });

  it('propagates malformed grammar', async () => {
    await expect(extractSequenceLabels('sequenceDiagram\nA->>: message\n')).rejects.toThrow();
  });
});
