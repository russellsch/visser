// Reproduce the pinned Kanban DB's section assignment and getData traversal.
// This module deliberately receives already-normalized DB fields; it performs
// no Mermaid parsing, sanitization, or metadata projection.

export type KanbanGroupNode = Readonly<{ nodeIndex: number; id: string; level: number }>;
export type KanbanGroupCopy = Readonly<{
  key: string;
  nodeIndex: number;
  sectionIndex: number;
  kind: 'section' | 'item';
}>;
export type KanbanGroupPlan = Readonly<{
  sections: readonly number[];
  parents: readonly (number | undefined)[];
  copies: readonly KanbanGroupCopy[];
}>;

function invalid(message: string): never {
  throw new TypeError(`kanban groups: ${message}`);
}

function validate(nodes: readonly KanbanGroupNode[]): void {
  if (!Array.isArray(nodes)) invalid('nodes must be an array');
  for (const [expectedIndex, node] of nodes.entries()) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) invalid(`node ${expectedIndex} must be an object`);
    if (!Number.isSafeInteger(node.nodeIndex) || node.nodeIndex !== expectedIndex) {
      invalid(`node ${expectedIndex} has a non-consecutive nodeIndex`);
    }
    if (typeof node.id !== 'string' || node.id.length === 0) invalid(`node ${expectedIndex} has an empty id`);
    if (!Number.isFinite(node.level) || !Number.isInteger(node.level) || node.level < 0) {
      invalid(`node ${expectedIndex} has an invalid level`);
    }
  }
}

/**
 * Plan the copies emitted by the native Kanban DB. `parents` records the
 * actual section ordinal selected while each source node was added, whereas
 * `copies` repeats matching child IDs under every duplicate section ID.
 */
export function planKanbanGroups(nodes: readonly KanbanGroupNode[]): KanbanGroupPlan {
  validate(nodes);
  const sections: number[] = [];
  const parents: Array<number | undefined> = [];

  for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
    const node = nodes[nodeIndex]!;
    if (nodeIndex === 0) {
      sections.push(nodeIndex);
      parents.push(undefined);
      continue;
    }

    const sectionLevel = nodes[0]!.level;
    let lastSectionNodeIndex: number | undefined;
    for (let previousIndex = nodeIndex - 1; previousIndex >= 0; previousIndex--) {
      const previous = nodes[previousIndex]!;
      if (previous.level === sectionLevel && lastSectionNodeIndex === undefined) lastSectionNodeIndex = previousIndex;
      // This is intentionally checked for every prior node, matching native
      // getSection. A first lower-level node is admitted; the next add fails.
      if (previous.level < sectionLevel) throw new Error(`Items without section detected, found section ("${previous.id}")`);
    }

    if (node.level === nodes[lastSectionNodeIndex!]!.level) {
      sections.push(nodeIndex);
      parents.push(undefined);
    } else {
      const sectionIndex = sections.indexOf(lastSectionNodeIndex!);
      if (sectionIndex < 0) invalid(`node ${nodeIndex} selected a non-section parent`);
      parents.push(sectionIndex);
    }
  }

  const copies: KanbanGroupCopy[] = [];
  for (const [sectionIndex, sectionNodeIndex] of sections.entries()) {
    const section = nodes[sectionNodeIndex]!;
    copies.push(Object.freeze({
      key: `kanban:${sectionIndex}:${sectionNodeIndex}:section`, nodeIndex: sectionNodeIndex, sectionIndex, kind: 'section',
    }));
    for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
      const parent = parents[nodeIndex];
      if (parent === undefined || nodes[sections[parent]!]!.id !== section.id) continue;
      copies.push(Object.freeze({
        key: `kanban:${sectionIndex}:${nodeIndex}:item`, nodeIndex, sectionIndex, kind: 'item',
      }));
    }
  }

  return Object.freeze({
    sections: Object.freeze(sections), parents: Object.freeze(parents), copies: Object.freeze(copies),
  });
}
