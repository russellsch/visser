import type { TargetId, TargetRecord } from '../types.ts';
import { evidenceIdsOf, inlineText, type MNode, type TargetModel } from './targets.ts';

export type InspectionDepth = 'explanation' | 'context' | 'evidence' | 'bare';

export type InspectionProfile = {
  targetId: TargetId;
  explanation: boolean;
  context: string[];
  evidenceIds: TargetId[];
  depth: InspectionDepth;
};

export type VisibleInspectionContent = {
  explanation?: boolean;
  context?: Iterable<string>;
  evidence?: boolean;
};

const FACTS: Readonly<Record<string, readonly string[]>> = {
  node: ['role', 'entity'], state: ['initial', 'terminal'], transition: ['event', 'guard', 'action', 'basis'],
  factor: ['basis'], 'causal-link': ['basis'], task: ['status', 'due', 'owner', 'output', 'acceptance', 'risk'],
  dependency: ['kind', 'quantity'], edge: ['quantity'], stage: ['representation', 'shape', 'units', 'location', 'ownership'],
  conversion: ['loss', 'condition', 'quantity'], criterion: ['units'], cell: ['value', 'valueStatus'],
  concept: ['category', 'attributes'], relation: ['kind', 'cardinality'], entry: ['path', 'role'], reading: ['value', 'valueStatus'],
  actor: ['entity'], event: ['actor', 'to', 'time', 'duration', 'branch'], branch: ['condition', 'exclusiveWith'], annotation: ['lines', 'side', 'region'],
};

type InspectionIndex = {
  targetNodes: ReadonlySet<MNode>;
  incident: ReadonlyMap<TargetId, readonly string[]>;
  appearances: ReadonlySet<TargetId>;
  mermaid: ReadonlyMap<TargetId, readonly string[]>;
  profiles: Map<TargetId, InspectionProfile>;
};

const INDEXES = new WeakMap<TargetModel, InspectionIndex>();

function add(map: Map<TargetId, Set<string>>, id: TargetId, value: string): void {
  const values = map.get(id) ?? new Set<string>();
  values.add(value);
  map.set(id, values);
}

/** Build the cross-target facts once; compiling every profile remains linear. */
function inspectionIndex(model: TargetModel): InspectionIndex {
  const existing = INDEXES.get(model);
  if (existing) return existing;

  const incident = new Map<TargetId, Set<string>>();
  for (const relationship of model.relationships) {
    if (relationship.id !== relationship.from) add(incident, relationship.from, `relationship:${relationship.id}`);
    if (relationship.id !== relationship.to) add(incident, relationship.to, `relationship:${relationship.id}`);
  }

  const entityGroups = new Map<string, TargetId[]>();
  for (const record of model.targets.values()) {
    if (!isPart(record)) continue;
    const node = model.nodes.get(record.id);
    const entity = typeof node?.attributes['entity'] === 'string' ? node.attributes['entity'] : record.id;
    entityGroups.set(entity, [...(entityGroups.get(entity) ?? []), record.id]);
  }
  const appearances = new Set<TargetId>();
  for (const ids of entityGroups.values()) if (ids.length > 1) for (const id of ids) appearances.add(id);

  const mermaid = new Map<TargetId, Set<string>>();
  for (const figure of model.mermaid.values()) {
    for (const element of figure.elements) {
      if (element.initial) add(mermaid, element.id, 'mermaid:initial');
      if (element.terminal) add(mermaid, element.id, 'mermaid:terminal');
      if (element.members?.length) add(mermaid, element.id, 'mermaid:members');
    }
    for (const relationship of figure.relationships) {
      const key = `mermaid:${relationship.id}`;
      add(mermaid, relationship.id, key);
      add(mermaid, relationship.from, key);
      add(mermaid, relationship.to, key);
    }
  }

  const index: InspectionIndex = {
    targetNodes: new Set(model.nodes.values()),
    incident: new Map([...incident].map(([id, values]) => [id, [...values].sort()])),
    appearances,
    mermaid: new Map([...mermaid].map(([id, values]) => [id, [...values].sort()])),
    profiles: new Map(),
  };
  INDEXES.set(model, index);
  return index;
}

function substantiveBody(node: MNode, isTarget: (node: MNode) => boolean): boolean {
  const visit = (n: MNode): boolean => {
    if (n !== node && isTarget(n)) return false;
    if (n.type === 'tag' && n.tag === 'cite') return false;
    if (n.type === 'text' || n.type === 'code') return String(n.attributes['content'] ?? '').trim() !== '';
    if (n.type === 'fence' || n.type === 'image' || n.type === 'hr' || n.type === 'table') return true;
    return n.children.some(visit);
  };
  return node.children.some(visit);
}

function bodyBlocks(node: MNode, isTarget: (node: MNode) => boolean): number {
  return node.children.filter((child) => child.type !== 'comment' && !isTarget(child) && substantiveBody({ ...node, children: [child] }, isTarget)).length;
}

function valuePresent(value: unknown): boolean {
  return value !== undefined && value !== false && (!Array.isArray(value) || value.length > 0);
}

function isPart(record: TargetRecord): boolean {
  return record.ownerComponentId !== undefined && record.ownerComponentId !== record.id && !['source', 'definition', 'detail'].includes(record.kind);
}

/**
 * Content available in a target's inspector, independent of any one rendered
 * representation. Renderers subtract their visible payload with `instanceDepth`.
 */
export function inspectionProfile(model: TargetModel, targetId: TargetId): InspectionProfile {
  const index = inspectionIndex(model);
  const cached = index.profiles.get(targetId);
  if (cached) return cached;
  const record = model.targets.get(targetId);
  const node = model.nodes.get(targetId);
  const isTarget = (n: MNode) => index.targetNodes.has(n);
  let explanation = node ? substantiveBody(node, isTarget) : false;

  // A concept's inspector begins with the full definition that it owns.
  // The profile therefore follows that one contract reference as well as the
  // concept's own body.
  if (record?.kind === 'concept' && node && typeof node.attributes['definition'] === 'string') {
    const definition = model.nodes.get(node.attributes['definition']);
    if (definition && substantiveBody(definition, isTarget)) explanation = true;
  }

  // A body-only compare cell displays its first authored block as the value.
  // Only later blocks are additional explanation in the inspector.
  if (record?.kind === 'cell' && node && node.attributes['value'] === undefined) explanation = bodyBlocks(node, isTarget) > 1;

  const context = new Set<string>();
  if (record && node) {
    const factKeys = record.kind === 'part'
      ? Object.keys(node.attributes).filter((key) => key !== 'id' && key !== 'label')
      : (FACTS[record.kind] ?? []);
    for (const key of factKeys) if (valuePresent(node.attributes[key])) context.add(`fact:${key}`);
    if (record.kind === 'task' && node.attributes['status'] === undefined) context.add('fact:status');
    // A nested detail is deliberately authored drill-down content. It does
    // not count as the parent's prose explanation, because target boundaries
    // stop substantiveBody(), but it must still keep the parent inspectable.
    for (const child of node.children) {
      if (child.type === 'tag' && child.tag === 'detail') {
        const detailId = typeof child.attributes['id'] === 'string' ? child.attributes['id'] : 'detail';
        context.add(`nested-detail:${detailId}`);
      }
    }
  }

  if (record && isPart(record)) {
    for (const key of index.incident.get(targetId) ?? []) context.add(key);
    if (index.appearances.has(targetId)) context.add('appearance:related');
  }

  for (const key of index.mermaid.get(targetId) ?? []) context.add(key);

  const evidenceIds: TargetId[] = [];
  const addEvidence = (id: TargetId) => { if (!evidenceIds.includes(id)) evidenceIds.push(id); };
  for (const id of node ? evidenceIdsOf(node, isTarget) : []) {
    const evidenceRecord = model.targets.get(id);
    if (evidenceRecord?.kind === 'source') addEvidence(id);
    if (evidenceRecord?.kind !== 'event' || model.nodes.get(id)?.attributes['kind'] !== 'observation') continue;
    // The observation is itself evidence even without a captured source.
    addEvidence(id);
    const observation = model.nodes.get(id);
    if (observation) for (const source of evidenceIdsOf(observation, isTarget)) if (model.targets.get(source)?.kind === 'source') addEvidence(source);
  }
  const depth: InspectionDepth = explanation ? 'explanation' : context.size > 0 ? 'context' : evidenceIds.length > 0 ? 'evidence' : 'bare';
  const profile = { targetId, explanation, context: [...context].sort(), evidenceIds, depth };
  index.profiles.set(targetId, profile);
  return profile;
}

/** Derive what one instance adds after subtracting content already visible there. */
export function instanceDepth(profile: InspectionProfile, visible: VisibleInspectionContent = {}): InspectionDepth {
  if (profile.explanation && !visible.explanation) return 'explanation';
  const shown = new Set(visible.context ?? []);
  if (profile.context.some((key) => !shown.has(key))) return 'context';
  if (profile.evidenceIds.length > 0 && !visible.evidence) return 'evidence';
  return 'bare';
}

export function depthAction(depth: InspectionDepth): string | undefined {
  return depth === 'explanation' || depth === 'context' ? 'opens more detail' : depth === 'evidence' ? 'opens sources' : undefined;
}

export function depthLabel(depth: InspectionDepth): string {
  return depth === 'explanation' ? 'Explanation' : depth === 'context' ? 'Additional context' : depth === 'evidence' ? 'Sources' : 'No additional detail';
}

/** Text-only body, useful to review rules that must distinguish prose from citations. */
export function inspectionBodyText(model: TargetModel, targetId: TargetId): string {
  const node = model.nodes.get(targetId);
  if (!node) return '';
  const targets = new Set(model.nodes.values());
  return inlineText(node, (n) => targets.has(n));
}
