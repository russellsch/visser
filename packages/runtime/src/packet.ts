// Reference packet text built in the browser (§11.2, §11.3). Pure functions with
// no DOM access, so Node tests can feed the output to the core `parsePacket`.
// String scalars are JSON-quoted, which is valid YAML double-quoted style.

export type PacketFields = {
  docId: string;
  targetId: string;
  sourceRevision: string;
  bodySha256: string;
  viewedBuildId?: string;
  label?: string;
  kind?: string;
  quote?: { exact: string; prefix: string; suffix: string };
};

export const QUOTE_EXACT_MAX = 2000;
export const QUOTE_CONTEXT_MAX = 80;
const SHORT_FIELD_MAX = 200;

/** Canonical reference URI; query order is rev, then body (§11.2). */
export function referenceUri(f: Pick<PacketFields, 'docId' | 'targetId' | 'sourceRevision' | 'bodySha256'>): string {
  return `explain://${f.docId}/${f.targetId}?rev=${f.sourceRevision}&body=${f.bodySha256}`;
}

/** Collapse whitespace runs to one space (§11.3 quote normalization). */
export function normalizeWhitespace(s: string, trim: boolean): string {
  const collapsed = s.replace(/\s+/gu, ' ');
  return trim ? collapsed.trim() : collapsed;
}

/** First `max` code points of `s`. */
export function codePoints(s: string, max: number): string {
  return Array.from(s).slice(0, max).join('');
}

/** Last `max` code points of `s`. */
export function lastCodePoints(s: string, max: number): string {
  const chars = Array.from(s);
  return chars.slice(Math.max(0, chars.length - max)).join('');
}

/** One line, no control characters, at most 200 characters (packet field limits). */
function shortField(s: string): string {
  const oneLine = s.replace(/[\u0000-\u001f\u007f-\u009f]+/gu, ' ').replace(/\s+/gu, ' ').trim();
  return codePoints(oneLine, SHORT_FIELD_MAX);
}

/** Build packet YAML in the createPacket key order, with JSON-quoted strings. */
export function buildPacketYaml(f: PacketFields): string {
  const q = (s: string) => JSON.stringify(s);
  const lines = [
    `schema: ${q('explain-ref/1')}`,
    `uri: ${q(referenceUri(f))}`,
    `docId: ${q(f.docId)}`,
    `targetId: ${q(f.targetId)}`,
    `sourceRevision: ${q(f.sourceRevision)}`,
    `bodySha256: ${q(f.bodySha256)}`,
  ];
  if (f.viewedBuildId) lines.push(`viewedBuildId: ${q(f.viewedBuildId)}`);
  if (f.label) {
    const label = shortField(f.label);
    if (label) lines.push(`label: ${q(label)}`);
  }
  if (f.kind) {
    const kind = shortField(f.kind);
    if (kind) lines.push(`kind: ${q(kind)}`);
  }
  lines.push(`issuedBy: ${q('reader')}`);
  if (f.quote) {
    const exact = codePoints(normalizeWhitespace(f.quote.exact, true), QUOTE_EXACT_MAX);
    if (exact) {
      lines.push('quote:');
      lines.push(`  exact: ${q(exact)}`);
      lines.push(`  prefix: ${q(lastCodePoints(normalizeWhitespace(f.quote.prefix, false), QUOTE_CONTEXT_MAX))}`);
      lines.push(`  suffix: ${q(codePoints(normalizeWhitespace(f.quote.suffix, false), QUOTE_CONTEXT_MAX))}`);
      lines.push(`  projection: ${q('explain-text/1')}`);
    }
  }
  return lines.join('\n') + '\n';
}
