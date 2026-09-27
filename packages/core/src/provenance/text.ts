// Captured text rules and line extraction (§8.2 "Captured text rules", §8.6).
import { HashError, normalizeText, sha256Hex } from '../model/hash.ts';

/** Longest line capture accepts (§2.3: 64 KiB logical line). */
export const MAX_LINE_BYTES = 64 * 1024;

const LFS_POINTER = 'version https://git-lfs.github.com/spec/v1';
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

function fail(code: string, message: string): never {
  throw new HashError(code, code, message);
}

/** A Git LFS pointer file carries a reference, not the content. */
export function isLfsPointer(bytes: Uint8Array): boolean {
  const head = Buffer.from(bytes.subarray(0, LFS_POINTER.length)).toString('latin1');
  return head === LFS_POINTER;
}

/**
 * Split raw bytes into lines; a line ends with LF, and a last line without a
 * final LF still counts (§8.2: lines count LF-terminated lines of the raw blob).
 */
export function splitLines(bytes: Uint8Array): Uint8Array[] {
  const lines: Uint8Array[] = [];
  let start = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0x0a) {
      lines.push(bytes.subarray(start, i + 1));
      start = i + 1;
    }
  }
  if (start < bytes.length) lines.push(bytes.subarray(start));
  return lines;
}

/** Reject bytes that capture must not store as text (§8.2). */
export function checkCapturedBytes(range: Uint8Array): void {
  try {
    utf8.decode(range);
  } catch {
    fail('E_SEMANTIC', 'the captured text is not valid UTF-8');
  }
  for (let i = 0; i < range.length; i++) {
    const b = range[i]!;
    if (b === 0x0d) {
      if (range[i + 1] !== 0x0a) fail('E_SEMANTIC', 'the captured range contains a carriage return without a line feed; normalize line endings in the source first');
      continue;
    }
    if (b < 0x20 && b !== 0x09 && b !== 0x0a) fail('E_SEMANTIC', `the captured text contains control byte 0x${b.toString(16).padStart(2, '0')} (binary content)`);
  }
}

export type Excerpt = {
  start: number;
  end: number;
  /** LF-normalized text with exactly one terminal LF added when the source line had none. */
  text: string;
  excerptSha256: string;
};

/** The excerpt form stored in a `source` block: normalized, ending with one added LF if missing. */
export function excerptText(range: Uint8Array): string {
  const text = normalizeText(range);
  return text.endsWith('\n') ? text : `${text}\n`;
}

/**
 * Extract lines `start..end` (1-based, inclusive) from a whole file and apply
 * every captured-text rule. `whole` is the full blob or file, for the LFS check.
 */
export function extractExcerpt(whole: Uint8Array, start: number, end: number): Excerpt {
  if (isLfsPointer(whole)) fail('E_SOURCE_UNAVAILABLE', 'the file is a Git LFS pointer; its content is not in Git');
  const lines = splitLines(whole);
  if (end > lines.length) fail('E_USAGE', `--lines ${start}:${end} is past the end of the file (${lines.length} lines)`);
  const selected = lines.slice(start - 1, end);
  for (const line of selected) {
    if (line.length > MAX_LINE_BYTES) fail('E_LIMIT', `a captured line is longer than ${MAX_LINE_BYTES} bytes`);
  }
  const range = Buffer.concat(selected);
  if (range.length === 0) fail('E_USAGE', 'the captured range is empty');
  checkCapturedBytes(range);
  const text = excerptText(range);
  return { start, end, text, excerptSha256: sha256Hex(Buffer.from(text, 'utf8')) };
}

/** The whole file as an excerpt (for `capture file` without `--lines`). */
export function wholeExcerpt(whole: Uint8Array): Excerpt {
  const count = splitLines(whole).length;
  if (count === 0) fail('E_USAGE', 'the file is empty');
  return extractExcerpt(whole, 1, count);
}
