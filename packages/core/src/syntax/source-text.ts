// Original-byte bookkeeping for the parser adapter (ARCHITECTURE.md §7.3).
// Markdoc sees an LF-normalized view; every span maps back to original bytes
// through a table of line starts built from the raw file.

export type SourceText = {
  bytes: Uint8Array;
  bomLength: number;
  text: string; // BOM removed, CRLF and CR normalized to LF
  lines: string[]; // text.split('\n')
  lineStart: number[]; // byte offset of each normalized line in `bytes`
};

const decoder = new TextDecoder('utf-8', { fatal: true });

/** Decode strict UTF-8, strip one BOM, and index line starts in the original bytes. Throws on invalid UTF-8. */
export function loadSourceText(bytes: Uint8Array): SourceText {
  const bomLength = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  const lineStart = [bomLength];
  for (let i = bomLength; i < bytes.length; i++) {
    if (bytes[i] === 0x0d) {
      if (bytes[i + 1] === 0x0a) i++;
      lineStart.push(i + 1);
    } else if (bytes[i] === 0x0a) {
      lineStart.push(i + 1);
    }
  }
  const text = decoder.decode(bytes.subarray(bomLength)).replace(/\r\n?/g, '\n');
  return { bytes, bomLength, text, lines: text.split('\n'), lineStart };
}

/** Byte range [start, end) of normalized lines [startLine, endLine). */
export function lineByteRange(src: SourceText, startLine: number, endLine: number): [number, number] {
  const start = src.lineStart[startLine] ?? src.bytes.length;
  const end = endLine < src.lineStart.length ? (src.lineStart[endLine] ?? src.bytes.length) : src.bytes.length;
  return [start, Math.min(end, src.bytes.length)];
}

/** The newline sequence the file uses first (LF when the file has none). */
export function detectNewline(bytes: Uint8Array): string {
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0x0d) return bytes[i + 1] === 0x0a ? '\r\n' : '\r';
    if (bytes[i] === 0x0a) return '\n';
  }
  return '\n';
}

export function isBlank(line: string | undefined): boolean {
  return line === undefined || line.trim() === '';
}
