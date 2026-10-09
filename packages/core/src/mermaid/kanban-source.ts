// Prepare Kanban's grammar-collected text for the isolated DB replay.  This is
// intentionally an internal source record: decoded YAML can retain aliases and
// cycles, so it is not a transport or activation format.
import { MathPolicyError } from '../math/policy.ts';
import {
  replayKanbanDb,
  type KanbanDbEffect,
  type KanbanDbNode,
  type KanbanDbOptions,
  type KanbanDbSnapshot,
} from './kanban-db.ts';
import { planKanbanGroups, type KanbanGroupPlan } from './kanban-groups.ts';
import {
  extractKanbanLabels,
  type KanbanAuthoredNode,
  type KanbanDecoration,
  type KanbanLabels,
} from './kanban-labels.ts';
import { decodeKanbanMetadata, type KanbanMetadataField } from './kanban-metadata.ts';
import { sanitizeKanbanField, type KanbanSanitation } from './kanban-sanitize.ts';
import { normalizeMermaidSource } from './rules.ts';
import type { ProvenanceText } from './source-provenance.ts';

export type KanbanSanitizedField = Readonly<{
  witness: KanbanSanitation;
  value: ProvenanceText;
}>;

export type KanbanDecodedMetadata = Readonly<{
  value: unknown;
  fields: readonly KanbanMetadataField[];
}>;

export type KanbanPreparedNode = Readonly<{
  nodeIndex: number;
  /** The parser-owned node, retained so its raw fields never need searching. */
  authored: KanbanAuthoredNode;
  /** Sanitized values passed as the ordinary addNode id and label arguments. */
  id: KanbanSanitizedField;
  baseLabel: KanbanSanitizedField;
  /** The final DB id; generated ids have deliberately synthetic provenance. */
  effectiveId: ProvenanceText;
  /** Metadata labels are authoritative and are not sanitized by addNode. */
  effectiveLabel: ProvenanceText;
  metadata?: KanbanDecodedMetadata;
}>;

export type KanbanPreparedDecoration = Readonly<{
  decorationIndex: number;
  nodeIndex: number;
  /** Exact authored owner, including its raw parser provenance. */
  owner: KanbanAuthoredNode;
  kind: KanbanDecoration['kind'];
  sanitation: KanbanSanitizedField;
}>;

export type KanbanPreparedSnapshot = Readonly<{
  nodes: readonly Readonly<KanbanDbNode>[];
  sections: readonly Readonly<KanbanDbNode>[];
  counter: number;
}>;

export type KanbanPreparedSource = Readonly<{
  authored: KanbanLabels;
  effects: readonly KanbanDbEffect[];
  snapshot: KanbanPreparedSnapshot;
  groups: KanbanGroupPlan;
  nodes: readonly KanbanPreparedNode[];
  decorations: readonly KanbanPreparedDecoration[];
}>;

function invalid(message: string): never {
  throw new MathPolicyError('E_MATH_INVALID', `kanban source: ${message}`);
}

function freezeField(value: Awaited<ReturnType<typeof sanitizeKanbanField>>): KanbanSanitizedField {
  return Object.freeze({ witness: value.witness, value: value.value });
}

function freezeSnapshot(snapshot: KanbanDbSnapshot): KanbanPreparedSnapshot {
  // The clone returned by replay preserves node/section aliases. Freeze the
  // wrappers in place so that relationship remains observable to internal
  // callers, without traversing arbitrary typed YAML values.
  for (const node of snapshot.nodes) Object.freeze(node);
  for (const section of snapshot.sections) Object.freeze(section);
  Object.freeze(snapshot.nodes);
  Object.freeze(snapshot.sections);
  return Object.freeze(snapshot) as KanbanPreparedSnapshot;
}

function verifyAuthored(authored: KanbanLabels): void {
  for (const [nodeIndex, node] of authored.nodes.entries()) {
    if (node.nodeIndex !== nodeIndex) invalid(`node ${nodeIndex} has a different nodeIndex`);
  }
  for (const [decorationIndex, decoration] of authored.decorations.entries()) {
    if (!Number.isSafeInteger(decoration.nodeIndex) || decoration.nodeIndex < 0 || decoration.nodeIndex >= authored.nodes.length) {
      invalid(`decoration ${decorationIndex} has no authored owner`);
    }
  }
}

function metadataLabel(metadata: KanbanDecodedMetadata | undefined): ProvenanceText | undefined {
  const field = metadata?.fields.find(item => item.name === 'label' && item.active);
  if (!field) return undefined;
  return field.mappedValue ?? invalid('active metadata label has no traced native text');
}

/**
 * Collect, decode, sanitize, and replay a Kanban source without constructing
 * or mutating Mermaid's shared DB.  The replayed snapshot is the sole source
 * for generated ids and for group planning.
 */
export async function prepareKanbanSource(
  original: string,
  options: KanbanDbOptions,
  rendered = normalizeMermaidSource(original),
  htmlLabels = true,
): Promise<KanbanPreparedSource> {
  if (typeof htmlLabels !== 'boolean') invalid('HTML-label mode must be boolean');
  const authored = await extractKanbanLabels(original, rendered);
  verifyAuthored(authored);

  // Decode every opaque metadata field before sanitation/replay can exercise
  // any native DB coercion. The traced decoder owns alias/cycle expansion.
  const decoded = authored.nodes.map(node => node.shapeData === undefined
    ? undefined
    : Object.freeze(decodeKanbanMetadata(node.shapeData)) as KanbanDecodedMetadata);

  const nodeFields = await Promise.all(authored.nodes.map(async node => Object.freeze({
    id: freezeField(await sanitizeKanbanField(node.id, htmlLabels)),
    baseLabel: freezeField(await sanitizeKanbanField(node.label, htmlLabels)),
  })));
  const decorationFields = await Promise.all(authored.decorations.map(async decoration =>
    freezeField(await sanitizeKanbanField(decoration.value, htmlLabels))));

  const effects: KanbanDbEffect[] = [];
  const seenNodes = new Set<number>();
  const seenDecorations = new Set<number>();
  for (const effect of authored.effects) {
    if (effect.kind === 'node') {
      const node = authored.nodes[effect.nodeIndex];
      const fields = nodeFields[effect.nodeIndex];
      if (!node || !fields || effect.nodeIndex !== seenNodes.size || seenNodes.has(effect.nodeIndex)) {
        invalid('node effect order differs from grammar');
      }
      seenNodes.add(effect.nodeIndex);
      effects.push(Object.freeze({
        kind: 'node', level: node.level, id: fields.id.value.text, label: fields.baseLabel.value.text, type: node.type,
        ...(decoded[effect.nodeIndex] === undefined ? {} : { metadata: decoded[effect.nodeIndex]!.value }),
      }));
      continue;
    }
    const decoration = authored.decorations[effect.decorationIndex];
    const field = decorationFields[effect.decorationIndex];
    if (!decoration || !field || effect.decorationIndex !== seenDecorations.size ||
        decoration.nodeIndex !== seenNodes.size - 1 || seenDecorations.has(effect.decorationIndex)) {
      invalid('decoration effect ownership differs from grammar');
    }
    seenDecorations.add(effect.decorationIndex);
    // Native decorateNode tests raw text before sanitation. Consequently an
    // authored value that sanitizes to empty remains an explicit overwrite.
    effects.push(Object.freeze({
      kind: 'decoration',
      ...(decoration.value.text ? { [decoration.kind]: field.value.text } : {}),
    }));
  }
  if (seenNodes.size !== authored.nodes.length || seenDecorations.size !== authored.decorations.length) {
    invalid('grammar effects do not cover every node and decoration exactly once');
  }

  // Do this exactly once after the complete trusted effect ledger is built.
  const replayed = replayKanbanDb(Object.freeze(effects), options);
  if (replayed.nodes.length !== authored.nodes.length) invalid('replay node count differs from grammar');

  const nodes: KanbanPreparedNode[] = authored.nodes.map((authoredNode, nodeIndex) => {
    const fields = nodeFields[nodeIndex]!;
    const snapshotNode = replayed.nodes[nodeIndex]!;
    const metadata = decoded[nodeIndex];
    const fromMetadata = metadataLabel(metadata);
    const effectiveId = fields.id.value.text
      ? fields.id.value
      : fields.id.value.synthetic(snapshotNode.id);
    const effectiveLabel = fromMetadata ?? fields.baseLabel.value;
    if (snapshotNode.id !== effectiveId.text || snapshotNode.level !== authoredNode.level) {
      invalid(`replay node ${nodeIndex} differs from its prepared identity`);
    }
    // Typed metadata can deliberately leave a non-string label in the DB.
    // Only compare the native string path; mapped metadata text remains the
    // bounded source authority for all other typed values.
    if (typeof snapshotNode.label === 'string' && snapshotNode.label !== effectiveLabel.text) {
      invalid(`replay node ${nodeIndex} has a different effective label`);
    }
    return Object.freeze({
      nodeIndex, authored: authoredNode, id: fields.id, baseLabel: fields.baseLabel,
      effectiveId, effectiveLabel, ...(metadata === undefined ? {} : { metadata }),
    });
  });

  const decorations: KanbanPreparedDecoration[] = authored.decorations.map((decoration, decorationIndex) => {
    const owner = authored.nodes[decoration.nodeIndex];
    if (!owner || owner.nodeIndex !== decoration.nodeIndex) invalid(`decoration ${decorationIndex} owner changed`);
    return Object.freeze({
      decorationIndex, nodeIndex: decoration.nodeIndex, owner, kind: decoration.kind,
      sanitation: decorationFields[decorationIndex]!,
    });
  });
  const groups = planKanbanGroups(replayed.nodes.map((node, nodeIndex) => ({ nodeIndex, id: node.id, level: node.level })));

  return Object.freeze({
    authored,
    effects: Object.freeze(effects),
    snapshot: freezeSnapshot(replayed),
    groups,
    nodes: Object.freeze(nodes),
    decorations: Object.freeze(decorations),
  });
}
