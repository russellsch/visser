import { describe, expect, it } from 'vitest';
import { beginStateExtraction, endStateExtraction, observeStateDb, observeStateExtraction } from '../../packages/core/src/mermaid/state-observer.ts';

describe('native state extraction observation', () => {
  it('isolates diagrams and regenerates ownership for each extraction', () => {
    const a = {}, b = {}, aNodes: object[] = [], bNodes: object[] = [], edges: object[] = [];
    const aKinds: string[] = [], bKinds: string[] = [];
    const stopA = observeStateDb(a, event => aKinds.push(event.kind));
    const stopB = observeStateDb(b, event => bKinds.push(event.kind));
    beginStateExtraction(a, aNodes, edges);
    beginStateExtraction(b, bNodes, edges);
    observeStateExtraction(aNodes, 'init', { item: {}, target: {} });
    endStateExtraction(b, bNodes, edges);
    const next: object[] = [];
    beginStateExtraction(a, next, edges);
    observeStateExtraction(aNodes, 'init', { item: {}, target: {} });
    observeStateExtraction(next, 'node', { candidate: {}, retained: {} });
    endStateExtraction(a, next, edges);
    expect(aKinds).toEqual(['begin', 'init', 'begin', 'node', 'end']);
    expect(bKinds).toEqual(['begin', 'end']);
    stopA(); stopB();
  });

  it('retains exact native object identity and runs before the next mutation', () => {
    const db = {}, nodes: object[] = [], edges: object[] = [], item = {}, target = { description: 'before' };
    const observed: string[] = [];
    const stop = observeStateDb(db, event => {
      if (event.kind !== 'description') return;
      expect(event.item).toBe(item);
      expect(event.target).toBe(target);
      observed.push(event.target.description as string);
    });
    beginStateExtraction(db, nodes, edges);
    observeStateExtraction(nodes, 'description', { mode: 'assign', item, target });
    target.description = 'after';
    endStateExtraction(db, nodes, edges);
    expect(observed).toEqual(['before']); stop();
  });

  it('propagates consumer failures and detaches failed arrays', () => {
    const db = {}, nodes: object[] = [], edges: object[] = [];
    let calls = 0;
    const stop = observeStateDb(db, event => { calls++; if (event.kind === 'init') throw new Error('bad provenance'); });
    beginStateExtraction(db, nodes, edges);
    expect(() => observeStateExtraction(nodes, 'init', { item: {}, target: {} })).toThrow('bad provenance');
    observeStateExtraction(nodes, 'init', { item: {}, target: {} });
    endStateExtraction(db, nodes, edges);
    expect(calls).toBe(2); stop();
  });

  it('rejects duplicate consumers and changed array ownership, and permits disposal', () => {
    const db = {}, nodes: object[] = [], edges: object[] = [];
    let calls = 0;
    const stop = observeStateDb(db, () => { calls++; });
    expect(() => observeStateDb(db, () => undefined)).toThrow('already has an observer');
    beginStateExtraction(db, nodes, edges);
    expect(() => endStateExtraction(db, [], edges)).toThrow('replaced arrays');
    stop(); stop();
    beginStateExtraction(db, nodes, edges);
    observeStateExtraction(nodes, 'init', { item: {}, target: {} });
    endStateExtraction(db, nodes, edges);
    expect(calls).toBe(1);
    observeStateDb(db, () => undefined)();
  });
});
