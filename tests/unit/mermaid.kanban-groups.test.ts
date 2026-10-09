import { afterAll, beforeAll, expect, it } from 'vitest';
import DOMPurify from 'dompurify';
// @ts-expect-error test-only jsdom package has no declarations.
import { JSDOM } from 'jsdom';
import { planKanbanGroups, type KanbanGroupNode } from '../../packages/core/src/mermaid/kanban-groups.ts';

const descriptors: Record<string, PropertyDescriptor | undefined> = {};
let mermaid: typeof import('mermaid')['default'];
beforeAll(async () => {
  for (const key of ['sanitize', 'addHook']) descriptors[key] = Object.getOwnPropertyDescriptor(DOMPurify, key);
  const instance = DOMPurify(new JSDOM('').window as any);
  Object.assign(DOMPurify, { sanitize: instance.sanitize, addHook: instance.addHook });
  mermaid = (await import('mermaid')).default;
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
});
afterAll(() => {
  for (const key of ['sanitize', 'addHook']) {
    if (descriptors[key]) Object.defineProperty(DOMPurify, key, descriptors[key]!);
    else Reflect.deleteProperty(DOMPurify, key);
  }
});

async function native(source: string): Promise<any[]> {
  const diagram = await mermaid.mermaidAPI.getDiagramFromText(source);
  return structuredClone((diagram.db as any).getData().nodes);
}
const input = (...rows: Array<readonly [string, number]>): KanbanGroupNode[] => rows.map(([id, level], nodeIndex) => ({ nodeIndex, id, level }));
const shape = (plan: ReturnType<typeof planKanbanGroups>) => plan.copies.map(copy => [copy.nodeIndex, copy.sectionIndex, copy.kind]);

it('matches ordinary native multi-column traversal and records literal parent ordinals', async () => {
  const plan = planKanbanGroups(input(['todo', 0], ['a', 2], ['b', 2], ['doing', 0], ['c', 2]));
  expect(plan.sections).toEqual([0, 3]);
  expect(plan.parents).toEqual([undefined, 0, 0, undefined, 1]);
  expect(plan.copies).toHaveLength(5);
  expect(plan.copies).toEqual([
    { key: 'kanban:0:0:section', nodeIndex: 0, sectionIndex: 0, kind: 'section' },
    { key: 'kanban:0:1:item', nodeIndex: 1, sectionIndex: 0, kind: 'item' },
    { key: 'kanban:0:2:item', nodeIndex: 2, sectionIndex: 0, kind: 'item' },
    { key: 'kanban:1:3:section', nodeIndex: 3, sectionIndex: 1, kind: 'section' },
    { key: 'kanban:1:4:item', nodeIndex: 4, sectionIndex: 1, kind: 'item' },
  ]);
  expect((await native('kanban\ntodo[Todo]\n  a[Alpha]\n  b[Beta]\ndoing[Doing]\n  c[Gamma]\n')).map(node => [node.id, node.parentId, node.label]))
    .toEqual([['todo', undefined, 'Todo'], ['a', 'todo', 'Alpha'], ['b', 'todo', 'Beta'], ['doing', undefined, 'Doing'], ['c', 'doing', 'Gamma']]);
});

it('matches native duplicate columns and duplicate card IDs while retaining the actual parent ordinal', async () => {
  const plan = planKanbanGroups(input(['col', 0], ['card', 2], ['col', 0], ['card', 2]));
  expect(plan.sections).toEqual([0, 2]);
  expect(plan.parents).toEqual([undefined, 0, undefined, 1]);
  expect(plan.copies).toHaveLength(6);
  expect(shape(plan)).toEqual([[0, 0, 'section'], [1, 0, 'item'], [3, 0, 'item'], [2, 1, 'section'], [1, 1, 'item'], [3, 1, 'item']]);
  expect((await native('kanban\ncol[First]\n  card[Card one]\ncol[Second]\n  card[Card two]\n')).map(node => [node.id, node.parentId, node.label]))
    .toEqual([['col', undefined, 'First'], ['card', 'col', 'Card one'], ['card', 'col', 'Card two'], ['col', undefined, 'Second'], ['card', 'col', 'Card one'], ['card', 'col', 'Card two']]);
});

it('matches deeper children, a nonzero initial level, and native-normalized distinct IDs', async () => {
  const deeper = planKanbanGroups(input(['to-do', 2], ['item_a', 4], ['deeper', 6], ['done', 2], ['finish', 4]));
  expect(deeper.sections).toEqual([0, 3]);
  expect(deeper.parents).toEqual([undefined, 0, 0, undefined, 1]);
  expect(deeper.copies).toHaveLength(5);
  expect(shape(deeper)).toEqual([[0, 0, 'section'], [1, 0, 'item'], [2, 0, 'item'], [3, 1, 'section'], [4, 1, 'item']]);
  expect((await native('kanban\n  to-do[Todo]\n    item_a[Alpha]\n      deeper[Deep]\n  done[Done]\n    finish[Beta]\n')).map(node => [node.id, node.parentId, node.level]))
    .toEqual([['to-do', undefined, 2], ['item_a', 'to-do', 4], ['deeper', 'to-do', 6], ['done', undefined, 2], ['finish', 'done', 4]]);
});

it('admits a first lower-level node then fails on the following addition, like native getSection', async () => {
  const admitted = planKanbanGroups(input(['column', 2], ['lower', 0]));
  expect(admitted.sections).toEqual([0]);
  expect(admitted.parents).toEqual([undefined, 0]);
  expect(admitted.copies).toHaveLength(2);
  expect(shape(admitted)).toEqual([[0, 0, 'section'], [1, 0, 'item']]);
  expect((await native('kanban\n  column[Column]\nlower[Lower]\n')).map(node => [node.id, node.parentId, node.level]))
    .toEqual([['column', undefined, 2], ['lower', 'column', 0]]);
  expect(() => planKanbanGroups(input(['column', 2], ['lower', 0], ['next', 0]))).toThrow(/Items without section/);
  await expect(native('kanban\n  column[Column]\nlower[Lower]\nnext[Next]\n')).rejects.toThrow(/Items without section/);
});

it('rejects malformed normalized input', () => {
  expect(() => planKanbanGroups([{ nodeIndex: 1, id: 'a', level: 0 }])).toThrow(/nodeIndex/);
  expect(() => planKanbanGroups([{ nodeIndex: 0, id: '', level: 0 }])).toThrow(/empty id/);
  expect(() => planKanbanGroups([{ nodeIndex: 0, id: 'a', level: 1.5 }])).toThrow(/invalid level/);
  expect(() => planKanbanGroups([{ nodeIndex: 0, id: 'a', level: -1 }])).toThrow(/invalid level/);
});
