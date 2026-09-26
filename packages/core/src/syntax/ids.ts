// `ids assign` (ARCHITECTURE.md §6.3, §17.1): insert missing ID markers.
import type { Diagnostic } from '../types.ts';
import { analyzeSource } from './parse.ts';
import { detectNewline, isBlank } from './source-text.ts';

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

/** Lowercase RFC 4648 base32 of 10 bytes (80 bits) gives exactly 16 characters. */
function base32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export class IdsAssignError extends Error {
  readonly diagnostics: Diagnostic[];
  constructor(diagnostics: Diagnostic[]) {
    super(`ids assign refused: the source has ${diagnostics.length} error(s) other than missing IDs`);
    this.diagnostics = diagnostics;
  }
}

/**
 * Insert `<!-- ex:id b_XXXXXXXXXXXXXXXX -->` before each top-level ordinary block that has no
 * marker. Existing IDs and all other bytes are unchanged; inserted lines use the file's newline.
 * Idempotent. Refuses (throws IdsAssignError) when the source has other errors, because a
 * malformed marker would otherwise gain a second one.
 */
export function assignIds(
  bytes: Uint8Array,
  randomBytes: (n: number) => Uint8Array,
): { bytes: Uint8Array; added: string[] } {
  const a = analyzeSource(bytes, 'index.md');
  const blocking = a.source.diagnostics.filter((d) => d.severity === 'error' && d.code !== 'E_ID_MISSING');
  if (blocking.length) throw new IdsAssignError(blocking);
  if (!a.unmarked.length || !a.text) return { bytes, added: [] };

  const src = a.text;
  const nl = detectNewline(bytes);
  const used = new Set(a.source.targets.map((t) => t.id));
  const newId = () => {
    for (;;) {
      const id = `b_${base32(randomBytes(10))}`;
      if (!used.has(id)) {
        used.add(id);
        return id;
      }
    }
  };

  const enc = new TextEncoder();
  const inserts = a.unmarked.map((u) => {
    const id = newId();
    const prev = u.line - 1;
    const prevOk = u.line === 0 || isBlank(src.lines[prev]) || prev === a.frontmatterCloseLine;
    const text = `${prevOk ? '' : nl}<!-- ex:id ${id} -->${nl}`;
    return { offset: src.lineStart[u.line] ?? bytes.length, id, bytes: enc.encode(text) };
  });

  const total = bytes.length + inserts.reduce((n, x) => n + x.bytes.length, 0);
  const out = new Uint8Array(total);
  let from = 0;
  let to = 0;
  for (const ins of inserts) {
    out.set(bytes.subarray(from, ins.offset), to);
    to += ins.offset - from;
    out.set(ins.bytes, to);
    to += ins.bytes.length;
    from = ins.offset;
  }
  out.set(bytes.subarray(from), to);
  return { bytes: out, added: inserts.map((x) => x.id) };
}
