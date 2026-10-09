// Decode flowchart node metadata with Mermaid's exact YAML wrapper/schema.
// The collector owns parser-token provenance; this layer preserves YAML
// scalar/alias origins without searching decoded values back through source.
import { MathPolicyError } from '../math/policy.ts';
import { loadWithProvenance, type YamlTrace } from './yaml-provenance.ts';
import type { FlowchartShapeDataRecord } from './flowchart-labels.ts';
import type { ProvenanceText } from './source-provenance.ts';

export type FlowchartMetadataLabel = {
  value: unknown; // preserve Mermaid's truthy typed assignment, not String(value)
  trace: YamlTrace;
  mappedValue?: ProvenanceText; // the string selected by native labelHelper
};

function invalid(message: string): never {
  throw new MathPolicyError('E_MATH_INVALID', `flowchart metadata: ${message}`);
}
function resolveAlias(trace: YamlTrace | null | undefined): YamlTrace {
  const seen = new Set<YamlTrace>();
  while (trace?.kind === 'alias') {
    if (seen.has(trace)) invalid('cyclic alias cannot select a label scalar');
    seen.add(trace);
    trace = trace.definition;
  }
  return trace ?? invalid('YAML label has no structural provenance');
}

export function loadFlowchartMetadata(
  record: Pick<FlowchartShapeDataRecord, 'rawValue' | 'mappedRawValue'>,
  retryParse?: (raw: ProvenanceText) => ProvenanceText,
): ReturnType<typeof loadWithProvenance> {
  const raw = record.mappedRawValue;
  if (raw.text !== record.rawValue) invalid('metadata token and provenance disagree');
  const wrap = (value: ProvenanceText) => value.text.includes('\n') ? value.concat(value.synthetic('\n'))
    : value.synthetic('{\n').concat(value, value.synthetic('\n}'));
  let decoded: ReturnType<typeof loadWithProvenance>;
  try { decoded = loadWithProvenance(wrap(raw)); }
  catch (error) {
    if (!retryParse) throw error;
    const retried = retryParse(raw);
    if (retried.text === raw.text) throw error;
    try { decoded = loadWithProvenance(wrap(retried)); } catch { throw error; }
  }
  const document = decoded.value;
  if (document && typeof document === 'object') {
    for (const key of ['icon', 'img']) if (Object.hasOwn(document, key)) {
      throw new MathPolicyError('E_UNSAFE_CONTENT', `flowchart metadata: decoded ${key} property is not allowed`);
    }
  }
  return decoded;
}

export function decodeFlowchartMetadata(
  record: Pick<FlowchartShapeDataRecord, 'rawValue' | 'mappedRawValue'>,
): {value: unknown; label?: FlowchartMetadataLabel} {
  const decoded = loadFlowchartMetadata(record);
  const document = decoded.value;
  // These mirror FlowDB's doc?.label and truthiness test. Falsy labels leave
  // the previous vertex label intact; metadata on other owners is handled by
  // the collector's effect classification before selecting this assignment.
  const value = document && typeof document === 'object' ? (document as Record<string, unknown>)['label'] : undefined;
  if (!value) return { value: document };
  const root = resolveAlias(decoded.trace);
  if (root.kind !== 'mapping') invalid('label property has no YAML mapping trace');
  const entry = root.entries?.findLast(entry => entry.name === 'label');
  if (!entry?.value) invalid('label property has no successful mapping entry');
  const trace = entry.value;
  let selected = resolveAlias(trace);
  // Native labelHelper uses a string directly or the first array item.
  // Browser characterization: truthy numbers/booleans fail upstream rendering;
  // preserve their typed assignment here instead of inventing display text.
  const text = typeof value === 'string' ? value : Array.isArray(value) ? value[0] : undefined;
  if (Array.isArray(value)) {
    if (selected.kind !== 'sequence') invalid('array label has no sequence trace');
    if (typeof text === 'string') selected = resolveAlias(selected.items?.[0]);
  }
  if (typeof text !== 'string') return { value: document, label: { value, trace } };
  if (selected.kind !== 'scalar' || !selected.decoded || selected.value !== text || selected.decoded.text !== text) {
    invalid('rendered label differs from traced YAML scalar');
  }
  return { value: document, label: { value, trace, mappedValue: selected.decoded } };
}
