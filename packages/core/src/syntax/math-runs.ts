/** The same single-dollar delimiter rule is used by source tokenization and decoded label runs. */
export function inlineMathClose(source: string, start: number, max = source.length): number {
  if (source[start] !== '$' || source[start + 1] === '$') return -1;
  if (!source[start + 1] || /\s/.test(source[start + 1] ?? '')) return -1;
  for (let pos = start + 2; pos < max; pos++) {
    if (source[pos] === '\n') break;
    if (source[pos] === '\\') { pos++; continue; }
    if (source[pos] === '$' && !/\s/.test(source[pos - 1] ?? '') && !/\d/.test(source[pos + 1] ?? '')) return pos;
  }
  return -1;
}

export type MathTextRun =
  | { kind: 'text'; text: string; startChar: number; endChar: number }
  | { kind: 'math'; tex: string; startChar: number; endChar: number };

/** Lossless text/math runs for already decoded rich-text attributes; no Markdown formatting pass. */
export function parseMathTextRuns(decoded: string): MathTextRun[] {
  const runs: MathTextRun[] = [];
  let textStart = 0;
  for (let i = 0; i < decoded.length;) {
    if (decoded[i] === '\\') { i += Math.min(2, decoded.length - i); continue; }
    if (decoded[i] !== '$') { i++; continue; }
    const close = inlineMathClose(decoded, i);
    if (close < 0) { i++; continue; }
    if (i > textStart) runs.push({ kind: 'text', text: decoded.slice(textStart, i), startChar: textStart, endChar: i });
    runs.push({ kind: 'math', tex: decoded.slice(i + 1, close), startChar: i, endChar: close + 1 });
    i = close + 1;
    textStart = i;
  }
  if (textStart < decoded.length) runs.push({ kind: 'text', text: decoded.slice(textStart), startChar: textStart, endChar: decoded.length });
  return runs;
}
