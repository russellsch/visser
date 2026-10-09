// AgentFlowDB retries invalid multiline YAML after removing trailing commas.
// Keep the pinned quote/flow/block-scalar state machine and delete only the
// comma's source unit, preserving every retained scalar's provenance.
import {loadFlowchartMetadata, type FlowchartMetadataLabel} from './flowchart-metadata.ts';
import {MathPolicyError} from '../math/policy.ts';
import {MERMAID_SOURCE_LIMIT} from './rules.ts';
import type {YamlTrace} from './yaml-provenance.ts';
import type {FlowchartShapeDataRecord} from './flowchart-labels.ts';
import type {ProvenanceText} from './source-provenance.ts';

export function stripAgentflowTrailingCommas(raw: ProvenanceText): ProvenanceText {
  if (!raw.text.includes('\n')) return raw;
  let inSingle = false, inDouble = false, flowDepth = 0;
  let blockScalarIndent: number | undefined;
  const removals = new Set<number>();
  let offset = 0;
  for (const line of raw.text.split('\n')) {
    const advance = () => { offset += line.length + 1; };
    if (blockScalarIndent !== undefined) {
      const indent = line.length - line.trimStart().length;
      if (line.trim() === '' || indent > blockScalarIndent) { advance(); continue; }
      blockScalarIndent = undefined;
    }
    let commentStart = -1;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inDouble) { if (ch === '\\') i++; else if (ch === '"') inDouble = false; }
      else if (inSingle) { if (ch === "'") inSingle = false; }
      else if (ch === '"') inDouble = true;
      else if (ch === "'") inSingle = true;
      else if (ch === '#' && (i === 0 || line[i-1] === ' ' || line[i-1] === '\t')) { commentStart = i; break; }
      else if (ch === '[' || ch === '{') flowDepth++;
      else if (ch === ']' || ch === '}') flowDepth = Math.max(0, flowDepth - 1);
    }
    if (inSingle || inDouble || flowDepth > 0) { advance(); continue; }
    const code = commentStart >= 0 ? line.slice(0, commentStart) : line;
    if (/:\s*[>|][\d+-]*\s*$/.test(code)) {
      blockScalarIndent = line.length - line.trimStart().length;
      advance(); continue;
    }
    const comma = /,([\t ]*)$/.exec(code);
    if (comma) removals.add(offset + comma.index);
    advance();
  }
  return raw.replaceRegex(/,/g, (match, span) => removals.has(match.index) ? '' : span);
}

function resolved(trace: YamlTrace | null | undefined): YamlTrace {
  const seen = new Set<YamlTrace>();
  while (trace?.kind === 'alias') {
    if (seen.has(trace)) throw new MathPolicyError('E_MATH_INVALID', 'cyclic Agentflow metadata alias');
    seen.add(trace); trace = trace.definition;
  }
  if (!trace) throw new MathPolicyError('E_MATH_INVALID', 'missing Agentflow metadata provenance');
  return trace;
}

// Native stripPrototypeKeys applies before sanitizeText stringifies a label.
function stripPrototypeKeys(value: unknown, ancestors = new Set<object>(), memo = new Map<object, unknown>()): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (ancestors.has(value)) throw new MathPolicyError('E_MATH_INVALID', 'cyclic Agentflow metadata');
  if (memo.has(value)) return memo.get(value);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const array = value.map(item => stripPrototypeKeys(item, ancestors, memo));
      memo.set(value, array); return array;
    }
    const clean: Record<string, unknown> = {};
    for (const key of Object.keys(value)) if (!['__proto__','constructor','prototype'].includes(key)) {
      clean[key] = stripPrototypeKeys((value as Record<string, unknown>)[key], ancestors, memo);
    }
    memo.set(value, clean); return clean;
  } finally { ancestors.delete(value); }
}

function stringifyLabel(value: unknown, trace: YamlTrace, raw: ProvenanceText, memo = new Map<YamlTrace, ProvenanceText>()): ProvenanceText {
  const selected = resolved(trace);
  const cached = memo.get(selected);
  if (cached) return cached;
  if (typeof value === 'string') {
    if (selected.kind !== 'scalar' || selected.decoded?.text !== value) {
      throw new MathPolicyError('E_MATH_INVALID', 'Agentflow string label differs from scalar provenance');
    }
    return selected.decoded;
  }
  if (Array.isArray(value)) {
    if (selected.kind !== 'sequence' || selected.items?.length !== value.length) {
      throw new MathPolicyError('E_MATH_INVALID', 'Agentflow array label differs from sequence provenance');
    }
    // Arrays stringify by joining all entries, including nested arrays. Commas
    // are generated, not attributed to an authored delimiter or neighboring field.
    let bytes = Math.max(0, value.length - 1);
    let pieces: ProvenanceText[] = [];
    for (const [index, item] of value.entries()) {
      const piece = item == null ? raw.synthetic('') : stringifyLabel(item, selected.items![index]!, raw, memo);
      bytes += new TextEncoder().encode(piece.text).length;
      if (bytes > MERMAID_SOURCE_LIMIT) throw new MathPolicyError('E_MATH_EXPRESSION_LIMIT', 'Mermaid label exceeds the figure source byte limit');
      if (index) pieces.push(raw.synthetic(','));
      pieces.push(piece);
    }
    // Pairwise concatenation avoids quadratic provenance copying for long arrays.
    while (pieces.length > 1) {
      const next: ProvenanceText[] = [];
      for (let i = 0; i < pieces.length; i += 2) next.push(pieces[i+1] ? pieces[i]!.concat(pieces[i+1]!) : pieces[i]!);
      pieces = next;
    }
    const result = pieces[0] ?? raw.synthetic('');
    memo.set(selected, result);
    return result;
  }
  try { return raw.synthetic(String(value)); }
  catch { throw new MathPolicyError('E_MATH_INVALID', 'Agentflow metadata label cannot be converted to text'); }
}

export function decodeAgentflowMetadata(record: Pick<FlowchartShapeDataRecord, 'rawValue' | 'mappedRawValue'>): {value: unknown; label?: FlowchartMetadataLabel} {
  const decoded = loadFlowchartMetadata(record, stripAgentflowTrailingCommas);
  const document = stripPrototypeKeys(decoded.value);
  const value = document && typeof document === 'object' ? (document as Record<string,unknown>)['label'] : undefined;
  if (!value) return {value: document};
  const root = resolved(decoded.trace);
  const trace = root.kind === 'mapping' ? root.entries?.findLast(entry => entry.name === 'label')?.value : undefined;
  if (!trace) throw new MathPolicyError('E_MATH_INVALID', 'Agentflow label has no mapping provenance');
  return {value: document, label: {value, trace, mappedValue: stringifyLabel(value, trace, record.mappedRawValue)}};
}
