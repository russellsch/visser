import { expect, it } from 'vitest';
import { extractJourneyLabels } from '../../packages/core/src/mermaid/journey-labels.ts';

it('retains all journey roles, overwritten metadata and repeated actors as distinct source records', async () => {
  const found = await extractJourneyLabels('journey\ntitle old\ntitle New $$t$$\naccTitle: Access\naccDescr {\n Long description\n}\nsection Phase\nTask $$x$$: 3: Alice $$a$$, Bob, Alice $$a$$\n');
  expect(found.records.map(r => [r.role, r.semanticValue])).toEqual([
    ['title','old'], ['title','New $$t$$'], ['accTitle','Access'], ['accDescr','Long description'],
    ['section','Phase'], ['task','Task $$x$$'], ['actor','Alice $$a$$'], ['actor','Bob'], ['actor','Alice $$a$$'],
  ]);
  expect(found.tasks).toHaveLength(1);
  expect(found.tasks[0]).toMatchObject({ taskIndex:0, labelRecordIndex:6, sectionRecordIndex:5, actorRecordIndices:[7,8,9], score:3 });
  const actors = found.records.filter(r => r.semanticValue === 'Alice $$a$$');
  expect(actors[0]!.intervals[0]!.sourceStart).not.toBe(actors[1]!.intervals[0]!.sourceStart);
});

it('follows native task data splitting without treating scores or ignored colon suffixes as labels', async () => {
  const found = await extractJourneyLabels('journey\nOne: 5\nTwo: 2: A, , B:ignored $$z$$\nThree: nope: __proto__\n');
  expect(found.records.filter(r => r.role === 'actor').map(r => r.semanticValue)).toEqual(['A','','B','__proto__']);
  expect(found.records.some(r => r.semanticValue.includes('ignored'))).toBe(false);
  expect(found.tasks[1]!.data.text).toBe(': 2: A, , B:ignored $$z$$');
  expect(found.tasks[0]!.actorRecordIndices).toEqual([]);
  expect(found.tasks[0]!.sectionRecordIndex).toBeUndefined();
  expect(found.tasks[2]!.score).toBeNaN();
});

it('preserves declaration ownership for equal and empty sections without guessing rendered copies', async () => {
  const found = await extractJourneyLabels('journey\nsection same\nA: 1\nsection same\nB: 2\nsection unused\n');
  expect(found.tasks.map(t => t.sectionRecordIndex)).toEqual([1,3]);
  expect(found.records.filter(r => r.role === 'section').map(r => r.semanticValue)).toEqual(['same','same','unused']);
});

it('maps Unicode, BOM, CRLF and fence dedent exactly while grammar comments stay literal', async () => {
  const original = '\uFEFF  journey\r\n  %% hidden $$bad$$\r\n  section 😀 $$s$$\r\n  Work $$w$$: 2: α $$a$$\r\n';
  const rendered = 'journey\n%% hidden $$bad$$\nsection 😀 $$s$$\nWork $$w$$: 2: α $$a$$\n';
  const found = await extractJourneyLabels(original, rendered);
  expect(found.records.map(r => r.semanticValue)).toEqual(['😀 $$s$$','Work $$w$$','α $$a$$']);
  for (const record of found.records) {
    expect(record.synthetic).toBe(false);
    expect(record.intervals.map(i => i.rawSource).join('')).toBe(record.semanticValue);
    for (const span of record.intervals) {
      expect(span.startByte).toBe(Buffer.byteLength(original.slice(0,span.sourceStart)));
      expect(span.endByte).toBe(Buffer.byteLength(original.slice(0,span.sourceEnd)));
    }
  }
});

it('keeps parser instances isolated and rejects source changes beyond indentation', async () => {
  const [a,b] = await Promise.all([extractJourneyLabels('journey\nsection A\nFirst: 1: X'),extractJourneyLabels('journey\nSecond: 2: Y')]);
  expect(a.records.map(r => r.semanticValue)).toEqual(['A','First','X']);
  expect(b.records.map(r => r.semanticValue)).toEqual(['Second','Y']);
  expect(b.tasks[0]!.sectionRecordIndex).toBeUndefined();
  await expect(extractJourneyLabels('journey\nFirst: 1\n','journey\nOther: 1\n')).rejects.toThrow('differs beyond leading indentation');
});

it('reconstructs native DB task/section/actor data using exactly one native task read', async () => {
  // Metadata sanitation is a later integration concern; compare the raw DB
  // fields here without replacing native addTask/addSection behavior.
  // @ts-expect-error Mermaid has no declarations for its internal chunk.
  const { diagram } = await import('mermaid/dist/chunks/mermaid.core/journeyDiagram-ZHPQQLJL.mjs');
  const sources = [
    'journey\nBefore: 1: A\nsection same\nOne: 2: A, B, A\nsection same\nTwo: 3: B\nsection unused\n',
    'journey\nsection 😀\nUnicode: 4: α $$x$$, __proto__, constructor\nEmpty: 0: ,\nIgnored: 5: A:unused\n',
  ];
  for (const source of sources) {
    const labels = await extractJourneyLabels(source);
    const record = (id: number) => labels.records.find(r => r.recordIndex === id)!;
    diagram.db.clear();
    try {
      const parser = new diagram.parser.parser.Parser();
      parser.yy = diagram.db;
      parser.parse(source);
      const tasks = diagram.db.getTasks();
      expect(tasks).toEqual(labels.tasks.map(task => ({
        section: task.sectionRecordIndex === undefined ? '' : record(task.sectionRecordIndex).semanticValue,
        type: task.sectionRecordIndex === undefined ? '' : record(task.sectionRecordIndex).semanticValue,
        task: record(task.labelRecordIndex).semanticValue,
        people: task.actorRecordIndices.map(id => record(id).semanticValue), score: task.score,
      })));
      expect(diagram.db.getSections()).toEqual(labels.records.filter(r => r.role === 'section').map(r => r.semanticValue));
      expect(diagram.db.getActors()).toEqual([...new Set(labels.records.filter(r => r.role === 'actor').map(r => r.semanticValue))].sort());
    } finally { diagram.db.clear(); }
  }
});
