import { beforeAll, describe, expect, it } from 'vitest';
import { extractStateLabels } from '../../packages/core/src/mermaid/state-labels.ts';
import { validateStateMathRecords } from '../../packages/core/src/mermaid/state-math.ts';
import { planStateRenderCopies as planNative } from '../../packages/core/src/mermaid/state-render-plan.ts';
import type { Leaf, StateProvenanceResult } from '../../packages/core/src/mermaid/state-provenance.ts';
import { prepareSequenceSanitizer, sanitizeSequenceField } from '../../packages/core/src/mermaid/sequence-sanitize.ts';
import { MATH_LIMITS } from '../../packages/core/src/math/policy.ts';

const identity = <T>(value: T): T => value;
// These unit fixtures supply reconciled leaves directly; snapshot the native
// identity once as the real observer consumer does in integration tests.
function withSnapshot(data: any): StateProvenanceResult {
  return {...data,nodes:new Map([...data.nodes].map(([node,value]:any)=>[node,{...value,identity:value.identity??Object.freeze({id:node.id,domId:node.domId,shape:node.shape,hasDescription:Object.hasOwn(node,'description')})}])),
    edges:new Map([...data.edges].map(([edge,value]:any)=>[edge,{...value,identity:value.identity??Object.freeze({id:edge.id,start:edge.start,end:edge.end})}]))};
}
function planStateRenderCopies(source:string,provenance:any,records:Parameters<typeof planNative>[2],sanitize:Parameters<typeof planNative>[3],initial?:Parameters<typeof planNative>[4]) {
  return planNative(source,withSnapshot(provenance),records,sanitize,initial);
}
async function fixture(source: string) {
  const labels = await extractStateLabels(source);
  const descriptions = labels.records.filter(record => record.role === 'state.description');
  const transitions = labels.records.filter(record => record.role === 'transition');
  const leaf = (record: typeof descriptions[number]): Leaf => ({ mapped: record.mappedValue, recordIndices: [record.recordIndex] });
  const provenance: StateProvenanceResult = { nodes: new Map(), edges: new Map(), promotedImplicitRecordIndices: [], recordVariants: new Map() };
  return { labels, descriptions, transitions, leaf, provenance };
}

describe('state final label copy plan', () => {
  beforeAll(prepareSequenceSanitizer);
  it('keeps title/body/edge ownership and charges surviving authored formulas once', async () => {
    const source = 'stateDiagram-v2\nA: $$x$$\nA: $$x$$\nA: $$x$$\nA --> B: $$m$$\n';
    const f = await fixture(source);
    const leaves = f.descriptions.map(f.leaf);
    const node = { id: 'A', domId: 'state-A-0', shape: 'rectWithTitle', label: '$$x$$', description: ['$$x$$', '$$x$$'] };
    const edge = { id: 'edge0', label: '$$m$$' };
    const provenance = { ...f.provenance,
      nodes: new Map([[node, { label: leaves[0], description: leaves.slice(1), promotedImplicitRecordIndices: [] }]]),
      edges: new Map([[edge, { label: f.leaf(f.transitions[0]!) }]]) };
    const ledger = validateStateMathRecords(source, f.labels, withSnapshot(provenance), identity);
    const plan = planStateRenderCopies(source, provenance, ledger.records, identity);
    expect(plan.total).toEqual(ledger.total);
    expect(plan.total.occurrences).toBe(4);
    expect(plan.slots.map(slot => [slot.role, slot.inputPath])).toEqual([['title', 'createLabel'], ['body', 'createLabel'], ['label', 'edge']]);
    expect(plan.slots[1]!.renderedValue).toBe('$$x$$\n$$x$$');
    const formulas = plan.slots.flatMap(slot => slot.parts.filter(part => part.kind === 'math'));
    expect(new Set(formulas.map(part => part.recordIndex)).size).toBe(4);
    expect(new Set(formulas.map(part => part.origins[0]!.sourceStart)).size).toBe(4);
    expect(formulas.every(part => !part.synthetic)).toBe(true);
  });

  it('retains overwritten authored costs and reserves additional copies by exact record identity', async () => {
    const source = 'stateDiagram-v2\nA: $$x$$\nA: $$y$$\n';
    const f = await fixture(source);
    const first = f.leaf(f.descriptions[0]!);
    const nodes = new Map(Array.from({ length: 3 }, (_, index) => [
      { id: `copy${index}`, domId: `state-copy-${index}`, shape: 'rect', label: first.mapped.text },
      { label: first, promotedImplicitRecordIndices: [] },
    ] as const));
    const provenance = { ...f.provenance, nodes };
    const ledger = validateStateMathRecords(source, f.labels, withSnapshot(provenance), identity);
    expect(ledger.total.occurrences).toBe(2);
    const plan = planStateRenderCopies(source, provenance, ledger.records, identity);
    expect(plan.total.occurrences).toBe(4); // three x copies plus overwritten y
    expect(() => planStateRenderCopies(source, provenance, ledger.records, identity,
      { svgBytes: 0, elementCount: 0, occurrences: MATH_LIMITS.documentOccurrences - 3 })).toThrow('budget');
  });

  it('uses the native extra decoder/sanitizer only on labelHelper paths', async () => {
    const text = '<br> ﬂ°dollar¶ßﬂ°dollar¶ßxﬂ°dollar¶ßﬂ°dollar¶ß';
    const source = `stateDiagram-v2\nA: ${text}\n`;
    const f = await fixture(source);
    const value = f.leaf(f.descriptions[0]!);
    const node = { id: 'A', domId: 'state-A-0', shape: 'rect', label: text };
    const nodes = new Map([[node, { label: value, promotedImplicitRecordIndices: [] }]]);
    const provenance = { ...f.provenance, nodes };
    const ledger = validateStateMathRecords(source, f.labels, withSnapshot(provenance), sanitizeSequenceField);
    const helper = planStateRenderCopies(source, provenance, ledger.records, sanitizeSequenceField);
    expect(helper.slots[0]!.renderedValue).toBe('\n $$x$$');
    expect(helper.total.occurrences).toBe(1);
    const titleNode = { ...node, shape: 'rectWithTitle', description: [] };
    const direct = planStateRenderCopies(source, { ...provenance, nodes: new Map([[titleNode,
      { label: value, description: [], promotedImplicitRecordIndices: [] }]]) }, ledger.records, sanitizeSequenceField);
    expect(direct.slots[0]!.renderedValue).toContain('ﬂ°dollar¶ß');
    expect(direct.total.occurrences).toBe(0);
  });

  it('rejects cross-field delimiter pairing, stale labels and missing record identity', async () => {
    const source = 'stateDiagram-v2\nA: $$x$$\n';
    const f = await fixture(source); const value = f.leaf(f.descriptions[0]!);
    const ledger = validateStateMathRecords(source, f.labels, f.provenance, identity);
    const node = { id: 'A', domId: 'state-A-0', shape: 'rect', label: 'changed' };
    const provenance = { ...f.provenance, nodes: new Map([[node, { label: value, promotedImplicitRecordIndices: [] }]]) };
    expect(() => planStateRenderCopies(source, provenance, ledger.records, identity)).toThrow('changed after reconciliation');
    node.label = value.mapped.text;
    expect(() => planStateRenderCopies(source, provenance, [], identity)).toThrow('missing from authored validation');
    const left = { ...value, mapped: value.mapped.replace(0, value.mapped.length, '$$x') };
    const right = { ...value, mapped: value.mapped.replace(0, value.mapped.length, 'y$$') };
    const joined = { id: 'A', domId: 'state-A-0', shape: 'rectWithTitle', label: value.mapped.text, description: ['$$x', 'y$$'] };
    expect(() => planStateRenderCopies(source, { ...f.provenance, nodes: new Map([[joined,
      { label: value, description: [left, right], promotedImplicitRecordIndices: [] }]]) }, ledger.records, identity)).toThrow('unmatched');
  });

  it('rejects mutations of reconciled native identity, applicability and absent descriptions', async () => {
    const source='stateDiagram-v2\nA: $$x$$\n';
    const f=await fixture(source), value=f.leaf(f.descriptions[0]!);
    const ledger=validateStateMathRecords(source,f.labels,f.provenance,identity);
    const node:Record<string,unknown>={id:'A',domId:'state-A-0',shape:'rect',label:'$$x$$'};
    const edge:Record<string,unknown>={id:'edge0',start:'A',end:'B',label:'$$x$$'};
    const provenance=withSnapshot({...f.provenance,nodes:new Map([[node,{label:value,promotedImplicitRecordIndices:[]}]]),edges:new Map([[edge,{label:value}]])});
    for(const [field,changed] of [['id','other'],['domId','other-dom'],['shape','choice']] as const){
      const before=node[field];node[field]=changed;
      expect(()=>planNative(source,provenance,ledger.records,identity)).toThrow('identity or shape changed');node[field]=before;
    }
    node.description=undefined;
    expect(()=>planNative(source,provenance,ledger.records,identity)).toThrow('identity or shape changed');delete node.description;
    for(const field of ['id','start','end']){
      const before=edge[field];edge[field]='other';
      expect(()=>planNative(source,provenance,ledger.records,identity)).toThrow('edge identity changed');edge[field]=before;
    }
  });

  it('omits untitled groups and hidden shapes and fails on the pinned undefined-shape case', async () => {
    const source = 'stateDiagram-v2\nA: plain\n';
    const f = await fixture(source); const value = f.leaf(f.descriptions[0]!);
    const ledger = validateStateMathRecords(source, f.labels, f.provenance, identity);
    const hidden = { id: 'start', domId: 'state-start-0', shape: 'stateStart', label: 'plain' };
    const group = { id: 'group', shape: 'noteGroup' };
    const provenance = { ...f.provenance, nodes: new Map<object, any>([[hidden, { label: value, promotedImplicitRecordIndices: [] }],
      [group, { structural: true, promotedImplicitRecordIndices: [] }]]) };
    expect(planStateRenderCopies(source, provenance, ledger.records, identity).slots).toEqual([]);
    expect(() => planStateRenderCopies(source, { ...f.provenance, nodes: new Map([[{ ...hidden, shape: undefined },
      { label: value, promotedImplicitRecordIndices: [] }]]) }, ledger.records, identity)).toThrow('no renderable shape');
  });
});
