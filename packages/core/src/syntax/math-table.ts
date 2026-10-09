// Adapted from markdown-it 12.3.2 lib/rules_block/table.js (MIT).
// See LICENSE.math-table.md. Changes: math-aware cell splitting and exact
// normalized-source character maps for every inline table cell.
import type StateBlock from 'markdown-it/lib/rules_block/state_block.js';
import type Token from 'markdown-it/lib/token.js';

type Cell = { content: string; charMap: number[] };

function space(code: number): boolean { return code === 0x09 || code === 0x20; }
function line(state: StateBlock, n: number): string {
  return state.src.slice((state.bMarks[n] ?? 0) + (state.tShift[n] ?? 0), state.eMarks[n]);
}
function closeDollar(s: string, from: number): number {
  for (let p = from + 1; p < s.length; p++) {
    if (s[p] === '\\') { p++; continue; }
    if (s[p] === '$' && !/\s/.test(s[p - 1] ?? '') && !/\d/.test(s[p + 1] ?? '')) return p;
  }
  return -1;
}
function splitCells(raw: string, sourceStart: number): Cell[] {
  // markdown-it trims the row before splitting. Keep the corresponding offset.
  const leading = raw.length - raw.trimStart().length;
  const s = raw.trim();
  const cells: Cell[] = [];
  let chars = '';
  let positions: number[] = [];
  let inMath = false;
  let codeTicks = 0;
  let escaped = false;
  let last = leading;
  function finish(end: number): void {
    const trimmed = chars.trim();
    const left = chars.length - chars.trimStart().length;
    const right = left + trimmed.length;
    const map = positions.slice(left, right).map(p => sourceStart + p);
    map.push(sourceStart + (positions[right] ?? end));
    cells.push({ content: trimmed, charMap: map });
    chars = '';
    positions = [];
    last = end;
  }
  for (let p = 0; p < s.length; p++) {
    const ch = s[p];
    if (ch === '`' && !escaped) {
      let run = 1;
      while (s[p + run] === '`') run++;
      if (codeTicks === 0) codeTicks = run;
      else if (codeTicks === run) codeTicks = 0;
      for (let j = 0; j < run; j++) { chars += '`'; positions.push(leading + p + j); }
      p += run - 1;
      escaped = false;
      continue;
    }
    if (ch === '$' && !escaped && codeTicks === 0) {
      if (inMath) inMath = false;
      else if (s[p + 1] && !/\s/.test(s[p + 1] ?? '') && closeDollar(s, p) >= 0) inMath = true;
    }
    if (ch === '|' && !escaped && !inMath) {
      finish(leading + p);
      continue;
    }
    if (ch === '|' && escaped && !inMath && chars.endsWith('\\')) {
      chars = chars.slice(0, -1);
      positions.pop();
    }
    chars += ch;
    positions.push(leading + p);
    escaped = ch === '\\' && !escaped;
    if (ch !== '\\') escaped = false;
  }
  finish(leading + s.length);
  if (cells[0]?.content === '') cells.shift();
  if (cells.at(-1)?.content === '') cells.pop();
  return cells;
}
function pushCell(state: StateBlock, tag: 'th' | 'td', cell: Cell | undefined, align: string): void {
  const open = state.push(`${tag}_open`, tag, 1);
  if (align) open.attrs = [['style', `text-align:${align}`]];
  const inline = state.push('inline', '', 0);
  inline.content = cell?.content ?? '';
  inline.children = [];
  inline.meta = { charMap: cell?.charMap ?? [] };
  state.push(`${tag}_close`, tag, -1);
}
/** Public markdown-it block ruler replacement for its GFM table rule. */
export function mathTable(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  if (startLine + 2 > endLine) return false;
  const alignLine = startLine + 1;
  if ((state.sCount[alignLine] ?? 0) < state.blkIndent) return false;
  if ((state.sCount[alignLine] ?? 0) - state.blkIndent >= 4) return false;
  let pos = (state.bMarks[alignLine] ?? 0) + (state.tShift[alignLine] ?? 0);
  const end = state.eMarks[alignLine] ?? 0;
  if (pos >= end) return false;
  const first = state.src.charCodeAt(pos++);
  if (![0x7c, 0x2d, 0x3a].includes(first)) return false;
  if (pos >= end) return false;
  const second = state.src.charCodeAt(pos++);
  if (![0x7c, 0x2d, 0x3a].includes(second) && !space(second)) return false;
  if (first === 0x2d && space(second)) return false;
  while (pos < end) {
    const ch = state.src.charCodeAt(pos++);
    if (![0x7c, 0x2d, 0x3a].includes(ch) && !space(ch)) return false;
  }
  const separators = line(state, alignLine).split('|');
  const aligns: string[] = [];
  for (let i = 0; i < separators.length; i++) {
    const t = separators[i]?.trim() ?? '';
    if (!t) {
      if (i === 0 || i === separators.length - 1) continue;
      return false;
    }
    if (!/^:?-+:?$/.test(t)) return false;
    aligns.push(t.endsWith(':') ? (t.startsWith(':') ? 'center' : 'right') : (t.startsWith(':') ? 'left' : ''));
  }
  const headerRaw = line(state, startLine);
  if (!headerRaw.includes('|')) return false;
  if ((state.sCount[startLine] ?? 0) - state.blkIndent >= 4) return false;
  const header = splitCells(headerRaw, (state.bMarks[startLine] ?? 0) + (state.tShift[startLine] ?? 0));
  const count = header.length;
  if (!count || count !== aligns.length) return false;
  if (silent) return true;
  const oldParent = state.parentType;
  state.parentType = 'table' as StateBlock['parentType']; // runtime supports this; @types/markdown-it 12 omits it
  const terminators = state.md.block.ruler.getRules('blockquote');
  let token: Token = state.push('table_open', 'table', 1);
  const tableMap: [number, number] = [startLine, 0]; token.map = tableMap;
  token = state.push('thead_open', 'thead', 1); token.map = [startLine, startLine + 1];
  token = state.push('tr_open', 'tr', 1); token.map = [startLine, startLine + 1];
  for (let i = 0; i < count; i++) pushCell(state, 'th', header[i], aligns[i] ?? '');
  state.push('tr_close', 'tr', -1);
  state.push('thead_close', 'thead', -1);
  let bodyMap: [number, number] | undefined;
  let nextLine: number;
  for (nextLine = startLine + 2; nextLine < endLine; nextLine++) {
    if ((state.sCount[nextLine] ?? 0) < state.blkIndent) break;
    if (terminators.some(rule => rule(state, nextLine, endLine, true))) break;
    const raw = line(state, nextLine);
    if (!raw.trim()) break;
    if ((state.sCount[nextLine] ?? 0) - state.blkIndent >= 4) break;
    const cells = splitCells(raw, (state.bMarks[nextLine] ?? 0) + (state.tShift[nextLine] ?? 0));
    if (nextLine === startLine + 2) {
      token = state.push('tbody_open', 'tbody', 1);
      bodyMap = [startLine + 2, 0]; token.map = bodyMap;
    }
    token = state.push('tr_open', 'tr', 1); token.map = [nextLine, nextLine + 1];
    for (let i = 0; i < count; i++) pushCell(state, 'td', cells[i], aligns[i] ?? '');
    state.push('tr_close', 'tr', -1);
  }
  if (bodyMap) { state.push('tbody_close', 'tbody', -1); bodyMap[1] = nextLine; }
  state.push('table_close', 'table', -1); tableMap[1] = nextLine;
  state.parentType = oldParent;
  state.line = nextLine;
  return true;
}
