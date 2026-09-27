// Canonical reference URI (ARCHITECTURE.md §11.2):
//   visser://DOC_UUID/TARGET_ID?rev=SOURCE_REVISION&body=TARGET_BODY_SHA256
import { HashError, TARGET_ID, UUID_V4, isSha256 } from '../model/hash.ts';

export type ReferenceParts = { docId: string; targetId: string; rev: string; body: string };

function invalid(reason: string): never {
  throw new HashError('E_REF_INVALID', 'E_REF_INVALID', `invalid reference URI: ${reason}`);
}

function validateParts(p: ReferenceParts): void {
  if (!UUID_V4.test(p.docId)) invalid('docId is not a lowercase UUIDv4');
  if (!TARGET_ID.test(p.targetId)) invalid('targetId does not match the ID grammar');
  if (!isSha256(p.rev)) invalid('rev is not 64 lowercase hex');
  if (!isSha256(p.body)) invalid('body is not 64 lowercase hex');
}

/** Emit the canonical form. Query order is always `rev`, then `body`. */
export function formatReferenceUri(p: ReferenceParts): string {
  validateParts(p);
  return `visser://${p.docId}/${p.targetId}?rev=${p.rev}&body=${p.body}`;
}

/**
 * Parse with a real URL parser, apply the §11.2 rejection rules, and then accept
 * only the exact canonical bytes. A well-formed but noncanonical URI is invalid.
 */
export function parseReferenceUri(raw: string): ReferenceParts {
  if (!/^[\x21-\x7e]*$/.test(raw)) invalid('non-ASCII, space, or control character');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return invalid('unparseable');
  }
  if (url.protocol !== 'visser:') invalid('scheme');
  if (raw.includes('#')) invalid('fragment');
  if (url.username !== '' || url.password !== '') invalid('credentials');
  if (url.port !== '') invalid('port');
  if (url.pathname.includes('%')) invalid('percent-encoding in path');
  const segments = url.pathname.split('/');
  if (segments.length !== 2 || segments[0] !== '') invalid('path segments');
  const keys = [...url.searchParams.keys()];
  if (keys.length !== 2 || new Set(keys).size !== 2 || !keys.includes('rev') || !keys.includes('body')) {
    invalid('query keys');
  }
  const parts: ReferenceParts = {
    docId: url.host,
    targetId: segments[1] ?? '',
    rev: url.searchParams.get('rev') ?? '',
    body: url.searchParams.get('body') ?? '',
  };
  validateParts(parts);
  if (formatReferenceUri(parts) !== raw) invalid('not the canonical form');
  return parts;
}
