// Disposable W0 adapter. Uses public markdown-it rules and Markdoc.parseTags /
// Markdoc.parse(token[]). The original Markdoc tokenizer remains untouched.
import MarkdownIt from 'markdown-it';
import Markdoc from '@markdoc/markdoc';
import mathTable from './math-table.cjs';

function sourceMapFor(source) {
  const charToByte = [0];
  let normalized = '';
  let byte = 0;
  for (let i = 0; i < source.length;) {
    const code = source.codePointAt(i);
    const raw = String.fromCodePoint(code);
    const width = raw.length;
    if (raw === '\r') {
      const pair = source[i + 1] === '\n';
      normalized += '\n';
      byte += pair ? 2 : 1;
      charToByte.push(byte);
      i += pair ? 2 : 1;
      continue;
    }
    const replacement = raw === '\0' ? '\ufffd' : raw;
    normalized += replacement;
    const nextByte = byte + new TextEncoder().encode(raw).length;
    for (let j = 1; j <= replacement.length; j++) charToByte.push(j === replacement.length ? nextByte : byte);
    byte = nextByte;
    i += width;
  }
  return { normalized, charToByte };
}

function recordSpan(state, kind, start, end, tex) {
  if (kind === 'inline' && state.env.sourceMap.normalized.slice(start, end) !== `$${tex}$`)
    throw new Error(`inline source span mismatch at ${start}:${end}`);
  const a = state.env.sourceMap.charToByte[start];
  const b = state.env.sourceMap.charToByte[end];
  if (a === undefined || b === undefined) throw new Error(`unmapped ${kind} at ${start}:${end}`);
  state.env.mathSpans.push({ kind, startByte: a, endByte: b, tex });
}

function line(state, number) {
  return state.src.slice(state.bMarks[number] + state.tShift[number], state.eMarks[number]);
}

function emitTag(state, name, sourceLine, map) {
  const parsed = Markdoc.parseTags(sourceLine).find((t) => t.type === name &&
    t.start === sourceLine.indexOf('{%'));
  if (!parsed) return false;
  const token = state.push(parsed.type, '', parsed.nesting);
  token.meta = parsed.meta;
  token.info = parsed.info;
  token.map = map;
  return true;
}

function frontmatter(state, start, end, silent) {
  if (start !== 0 || line(state, start).trim() !== '---') return false;
  let close = start + 1;
  while (close < end && line(state, close).trim() !== '---') close++;
  if (close >= end) return false;
  if (silent) return true;
  const t = state.push('frontmatter', '', 0);
  t.content = state.src.slice(state.eMarks[start], state.bMarks[close]).trim();
  t.map = [start, close];
  t.hidden = true;
  state.line = close + 1;
  return true;
}

function commentBlock(state, start, end, silent) {
  const at = state.bMarks[start] + state.tShift[start];
  if (!state.src.startsWith('<!--', at)) return false;
  const close = state.src.indexOf('-->', at + 4);
  if (close < 0) return false;
  if (silent) return true;
  const content = state.src.slice(at + 4, close);
  const lines = content.split('\n').length;
  const t = state.push('comment', '', 0);
  t.content = content.trim();
  t.map = [start, start + lines];
  state.line = start + lines;
  return true;
}

function tagBlock(state, start, end, silent) {
  const raw = line(state, start);
  if (!raw.startsWith('{%')) return false;
  let close = start;
  while (close < end && !line(state, close).includes('%}')) close++;
  if (close >= end) return false;
  const full = state.src.slice(state.bMarks[start] + state.tShift[start], state.eMarks[close]);
  const parsed = Markdoc.parseTags(full).find((t) =>
    ['tag', 'tag_open', 'tag_close', 'error'].includes(t.type) && t.start === full.indexOf('{%'));
  if (!parsed || full.slice(parsed.end + 1).trim() !== '') return false;
  const type = parsed.type;
  if (!type || type === 'error' || !['tag', 'tag_open', 'tag_close'].includes(type)) return false;
  if (silent) return true;
  emitTag(state, type, full, [start, close + 1]);
  state.line = close + 1;
  return true;
}

function equationBlock(state, start, end, silent) {
  const raw = line(state, start);
  if (!raw.startsWith('{% equation ') || !raw.trimEnd().endsWith('%}')) return false;
  const parsed = Markdoc.parseTags(raw).find((t) => t.type === 'tag_open' && t.meta?.tag === 'equation');
  if (!parsed) return false;
  let close = start + 1;
  while (close < end && line(state, close).trim() !== '{% /equation %}') close++;
  if (silent) return true;
  if (close >= end) {
    const error = state.push('error', '', 0);
    error.meta = { error: { message: 'unclosed equation block' } };
    error.map = [start, start + 1];
    state.line = start + 1;
    return true;
  }
  const open = state.push('tag_open', '', 1);
  open.meta = parsed.meta;
  open.map = [start, start + 1];
  const body = state.push('text', '', 0);
  body.content = state.src.slice(state.bMarks[start + 1], state.bMarks[close]);
  body.map = [start + 1, close];
  const ending = state.push('tag_close', '', -1);
  ending.meta = { tag: 'equation' };
  ending.map = [close, close + 1];
  recordSpan(state, 'equation', state.bMarks[start], state.eMarks[close], body.content);
  state.line = close + 1;
  return true;
}

function mathDisplay(state, start, end, silent) {
  if (line(state, start).trim() !== '$$') return false;
  let close = start + 1;
  while (close < end && line(state, close).trim() !== '$$') close++;
  if (silent) return true;
  if (close >= end) {
    const error = state.push('error', '', 0);
    error.meta = { error: { message: 'unclosed $$ display' } };
    error.map = [start, start + 1];
    state.line = start + 1;
    return true;
  }
  const open = state.push('math_display_open', '', 1);
  open.map = [start, start + 1];
  const body = state.push('text', '', 0);
  body.content = state.src.slice(state.bMarks[start + 1], state.bMarks[close]);
  body.map = [start + 1, close];
  const ending = state.push('math_display_close', '', -1);
  ending.map = [close, close + 1];
  recordSpan(state, 'display', state.bMarks[start], state.eMarks[close], body.content);
  state.line = close + 1;
  return true;
}

function commentInline(state, silent) {
  if (!state.src.startsWith('<!--', state.pos)) return false;
  const close = state.src.indexOf('-->', state.pos + 4);
  if (close < 0) return false;
  if (!silent) {
    const t = state.push('comment', '', 0);
    t.content = state.src.slice(state.pos + 4, close).trim();
  }
  state.pos = close + 3;
  return true;
}

function tagInline(state, silent) {
  if (!state.src.startsWith('{%', state.pos)) return false;
  const parsed = Markdoc.parseTags(state.src.slice(state.pos)).find((t) =>
    ['tag', 'tag_open', 'tag_close', 'variable', 'error'].includes(t.type) && t.start === 0);
  if (!parsed) return false;
  if (!silent) {
    const t = state.push(parsed.type, '', parsed.nesting);
    t.meta = parsed.meta;
    t.info = parsed.info;
  }
  state.pos += parsed.end + 1;
  return true;
}

function mathInline(state, silent) {
  const start = state.pos;
  if (state.src[start] !== '$' || state.src[start + 1] === '$') return false;
  if (!state.src[start + 1] || /\s/.test(state.src[start + 1])) return false;
  for (let pos = start + 2; pos < state.posMax; pos++) {
    if (state.src[pos] === '\n') break;
    if (state.src[pos] === '\\') { pos++; continue; }
    if (state.src[pos] !== '$' || /\s/.test(state.src[pos - 1]) || /\d/.test(state.src[pos + 1] ?? '')) continue;
    if (!silent) {
      const open = state.push('math_inline_open', '', 1);
      open.position = { start, end: pos + 1 };
      const body = state.push('text', '', 0);
      body.content = state.src.slice(start + 1, pos);
      body.position = { start: start + 1, end: pos };
      const close = state.push('math_inline_close', '', -1);
      close.position = { start: pos, end: pos + 1 };
      const positions = state.env.currentInline?.meta?.charMap;
      const from = positions?.[start];
      const to = positions?.[pos + 1];
      if (from !== undefined && to !== undefined) recordSpan(state, 'inline', from, to, body.content);
      else state.env.unmappedMath.push({ tex: body.content, reason: 'inline source offset unavailable' });
    }
    state.pos = pos + 1;
    return true;
  }
  return false;
}

export function createMathTokenizer() {
  const md = new MarkdownIt({ html: true });
  md.disable(['lheading', 'code']);
  md.block.ruler.before('hr', 'visser_frontmatter', frontmatter);
  md.block.ruler.before('table', 'visser_comment', commentBlock, { alt: ['paragraph'] });
  md.block.ruler.before('table', 'visser_math_display', mathDisplay, { alt: ['paragraph'] });
  md.block.ruler.before('paragraph', 'visser_equation', equationBlock, { alt: ['paragraph', 'blockquote'] });
  md.block.ruler.before('paragraph', 'visser_tag', tagBlock, { alt: ['paragraph', 'blockquote'] });
  md.block.ruler.at('table', mathTable);
  md.inline.ruler.before('text', 'visser_comment', commentInline);
  md.inline.ruler.before('text', 'visser_tag', tagInline);
  md.inline.ruler.before('text', 'visser_math', mathInline);
  md.core.ruler.at('inline', (state) => {
    state.env.currentNormalized = state.src;
    const lineStarts = [0];
    for (let i = 0; i < state.src.length; i++) if (state.src[i] === '\n') lineStarts.push(i + 1);
    for (const token of state.tokens) {
      if (token.type !== 'inline') continue;
      const charMap = [];
      if (token.meta?.sourceStartChar !== undefined) {
        for (let i = 0; i <= token.content.length; i++) charMap[i] = token.meta.sourceStartChar + i;
      } else if (token.map) {
        const [first] = token.map;
        const parts = token.content.split('\n');
        let offset = 0;
        for (let partIndex = 0; partIndex < parts.length; partIndex++) {
          const lineNumber = first + partIndex;
          const lineStart = lineStarts[lineNumber];
          const lineEnd = lineStarts[lineNumber + 1] ?? state.src.length;
          const part = parts[partIndex];
          if (lineStart === undefined) break;
          const at = state.src.slice(lineStart, lineEnd).indexOf(part);
          if (at < 0) { offset += part.length + 1; continue; }
          for (let j = 0; j <= part.length; j++) charMap[offset + j] = lineStart + at + j;
          offset += part.length + 1;
        }
      }
      token.meta = { ...(token.meta ?? {}), charMap };
      state.env.currentInline = token;
      token.children = [];
      state.md.inline.parse(token.content, state.md, state.env, token.children);
    }
    delete state.env.currentInline;
  });
  return {
    tokenize: (source) => md.parse(source, { sourceMap: sourceMapFor(source), mathSpans: [], unmappedMath: [] }),
    analyze: (source) => {
      const sourceMap = sourceMapFor(source);
      const env = { sourceMap, mathSpans: [], unmappedMath: [] };
      const tokens = md.parse(source, env);
      if (sourceMap.normalized !== env.currentNormalized && env.currentNormalized !== undefined) throw new Error('source normalization mismatch');
      return { tokens, ast: Markdoc.parse(tokens), spans: env.mathSpans, unmapped: env.unmappedMath };
    },
  };
}

export function parseMath(source) {
  return createMathTokenizer().analyze(source).ast;
}
