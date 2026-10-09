import { afterAll, beforeAll, expect, it } from 'vitest';
import DOMPurify from 'dompurify';
// @ts-expect-error jsdom is supplied without declarations.
import { JSDOM } from 'jsdom';
import { extractJourneyMath } from '../../packages/core/src/mermaid/journey-math.ts';
import { reconcileJourneyDb, type JourneyDbSnapshot } from '../../packages/core/src/mermaid/journey-db.ts';
// Native Mermaid expects a browser-initialized DOMPurify dependency. Supply
// its real factory instance in this isolated test file; no global DOM is set.
const original = Object.getOwnPropertyDescriptors(DOMPurify);
beforeAll(() => {
  const instance = DOMPurify(new JSDOM('').window);
  Object.assign(DOMPurify, { sanitize: instance.sanitize, addHook: instance.addHook });
});
afterAll(() => {
  for (const name of ['sanitize', 'addHook']) {
    if (original[name]) Object.defineProperty(DOMPurify, name, original[name]!);
    else Reflect.deleteProperty(DOMPurify, name);
  }
});

async function native(source: string): Promise<JourneyDbSnapshot> {
  // @ts-expect-error pinned internal Mermaid chunk has no declarations.
  const { diagram } = await import('mermaid/dist/chunks/mermaid.core/journeyDiagram-ZHPQQLJL.mjs');
  diagram.db.clear();
  try {
    const parser = new diagram.parser.parser.Parser(); parser.yy = diagram.db;
    parser.parse(source);
    const tasks = diagram.db.getTasks(); // Exactly one native read.
    return structuredClone({ tasks, sections:diagram.db.getSections(), actors:diagram.db.getActors(),
      title:diagram.db.getDiagramTitle(),accTitle:diagram.db.getAccTitle(),accDescr:diagram.db.getAccDescription() });
  } finally { diagram.db.clear(); }
}

it('reconciles native metadata sanitation and selects final metadata with exact source ownership', async () => {
  const source = 'journey\ntitle $$old$$\ntitle $$x < y$$\naccTitle: $$a < b$$\naccDescr {\n $$c < d$$\n}\nTask: 1\n';
  const result = reconcileJourneyDb(await extractJourneyMath(source),await native(source));
  expect(result.snapshot.title).toBe('$$x &lt; y$$');
  expect(result.slots.filter(s => s.role === 'title')).toEqual([{key:'title',role:'title',recordIndex:2}]);
  expect(result.slots.some(s => ['accTitle','accDescr'].includes(s.role))).toBe(false);
});

it('merges equal section runs and binds sorted legends to the first authored actor occurrence', async () => {
  const source = 'journey\nBefore: 1: B\nsection $$s$$\nOne: 2: A, B, A\nsection $$s$$\nTwo: 3: __proto__\nsection Other\nThree: 4: constructor\nsection unused\n';
  const math = await extractJourneyMath(source);
  const plan = reconcileJourneyDb(math,await native(source));
  expect(plan.slots.filter(s => s.role === 'section').map(s => [s.taskStart,s.taskCount])).toEqual([[1,2],[3,1]]);
  const actors = plan.slots.filter(s => s.role === 'actor');
  expect(actors.map(s => s.actorName)).toEqual(['A','B','__proto__','constructor']);
  for (const slot of actors) expect(slot.recordIndex).toBe(math.records.find(r => r.role === 'actor' && r.dbValue === slot.actorName)!.recordIndex);
  expect(plan.slots.filter(s => s.role === 'task')).toHaveLength(4);
});

it('rejects stale snapshots, duplicate native task reads and changed authored ownership', async () => {
  const source = 'journey\nsection Phase\nTask $$x$$: 2: A\n';
  const math = await extractJourneyMath(source), snapshot = await native(source);
  for (const changed of [ {...snapshot,title:'changed'}, {...snapshot,actors:['B']}, {...snapshot,tasks:[...snapshot.tasks,...snapshot.tasks]}, {...snapshot,sections:[]} ]) {
    expect(() => reconcileJourneyDb(math,changed)).toThrow('native task, section, actor or metadata values differ');
  }
  expect(() => reconcileJourneyDb({...math,records:[...math.records,math.records[0]!]},snapshot)).toThrow('duplicate or invalid record identity');
  expect(() => reconcileJourneyDb({...math,labels:{...math.labels,tasks:math.labels.tasks.map(t => ({...t,labelRecordIndex:1}))}},snapshot)).toThrow('missing task owner');
});

it('rejects repeated visible ownership even when native task text is identical', async () => {
  const source = 'journey\nSame $$x$$: 1\nSame $$x$$: 1\n';
  const math = await extractJourneyMath(source), snapshot = await native(source);
  const tasks = math.labels.tasks.map(task => ({...task,labelRecordIndex:math.labels.tasks[0]!.labelRecordIndex}));
  expect(() => reconcileJourneyDb({...math,labels:{...math.labels,tasks}},snapshot)).toThrow('visible record requires extra copy accounting');
});
