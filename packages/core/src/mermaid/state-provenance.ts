// Reconciles the pinned state extractor's live objects with grammar-owned text.
import type { StateExtractionEvent, StateExtractionListener } from './state-observer.ts';
import type { StateLabelRecord, StateLabels } from './state-labels.ts';
import { ProvenanceText } from './source-provenance.ts';

export type Leaf = Readonly<{ mapped: ProvenanceText; recordIndices: readonly number[] }>;
export type Value = Leaf | readonly Value[];
export type StateProvenanceNode = Readonly<{
  identity: Readonly<{ id: unknown; domId: unknown; shape: unknown; hasDescription: boolean }>;
  label?: Value;
  description?: Value;
  promotedImplicitRecordIndices: readonly number[];
  structural?: true;
}>;
export type StateProvenanceEdge = Readonly<{ identity: Readonly<{ id: unknown; start: unknown; end: unknown }>; label: Value }>;
export type StateProvenanceResult = Readonly<{
  nodes: ReadonlyMap<object, StateProvenanceNode>;
  edges: ReadonlyMap<object, StateProvenanceEdge>;
  promotedImplicitRecordIndices: readonly number[];
  recordVariants: ReadonlyMap<number, readonly ProvenanceText[]>;
}>;

type Native = Record<string, unknown>;
type Pending = { description?: Value; label?: Value; promoted: readonly number[]; structural?: true };

function fail(message: string): never { throw new Error(`state provenance: ${message}`); }
function leaf(mapped: ProvenanceText, recordIndices: readonly number[]): Leaf {
  return Object.freeze({ mapped, recordIndices: Object.freeze([...recordIndices]) });
}
function isLeaf(value: Value): value is Leaf { return !Array.isArray(value); }
function native(value: Value): string | readonly unknown[] {
  return isLeaf(value) ? value.mapped.text : value.map(native);
}
function equalNative(value: unknown, expected: Value): boolean {
  if (isLeaf(expected)) return value === expected.mapped.text;
  return Array.isArray(value) && value.length === expected.length && value.every((part, index) => equalNative(part, expected[index]!));
}
function flattenOne(value: Value): readonly Leaf[] {
  if (isLeaf(value)) return [value];
  const flat: Leaf[] = [];
  for (const part of value) {
    if (isLeaf(part)) flat.push(part);
    else for (const nested of part) {
      if (!isLeaf(nested)) fail('description has more than one native array level');
      flat.push(nested);
    }
  }
  return flat;
}
function sameString(value: unknown, expected: string): boolean { return typeof value === 'string' && value === expected; }

/** Build a synchronous listener for one or more state extraction epochs. */
export function createStateProvenance(
  labels: StateLabels,
  sanitize: (value: ProvenanceText) => ProvenanceText,
): { listener: StateExtractionListener; result(): StateProvenanceResult } {
  const base = labels.records[0]?.mappedValue ?? ProvenanceText.identity(labels.parserSource);
  const byStatement = new WeakMap<object, StateLabelRecord[]>();
  const notes = new WeakMap<object, StateLabelRecord>();
  const byIndex = new Map<number, StateLabelRecord>();
  for (const record of labels.records) {
    byIndex.set(record.recordIndex, record);
    if (record.statement && typeof record.statement === 'object') {
      const list = byStatement.get(record.statement) ?? [];
      list.push(record); byStatement.set(record.statement, list);
      if (record.role === 'note' && record.statement.note && typeof record.statement.note === 'object') notes.set(record.statement.note, record);
    }
  }
  const noteHistory = new WeakMap<object, Leaf>();
  let active = false;
  let complete = false;
  let layoutNodes: object[] = [];
  let layoutEdges: object[] = [];
  let pending = new WeakMap<object, Pending>();
  let outputNodes = new Map<object, StateProvenanceNode>();
  let outputEdges = new Map<object, StateProvenanceEdge>();
  let promoted = new Set<number>();
  let variants = new Map<number, Map<string, ProvenanceText>>();
  let notePairs: readonly Readonly<{ from: string; to: string; id: string }>[] = [];

  const synthetic = (text: string): Leaf => leaf(base.synthetic(text), []);
  const recordsFor = (item: Native, role: StateLabelRecord['role']): StateLabelRecord[] =>
    (byStatement.get(item) ?? []).filter(record => record.role === role);
  const remember = (value: Leaf): void => {
    for (const index of value.recordIndices) {
      if (!byIndex.has(index)) fail('sanitizer variant has no authored record');
      const entries = variants.get(index) ?? new Map<string, ProvenanceText>();
      // Deduplicate validation work only within one exact authored record.
      // Final slot origins remain in their independently tracked leaves.
      if (!entries.has(value.mapped.text)) entries.set(value.mapped.text, value.mapped);
      variants.set(index, entries);
    }
  };
  const sanitizeLeaf = (value: Leaf): Leaf => {
    remember(value);
    const result = leaf(sanitize(value.mapped), value.recordIndices);
    remember(result);
    return result;
  };
  const descriptionValue = (item: Native): Value => {
    const records = recordsFor(item, 'state.description');
    const raw = item.description;
    const values = Array.isArray(raw) ? raw : [raw];
    if (!values.every(value => typeof value === 'string')) fail('description is not a string or string array');
    const selected = records;
    if (selected.length !== values.length || selected.some((record, index) => record?.semanticValue !== values[index])) {
      fail('description does not match its grammar record');
    }
    const leaves = selected.map(record => leaf(record.mappedValue, [record.recordIndex]));
    return Array.isArray(raw) ? leaves : leaves[0]!;
  };
  const put = (object: object, value: Pending): void => { pending.set(object, value); };
  const promote = (value: Value | undefined, shape: unknown): readonly number[] => {
    if (shape !== 'rect' && shape !== 'rectWithTitle' && shape !== 'note') return [];
    const indexes: number[] = [];
    for (const part of flattenOne(value ?? synthetic(''))) for (const index of part.recordIndices) {
      const record = byIndex.get(index);
      if (record?.role === 'state.implicit') indexes.push(index);
    }
    return Object.freeze(indexes);
  };
  const publish = (object: object, state: Pending): void => {
    const nativeObject = object as Native;
    const identity = Object.freeze({ id: nativeObject.id, domId: nativeObject.domId, shape: nativeObject.shape,
      hasDescription: Object.hasOwn(nativeObject, 'description') });
    outputNodes.set(object, Object.freeze({ identity, ...(state.label ? { label: state.label } : {}),
      ...(state.description ? { description: state.description } : {}),
      promotedImplicitRecordIndices: state.promoted, ...(state.structural ? { structural: true as const } : {}) }));
  };
  const publishEdge = (object: object, label: Value): void => {
    const edge = object as Native;
    outputEdges.set(object, Object.freeze({ identity: Object.freeze({ id: edge.id, start: edge.start, end: edge.end }), label }));
  };

  const listener: StateExtractionListener = event => {
    if (event.kind === 'begin') {
      active = true; complete = false; layoutNodes = event.nodes; layoutEdges = event.edges;
      pending = new WeakMap(); outputNodes = new Map(); outputEdges = new Map(); promoted = new Set(); variants = new Map(); notePairs = [];
      return;
    }
    if (!active) fail(`received ${event.kind} outside an extraction epoch`);
    if (event.kind === 'init') {
      const implicit = recordsFor(event.item, 'state.implicit');
      if (implicit.length > 1) fail('state has more than one implicit ID record');
      if (event.item.doc !== undefined || event.item.type === 'divider') fail('composite or concurrent states are excluded');
      const authored = implicit.length === 1 && implicit[0]!.semanticValue === event.item.id;
      const pseudo = implicit.length === 1 && implicit[0]!.semanticValue === '[*]' &&
        typeof event.item.start === 'boolean' && event.item.id === (event.item.start ? 'root_start' : 'root_end');
      if (!authored && !pseudo) fail('initial state ID has no attested grammar origin');
      const initial = authored ? sanitizeLeaf(leaf(implicit[0]!.mappedValue, [implicit[0]!.recordIndex]))
        : sanitizeLeaf(synthetic(event.item.id as string));
      if (!sameString(event.target.description, initial.mapped.text)) fail('initial state description does not match native extraction');
      put(event.target, { description: initial, promoted: [] });
      return;
    }
    if (event.kind === 'description') {
      const incoming = descriptionValue(event.item);
      const prior = pending.get(event.target)?.description;
      if (!prior) fail('description has no initialized source value');
      if (!equalNative(event.target.description, prior)) fail('description pre-mutation value does not match native extraction');
      let description: Value;
      if (event.mode === 'assign') description = incoming;
      else if (event.mode === 'replace-implicit') description = [incoming];
      else if (event.mode === 'prepend') { if (!prior) fail('prepend has no prior description'); description = [prior, incoming]; }
      else { if (!prior || !Array.isArray(prior)) fail('append has no native array description'); description = [...prior, incoming]; }
      put(event.target, { ...pending.get(event.target), description, promoted: [] });
      return;
    }
    if (event.kind === 'sanitized') {
      const before = pending.get(event.target)?.description;
      if (!before) fail('sanitized description has no source value');
      const leaves = flattenOne(before).map(sanitizeLeaf);
      const description: Value = Array.isArray(before) ? leaves : leaves[0]!;
      if (!equalNative(event.target.description, description)) fail('sanitized description does not match native extraction');
      put(event.target, { ...pending.get(event.target), description, promoted: [] });
      return;
    }
    if (event.kind === 'candidate') {
      const source = pending.get(event.target);
      if (!source?.description) fail('candidate has no target provenance');
      const label = source.description;
      if (!equalNative(event.candidate.label, label)) fail('candidate label does not match its source value');
      const indexes = promote(label, event.candidate.shape);
      for (const index of indexes) promoted.add(index);
      put(event.candidate, { label, promoted: indexes });
      return;
    }
    if (event.kind === 'node') {
      const state = pending.get(event.candidate);
      if (!state) {
        if (event.candidate.label !== '') fail('node has no candidate provenance');
        put(event.retained, { label: synthetic(''), promoted: [], structural: true });
      } else put(event.retained, state);
      publish(event.retained, pending.get(event.retained)!);
      return;
    }
    if (event.kind === 'note-sanitized') {
      const record = notes.get(event.note);
      const prior = noteHistory.get(event.note) ?? (record ? leaf(record.mappedValue, [record.recordIndex]) : undefined);
      if (!prior) fail('note sanitizer has no grammar note record');
      if (!sameString(event.before, prior.mapped.text)) fail('note sanitizer before value does not match history');
      const after = sanitizeLeaf(prior);
      if (!sameString(event.after, after.mapped.text)) fail('note sanitizer after value does not match sanitizer');
      noteHistory.set(event.note, after);
      return;
    }
    if (event.kind === 'note') {
      const grammarNote = event.item.note;
      const grammarNative = grammarNote && typeof grammarNote === 'object' ? grammarNote as Native : undefined;
      const value = grammarNative ? noteHistory.get(grammarNative) : undefined;
      if (!value || !sameString(event.note.label, value.mapped.text)) fail('note does not match sanitized grammar text');
      put(event.note, { label: value, promoted: promote(value, 'note') });
      put(event.group, { promoted: [], structural: true });
      const stateId = event.item.id;
      const noteId = event.note.id;
      const position = grammarNative!.position;
      if (typeof stateId !== 'string' || typeof noteId !== 'string') fail('note connector has no native IDs');
      const [from, to] = position === 'left of' ? [noteId, stateId] : [stateId, noteId];
      notePairs = [...notePairs, Object.freeze({ from, to, id: `${from}-${to}` })];
      return;
    }
    if (event.kind === 'relation') {
      const records = recordsFor(event.item, 'transition');
      if (records.length > 1) fail('relation has more than one transition record');
      const label = records.length ? sanitizeLeaf(leaf(records[0]!.mappedValue, [records[0]!.recordIndex])) : synthetic('');
      if (!sameString(event.edge.label, label.mapped.text)) fail('relation label does not match native extraction');
      publishEdge(event.edge, label);
      return;
    }
    if (event.kind === 'split') {
      const state = pending.get(event.node);
      if (!state?.label || !Array.isArray(state.label) || state.label.length === 0) fail('split node has no array label provenance');
      const [title, ...description] = state.label;
      if (!sameString(event.node.label, isLeaf(title!) ? title!.mapped.text : '') || !equalNative(event.node.description, description)) fail('split node does not match native extraction');
      const split = { label: title!, description, promoted: promote(title!, event.node.shape) };
      put(event.node, split); publish(event.node, split);
      return;
    }
    // end
    for (const node of layoutNodes) {
      if (!outputNodes.has(node)) {
        const known = pending.get(node);
        if (known) { publish(node, known); continue; }
        fail('layout node has no provenance');
      }
    }
    for (const edge of layoutEdges) if (!outputEdges.has(edge)) {
      const generated = edge as Native;
      const label = generated.label;
      const knownNoteConnector = notePairs.some(pair => generated.id === pair.id && generated.start === pair.from && generated.end === pair.to);
      if ((label !== '' && label !== undefined) || !knownNoteConnector) fail('layout edge has no provenance');
      publishEdge(edge, synthetic(''));
    }
    active = false; complete = true;
  };
  return { listener, result: () => {
    if (!complete) fail('result requested before extraction completed');
    return Object.freeze({ nodes: new Map(outputNodes), edges: new Map(outputEdges), promotedImplicitRecordIndices: Object.freeze([...promoted]),
      recordVariants: new Map([...variants].map(([index, entries]) => [index, Object.freeze([...entries.values()])])) });
  } };
}
