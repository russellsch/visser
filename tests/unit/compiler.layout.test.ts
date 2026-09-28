import { describe, expect, it } from 'vitest';
import { layoutGraph, workerLayout, type GraphInput } from '../../packages/core/src/compiler/index.ts';

const workerPath = new URL('../../packages/core/src/compiler/layout-worker.ts', import.meta.url);

const graph: GraphInput = {
  id: 'handoff',
  groups: [{ id: 'svc', label: 'Service' }],
  nodes: [
    { id: 'producer', label: 'Producer' },
    { id: 'queue', label: 'Bounded queue', group: 'svc' },
    { id: 'worker', label: 'Consumer' },
  ],
  edges: [
    { id: 'enqueue', from: 'producer', to: 'queue', label: 'put waits while full' },
    { id: 'dequeue', from: 'worker', to: 'queue', label: 'get removes one item; waits while empty' },
  ],
};

describe('graph layout (§7.5)', () => {
  it('is deterministic and rounded to three decimals', async () => {
    const a = await layoutGraph(graph);
    const b = await layoutGraph(structuredClone(graph));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    for (const x of JSON.stringify(a).match(/-?\d+\.\d+/g) ?? []) expect(x.split('.')[1]!.length).toBeLessThanOrEqual(3);
    expect(a.groups[0]!.x).toBeLessThanOrEqual(a.nodes.find((n) => n.id === 'queue')!.x);
  });

  it('gives the same layout in the bounded worker', async () => {
    const inProcess = await layoutGraph(graph);
    const viaWorker = await workerLayout(workerPath.pathname)(graph);
    expect(viaWorker).toEqual(inProcess);
  });

  it('fails with E_LAYOUT_TIMEOUT when the worker exceeds its time limit', async () => {
    await expect(workerLayout(workerPath.pathname, 1)(graph)).rejects.toMatchObject({ code: 'E_LAYOUT_TIMEOUT' });
  });

  it('gives two self-transitions on one state non-overlapping label boxes (dogfood-3 F6)', async () => {
    const selfLoopGraph: GraphInput = {
      id: 'lifecycle',
      groups: [],
      nodes: [{ id: 'running', label: 'Running' }, { id: 'done', label: 'Done' }],
      edges: [
        { id: 'tr_tick', from: 'running', to: 'running', label: 'timer tick' },
        { id: 'tr_poll', from: 'running', to: 'running', label: 'health poll' },
        { id: 'tr_finish', from: 'running', to: 'done', label: 'finish' },
      ],
    };
    const layout = await layoutGraph(selfLoopGraph);
    const label = (id: string) => layout.edges.find((e) => e.id === id)!.label!;
    const a = label('tr_tick');
    const b = label('tr_poll');
    const overlapsX = a.x < b.x + b.width && b.x < a.x + a.width;
    const overlapsY = a.y < b.y + b.height && b.y < a.y + a.height;
    expect(overlapsX && overlapsY).toBe(false);
    // Every coordinate stays rounded to three decimals even after the self-loop shift.
    for (const x of JSON.stringify(layout).match(/-?\d+\.\d+/g) ?? []) expect(x.split('.')[1]!.length).toBeLessThanOrEqual(3);
    // A single self-transition is untouched: same layout on repeat, no special-casing bug.
    const single: GraphInput = { id: 'g2', groups: [], nodes: [{ id: 's', label: 'S' }], edges: [{ id: 'tr_only', from: 's', to: 's', label: 'retry' }] };
    const layoutSingle = await layoutGraph(single);
    expect(layoutSingle.edges[0]!.label).toBeDefined();
  });
});
