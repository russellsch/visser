// Shared verified mapping from authored Mermaid origins to displayed code.
import { visibleBidi } from '../compiler/html.ts';
import { MathPolicyError } from '../math/policy.ts';
import { mapMermaidFence } from './flowchart-source.ts';
import { stripMermaidComments } from './rules.ts';
import { MermaidSourceCoordinates, type LocatedSourceInterval } from './source-coordinates.ts';
import type { ProvenanceText } from './source-provenance.ts';

export type MermaidSourceBody = { source: string; mathBodyStartByte?: number };
export type MermaidSourceExpression =
  | { tex: string; rawSource: string; start: number; end: number; encoded?: true }
  | { tex: string; unrepresentable: true };
type Part = { kind: 'text' } | { kind: 'math'; tex: string; source: string;
  origins: readonly LocatedSourceInterval[]; synthetic: boolean };

// The first U+FEFF belongs to the original fenced body coordinate system.
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const encoder = new TextEncoder();
const COMMENT_LINE = /^[ \t]*%%/;

function invalid(message: string): never {
  throw new MathPolicyError('E_MATH_INVALID', `Mermaid source map: ${message}`);
}

function originalFence(figure: MermaidSourceBody, bytes: Uint8Array): string {
  const base = figure.mathBodyStartByte;
  if (!Number.isSafeInteger(base) || base === undefined || base < 0 || base > bytes.length) {
    invalid('missing or invalid body byte offset');
  }
  const shownLines = figure.source.split('\n');
  const count = shownLines.length - (figure.source.endsWith('\n') ? 1 : 0);
  let at = base;
  let original = '';
  for (let i = 0; i < count; i++) {
    const start = at;
    while (at < bytes.length && bytes[at] !== 0x0a && bytes[at] !== 0x0d) at++;
    const contentEnd = at;
    if (bytes[at] === 0x0d) at += bytes[at + 1] === 0x0a ? 2 : 1;
    else if (bytes[at] === 0x0a) at++;
    const needsNewline = i < shownLines.length - 1;
    if ((at > contentEnd) !== needsNewline) invalid('original and displayed line endings differ');
    let raw: string;
    try { raw = decoder.decode(bytes.subarray(start, at)); }
    catch { return invalid('original body contains invalid UTF-8'); }
    original += raw;
  }
  // This also verifies every dedented line, BOM, and normalized line ending.
  try {
    if (mapMermaidFence(original, figure.source).text !== figure.source) invalid('body differs from displayed fence');
  } catch (error) {
    if (error instanceof MathPolicyError) throw error;
    invalid('body differs from displayed fence');
  }
  return original;
}

/** Preserve provenance while deleting only whole-line comments. */
function withoutComments(fence: ProvenanceText): ProvenanceText {
  const lines = fence.text.split('\n');
  const pieces: ProvenanceText[] = [];
  let at = 0;
  let kept = 0;
  for (const line of lines) {
    if (!COMMENT_LINE.test(line)) {
      if (kept) pieces.push(fence.slice(at - 1, at));
      pieces.push(fence.slice(at, at + line.length));
      kept++;
    }
    at += line.length + 1;
  }
  return fence.slice(0, 0).concatAll(pieces);
}

function displayedRange(display: ProvenanceText, start: number, end: number): { start: number; end: number } | undefined {
  let first = -1, last = -1;
  for (let i = 0; i < display.length; i++) {
    const origin = display.originAt(i);
    if (origin.intervals.some(interval => interval.start < end && interval.end > start)) {
      if (origin.synthetic || origin.intervals.length !== 1 ||
          origin.intervals[0]!.start < start || origin.intervals[0]!.end > end) return undefined;
      if (first < 0) first = i;
      last = i + 1;
    }
  }
  if (first < 0) return undefined;
  // An interval can map to a normalized newline or visible bidi spelling, but
  // intervening visible units may not come from another authored field.
  for (let i = first; i < last; i++) {
    const origin = display.originAt(i);
    if (origin.synthetic || origin.intervals.length !== 1 ||
        origin.intervals[0]!.start < start || origin.intervals[0]!.end > end) return undefined;
  }
  return { start: first, end: last };
}

/** Build once per fenced body; map each source-owned label independently. */
export function createMermaidSourceDisplay(figure: MermaidSourceBody, rawDocument: Uint8Array) {
  const original = originalFence(figure, rawDocument);
  const fence = mapMermaidFence(original, figure.source);
  const plain = withoutComments(fence);
  if (plain.text !== stripMermaidComments(figure.source)) invalid('comment removal changed displayed code');
  const display = plain.replaceRegex(/[\u202a-\u202e\u2066-\u2069]/g,
    match => visibleBidi(match[0]));
  const source = display.text;
  if (source !== visibleBidi(stripMermaidComments(figure.source))) invalid('bidi spelling changed displayed code');
  const coordinates = new MermaidSourceCoordinates(original);
  return { original, source, expressions(parts: readonly Part[]): MermaidSourceExpression[] {
    const expressions: MermaidSourceExpression[] = [];
    let previousEnd = -1;
    for (const part of parts) {
      if (part.kind !== 'math') continue;
      for (const interval of part.origins) {
        const located = coordinates.locate({ start: interval.sourceStart, end: interval.sourceEnd });
        if (JSON.stringify(located) !== JSON.stringify(interval) ||
            !encoder.encode(interval.rawSource).every((byte, i) => rawDocument[figure.mathBodyStartByte! + interval.startByte + i] === byte)) {
          invalid('expression provenance differs from original body bytes');
        }
      }
      if (part.synthetic || part.origins.length !== 1) {
        expressions.push({ tex: part.tex, unrepresentable: true });
        continue;
      }
      const origin = part.origins[0]!;
      const range = displayedRange(display, origin.sourceStart, origin.sourceEnd);
      if (!range || range.start < previousEnd) {
        expressions.push({ tex: part.tex, unrepresentable: true });
        continue;
      }
      const rawSource = source.slice(range.start, range.end);
      if (!rawSource) invalid('mapped expression has no displayed code');
      expressions.push({ tex: part.tex, rawSource, ...range,
        ...(rawSource !== part.source ? { encoded: true as const } : {}) });
      previousEnd = range.end;
    }
    return expressions;
  } };
}
