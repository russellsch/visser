import { expect, it } from 'vitest';
import { planKanbanGroups, type KanbanGroupNode } from '../../packages/core/src/mermaid/kanban-groups.ts';
import { planKanbanRenderCopies } from '../../packages/core/src/mermaid/kanban-render-copies.ts';
import type { KanbanPreparedSource } from '../../packages/core/src/mermaid/kanban-source.ts';

function prepared(rows: Array<readonly [string, number]>): KanbanPreparedSource {
  const source: KanbanGroupNode[] = rows.map(([id, level], nodeIndex) => ({ nodeIndex, id, level }));
  const groups = planKanbanGroups(source);
  const snapshotNodes = source.map((node, nodeIndex) => ({
    ...node,
    label: node.id,
    width: 200,
    padding: 10,
    isGroup: false as const,
    ...(groups.parents[nodeIndex] === undefined ? {} : { parentId: source[groups.sections[groups.parents[nodeIndex]!]!]!.id }),
  }));
  return {
    authored: { parserSource: '', nodes: source.map(node => ({ ...node, type: 0, id: {} as any, label: {} as any })), decorations: [], effects: [] },
    effects: [],
    snapshot: { nodes: snapshotNodes, sections: groups.sections.map(index => snapshotNodes[index]!), counter: 0 },
    groups,
    nodes: source.map(node => ({ nodeIndex: node.nodeIndex, authored: {} as any, id: {} as any, baseLabel: {} as any, effectiveId: { text: node.id } as any, effectiveLabel: {} as any })),
    decorations: [],
  } as unknown as KanbanPreparedSource;
}

it('draws all headers first, then repeats each matching display card for duplicate section IDs', () => {
  const plan = planKanbanRenderCopies(prepared([['col', 0], ['card', 2], ['col', 0], ['card', 2]]));
  expect(plan.counts).toEqual([1, 4, 1, 4]);
  expect(plan.total).toBe(10);
  expect([...plan.copies()]).toEqual([
    { key: 'kanban-render:0:0:section', nodeIndex: 0, sectionIndex: 0, displayIndex: 0, kind: 'section' },
    { key: 'kanban-render:1:3:section', nodeIndex: 2, sectionIndex: 1, displayIndex: 3, kind: 'section' },
    { key: 'kanban-render:0:1:item', nodeIndex: 1, sectionIndex: 0, displayIndex: 1, kind: 'item' },
    { key: 'kanban-render:0:2:item', nodeIndex: 3, sectionIndex: 0, displayIndex: 2, kind: 'item' },
    { key: 'kanban-render:0:4:item', nodeIndex: 1, sectionIndex: 0, displayIndex: 4, kind: 'item' },
    { key: 'kanban-render:0:5:item', nodeIndex: 3, sectionIndex: 0, displayIndex: 5, kind: 'item' },
    { key: 'kanban-render:1:1:item', nodeIndex: 1, sectionIndex: 1, displayIndex: 1, kind: 'item' },
    { key: 'kanban-render:1:2:item', nodeIndex: 3, sectionIndex: 1, displayIndex: 2, kind: 'item' },
    { key: 'kanban-render:1:4:item', nodeIndex: 1, sectionIndex: 1, displayIndex: 4, kind: 'item' },
    { key: 'kanban-render:1:5:item', nodeIndex: 3, sectionIndex: 1, displayIndex: 5, kind: 'item' },
  ]);
});

it('uses effective fallback IDs and keeps mixed section IDs in display order', () => {
  const fallback = planKanbanRenderCopies(prepared([['kbn0', 0], ['kbn1', 2]]));
  expect(fallback.counts).toEqual([1, 1]);
  expect(fallback.total).toBe(2);

  const mixed = planKanbanRenderCopies(prepared([['same', 0], ['x', 2], ['other', 0], ['y', 2], ['same', 0], ['x', 2]]));
  expect(mixed.counts).toEqual([1, 4, 1, 1, 1, 4]);
  expect(mixed.total).toBe(12);
  expect([...mixed.copies()].map(copy => [copy.sectionIndex, copy.displayIndex, copy.kind])).toEqual([
    [0, 0, 'section'], [1, 3, 'section'], [2, 5, 'section'],
    [0, 1, 'item'], [0, 2, 'item'], [0, 6, 'item'], [0, 7, 'item'], [1, 4, 'item'],
    [2, 1, 'item'], [2, 2, 'item'], [2, 6, 'item'], [2, 7, 'item'],
  ]);
});

it('handles empty sources and supplies a fresh iterator each time', () => {
  const empty = planKanbanRenderCopies(prepared([]));
  expect(empty).toMatchObject({ counts: [], total: 0 });
  const plan = planKanbanRenderCopies(prepared([['a', 0], ['i', 2]]));
  expect([...plan.copies()]).toEqual([...plan.copies()]);
  expect(Object.isFrozen(plan)).toBe(true);
  expect(Object.isFrozen(plan.counts)).toBe(true);
});

it('filters display nodes once while retaining native display indices and draw order', () => {
  const plan = planKanbanRenderCopies(prepared([['col', 0], ['visible', 2], ['col', 0], ['hidden', 2]]));
  expect([...plan.copies(new Set([0, 1]))]).toEqual([
    { key: 'kanban-render:0:0:section', nodeIndex: 0, sectionIndex: 0, displayIndex: 0, kind: 'section' },
    { key: 'kanban-render:0:1:item', nodeIndex: 1, sectionIndex: 0, displayIndex: 1, kind: 'item' },
    { key: 'kanban-render:0:4:item', nodeIndex: 1, sectionIndex: 0, displayIndex: 4, kind: 'item' },
    { key: 'kanban-render:1:1:item', nodeIndex: 1, sectionIndex: 1, displayIndex: 1, kind: 'item' },
    { key: 'kanban-render:1:4:item', nodeIndex: 1, sectionIndex: 1, displayIndex: 4, kind: 'item' },
  ]);
  expect([...plan.copies(new Set())]).toEqual([]);
});

it('calculates a large duplicate multiplicity without enumerating render copies', () => {
  const sections = 20;
  const cards = 20;
  const plan = planKanbanRenderCopies(prepared([
    ...Array.from({ length: sections }, () => ['same', 0] as const),
    ...Array.from({ length: cards }, () => ['card', 2] as const),
  ]));
  // Each of the 20 authored cards appears in getData once for every duplicate
  // section, then the renderer draws all 400 display cards below every column.
  expect(plan.counts.slice(0, sections)).toEqual(Array(sections).fill(1));
  expect(plan.counts.slice(sections)).toEqual(Array(cards).fill(sections * sections));
  expect(plan.total).toBe(sections + cards * sections * sections);
});
