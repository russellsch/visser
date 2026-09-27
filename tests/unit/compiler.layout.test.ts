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
});
