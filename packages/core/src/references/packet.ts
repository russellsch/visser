// Reference packets (ARCHITECTURE.md §11.3). A packet is untrusted data: it can
// only name a document and target; it never chooses a file or carries an instruction.
import { parseDocument, stringify } from 'yaml';
import { HashError } from '../model/hash.ts';
import { validateAgainst } from '../model/schemas.ts';
import { formatReferenceUri, parseReferenceUri } from './uri.ts';

export const PACKET_MAX_BYTES = 16 * 1024;
export const SHORT_FIELD_MAX = 200;
export const QUOTE_EXACT_MAX = 2000;
export const QUOTE_CONTEXT_MAX = 80;

export type PacketQuote = {
  exact: string;
  prefix?: string;
  suffix?: string;
  projection: 'explain-text/1';
};

export type ReferencePacket = {
  schema: 'explain-ref/1';
  uri?: string;
  docId: string;
  targetId: string;
  sourceRevision: string;
  bodySha256: string;
  viewedBuildId?: string;
  label?: string;
  kind?: string;
  sourceHint?: string;
  issuedBy: 'reader' | 'refs-show';
  quote?: PacketQuote;
};

function invalid(message: string): never {
  throw new HashError('E_REF_INVALID', 'E_REF_INVALID', `invalid packet: ${message}`);
}

function codePointLength(s: string): number {
  let n = 0;
  for (const _ of s) n++;
  return n;
}

// C0, DEL, C1, and the Unicode line/paragraph separators all break "one line".
const CONTROL_OR_BREAK = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

function checkShortField(name: string, value: string | undefined): void {
  if (value === undefined) return;
  if (codePointLength(value) > SHORT_FIELD_MAX) invalid(`${name} is longer than ${SHORT_FIELD_MAX} characters`);
  if (CONTROL_OR_BREAK.test(value)) invalid(`${name} must be one line without control characters`);
}

function checkLimits(p: ReferencePacket): void {
  checkShortField('label', p.label);
  checkShortField('kind', p.kind);
  checkShortField('sourceHint', p.sourceHint);
  if (p.quote) {
    if (codePointLength(p.quote.exact) > QUOTE_EXACT_MAX) invalid(`quote.exact exceeds ${QUOTE_EXACT_MAX} code points`);
    for (const key of ['prefix', 'suffix'] as const) {
      const v = p.quote[key];
      if (v !== undefined && codePointLength(v) > QUOTE_CONTEXT_MAX) {
        invalid(`quote.${key} exceeds ${QUOTE_CONTEXT_MAX} code points`);
      }
    }
  }
}

function checkUriAgreement(p: ReferencePacket): void {
  if (p.uri === undefined) return;
  let parts;
  try {
    parts = parseReferenceUri(p.uri);
  } catch (e) {
    invalid((e as Error).message);
  }
  if (
    parts.docId !== p.docId ||
    parts.targetId !== p.targetId ||
    parts.rev !== p.sourceRevision ||
    parts.body !== p.bodySha256
  ) {
    invalid('uri does not agree with the expanded fields');
  }
}

/**
 * Parse and validate a packet file. Rejects oversized input, YAML errors,
 * duplicate keys, aliases, schema violations, field-limit violations, and a
 * `uri` that disagrees with the expanded fields. Failures throw E_REF_INVALID.
 */
export function parsePacket(text: string): ReferencePacket {
  if (Buffer.byteLength(text, 'utf8') > PACKET_MAX_BYTES) invalid(`file is larger than ${PACKET_MAX_BYTES} bytes`);
  const doc = parseDocument(text, { schema: 'core', uniqueKeys: true, prettyErrors: false });
  if (doc.errors.length > 0) invalid(doc.errors[0]?.message ?? 'YAML error');
  let value: unknown;
  try {
    value = doc.toJS({ maxAliasCount: 0 });
  } catch (e) {
    invalid((e as Error).message);
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid('top level must be a mapping');
  const result = validateAgainst('packet', value);
  if (!result.ok) invalid(result.errors.join('; '));
  const packet = value as ReferencePacket;
  checkLimits(packet);
  checkUriAgreement(packet);
  return packet;
}

/** Collapse whitespace runs to one space, as the §11.3 quote projection requires. */
export function normalizeQuoteText(s: string, trim: boolean): string {
  const collapsed = s.replace(/\s+/gu, ' ');
  return trim ? collapsed.trim() : collapsed;
}

export type CreatePacketInput = {
  docId: string;
  targetId: string;
  sourceRevision: string;
  bodySha256: string;
  issuedBy: 'reader' | 'refs-show';
  label?: string;
  kind?: string;
  sourceHint?: string;
  viewedBuildId?: string;
  quote?: { exact: string; prefix?: string; suffix?: string };
};

/**
 * §17.9 createReference: build a packet and its canonical YAML text. Key order
 * is fixed; the result is validated by `parsePacket` before it is returned.
 */
export function createPacket(input: CreatePacketInput): { packet: ReferencePacket; yaml: string } {
  const packet: ReferencePacket = {
    schema: 'explain-ref/1',
    uri: formatReferenceUri({
      docId: input.docId,
      targetId: input.targetId,
      rev: input.sourceRevision,
      body: input.bodySha256,
    }),
    docId: input.docId,
    targetId: input.targetId,
    sourceRevision: input.sourceRevision,
    bodySha256: input.bodySha256,
  } as ReferencePacket;
  if (input.viewedBuildId !== undefined) packet.viewedBuildId = input.viewedBuildId;
  if (input.label !== undefined) packet.label = input.label;
  if (input.kind !== undefined) packet.kind = input.kind;
  if (input.sourceHint !== undefined) packet.sourceHint = input.sourceHint;
  packet.issuedBy = input.issuedBy;
  if (input.quote !== undefined) {
    const ordered = { exact: normalizeQuoteText(input.quote.exact, true) } as PacketQuote;
    if (input.quote.prefix !== undefined) ordered.prefix = normalizeQuoteText(input.quote.prefix, false);
    if (input.quote.suffix !== undefined) ordered.suffix = normalizeQuoteText(input.quote.suffix, false);
    ordered.projection = 'explain-text/1';
    packet.quote = ordered;
  }
  const yaml = stringify(packet, { lineWidth: 0, minContentWidth: 0 });
  const reparsed = parsePacket(yaml);
  return { packet: reparsed, yaml };
}
