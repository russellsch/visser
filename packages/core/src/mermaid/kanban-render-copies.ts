// Plan the copies drawn by Kanban's renderer from its already-prepared DB
// state.  `groups.copies` is getData's display order; drawing has a separate
// header pass and then revisits matching display items for every section.
import { MathPolicyError } from '../math/policy.ts';
import type { KanbanPreparedSource } from './kanban-source.ts';

export type KanbanRenderCopy = Readonly<{
  key: string;
  nodeIndex: number;
  sectionIndex: number;
  displayIndex: number;
  kind: 'section' | 'item';
}>;

export type KanbanRenderCopyPlan = Readonly<{
  counts: readonly number[];
  total: number;
  copies(nodes?: ReadonlySet<number>): IterableIterator<KanbanRenderCopy>;
}>;

type ValidatedSource = Readonly<{
  nodeCount: number;
  sections: readonly number[];
  sectionIds: readonly string[];
  display: KanbanPreparedSource['groups']['copies'];
  parentIds: readonly (string | undefined)[];
}>;

function invalid(message: string): never {
  throw new MathPolicyError('E_MATH_INVALID', `kanban render copies: ${message}`);
}

function overflow(message: string): never {
  throw new MathPolicyError('E_MATH_RESOURCE', `kanban render copies: ${message}`);
}

function index(value: unknown, limit: number, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) >= limit) invalid(`${field} is invalid`);
  return value as number;
}

function validate(prepared: KanbanPreparedSource): ValidatedSource {
  if (!prepared || typeof prepared !== 'object' || Array.isArray(prepared)) invalid('prepared source is invalid');
  const { authored, groups, nodes, snapshot } = prepared;
  if (!authored || !Array.isArray(authored.nodes) || !groups || !Array.isArray(groups.sections) ||
      !Array.isArray(groups.parents) || !Array.isArray(groups.copies) || !Array.isArray(nodes) ||
      !snapshot || !Array.isArray(snapshot.nodes)) {
    invalid('prepared source has invalid collections');
  }
  const nodeCount = nodes.length;
  if (authored.nodes.length !== nodeCount || snapshot.nodes.length !== nodeCount || groups.parents.length !== nodeCount) {
    invalid('prepared source node collections disagree');
  }

  const parentIds: Array<string | undefined> = [];
  for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex++) {
    const authoredNode = authored.nodes[nodeIndex];
    const node = nodes[nodeIndex];
    const snapshotNode = snapshot.nodes[nodeIndex];
    if (!authoredNode || authoredNode.nodeIndex !== nodeIndex || !node || node.nodeIndex !== nodeIndex ||
        !snapshotNode || typeof snapshotNode.id !== 'string' || snapshotNode.id.length === 0 ||
        !node.effectiveId || node.effectiveId.text !== snapshotNode.id) {
      invalid(`node ${nodeIndex} differs from prepared identity`);
    }
    if (snapshotNode.parentId !== undefined && typeof snapshotNode.parentId !== 'string') {
      invalid(`node ${nodeIndex} has an invalid parent id`);
    }
    parentIds.push(snapshotNode.parentId);
  }

  const sectionIds: string[] = [];
  const sectionNodes = new Set<number>();
  for (const [sectionIndex, sectionNodeIndex] of groups.sections.entries()) {
    const nodeIndex = index(sectionNodeIndex, nodeCount, `section ${sectionIndex}`);
    if (sectionNodes.has(nodeIndex) || parentIds[nodeIndex] !== undefined) invalid(`section ${sectionIndex} is inconsistent`);
    sectionNodes.add(nodeIndex);
    sectionIds.push(snapshot.nodes[nodeIndex]!.id);
  }
  for (const [nodeIndex, parent] of groups.parents.entries()) {
    if (parent === undefined) {
      if (!sectionNodes.has(nodeIndex)) invalid(`node ${nodeIndex} has no section`);
      continue;
    }
    const sectionIndex = index(parent, sectionIds.length, `parent ${nodeIndex}`);
    if (parentIds[nodeIndex] !== sectionIds[sectionIndex]) invalid(`node ${nodeIndex} parent differs from its section`);
  }

  // Check the existing display list against getData's exact construction. The
  // check scans it but does not construct another (potentially much larger)
  // render-output list.
  let displayIndex = 0;
  for (const [sectionIndex, sectionNodeIndex] of groups.sections.entries()) {
    const section = groups.copies[displayIndex++];
    if (!section || section.kind !== 'section' || section.sectionIndex !== sectionIndex || section.nodeIndex !== sectionNodeIndex) {
      invalid(`display section ${sectionIndex} is inconsistent`);
    }
    for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex++) {
      const parent = groups.parents[nodeIndex];
      if (parent === undefined || sectionIds[parent] !== sectionIds[sectionIndex]) continue;
      const item = groups.copies[displayIndex++];
      if (!item || item.kind !== 'item' || item.sectionIndex !== sectionIndex || item.nodeIndex !== nodeIndex) {
        invalid(`display item ${displayIndex - 1} is inconsistent`);
      }
    }
  }
  if (displayIndex !== groups.copies.length) invalid('display copies have extra entries');
  return Object.freeze({ nodeCount, sections: groups.sections, sectionIds: Object.freeze(sectionIds), display: groups.copies, parentIds: Object.freeze(parentIds) });
}

function add(counts: number[], nodeIndex: number, amount: number): void {
  const next = counts[nodeIndex]! + amount;
  if (!Number.isSafeInteger(next)) overflow(`count for node ${nodeIndex} exceeds a safe integer`);
  counts[nodeIndex] = next;
}

/**
 * Reproduce the native renderer's draw multiplicity.  The prepared source is
 * internal trusted state, not a transport receipt: this only reads the DB and
 * group fields needed to establish native display identities.
 */
export function planKanbanRenderCopies(prepared: KanbanPreparedSource): KanbanRenderCopyPlan {
  const source = validate(prepared);
  const sectionMultiplicity = new Map<string, number>();
  for (const sectionId of source.sectionIds) sectionMultiplicity.set(sectionId, (sectionMultiplicity.get(sectionId) ?? 0) + 1);

  const counts = Array<number>(source.nodeCount).fill(0);
  let total = 0;
  for (const copy of source.display) {
    const nodeIndex = index(copy.nodeIndex, source.nodeCount, 'display node index');
    if (copy.kind === 'section') {
      add(counts, nodeIndex, 1);
      if (total === Number.MAX_SAFE_INTEGER) overflow('total exceeds a safe integer');
      total++;
      continue;
    }
    if (copy.kind !== 'item') invalid('display copy has an invalid kind');
    const amount = sectionMultiplicity.get(source.parentIds[nodeIndex]!) ?? 0;
    add(counts, nodeIndex, amount);
    if (amount > Number.MAX_SAFE_INTEGER - total) overflow('total exceeds a safe integer');
    total += amount;
  }
  if (!Number.isSafeInteger(total) || counts.some(count => !Number.isSafeInteger(count) || count < 0)) overflow('counts are not safe integers');

  const immutableCounts = Object.freeze(counts);
  function* copies(nodes?: ReadonlySet<number>): IterableIterator<KanbanRenderCopy> {
    // Filter the display list once.  Keeping the original index is important:
    // it is part of the renderer draw identity, even when earlier entries are
    // absent from this bounded projection.
    const display = nodes === undefined ? source.display.map((entry, displayIndex) => ({entry, displayIndex})) :
      source.display.flatMap((entry, displayIndex) => nodes.has(entry.nodeIndex) ? [{entry, displayIndex}] : []);
    for (const {entry, displayIndex} of display) {
      const display = entry;
      if (display.kind !== 'section') continue;
      yield Object.freeze({
        key: `kanban-render:${display.sectionIndex}:${displayIndex}:section`,
        nodeIndex: display.nodeIndex,
        sectionIndex: display.sectionIndex,
        displayIndex,
        kind: 'section',
      });
    }
    for (let sectionIndex = 0; sectionIndex < source.sections.length; sectionIndex++) {
      const sectionId = source.sectionIds[sectionIndex]!;
      for (const {entry, displayIndex} of display) {
        const display = entry;
        if (display.kind !== 'item' || source.parentIds[display.nodeIndex] !== sectionId) continue;
        yield Object.freeze({
          key: `kanban-render:${sectionIndex}:${displayIndex}:item`,
          nodeIndex: display.nodeIndex,
          sectionIndex,
          displayIndex,
          kind: 'item',
        });
      }
    }
  }
  return Object.freeze({ counts: immutableCounts, total, copies });
}
