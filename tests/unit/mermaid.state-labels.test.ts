import { describe, expect, it } from 'vitest';
import { extractStateLabels } from '../../packages/core/src/mermaid/state-labels.ts';

describe('pinned state grammar label collector', () => {
  it('collects implicit IDs, descriptions, quoted aliases, transition labels and notes in reduction order', async () => {
    const source = [
      'stateDiagram-v2',
      'Idle: waiting',
      'state "Working" as Busy',
      'state "Shown" as Alias:second:ignored',
      'Idle --> Busy: start',
      'note right of Busy: note text',
      '',
    ].join('\n');
    const found = await extractStateLabels(source);
    expect(found.records.map(record => [record.role, record.semanticValue, record.ownerId])).toEqual([
      ['state.implicit', 'Idle', 'Idle'], ['state.description', 'waiting', 'Idle'],
      ['state.description', 'Working', 'Busy'], ['state.implicit', 'Busy', 'Busy'],
      ['state.description', 'Shown', 'Alias'], ['state.implicit', 'Alias', 'Alias'], ['state.description', 'second', 'Alias'],
      ['state.implicit', 'Idle', 'Idle'], ['state.implicit', 'Busy', 'Busy'], ['transition', 'start', undefined],
      ['state.implicit', 'Busy', 'Busy'], ['note', 'note text', 'Busy'],
    ]);
  });

  it('returns parsed root objects and shares statement identity across fields while record identity stays unique', async () => {
    const found = await extractStateLabels('stateDiagram-v2\nA: first\nstate "second" as B:third\n');
    expect(found.root.map(statement => statement.id)).toEqual(['A', 'B']);
    const [implicitA, descriptionA] = found.records.filter(record => record.ownerId === 'A');
    const b = found.records.filter(record => record.ownerId === 'B');
    expect(implicitA!.statement).toBe(found.root[0]);
    expect(descriptionA!.statement).toBe(found.root[0]);
    expect(implicitA!.statementIndex).toBe(descriptionA!.statementIndex);
    expect(b.map(record => record.statement)).toEqual([found.root[1], found.root[1], found.root[1]]);
    expect(b[0]!.statementIndex).toBe(b[1]!.statementIndex);
    expect(new Set(found.records.map(record => record.recordIndex)).size).toBe(found.records.length);
  });

  it('retains relation endpoint statement objects and their implicit label records', async () => {
    const found = await extractStateLabels('stateDiagram-v2\nA --> B: move\n');
    const relation = found.root[0] as { state1: object; state2: object };
    expect(found.records.find(record => record.ownerId === 'A')!.statement).toBe(relation.state1);
    expect(found.records.find(record => record.ownerId === 'B')!.statement).toBe(relation.state2);
  });

  it('retains repeated/equal grammar fields and accessibility assignments with distinct spans', async () => {
    const source = 'stateDiagram\naccTitle: same\naccTitle: same\naccDescr: same\naccDescr {\n  same\n}\nA --> B: same\n';
    const found = await extractStateLabels(source);
    const same = found.records.filter(record => record.semanticValue === 'same');
    expect(same.map(record => record.role)).toEqual(['accTitle', 'accTitle', 'accDescr', 'accDescr', 'transition']);
    expect(new Set(same.map(record => record.intervals[0]!.sourceStart)).size).toBe(5);
    expect(same.slice(0, 4).map(record => record.eventIndex)).toEqual([1, 2, 3, 4]);
  });

  it('maps BOM, CRLF, Unicode, fence dedent and skipped comments to original UTF-8 source coordinates', async () => {
    const original = '\uFEFF  stateDiagram-v2\r\n  %% hidden $$private$$\r\n  A: 😀 $$x$$\r\n  A --> B: $$y$$\r\n';
    const rendered = 'stateDiagram-v2\n%% hidden $$private$$\nA: 😀 $$x$$\nA --> B: $$y$$\n';
    const found = await extractStateLabels(original, rendered);
    expect(found.parserSource).toContain('hidden');
    expect(found.records.some(record => record.semanticValue.includes('private'))).toBe(false);
    const description = found.records.find(record => record.role === 'state.description')!;
    const transition = found.records.find(record => record.role === 'transition')!;
    expect(description.intervals[0]!.rawSource).toBe('😀 $$x$$');
    expect(transition.intervals[0]!.rawSource).toBe('$$y$$');
    for (const record of [description, transition]) {
      const interval = record.intervals[0]!;
      expect(interval.startByte).toBe(new TextEncoder().encode(original.slice(0, interval.sourceStart)).length);
      expect(interval.endByte).toBe(new TextEncoder().encode(original.slice(0, interval.sourceEnd)).length);
    }
  });

  it('keeps quoted lexer literals as the parser receives them and does not regex-scan comments', async () => {
    const source = String.raw`stateDiagram-v2
%% state Hidden: $$private$$
state "literal \\ $$x$$" as A
A --> A: $$x$$
`;
    const found = await extractStateLabels(source);
    expect(found.records.filter(record => record.semanticValue === '$$x$$')).toHaveLength(1);
    const alias = found.records.find(record => record.role === 'state.description')!;
    expect(alias.semanticValue).toBe(String.raw`literal \\ $$x$$`);
    expect(alias.intervals[0]!.rawSource).toBe(String.raw`literal \\ $$x$$`);
  });

  it('retains composite and concurrent inner authored fields rather than dropping them', async () => {
    const source = 'stateDiagram-v2\nstate Group {\n  Child: child label\n  --\n  Other: other label\n}\n';
    const found = await extractStateLabels(source);
    expect(found.records.filter(record => record.role === 'state.implicit').map(record => [record.ownerId, record.semanticValue]))
      .toEqual([['Child', 'Child'], ['Other', 'Other'], ['Group', 'Group']]);
    expect(found.records.filter(record => record.role === 'state.description').map(record => [record.ownerId, record.semanticValue]))
      .toEqual([['Child', 'child label'], ['Other', 'other label']]);
  });

  it('preserves quoted composite alias whitespace because production 21 does not trim it', async () => {
    const found = await extractStateLabels('stateDiagram-v2\nstate "  title  " as Group {\n Child\n}\n');
    const title = found.records.find(record => record.role === 'state.description')!;
    expect(title.semanticValue).toBe('  title  ');
    expect(title.intervals[0]!.rawSource).toBe('  title  ');
  });

  it('retains alias IDs as implicit provenance when quoted titles trim empty', async () => {
    const source = 'stateDiagram-v2\nstate " " as A\nstate " " as B: detail\nstate " " as A\nstate "title" as C   \nstate " " as Group {\n Child\n}\n';
    const found = await extractStateLabels(source);
    expect(found.records.filter(record => record.role === 'state.description').map(record => [record.ownerId, record.semanticValue]))
      .toEqual([['A', ''], ['B', ''], ['B', ' detail'], ['A', ''], ['C   ', 'title'], ['Group ', ' ']]);
    const aliases = found.records.filter(record => record.role === 'state.implicit' && ['A', 'B', 'C', 'Group'].includes(record.semanticValue));
    expect(aliases.map(record => record.semanticValue)).toEqual([
      'A', 'B', 'A', 'C', 'Group',
    ]);
    const repeatedA = aliases.filter(record => record.ownerId === 'A');
    expect(repeatedA[0]!.intervals[0]!.sourceStart).not.toBe(repeatedA[1]!.intervals[0]!.sourceStart);
    expect(aliases.find(record => record.semanticValue === 'C')!.intervals[0]!.rawSource).toBe('C');
  });

  it('uses the pinned multiline note lexer transform and retains its complete authored body', async () => {
    const source = 'stateDiagram-v2\nA\nnote left of A\n  first $$x$$\n  second\nend note\n';
    const note = (await extractStateLabels(source)).records.find(record => record.role === 'note')!;
    expect(note.semanticValue).toBe('first $$x$$\n  second');
    expect(note.intervals[0]!.rawSource).toBe('first $$x$$\n  second');
  });

  it('matches the native inline-note substr(2) transform with whitespace before the colon and records note-only state IDs', async () => {
    const found = await extractStateLabels('stateDiagram-v2\nnote right of Only : inline $$x$$\n');
    expect(found.records.map(record => [record.role, record.semanticValue, record.ownerId])).toEqual([
      ['state.implicit', 'Only', 'Only'], ['note', 'inline $$x$$', 'Only'],
    ]);
    expect(found.records[0]!.statement).toBe(found.records[1]!.statement);
  });

  it('uses lexer rule 67 for newline-before-colon note text instead of inferring from a newline', async () => {
    const found = await extractStateLabels('stateDiagram-v2\nnote right of A\n: newline $$x$$\n');
    expect(found.records.map(record => [record.role, record.semanticValue])).toEqual([
      ['state.implicit', 'A'], ['note', 'newline $$x$$'],
    ]);
  });

  it('maps fork, join and choice IDs through their pinned lexer suffix transforms and gives dividers native IDs', async () => {
    const found = await extractStateLabels('stateDiagram-v2\nstate F <<fork>>\nstate J <<join>>\nstate C <<choice>>\nstate Group {\n --\n --\n}\n');
    expect(found.records.filter(record => record.role === 'state.implicit').map(record => [record.ownerId, record.semanticValue]))
      .toEqual([['F', 'F'], ['J', 'J'], ['C', 'C'], ['Group', 'Group']]);
    const group = found.root.find(statement => statement.id === 'Group')!;
    const doc = group.doc as Array<{ id?: string; type?: string }>;
    expect(doc.filter(statement => statement.type === 'divider').map(statement => statement.id)).toEqual(['divider-id-1', 'divider-id-2']);
  });

  it('accepts case-insensitive bracket special-state suffixes using the native fixed slice lengths', async () => {
    const found = await extractStateLabels('stateDiagram-v2\nstate F [[FoRk]]\nstate J [[JOIN]]\nstate C [[cHoIcE]]\n');
    expect(found.records.map(record => [record.role, record.ownerId, record.semanticValue])).toEqual([
      ['state.implicit', 'F', 'F'], ['state.implicit', 'J', 'J'], ['state.implicit', 'C', 'C'],
    ]);
  });

  it('propagates malformed grammar', async () => {
    await expect(extractStateLabels('stateDiagram-v2\nA --> : broken\n')).rejects.toThrow();
  });
});
