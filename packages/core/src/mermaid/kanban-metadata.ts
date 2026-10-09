// Decode Kanban's opaque YAML metadata with the same wrapper and coercion
// rules used by Mermaid's Kanban DB.  Unlike the DB, this also keeps the
// source witness for each value that can become rendered text.
import { MathPolicyError } from '../math/policy.ts';
import { MERMAID_SOURCE_LIMIT } from './rules.ts';
import { loadWithProvenance, type YamlTrace } from './yaml-provenance.ts';
import type { ProvenanceText } from './source-provenance.ts';

type KanbanMetadataName = 'label' | 'assigned' | 'ticket' | 'priority' | 'icon' | 'shape';
export type KanbanMetadataField = Readonly<{
  name: KanbanMetadataName;
  value: unknown;
  active: boolean;
  trace: YamlTrace;
  mappedValue?: ProvenanceText;
}>;

const NAMES = new Set<KanbanMetadataName>(['label', 'assigned', 'ticket', 'priority', 'icon', 'shape']);

function invalid(message: string): never {
  throw new MathPolicyError('E_MATH_INVALID', `kanban metadata: ${message}`);
}

function resolved(trace: YamlTrace | null | undefined): YamlTrace {
  const seen = new Set<YamlTrace>();
  while (trace?.kind === 'alias') {
    if (seen.has(trace)) invalid('cyclic YAML alias has no structural provenance');
    seen.add(trace);
    trace = trace.definition;
  }
  return trace ?? invalid('YAML value has no structural provenance');
}

function scalarText(trace: YamlTrace, value: unknown, raw: ProvenanceText): ProvenanceText {
  const scalar = resolved(trace);
  if (scalar.kind !== 'scalar' || !scalar.decoded) invalid('native string coercion has no scalar provenance');
  if (typeof value === 'string') {
    if (scalar.value !== value || scalar.decoded.text !== value) invalid('decoded string differs from its YAML scalar');
    return scalar.decoded;
  }
  if (typeof value !== 'number' && typeof value !== 'boolean' && typeof value !== 'bigint') {
    invalid('non-scalar value has scalar provenance');
  }
  // String(value) is native primitive .toString() output.  It is generated
  // from a typed YAML scalar, so retain the scalar range as a replacement.
  return scalar.decoded.replace(0, scalar.decoded.length, String(value));
}

function utf8Length(text: string): number {
  let bytes = 0;
  for (let index = 0; index < text.length; index++) {
    const unit = text.charCodeAt(index);
    if (unit < 0x80) bytes++;
    else if (unit < 0x800) bytes += 2;
    else if (unit >= 0xd800 && unit <= 0xdbff && index + 1 < text.length &&
      (text.charCodeAt(index + 1) & 0xfc00) === 0xdc00) { bytes += 4; index++; }
    else bytes += 3;
  }
  return bytes;
}

/**
 * Produce the result of Mermaid's `value.toString()` without invoking YAML
 * supplied properties.  Array#toString delegates to join(','); active-path
 * cycles become an empty element, exactly as native Array#join does.
 */
function nativeText(value: unknown, trace: YamlTrace, raw: ProvenanceText): ProvenanceText {
  type Work =
    | { kind: 'value'; value: unknown; trace: YamlTrace | null; inArray: boolean }
    | { kind: 'comma' }
    | { kind: 'leave'; array: readonly unknown[] };
  const empty = raw.synthetic('');
  const output: ProvenanceText[] = [];
  let outputBytes = 0;
  const retain = (piece: ProvenanceText): void => {
    outputBytes += utf8Length(piece.text);
    if (outputBytes > MERMAID_SOURCE_LIMIT) {
      throw new MathPolicyError('E_MATH_EXPRESSION_LIMIT', 'Kanban metadata text exceeds the figure source byte limit');
    }
    output.push(piece);
  };
  const activeArrays = new Set<readonly unknown[]>();
  const work: Work[] = [{ kind: 'value', value, trace, inArray: false }];

  while (work.length) {
    const item = work.pop()!;
    if (item.kind === 'comma') { retain(raw.synthetic(',')); continue; }
    if (item.kind === 'leave') { activeArrays.delete(item.array); continue; }
    const current = item.value;
    if (current == null) {
      if (item.inArray) continue;
      // Mermaid calls null.toString() for a truthy check only after null has
      // failed, but retain this native failure if this helper is reused.
      throw new TypeError("Cannot read properties of null (reading 'toString')");
    }
    const currentTrace = resolved(item.trace);
    if (Array.isArray(current)) {
      if (activeArrays.has(current)) continue;
      if (currentTrace.kind !== 'sequence') invalid('array value has no sequence provenance');
      const items = currentTrace.items ?? [];
      if (items.length !== current.length) invalid('array trace length differs from decoded YAML');
      activeArrays.add(current);
      work.push({ kind: 'leave', array: current });
      for (let index = current.length - 1; index >= 0; index--) {
        work.push({ kind: 'value', value: current[index], trace: items[index] ?? null, inArray: true });
        if (index) work.push({ kind: 'comma' });
      }
      continue;
    }
    if (typeof current === 'object') {
      // A mapping can shadow Object.prototype.toString with YAML data. Native
      // calls that property and fails because YAML cannot create a callable.
      if (Object.hasOwn(current, 'toString')) {
        throw new TypeError('value.toString is not a function');
      }
      if (currentTrace.kind !== 'mapping') invalid('object value has no mapping provenance');
      retain(raw.synthetic('[object Object]'));
      continue;
    }
    retain(scalarText(currentTrace, current, raw));
  }
  return empty.concatAll(output);
}

/** Decode authored Kanban metadata and preserve every recognized mapping entry. */
export function decodeKanbanMetadata(raw: ProvenanceText): { value: unknown; fields: readonly KanbanMetadataField[] } {
  // Keep this wrapper byte-for-byte aligned with addNode in the pinned Kanban
  // artifact.  In particular, multiline values are documents, not flow maps.
  const wrapped = raw.text.includes('\n')
    ? raw.concat(raw.synthetic('\n'))
    : raw.synthetic('{\n').concat(raw, raw.synthetic('\n}'));
  const decoded = loadWithProvenance(wrapped);
  const document = decoded.value;

  // Deliberately use native property access: Mermaid's `doc.shape` rejects a
  // null document and its lower-case test throws for truthy non-strings.
  const shape = (document as Record<string, unknown>).shape;
  if (shape && (shape !== (shape as { toLowerCase(): unknown }).toLowerCase() ||
      (shape as { includes(value: string): boolean }).includes('_'))) {
    throw new Error(`No such shape: ${shape}. Shape names should be lowercase.`);
  }

  if (document && typeof document === 'object') {
    for (const key of ['icon', 'img']) {
      if (Object.hasOwn(document, key)) {
        throw new MathPolicyError('E_UNSAFE_CONTENT', `kanban metadata: decoded ${key} property is not allowed`);
      }
    }
  }

  const root = decoded.trace ? resolved(decoded.trace) : null;
  if (!root || root.kind !== 'mapping') return { value: document, fields: Object.freeze([]) };
  const fields: KanbanMetadataField[] = [];
  for (const entry of root.entries ?? []) {
    if (!NAMES.has(entry.name as KanbanMetadataName) || !entry.value) continue;
    const name = entry.name as KanbanMetadataName;
    const value = entry.value.value;
    const active = Boolean(value);
    let mappedValue: ProvenanceText | undefined;
    if (active && (name === 'label' || name === 'assigned' || name === 'ticket')) {
      mappedValue = nativeText(value, entry.value, raw);
    }
    fields.push(Object.freeze({ name, value, active, trace: entry.value, ...(mappedValue ? { mappedValue } : {}) }));
  }
  return { value: document, fields: Object.freeze(fields) };
}
