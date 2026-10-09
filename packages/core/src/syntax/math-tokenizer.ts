// Standalone W1 math tokenizer. Uses markdown-it 12.3.2 public rule APIs and
// Markdoc's public parseTags/token-stream entry point. Production parse.ts does
// not call this module yet.
import Markdoc from '@markdoc/markdoc';
import MarkdownIt from 'markdown-it';
import imageRule from 'markdown-it/lib/rules_inline/image.js';
import type Token from 'markdown-it/lib/token.js';
import type StateBlock from 'markdown-it/lib/rules_block/state_block.js';
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.js';
import type { Diagnostic } from '../types.ts';
import { loadSourceText, type SourceText } from './source-text.ts';
import { mathTable } from './math-table.ts';
import { inlineMathClose } from './math-runs.ts';
export { parseMathTextRuns, type MathTextRun } from './math-runs.ts';

export type MathOccurrence = {
  kind: 'inline' | 'display' | 'equation';
  tex: string;
  startByte: number;
  endByte: number;
};
export type MathTokenization = {
  tokens: Token[];
  occurrences: MathOccurrence[];
  diagnostics: Diagnostic[];
  source?: SourceText;
};
type SourceMap = { normalized: string; charToByte: Array<number | undefined> };
type MathEnv = {
  sourceMap: SourceMap;
  sourceMapBytes: Uint8Array;
  occurrences: MathOccurrence[];
  diagnostics: Diagnostic[];
  path: string;
  currentInline?: Token;
  imageAlt?: boolean;
};
const utf8 = new TextEncoder();
type ParsedTag = Token & { start: number; end: number };
// parseTags returns markdown-it tokens with numeric source offsets at runtime.
function parsedTags(source: string): ParsedTag[] { return Markdoc.parseTags(source) as ParsedTag[]; }

// Every mapped offset is a boundary in the original UTF-8 bytes. An interior
// UTF-16 surrogate position remains undefined, so it can never become a lie.
function originalMap(source: SourceText): SourceMap {
  const raw = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(source.bytes.subarray(source.bomLength));
  const charToByte: Array<number | undefined> = [source.bomLength];
  let normalized = '';
  let byte = source.bomLength;
  for (let i = 0; i < raw.length;) {
    const cp = raw.codePointAt(i);
    if (cp === undefined) break;
    const value = String.fromCodePoint(cp);
    if (value === '\r') {
      const pair = raw[i + 1] === '\n';
      normalized += '\n';
      byte += pair ? 2 : 1;
      charToByte.push(byte);
      i += pair ? 2 : 1;
      continue;
    }
    const replacement = value === '\0' ? '\ufffd' : value;
    normalized += replacement;
    const next = byte + utf8.encode(value).length;
    if (replacement.length === 2) charToByte.push(undefined);
    charToByte.push(next);
    byte = next;
    i += value.length;
  }
  return { normalized, charToByte };
}
function report(env: MathEnv, code: string, message: string, start?: number): void {
  const startLine = start === undefined ? undefined : env.sourceMap.normalized.slice(0, start).split('\n').length;
  env.diagnostics.push({ code, severity: 'error', message, path: env.path, startLine });
}
function record(env: MathEnv, kind: MathOccurrence['kind'], start: number | undefined, end: number | undefined, tex: string): void {
  if (start === undefined || end === undefined || start < 0 || end < start || end > env.sourceMap.normalized.length) {
    report(env, 'E_SPAN_UNPROVEN', `cannot prove ${kind} math source offset`, start);
    return;
  }
  const a = env.sourceMap.charToByte[start];
  const b = env.sourceMap.charToByte[end];
  const normalizedSlice = env.sourceMap.normalized.slice(start, end);
  if (a === undefined || b === undefined || (kind === 'inline' && normalizedSlice !== `$${tex}$`)) {
    report(env, 'E_SPAN_UNPROVEN', `cannot prove ${kind} math source span`, start);
    return;
  }
  // A second check ties normalized characters to the actual original bytes.
  const rawSlice = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(env.sourceMapBytes?.subarray(a, b) ?? new Uint8Array());
  if (rawSlice.replace(/\r\n?/g, '\n').replace(/\0/g, '\ufffd') !== normalizedSlice) {
    report(env, 'E_SPAN_UNPROVEN', `original bytes disagree with ${kind} math source span`, start);
    return;
  }
  env.occurrences.push({ kind, tex, startByte: a, endByte: b });
}
function line(state: StateBlock, n: number): string {
  return state.src.slice((state.bMarks[n] ?? 0) + (state.tShift[n] ?? 0), state.eMarks[n]);
}
function frontmatter(state: StateBlock, start: number, end: number, silent: boolean): boolean {
  if (start !== 0 || line(state, start).trim() !== '---') return false;
  let close = start + 1;
  while (close < end && line(state, close).trim() !== '---') close++;
  if (close >= end) return false;
  if (silent) return true;
  const token = state.push('frontmatter', '', 0);
  token.content = state.src.slice(state.eMarks[start], state.bMarks[close]).trim();
  token.map = [start, close]; token.hidden = true;
  state.line = close + 1;
  return true;
}
function commentBlock(state: StateBlock, start: number, _end: number, silent: boolean): boolean {
  const at = (state.bMarks[start] ?? 0) + (state.tShift[start] ?? 0);
  if (!state.src.startsWith('<!--', at)) return false;
  const close = state.src.indexOf('-->', at + 4);
  if (close < 0) return false;
  if (silent) return true;
  const content = state.src.slice(at + 4, close);
  const lines = content.split('\n').length;
  const token = state.push('comment', '', 0);
  token.content = content.trim(); token.map = [start, start + lines];
  state.line = start + lines;
  return true;
}
function tagBlock(state: StateBlock, start: number, end: number, silent: boolean): boolean {
  if (!line(state, start).startsWith('{%')) return false;
  let close = start;
  while (close < end && !line(state, close).includes('%}')) close++;
  if (close >= end) return false;
  const full = state.src.slice((state.bMarks[start] ?? 0) + (state.tShift[start] ?? 0), state.eMarks[close]);
  const parsed = parsedTags(full).find(t => ['tag', 'tag_open', 'tag_close'].includes(t.type) && t.start === full.indexOf('{%'));
  if (!parsed || full.slice(parsed.end + 1).trim()) return false;
  if (silent) return true;
  const token = state.push(parsed.type, '', parsed.nesting);
  token.meta = parsed.meta; token.info = parsed.info; token.map = [start, close + 1];
  state.line = close + 1;
  return true;
}
function rawBlock(state: StateBlock, start: number, end: number, silent: boolean, kind: 'display' | 'equation'): boolean {
  const first = line(state, start);
  let parsed: ParsedTag | undefined;
  if (kind === 'display') {
    if (first.trim() !== '$$') return false;
  } else {
    const trimmed = first.trim();
    parsed = parsedTags(trimmed).find(t => t.type === 'tag_open' && t.meta?.tag === 'equation' && t.start === 0 && t.end === trimmed.length - 1);
    if (!parsed) return false;
  }
  const closes = (raw: string): boolean => {
    const trimmed = raw.trim();
    if (kind === 'display') return trimmed === '$$';
    return parsedTags(trimmed).some(t => t.type === 'tag_close' && t.meta?.tag === 'equation' && t.start === 0 && t.end === trimmed.length - 1);
  };
  let close = start + 1;
  while (close < end && !closes(line(state, close))) close++;
  if (silent) return true;
  if (close >= end) {
    const error = state.push('error', '', 0);
    error.meta = { error: { message: `unclosed ${kind} math block` } }; error.map = [start, start + 1];
    report(state.env as MathEnv, 'E_SYNTAX', `unclosed ${kind} math block`, state.bMarks[start]);
    state.line = start + 1;
    return true;
  }
  const open = state.push(kind === 'display' ? 'math_display_open' : 'tag_open', '', 1);
  if (parsed) open.meta = parsed.meta;
  open.map = [start, start + 1];
  const body = state.push('text', '', 0);
  body.content = Array.from({ length: close - start - 1 }, (_, i) => {
    const n = start + i + 1;
    // Container parsers rewrite bMarks/tShift. Their offsets give the visible
    // TeX body without quote/list syntax; root bodies retain source indentation.
    return state.parentType === 'root'
      ? state.src.slice(state.bMarks[n], state.eMarks[n])
      : line(state, n);
  }).join('\n') + (close > start + 1 ? '\n' : '');
  body.map = [start + 1, close];
  const ending = state.push(kind === 'display' ? 'math_display_close' : 'tag_close', '', -1);
  if (kind === 'equation') ending.meta = { tag: 'equation' };
  ending.map = [close, close + 1];
  record(state.env as MathEnv, kind, state.bMarks[start], state.eMarks[close], body.content);
  state.line = close + 1;
  return true;
}
function commentInline(state: StateInline, silent: boolean): boolean {
  if (!state.src.startsWith('<!--', state.pos)) return false;
  const close = state.src.indexOf('-->', state.pos + 4);
  if (close < 0) return false;
  if (!silent) { const token = state.push('comment', '', 0); token.content = state.src.slice(state.pos + 4, close).trim(); }
  state.pos = close + 3;
  return true;
}
function tagInline(state: StateInline, silent: boolean): boolean {
  if (!state.src.startsWith('{%', state.pos)) return false;
  const parsed = parsedTags(state.src.slice(state.pos)).find(t =>
    ['tag', 'tag_open', 'tag_close', 'variable', 'error'].includes(t.type) && t.start === 0);
  if (!parsed) return false;
  if (!silent) { const token = state.push(parsed.type, '', parsed.nesting); token.meta = parsed.meta; token.info = parsed.info; }
  state.pos += parsed.end + 1;
  return true;
}
function mathInline(state: StateInline, silent: boolean): boolean {
  // Image alt is an accessible string, not a formula-bearing HTML subtree.
  // markdown-it parses it recursively with label-relative offsets; leave its
  // delimiters literal instead of attributing them to the containing paragraph.
  if ((state.env as MathEnv).imageAlt) return false;
  const start = state.pos;
  const pos = inlineMathClose(state.src, start, state.posMax);
  if (pos < 0) return false;
  if (!silent) {
      const open = state.push('math_inline_open', '', 1);
      (open as Token & { position?: { start: number; end: number } }).position = { start, end: pos + 1 };
      const body = state.push('text', '', 0);
      body.content = state.src.slice(start + 1, pos);
      (body as Token & { position?: { start: number; end: number } }).position = { start: start + 1, end: pos };
      const close = state.push('math_inline_close', '', -1);
      (close as Token & { position?: { start: number; end: number } }).position = { start: pos, end: pos + 1 };
      const charMap = (state.env as MathEnv).currentInline?.meta?.charMap as Array<number | undefined> | undefined;
      record(state.env as MathEnv, 'inline', charMap?.[start], charMap?.[pos + 1], body.content);
  }
  state.pos = pos + 1;
  return true;
}
function inlineMap(token: Token, src: string, lineStarts: number[]): Array<number | undefined> {
  if (Array.isArray(token.meta?.charMap)) return token.meta.charMap as Array<number | undefined>;
  const result: Array<number | undefined> = [];
  if (!token.map) return result;
  const parts = token.content.split('\n');
  let offset = 0;
  for (let p = 0; p < parts.length; p++) {
    const lineStart = lineStarts[token.map[0] + p];
    const lineEnd = lineStarts[token.map[0] + p + 1] ?? src.length;
    const part = parts[p] ?? '';
    if (lineStart === undefined || !part) { offset += part.length + 1; continue; }
    const sourceLine = src.slice(lineStart, lineEnd);
    const first = sourceLine.indexOf(part);
    if (first < 0 || sourceLine.indexOf(part, first + 1) >= 0) {
      offset += part.length + 1;
      continue;
    }
    for (let j = 0; j <= part.length; j++) result[offset + j] = lineStart + first + j;
    offset += part.length + 1;
  }
  return result;
}
function createTokenizer(): MarkdownIt {
  const md = new MarkdownIt({ html: true });
  md.disable(['lheading', 'code']);
  md.block.ruler.before('hr', 'visser_frontmatter', frontmatter);
  md.block.ruler.before('table', 'visser_comment', commentBlock, { alt: ['paragraph'] });
  md.block.ruler.before('table', 'visser_math_display', (s, a, b, c) => rawBlock(s, a, b, c, 'display'), { alt: ['paragraph'] });
  md.block.ruler.before('paragraph', 'visser_equation', (s, a, b, c) => rawBlock(s, a, b, c, 'equation'), { alt: ['paragraph', 'blockquote'] });
  md.block.ruler.before('paragraph', 'visser_tag', tagBlock, { alt: ['paragraph', 'blockquote'] });
  md.block.ruler.at('table', mathTable);
  md.inline.ruler.before('text', 'visser_comment', commentInline);
  md.inline.ruler.before('text', 'visser_tag', tagInline);
  md.inline.ruler.before('text', 'visser_math', mathInline);
  md.inline.ruler.at('image', (state, silent) => {
    const env = state.env as MathEnv;
    const previous = env.imageAlt;
    env.imageAlt = true;
    try { return imageRule(state, silent); }
    finally { env.imageAlt = previous; }
  });
  md.core.ruler.at('inline', state => {
    const env = state.env as MathEnv;
    const lineStarts = [0];
    for (let i = 0; i < state.src.length; i++) if (state.src[i] === '\n') lineStarts.push(i + 1);
    for (const token of state.tokens) {
      if (token.type !== 'inline') continue;
      const charMap = inlineMap(token, state.src, lineStarts);
      token.meta = { ...(token.meta ?? {}), charMap };
      env.currentInline = token;
      token.children = [];
      state.md.inline.parse(token.content, state.md, env, token.children);
    }
    delete env.currentInline;
  });
  return md;
}
const tokenizer = createTokenizer();
/** Tokenize authored source without changing production parsing. Spans are half-open original byte ranges. */
export function tokenizeMath(sourceBytes: Uint8Array | string, path = 'index.md'): MathTokenization {
  const bytes = typeof sourceBytes === 'string' ? utf8.encode(sourceBytes) : sourceBytes;
  let source: SourceText;
  try { source = loadSourceText(bytes); }
  catch { return { tokens: [], occurrences: [], diagnostics: [{ code: 'E_SYNTAX', severity: 'error', message: 'source is not valid UTF-8', path }] }; }
  const sourceMap = originalMap(source);
  const env: MathEnv = { sourceMap, sourceMapBytes: bytes, occurrences: [], diagnostics: [], path };
  if (source.text.replace(/\0/g, '\ufffd') !== sourceMap.normalized) {
    report(env, 'E_SPAN_UNPROVEN', 'normalized source differs from original byte map');
    return { tokens: [], occurrences: [], diagnostics: env.diagnostics, source };
  }
  const tokens = tokenizer.parse(sourceMap.normalized, env);
  env.occurrences.sort((a, b) => a.startByte - b.startByte || a.endByte - b.endByte);
  return { tokens, occurrences: env.occurrences, diagnostics: env.diagnostics, source };
}
