// Decode sequence participant configuration with the same wrapper and
// JSON_SCHEMA loader as Mermaid's pinned SequenceDB.addActor. The caller owns
// the later rule that an explicit `as` description can suppress this alias.
import { MathPolicyError } from '../math/policy.ts';
import { loadWithProvenance, type YamlTrace } from './yaml-provenance.ts';
import type { ProvenanceText } from './source-provenance.ts';

export type SequenceMetadataAlias = {
  value: unknown; // preserve typed truthy values; never coerce an array/number
  trace: YamlTrace;
  mappedValue?: ProvenanceText; // present only for a decoded string scalar
};
export type SequenceMetadata = { value: unknown; alias?: SequenceMetadataAlias };

function invalid(message: string): never {
  throw new MathPolicyError('E_MATH_INVALID', `sequence metadata: ${message}`);
}
function resolveAlias(trace: YamlTrace | null | undefined): YamlTrace {
  const seen = new Set<YamlTrace>();
  while (trace?.kind === 'alias') {
    if (seen.has(trace)) invalid('cyclic YAML alias');
    seen.add(trace);
    trace = trace.definition;
  }
  return trace ?? invalid('alias has no YAML provenance');
}

/** Decode the grammar's CONFIG_CONTENT value, retaining original scalar origins. */
export function decodeSequenceMetadata(record: { rawValue: string; mappedRawValue: ProvenanceText }): SequenceMetadata {
  const raw = record.mappedRawValue;
  if (raw.text !== record.rawValue) invalid('metadata token and provenance disagree');
  const wrapped = raw.text.includes('\n') ? raw.concat(raw.synthetic('\n'))
    : raw.synthetic('{\n').concat(raw, raw.synthetic('\n}'));
  const decoded = loadWithProvenance(wrapped);
  const document = decoded.value;
  // Pinned addActor tests doc?.alias for truthiness before deciding whether an
  // explicit description wins. Preserve that candidate without selecting it.
  const value = document && typeof document === 'object' ? (document as Record<string, unknown>)['alias'] : undefined;
  if (!value) return { value: document };
  const root = resolveAlias(decoded.trace);
  if (root.kind !== 'mapping') invalid('alias property has no YAML mapping trace');
  const entry = root.entries?.findLast(item => item.name === 'alias');
  if (!entry?.value) invalid('alias property has no successful mapping entry');
  const trace = entry.value;
  if (typeof value !== 'string') return { value: document, alias: { value, trace } };
  const selected = resolveAlias(trace);
  if (selected.kind !== 'scalar' || !selected.decoded || selected.value !== value || selected.decoded.text !== value) {
    invalid('sequence alias differs from traced YAML scalar');
  }
  return { value: document, alias: { value, trace, mappedValue: selected.decoded } };
}
