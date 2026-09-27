// Canonical hashing (ARCHITECTURE.md §7.4). Ported from spikes/hash-vectors/ts,
// which an independent Python implementation cross-checks (scripts/check-contracts.mjs).
// This module uses only erasable TypeScript syntax so Node 24 can run it directly.
import { createHash } from 'node:crypto';
import type { Sha256 } from '../types.ts';

/**
 * A hashing error. `code` is the §15.6 diagnostic code; `reason` is a finer
 * machine-readable cause that the cross-language test vectors compare.
 */
export class HashError extends Error {
  readonly code: string;
  readonly reason: string;
  constructor(code: string, reason: string, message: string) {
    super(message);
    this.name = 'HashError';
    this.code = code;
    this.reason = reason;
  }
}

const HEX64 = /^[0-9a-f]{64}$/;
export const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const TARGET_ID = /^[a-z][a-z0-9_-]{0,63}$/;

export function isSha256(value: unknown): value is Sha256 {
  return typeof value === 'string' && HEX64.test(value);
}

export function sha256Hex(data: Uint8Array | string): Sha256 {
  return createHash('sha256').update(data).digest('hex');
}

// ---------------------------------------------------------------------------
// Text normalization

/** Decode strict UTF-8, remove one leading BOM, and convert CRLF and CR to LF. */
export function normalizeText(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new HashError('E_SYNTAX', 'E_UTF8', 'invalid UTF-8');
  }
  if (text.startsWith('\ufeff')) text = text.slice(1);
  return text.replace(/\r\n?/g, '\n');
}

/** sha256 of the normalized text of a target span (§7.4 bodySha256). */
export function bodySha256(spanBytes: Uint8Array): Sha256 {
  return sha256Hex(Buffer.from(normalizeText(spanBytes), 'utf8'));
}

/** sha256 of normalized text, as used for captured excerpts and text bundle files. */
export function normalizedTextSha256(bytes: Uint8Array): Sha256 {
  return bodySha256(bytes);
}

// ---------------------------------------------------------------------------
// Canonical JSON

/**
 * Code-point order, which equals UTF-8 byte order. JavaScript's default string
 * comparison uses UTF-16 code units and is not this order.
 */
export function compareCodePoints(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

function assertScalarValues(s: string): void {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = s.charCodeAt(i + 1);
      if (!(d >= 0xdc00 && d <= 0xdfff)) {
        throw new HashError('E_SYNTAX', 'E_LONE_SURROGATE', 'lone high surrogate');
      }
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      throw new HashError('E_SYNTAX', 'E_LONE_SURROGATE', 'lone low surrogate');
    }
  }
}

const SHORT_ESCAPES: Record<string, string> = {
  '"': '\\"', '\\': '\\\\', '\b': '\\b', '\f': '\\f', '\n': '\\n', '\r': '\\r', '\t': '\\t',
};

function quoteString(s: string): string {
  assertScalarValues(s);
  let out = '"';
  for (const ch of s) {
    const short = SHORT_ESCAPES[ch];
    if (short !== undefined) out += short;
    else if (ch.charCodeAt(0) < 0x20) out += '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0');
    else out += ch;
  }
  return out + '"';
}

/**
 * Canonical JSON (§7.4): keys in code-point order, arrays in order, no
 * insignificant whitespace, only safe integers, `-0` as `0`. Not RFC 8785.
 */
export function canonicalJSON(value: unknown): string {
  if (value === null) return 'null';
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (value === undefined) throw new HashError('E_SYNTAX', 'E_UNDEFINED', 'undefined is not allowed');
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new HashError('E_SYNTAX', 'E_NONFINITE', 'NaN or Infinity');
    if (!Number.isInteger(value)) throw new HashError('E_SYNTAX', 'E_FLOAT', 'floating-point number');
    if (!Number.isSafeInteger(value)) throw new HashError('E_SYNTAX', 'E_UNSAFE_INT', 'integer outside safe range');
    return Object.is(value, -0) ? '0' : String(value);
  }
  if (typeof value === 'string') return quoteString(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJSON).join(',') + ']';
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    keys.forEach(assertScalarValues);
    keys.sort(compareCodePoints);
    return '{' + keys.map((k) => quoteString(k) + ':' + canonicalJSON(obj[k])).join(',') + '}';
  }
  throw new HashError('E_SYNTAX', 'E_TYPE', `unsupported type ${typeof value}`);
}

export function canonicalSha256(value: unknown): Sha256 {
  return sha256Hex(Buffer.from(canonicalJSON(value), 'utf8'));
}

/**
 * Parse JSON text for hashed inputs (lock, config, packet, options). Numbers must
 * match `-?(0|[1-9][0-9]*)` at the text level: `1.0` and `1e3` are rejected even
 * when integral, because JavaScript and Python parse them differently (§7.4).
 */
export function parseJsonStrictIntegers(text: string): unknown {
  // Scan outside strings for number tokens with a fraction or exponent.
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '-' || (ch !== undefined && ch >= '0' && ch <= '9')) {
      let j = i + 1;
      while (j < text.length && /[0-9.eE+-]/.test(text[j] ?? '')) j++;
      const token = text.slice(i, j);
      if (!/^-?(0|[1-9][0-9]*)$/.test(token)) {
        throw new HashError('E_SYNTAX', 'E_FLOAT', `number ${token} is not an integer literal`);
      }
      i = j - 1;
    }
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new HashError('E_SYNTAX', 'E_JSON', `invalid JSON: ${(e as Error).message}`);
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Bundle paths and source revision

/** Validate one bundle-relative path (§7.4 path grammar). */
export function validateBundlePath(p: string): void {
  if (p.length === 0 || p.includes('\u0000')) {
    throw new HashError('E_PATH_INVALID', 'E_PATH_INVALID', 'empty path or NUL');
  }
  if (p.startsWith('/')) throw new HashError('E_PATH_ESCAPE', 'E_PATH_ESCAPE', 'absolute path');
  if (p.includes('\\')) throw new HashError('E_PATH_INVALID', 'E_PATH_INVALID', 'backslash in path');
  const segments = p.split('/');
  if (segments.includes('..')) throw new HashError('E_PATH_ESCAPE', 'E_PATH_ESCAPE', 'traversal segment');
  if (segments.some((s) => s === '' || s === '.')) {
    throw new HashError('E_PATH_INVALID', 'E_PATH_INVALID', 'empty or dot segment');
  }
  if (p.normalize('NFC') !== p) throw new HashError('E_PATH_INVALID', 'E_PATH_INVALID', 'path is not NFC');
}

/** Digest kind follows the declared role, never the extension alone. */
export type BundleFile = { path: string; kind: 'text' | 'binary'; content: Uint8Array };

export type SourceManifest = {
  schema: 'visser-source-manifest/1';
  docId: string;
  files: Array<{ path: string; sha256: Sha256 }>;
};

export function assertDocId(docId: string): void {
  if (!UUID_V4.test(docId)) {
    throw new HashError('E_SYNTAX', 'E_DOCID', 'docId is not a lowercase UUIDv4');
  }
}

/** Build the source manifest (§7.4) from declared bundle files. */
export function sourceManifest(docId: string, files: readonly BundleFile[]): SourceManifest {
  assertDocId(docId);
  const seen = new Set<string>();
  const folded = new Set<string>();
  const entries = files.map((f) => {
    validateBundlePath(f.path);
    if (seen.has(f.path)) {
      throw new HashError('E_PATH_INVALID', 'E_PATH_DUPLICATE', `duplicate path ${f.path}`);
    }
    const fold = f.path.normalize('NFC').toLowerCase().normalize('NFC');
    if (folded.has(fold)) {
      throw new HashError('E_PATH_INVALID', 'E_PATH_CASE_COLLISION', `case collision for ${f.path}`);
    }
    seen.add(f.path);
    folded.add(fold);
    const sha256 = f.kind === 'text' ? normalizedTextSha256(f.content) : sha256Hex(f.content);
    return { path: f.path, sha256 };
  });
  if (!seen.has('index.md')) throw new HashError('E_PATH_INVALID', 'E_MANIFEST', 'index.md is required');
  entries.sort((a, b) => compareCodePoints(a.path, b.path));
  return { schema: 'visser-source-manifest/1', docId, files: entries };
}

/** §17.9 computeSourceRevision: sha256 of the canonical manifest. */
export function computeSourceRevision(manifest: SourceManifest): Sha256 {
  return canonicalSha256(manifest);
}

export function sourceRevision(docId: string, files: readonly BundleFile[]) {
  const manifest = sourceManifest(docId, files);
  const canonical = canonicalJSON(manifest);
  return { manifest, canonical, sourceRevision: sha256Hex(Buffer.from(canonical, 'utf8')) };
}

// ---------------------------------------------------------------------------
// Build ID

export type EffectiveRenderOptions = {
  audience: 'private' | 'public';
  includeSource: boolean;
  layoutFallback: boolean;
  /**
   * Present, and true, only for a development build (§12.4). A development build
   * and a normal build of the same source and toolkit then get different IDs, so
   * an existing snapshot folder is never replaced. Absent otherwise, so normal
   * build IDs do not change.
   */
  development?: true;
};

export type BuildInput = {
  sourceRevision: string;
  toolkitSha256: string;
  extensionDigests: readonly string[];
  effectiveRenderOptions: EffectiveRenderOptions;
};

function assertHex(name: string, v: unknown): Sha256 {
  if (!isSha256(v)) throw new HashError('E_INTEGRITY', 'E_HASH', `${name} is not 64 lowercase hex`);
  return v;
}

/**
 * Hash an arbitrary build-input object. Used by `buildId` after option
 * validation, and by the cross-language vectors, which predate the fixed keys.
 */
export function buildIdFromInput(input: {
  sourceRevision: string;
  toolkitSha256: string;
  extensionDigests: readonly string[];
  effectiveRenderOptions: Record<string, unknown>;
}) {
  assertHex('sourceRevision', input.sourceRevision);
  assertHex('toolkitSha256', input.toolkitSha256);
  const ext = input.extensionDigests.map((d, i) => assertHex(`extensionDigests[${i}]`, d));
  if (new Set(ext).size !== ext.length) {
    throw new HashError('E_INTEGRITY', 'E_DUPLICATE_DIGEST', 'duplicate extension digest');
  }
  ext.sort(compareCodePoints);
  const canonical = canonicalJSON({
    schema: 'visser-build-input/1',
    sourceRevision: input.sourceRevision,
    toolkitSha256: input.toolkitSha256,
    extensionDigests: ext,
    effectiveRenderOptions: input.effectiveRenderOptions,
  });
  return { canonical, buildId: sha256Hex(Buffer.from(canonical, 'utf8')) };
}

/** §7.4 buildId with the exact `{audience, includeSource, layoutFallback}` options, plus `development: true` for a development build. */
export function buildId(input: BuildInput) {
  const o = input.effectiveRenderOptions as Record<string, unknown>;
  const keys = Object.keys(o).filter((k) => !(k === 'development' && o[k] === true)).sort();
  if (
    keys.join(',') !== 'audience,includeSource,layoutFallback' ||
    (o.audience !== 'private' && o.audience !== 'public') ||
    typeof o.includeSource !== 'boolean' ||
    typeof o.layoutFallback !== 'boolean'
  ) {
    throw new HashError(
      'E_SYNTAX',
      'E_RENDER_OPTIONS',
      'effectiveRenderOptions must be exactly {audience, includeSource, layoutFallback}, plus development: true for a development build',
    );
  }
  return buildIdFromInput(input);
}
