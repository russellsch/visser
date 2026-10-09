import { registerHooks } from 'node:module';
import { describe, expect, it } from 'vitest';
import { extractFlowchartMath } from '../../packages/core/src/mermaid/flowchart-math.ts';
import { parseMermaid } from '../../packages/core/src/mermaid/parse.ts';
import { reconcileFlowchartMath, reconcileFlowchartData } from '../../packages/core/src/mermaid/flowchart-db.ts';

type Db = Parameters<typeof reconcileFlowchartMath>[0];
async function fixture(source: string) {
  const hook = registerHooks({ resolve(specifier, context, next) {
    return specifier === 'dompurify'
      ? { url: new URL('../../packages/core/src/mermaid/dompurify-stub.ts', import.meta.url).href, shortCircuit: true }
      : next(specifier, context);
  } });
  try {
    const { default: mermaid } = await import('mermaid');
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', logLevel: 'fatal' });
    const parsed = await extractFlowchartMath(source);
    const diagram = await mermaid.mermaidAPI.getDiagramFromText(source);
    return { ...parsed, db: diagram.db as unknown as Db };
  } finally { hook.deregister(); }
}

describe('flowchart renderer DB reconciliation', () => {
  it('matches final labels, types, edge fanout and normalized accessibility against actual Mermaid', async () => {
    const { records, db } = await fixture(`flowchart LR
accTitle: Math
accDescr {First
   $$y$$
}
A["$$x$$"] & B -->|"$$z$$"| C & D
A@{label: ["$$w$$", "unused"]}
`);
    const slots = reconcileFlowchartMath(db, records);
    expect(slots.filter(slot => slot.kind === 'edge')).toHaveLength(4);
    const a = slots.find(slot => slot.key === 'node:A')!;
    expect(records[a.recordIndex]!.role).toBe('node.metadata');
    expect(records[a.recordIndex]!.semanticValue).toBe('$$w$$');
  });
  it('derives visible slots after collapse while retaining hidden authored validation records', async () => {
    const { records, db } = await fixture(`flowchart LR
subgraph g["Group $$s$$"]
 A["$$a$$"] -->|"$$inside$$"| B["$$b$$"]
end
g@{view: collapsed}
B -->|"$$outside$$"| C
`);
    const { slots, hiddenKeys } = reconcileFlowchartData(db, records);
    expect(hiddenKeys).toEqual(expect.arrayContaining(['node:A', 'node:B', 'edge:L_A_B_0']));
    expect(hiddenKeys).not.toContain('group:g');
    expect(slots.map(slot => slot.key)).toContain('subgraph:g');
    expect(slots.map(slot => slot.key)).not.toContain('node:g');
    expect(slots.map(slot => slot.key)).not.toContain('node:A');
    expect(slots.map(slot => slot.key)).not.toContain('node:B');
    expect(slots.filter(slot => slot.kind === 'edge')).toHaveLength(1);
    expect(records.some(record => record.semanticValue === '$$inside$$')).toBe(true);
  });
  it('rejects duplicate subgraph identities accepted by upstream parsing', async () => {
    const { records, db } = await fixture('flowchart LR\nsubgraph g["$$x$$"]\nA\nend\nsubgraph g["$$y$$"]\nB\nend\n');
    expect(() => reconcileFlowchartMath(db, records)).toThrow(/duplicate subgraph IDs/);
  });
  it('rejects altered label, type, edge identity and extra visible slots', async () => {
    for (const mutate of [
      (db: Db) => { ((db['getVertices']!() as Map<string, Record<string, unknown>>).get('A')!).text = '$$different$$'; },
      (db: Db) => { ((db['getVertices']!() as Map<string, Record<string, unknown>>).get('A')!).labelType = 'markdown'; },
      (db: Db) => { (db['getEdges']!() as Record<string, unknown>[])[0]!.start = 'wrong'; },
      (db: Db) => { const get = db['getData']!; db['getData'] = () => {
        const data = get.call(db) as { nodes: unknown[] }; data.nodes.push({ id: 'unowned', label: '$$x$$' }); return data;
      }; },
    ]) {
      const { records, db } = await fixture('flowchart LR\nA["$$x$$"] -->|"$$y$$"| B\n');
      mutate(db);
      expect(() => reconcileFlowchartMath(db, records)).toThrow(/reconciliation/);
    }
  });
});

it('keeps plain upstream acceptance without losing ignored authored math validation', () => {
  const sources = [
    'flowchart LR\nsubgraph g[First]\nA\nend\nsubgraph g[Second]\nB\nend\n',
    'flowchart LR\nA e1@--> B\ne1["ignored"]\n',
    'flowchart LR\nA e1@--> B\nstyle e1 fill:#f00\n',
    'flowchart LR\ne1[Original]\nA e1@--> B\ne1["ignored"]\n',
  ];
  for (const source of sources) {
    expect(parseMermaid([{ figureId: 'f', type: 'flowchart', source }]).get('f')?.ok).toBe(true);
  }
  const source = 'flowchart LR\nA e1@--> B\ne1["$$\\unsupportedVisserCommand$$"]\n';
  expect(parseMermaid([{ figureId: 'f', type: 'flowchart', source }]).get('f')).toMatchObject({ ok: false, code: 'E_MATH' });
});

it('omits only deliberate no-label shape slots while validating their authored math', async () => {
  for (const shape of ['fork', 'join', 'sm-circ', 'fr-circ', 'hourglass', 'bolt', 'junction', 'summary', 'choice', 'anchor']) {
    const { records, db, total } = await fixture(`flowchart LR\nA@{shape: ${shape}, label: "$$x$$"}\nB["$$y$$"]\n`);
    const { slots, hiddenKeys } = reconcileFlowchartData(db, records);
    expect(slots.map(slot => slot.key), shape).toEqual(['node:B']);
    expect(hiddenKeys, shape).not.toContain('node:A');
    expect(total.occurrences, shape).toBe(2);
  }
});
it('pins all no-label handler aliases to the reviewed registry', async () => {
  const { FLOWCHART_NO_LABEL_SHAPES } = await import('../../packages/core/src/mermaid/flowchart-shapes.ts');
  // @ts-expect-error pinned upstream chunk has no declarations.
  const { shapes } = await import('mermaid/dist/chunks/mermaid.core/chunk-7INBJB4K.mjs');
  const handlers = new Set(['anchor', 'choice', 'stateStart', 'stateEnd', 'forkJoin', 'hourglass', 'lightningBolt', 'filledCircle', 'crossedCircle']);
  const actual = Object.entries(shapes as Record<string, Function>).filter(([, handler]) => handlers.has(handler.name)).map(([name]) => name);
  expect([...FLOWCHART_NO_LABEL_SHAPES].sort()).toEqual(actual.sort());
});
