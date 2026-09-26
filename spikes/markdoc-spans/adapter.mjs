// Minimal span adapter for spike 1: characterizes Markdoc 0.5.10 against ARCHITECTURE.md §6.3 and §7.3.
import Markdoc from '@markdoc/markdoc';

export const MARKER_LINE = /^[ ]{0,3}<!-- ex:id ([a-z][a-z0-9_-]{0,63}) -->[ ]*$/;

// Decode original bytes, strip one BOM, normalize CRLF/CR to LF, and keep a table
// that maps each normalized line index to its original byte range.
export function loadSource(bytes) {
  let off = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) off = 3;
  const lineStart = [off];
  for (let i = off; i < bytes.length; i++) {
    if (bytes[i] === 0x0d) {
      if (bytes[i + 1] === 0x0a) i++;
      lineStart.push(i + 1);
    } else if (bytes[i] === 0x0a) {
      lineStart.push(i + 1);
    }
  }
  const text = new TextDecoder('utf-8', { fatal: true })
    .decode(bytes.subarray(off))
    .replace(/\r\n?/g, '\n');
  return { bytes, text, lineStart, lines: text.split('\n') };
}

export function parse(text, opts = {}) {
  const tokenizer = new Markdoc.Tokenizer({ allowComments: true, ...opts });
  const tokens = tokenizer.tokenize(text);
  // Markdoc parses tags and variables inside every fence unless the info string has
  // {% process=false %}. Explain treats fence content as raw displayed code, so drop
  // those parsed children before building the AST; token.content keeps the raw text.
  if (!opts.processFences) for (const t of tokens) if (t.type === 'fence') t.children = null;
  return { tokens, ast: Markdoc.parse(tokens) };
}

// Byte range for normalized lines [start, end): end is exclusive.
export function byteRange(src, start, end) {
  const s = src.lineStart[start];
  const e = end < src.lineStart.length ? src.lineStart[end] : src.bytes.length;
  return [s, Math.min(e, src.bytes.length)];
}

// Node line range: markdown-it maps are [start, endExclusive]; a block tag also
// receives its closing tag map, so take the first and last values.
export function nodeLines(node) {
  const l = node.lines || [];
  if (l.length < 2) return null;
  return [l[0], l[l.length - 1]];
}

// Collect targets: top-level markers bound to the next sibling, plus every tag
// with an id attribute at any depth.
export function collectTargets(src, ast) {
  const targets = [];
  const errors = [];
  const top = ast.children;
  for (let i = 0; i < top.length; i++) {
    const n = top[i];
    if (n.type === 'comment') {
      const [ls] = nodeLines(n) || [];
      const raw = src.lines[ls];
      const m = MARKER_LINE.exec(raw);
      if (!m) {
        if (/ex:id/.test(raw)) errors.push(`malformed marker line ${ls + 1}: ${JSON.stringify(raw)}`);
        continue;
      }
      const next = top[i + 1];
      if (!next) { errors.push(`marker ${m[1]} at EOF`); continue; }
      if (next.type === 'comment') { errors.push(`marker ${m[1]} followed by comment`); continue; }
      if (next.type === 'tag') { errors.push(`marker ${m[1]} before custom tag`); continue; }
      const nl = nodeLines(next);
      const gapBlank = nl && src.lines.slice(ls + 1, nl[0]).every((l) => l.trim() === '');
      if (!nl || !gapBlank) { errors.push(`marker ${m[1]} not followed by a sibling block (next starts ${nl && nl[0] + 1})`); continue; }
      targets.push({ id: m[1], kind: next.type, lines: [ls, trimBlank(src, nl[1])] });
    }
  }
  const walk = (node, parentId) => {
    for (const c of node.children || []) {
      let pid = parentId;
      if (c.type === 'tag' && typeof c.attributes.id === 'string') {
        const nl = nodeLines(c);
        targets.push({ id: c.attributes.id, kind: c.tag, parentId, lines: nl && [nl[0], trimBlank(src, nl[1])] });
        pid = c.attributes.id;
      }
      walk(c, pid);
    }
  };
  walk(ast, undefined);
  return { targets, errors };
}

// Inter-block blank lines are outside the target (§7.3).
function trimBlank(src, end) {
  while (end > 0 && src.lines[end - 1] !== undefined && src.lines[end - 1].trim() === '') end--;
  return end;
}
