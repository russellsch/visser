// Reconcile grammar-owned assignments with the actual pinned renderer DB.
// Raw assignments establish identity; getData() determines visible slots after
// group collapse. No source binding may be inferred from equal label text.
import { FLOWCHART_NO_LABEL_SHAPES } from './flowchart-shapes.ts';
import { MathPolicyError } from '../math/policy.ts';
import type { FlowchartMathRecord } from './flowchart-math.ts';

type Db = Record<string, (...args: unknown[]) => unknown>;
type Item = Record<string, unknown>;
export type FlowchartMathSlot = {
  key: string;
  kind: 'node' | 'edge' | 'subgraph';
  id: string;
  recordIndex: number;
};
function invalid(message: string): never {
  throw new MathPolicyError('E_MATH_INVALID', `flowchart renderer reconciliation: ${message}`);
}
function item(value: unknown): Item {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('expected a DB record');
  return value as Item;
}
function selected(value: unknown): string {
  const text = Array.isArray(value) ? value[0] : value;
  if (typeof text !== 'string') invalid('final label must select a string');
  return text;
}
function sameLabel(record: FlowchartMathRecord, actual: Item, field: string): void {
  if (record.semanticValue !== selected(actual[field]) || record.labelType !== actual['labelType']) {
    invalid(`${record.role} label or label type differs from the renderer DB`);
  }
}

export function reconcileFlowchartData(db: Db, records: readonly FlowchartMathRecord[]): { slots: FlowchartMathSlot[]; hiddenKeys: string[] } {
  const rawVertices = db['getVertices']?.();
  const rawEdges = db['getEdges']?.();
  const rawGroups = db['getSubGraphs']?.();
  if (!(rawVertices instanceof Map) || !Array.isArray(rawEdges) || !Array.isArray(rawGroups)) {
    invalid('expected vertices, edges and subgraphs');
  }
  const nodes = new Map<string, number>();
  const groups = new Map<string, number>();
  const edges = new Map<number, number>();
  for (const [index, record] of records.entries()) {
    if (!record.active) continue;
    if (record.role.startsWith('node.')) {
      if (!record.ownerId || nodes.has(record.ownerId)) invalid('ambiguous active node assignment');
      nodes.set(record.ownerId, index);
    } else if (record.role === 'subgraph') {
      if (!record.ownerId || groups.has(record.ownerId)) invalid('duplicate subgraph IDs cannot identify source labels');
      groups.set(record.ownerId, index);
    } else if (record.role === 'edge') {
      if (!record.edgeIndices || record.edgeIndices.length !== record.edgeIds?.length ||
          record.edgeIndices.length !== record.endpoints?.length) invalid('incomplete edge identities');
      for (const [copy, edgeIndex] of record.edgeIndices.entries()) {
        if (edges.has(edgeIndex)) invalid('ambiguous edge assignment');
        const actual = item(rawEdges[edgeIndex]);
        const endpoint = record.endpoints[copy]!;
        if (actual['id'] !== record.edgeIds[copy] || actual['start'] !== endpoint.start || actual['end'] !== endpoint.end) {
          invalid('edge identity differs from grammar fanout');
        }
        sameLabel(record, actual, 'text');
        edges.set(edgeIndex, index);
      }
    }
  }
  if (nodes.size !== rawVertices.size) invalid('node assignment count differs from renderer DB');
  for (const [id, value] of rawVertices) {
    const index = nodes.get(id);
    if (index === undefined) invalid('renderer node has no authored assignment');
    const actual = item(value);
    if (actual['id'] !== id) invalid('renderer vertex key differs from its ID');
    sameLabel(records[index]!, actual, 'text');
  }
  const edgeById = new Map<string, number>();
  for (const [index, value] of rawEdges.entries()) {
    const actual = item(value);
    if (typeof actual['id'] !== 'string' || edgeById.has(actual['id'])) invalid('duplicate or invalid edge IDs');
    edgeById.set(actual['id'], index);
    if (!edges.has(index) && actual['text'] !== '') invalid('renderer edge label has no authored assignment');
  }
  if (groups.size !== rawGroups.length) invalid('subgraph assignment count differs from renderer DB');
  const seenGroups = new Set<string>();
  for (const value of rawGroups) {
    const actual = item(value);
    const id = actual['id'];
    const index = typeof id === 'string' ? groups.get(id) : undefined;
    if (typeof id !== 'string' || index === undefined || seenGroups.has(id)) invalid('subgraph identity differs from grammar');
    seenGroups.add(id);
    // Native repeated flows retain their first insertion position while their
    // active label's effect order follows the final assignment.
    sameLabel(records[index]!, actual, 'title');
  }
  for (const [role, getter] of [['accTitle', 'getAccTitle'], ['accDescr', 'getAccDescription']] as const) {
    const expected = records.findLast(record => record.role === role && record.active)?.semanticValue ?? '';
    if (db[getter]?.() !== expected) invalid(`${role} differs from renderer DB`);
  }

  // Call once. Future upstream changes must not make separate reads disagree.
  const data = item(db['getData']?.());
  if (!Array.isArray(data['nodes']) || !Array.isArray(data['edges'])) invalid('missing renderer layout data');
  const slots: FlowchartMathSlot[] = [];
  const seen = new Set<string>();
  const add = (kind: FlowchartMathSlot['kind'], id: string, recordIndex: number) => {
    const key = `${kind}:${id}`;
    if (seen.has(key)) invalid('duplicate visible label identity');
    seen.add(key);
    slots.push({ key, kind, id, recordIndex });
  };
  for (const value of data['nodes']) {
    const actual = item(value);
    const id = actual['id'];
    if (typeof id !== 'string') invalid('invalid visible node ID');
    const group = groups.get(id);
    const index = group ?? nodes.get(id);
    if (index === undefined) invalid('visible node has no source assignment');
    sameLabel(records[index]!, actual, 'label');
    if (typeof actual['shape'] !== 'string') invalid('visible node has no shape');
    if (!FLOWCHART_NO_LABEL_SHAPES.has(actual['shape'])) add(group === undefined ? 'node' : 'subgraph', id, index);
  }
  for (const value of data['edges']) {
    const actual = item(value);
    const id = actual['id'];
    if (typeof id !== 'string') invalid('invalid visible edge ID');
    const rawIndex = edgeById.get(id);
    if (rawIndex === undefined) invalid('visible edge has no raw identity');
    const index = edges.get(rawIndex);
    if (index === undefined) {
      if (actual['label'] !== '') invalid('visible edge gained a label');
      continue;
    }
    sameLabel(records[index]!, actual, 'label');
    add('edge', id, index);
  }
  const visibleNodes = new Set(data['nodes'].map(value => item(value)['id']));
  const visibleEdges = new Set(data['edges'].map(value => item(value)['id']));
  const hiddenKeys: string[] = [];
  for (const id of nodes.keys()) if (!groups.has(id) && !visibleNodes.has(id)) hiddenKeys.push(`node:${id}`);
  for (const id of groups.keys()) if (!visibleNodes.has(id)) hiddenKeys.push(`group:${id}`);
  for (const id of edgeById.keys()) if (!visibleEdges.has(id)) hiddenKeys.push(`edge:${id}`);
  return { slots, hiddenKeys };
}

export function reconcileFlowchartMath(db: Db, records: readonly FlowchartMathRecord[]): FlowchartMathSlot[] {
  return reconcileFlowchartData(db, records).slots;
}
