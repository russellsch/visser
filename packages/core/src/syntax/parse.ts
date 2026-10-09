// Markdoc parser adapter (ARCHITECTURE.md §6.3–6.5, §7.2–7.3).
// Characterized on @markdoc/markdoc 0.5.10 (spikes/markdoc-spans/).
import Markdoc from '@markdoc/markdoc';
import { parseDocument, visit } from 'yaml';
import type { Diagnostic, MathExpression, ParsedSource, ParsedTarget } from '../types.ts';
import { ADDRESSABLE_BLOCKS, BLOCK_TAGS, DYNAMIC_TAGS, EQUATION_PARENTS, INLINE_TAGS, LIMITS, MARKER_LINE, MATH_TEXT_ATTRIBUTES, TARGET_ID } from './profile.ts';
import { isBlank, lineByteRange, loadSourceText, type SourceText } from './source-text.ts';
import { parseMathTextRuns, tokenizeMath } from './math-tokenizer.ts';

// Structural view of the Markdoc AST nodes the adapter reads.
type MNode = {
  type: string;
  tag?: string;
  inline?: boolean;
  lines: number[];
  attributes: Record<string, unknown>;
  children: MNode[];
  errors?: Array<{ id: string; message: string }>;
};

type MToken = {
  type: string;
  map: [number, number] | null;
  content: string;
  children: MToken[] | null;
  meta?: { tag?: string };
};

/** A top-level ordinary block that has no ID marker; `line` is 0-based. */
export type UnmarkedBlock = { line: number; kind: string };

export type Analysis = {
  source: ParsedSource;
  text: SourceText | undefined;
  unmarked: UnmarkedBlock[];
  frontmatterCloseLine: number; // 0-based line of the closing `---`, or -1
};

const utf8 = new TextEncoder();
const decodeStrict = new TextDecoder('utf-8', { fatal: true });

/** Parse one Visser source file into targets with proven byte spans (§17.9 parseSource). */
export function parseSource(bytes: Uint8Array, relPath: string): ParsedSource {
  return analyzeSource(bytes, relPath).source;
}

export function analyzeSource(bytes: Uint8Array, relPath: string): Analysis {
  const diagnostics: Diagnostic[] = [];
  const seen = new Set<string>();
  const report = (code: string, message: string, line?: number, extra: Partial<Diagnostic> = {}) => {
    const key = `${code}|${line ?? ''}|${message}|${extra.targetId ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    const d: Diagnostic = { code, severity: 'error', message, path: relPath, ...extra };
    if (line !== undefined) d.startLine = line + 1;
    diagnostics.push(d);
  };
  const empty = (src?: SourceText): Analysis => ({
    source: { path: relPath, rawBytes: bytes, frontmatter: {}, ast: null, targets: [], diagnostics },
    text: src,
    unmarked: [],
    frontmatterCloseLine: -1,
  });

  if (bytes.length > LIMITS.sourceBytes) {
    report('E_LIMIT', `source is ${bytes.length} bytes; the limit is ${LIMITS.sourceBytes}`);
    return empty();
  }
  let src: SourceText;
  try {
    src = loadSourceText(bytes);
  } catch {
    report('E_SYNTAX', 'source is not valid UTF-8');
    return empty();
  }
  for (let i = 0; i < src.lines.length; i++) {
    if (utf8.encode(src.lines[i] ?? '').length > LIMITS.lineBytes) {
      report('E_LIMIT', `line exceeds ${LIMITS.lineBytes} bytes`, i);
      return empty(src);
    }
  }

  const frontmatterCloseLine = findFrontmatterClose(src.lines);

  // Tokenize. `html: true` makes prose HTML visible as html_* tokens (spike P6).
  const tokenized = tokenizeMath(bytes, relPath);
  for (const d of tokenized.diagnostics) report(d.code, d.message, d.startLine === undefined ? undefined : d.startLine - 1);
  const tokens = tokenized.tokens as unknown as MToken[];
  const fenceLines: Array<[number, number]> = [];
  for (const tok of tokens) {
    // Fences are raw leaves (§6.5): drop Markdoc's parsed children, keep raw content.
    if (tok.type === 'fence') {
      tok.children = null;
      if (tok.map) fenceLines.push(tok.map);
    }
    checkHtmlToken(tok, undefined, report);
    checkEqrefToken(tok, undefined, report);
  }

  const ast = Markdoc.parse(tokens as never) as unknown as MNode;

  // Frontmatter: YAML core schema, no aliases, duplicate keys rejected (§5.2).
  const frontmatter = parseFrontmatter(ast.attributes['frontmatter'], report);

  const commentLines = new Set<number>();
  const targets: ParsedTarget[] = [];
  const unmarked: UnmarkedBlock[] = [];
  const tagNodes = new Map<string, MNode>();
  const inlineAttributeNodes: MNode[] = [];

  // Validate every node, and collect tag targets with their structural parent.
  const walk = (node: MNode, depth: number, parentTagId: string | undefined, insideTag: boolean, ordinaryBarrier: boolean) => {
    for (const e of node.errors ?? []) report('E_SYNTAX', `Markdoc: ${e.id}: ${e.message}`, node.lines[0]);
    checkAttributes(node, report);
    let childParent = parentTagId;
    if (node.type === 'tag') {
      if (node.inline && INLINE_TAGS.has(node.tag ?? '')) inlineAttributeNodes.push(node);
      if (node.tag === 'equation' && (ordinaryBarrier || (parentTagId !== undefined && !EQUATION_PARENTS.has(targets.find((t) => t.id === parentTagId)?.tagName ?? '')))) {
        report('E_SYNTAX', 'numbered equation must be top level or directly inside an eligible prose tag body', node.lines[0]);
      }
      const tagTarget = checkTag(node, src, report);
      if (tagTarget) {
        targets.push({ ...tagTarget, ...(parentTagId ? { parentId: parentTagId } : {}) });
        tagNodes.set(tagTarget.id, node);
        childParent = tagTarget.id;
      }
    } else if (node.type === 'comment') {
      const s = node.lines[0];
      if (s !== undefined) commentLines.add(s);
      if (depth > 1 || insideTag) checkNestedComment(node, src, report);
    } else if (node.type === 'paragraph') {
      checkSetext(node, src, report);
    }
    for (const child of node.children ?? []) walk(child, depth + 1, childParent, insideTag || node.type === 'tag',
      ordinaryBarrier || ['list', 'item', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td'].includes(node.type));
  };
  walk(ast, 0, undefined, false, false);

  // Top level: bind markers to the next sibling block; find unmarked blocks.
  const top = ast.children ?? [];
  const boundBlocks = new Set<MNode>();
  for (let i = 0; i < top.length; i++) {
    const node = top[i]!;
    if (node.type === 'comment') {
      const marker = checkTopComment(node, top[i + 1], src, frontmatterCloseLine, report);
      if (marker) {
        const next = top[i + 1]!;
        boundBlocks.add(next);
        const t = markerTarget(marker.id, marker.line, next, src, report);
        if (t) targets.push(t);
      }
    } else if (node.type === 'hr') {
      const prev = top[i - 1];
      if (prev?.type === 'paragraph' && node.lines[0] === prev.lines[1] && /^ {0,3}-+[ \t]*$/.test(src.lines[node.lines[0]!] ?? '')) {
        report('E_SYNTAX', 'setext heading underline; use an ATX (#) heading', node.lines[0]);
      }
    }
  }
  for (const node of top) {
    if (ADDRESSABLE_BLOCKS.has(node.type) && !boundBlocks.has(node)) {
      const line = node.lines[0] ?? 0;
      const kind = blockKind(node);
      unmarked.push({ line, kind });
      report('E_ID_MISSING', `${kind} has no ID marker`, line, { suggestedAction: 'run `visser ids assign`' });
    }
  }

  // Unclosed or unparsed marker comments are visible only in the raw lines (spike P5f).
  for (let i = 0; i < src.lines.length; i++) {
    const line = src.lines[i] ?? '';
    if (!line.trimStart().startsWith('<!--') || !/vs:id/.test(line)) continue;
    if (commentLines.has(i) || fenceLines.some(([s, e]) => i >= s && i < e)) continue;
    report('E_SYNTAX', 'malformed vs:id marker comment', i);
  }

  // Identity checks.
  const byId = new Map<string, ParsedTarget>();
  for (const t of targets) {
    if (byId.has(t.id)) report('E_ID_DUPLICATE', `duplicate target ID "${t.id}"`, t.startLine - 1, { targetId: t.id });
    else byId.set(t.id, t);
  }
  if (targets.length > LIMITS.targets) report('E_LIMIT', `document has ${targets.length} targets; the limit is ${LIMITS.targets}`);

  targets.sort((a, b) => a.startByte - b.startByte || b.endByte - a.endByte);
  const math: MathExpression[] = tokenized.occurrences.map((occurrence) => {
    const enclosing = targets
      .filter((t) => t.startByte <= occurrence.startByte && t.endByte >= occurrence.endByte &&
        !(occurrence.kind === 'equation' && t.kind === 'equation' && t.startByte === occurrence.startByte))
      .sort((a, b) => (a.endByte - a.startByte) - (b.endByte - b.startByte))[0];
    const numbered = occurrence.kind === 'equation'
      ? targets.find((t) => t.tagName === 'equation' && t.startByte === occurrence.startByte && t.endByte >= occurrence.endByte)
      : undefined;
    const expression: MathExpression = {
      kind: occurrence.kind, tex: occurrence.tex,
      span: { path: relPath, startByte: occurrence.startByte, endByte: occurrence.endByte,
        startLine: lineOfByte(src, occurrence.startByte), endLine: lineOfByte(src, Math.max(occurrence.startByte, occurrence.endByte - 1)) },
    };
    if (numbered) expression.targetId = numbered.id;
    if (enclosing) expression.enclosingTargetId = enclosing.id;
    return expression;
  });
  for (const target of targets.filter((t) => t.origin === 'tag')) {
    const node = tagNodes.get(target.id);
    if (!node) continue;
    const startLine = target.startLine;
    const opening = src.lines[startLine - 1] ?? '';
    const startByte = src.lineStart[startLine - 1] ?? target.startByte;
    const endByte = startByte + utf8.encode(opening).length;
    const fields = new Set(MATH_TEXT_ATTRIBUTES);
    // Extension parts render their open fields in the inspector, including
    // extension-defined string facts. This includes custom `summary` and
    // `note`: those names are unused on detail/cite, but visible on a part.
    // The ID remains structural.
    if (target.tagName === 'part') for (const field of Object.keys(node.attributes)) {
      if (!/^(?:id|path|url|uri|href|src|file|source)$|(?:[_-](?:id|path|url|uri|href|src|file|source)|(?:Id|Path|Url|Uri|Href|Src|File|Source))$/.test(field)) fields.add(field);
    }
    for (const field of fields) {
      const value = node.attributes[field];
      const values: Array<[string, string]> = typeof value === 'string' ? [[field, value]]
        : Array.isArray(value) ? value.flatMap((item, i) => typeof item === 'string' ? [[`${field}[${i}]`, item]] : []) : [];
      for (const [fieldKey, decoded] of values) for (const run of parseMathTextRuns(decoded)) {
        if (run.kind === 'math') math.push({ kind: 'inline', tex: run.tex,
          span: { path: relPath, startByte, endByte, startLine, endLine: startLine },
          enclosingTargetId: target.id, field: fieldKey, spanPrecision: 'containing-attribute' });
      }
    }
  }
  for (const node of inlineAttributeNodes) {
    const line = node.lines[0];
    if (line === undefined) continue;
    const startByte = src.lineStart[line] ?? 0;
    const endByte = startByte + utf8.encode(src.lines[line] ?? '').length;
    const enclosing = targets.filter((t) => t.startByte <= startByte && t.endByte >= endByte)
      .sort((a, b) => (a.endByte - a.startByte) - (b.endByte - b.startByte))[0];
    for (const field of MATH_TEXT_ATTRIBUTES) {
      const value = node.attributes[field];
      if (typeof value !== 'string') continue;
      for (const run of parseMathTextRuns(value)) if (run.kind === 'math') math.push({ kind: 'inline', tex: run.tex,
        span: { path: relPath, startByte, endByte, startLine: line + 1, endLine: line + 1 },
        ...(enclosing ? { enclosingTargetId: enclosing.id } : {}), field: `${node.tag}.${field}`,
        spanPrecision: 'containing-attribute' });
    }
  }
  if (frontmatterCloseLine >= 0 && typeof frontmatter['title'] === 'string') {
    const [, endByte] = lineByteRange(src, 0, frontmatterCloseLine + 1);
    for (const run of parseMathTextRuns(frontmatter['title'])) {
      if (run.kind !== 'math') continue;
      math.push({ kind: 'inline', tex: run.tex,
        span: { path: relPath, startByte: src.bomLength, endByte, startLine: 1, endLine: frontmatterCloseLine + 1 },
        field: 'frontmatter.title', spanPrecision: 'containing-attribute' });
    }
  }
  math.sort((a, b) => a.span.startByte - b.span.startByte || a.span.endByte - b.span.endByte);
  for (const t of targets.filter((target) => target.tagName === 'equation')) {
    if (!math.some((m) => m.targetId === t.id)) report('E_SYNTAX', `equation ${t.id} has no proven raw body`, t.startLine - 1, { targetId: t.id });
  }
  for (const m of math) {
    if (/\\(?:label|ref|eqref|tag|def|newcommand|renewcommand|providecommand)\b/.test(m.tex)) {
      report('E_SYNTAX', 'TeX labels, references, tags and macro definitions are unsupported; use Visser equation IDs and eqref', m.span.startLine - 1);
    }
  }
  unmarked.sort((a, b) => a.line - b.line);
  return {
    source: { path: relPath, rawBytes: bytes, frontmatter, ast, targets, math, diagnostics },
    text: src,
    unmarked,
    frontmatterCloseLine,
  };

  // ---- helpers bound to this source ----

  function markerTarget(id: string, markerLine: number, block: MNode, s: SourceText, rep: typeof report): ParsedTarget | undefined {
    const blockEnd = trimTrailingBlank(s, block.lines[block.lines.length - 1] ?? markerLine + 1);
    return provenTarget(s, rep, {
      id, kind: blockKind(block), origin: 'marker', attributes: {},
      startLine: markerLine, endLineExclusive: blockEnd,
      firstLine: (first) => first === (s.lines[markerLine] ?? ''),
      lastLine: (last) => !isBlank(last),
    });
  }
}

function checkEqrefToken(tok: MToken, parentLine: number | undefined, report: Report): void {
  const line = tok.map?.[0] ?? parentLine;
  if (tok.type === 'tag_open' && tok.meta?.tag === 'eqref') {
    report('E_SYNTAX', 'eqref must be an inline self-closing tag', line);
  }
  for (const child of tok.children ?? []) checkEqrefToken(child, line, report);
}

type ProofInput = {
  id: string;
  kind: string;
  origin: 'marker' | 'tag';
  tagName?: string;
  attributes: Record<string, unknown>;
  startLine: number; // 0-based
  endLineExclusive: number;
  firstLine: (line: string) => boolean;
  lastLine: (line: string) => boolean;
};

type Report = (code: string, message: string, line?: number, extra?: Partial<Diagnostic>) => void;

/** Compute a line-bounded byte span and prove it from the original bytes (§7.3). */
function provenTarget(src: SourceText, report: Report, p: ProofInput): ParsedTarget | undefined {
  const fail = (why: string) => {
    report('E_SPAN_UNPROVEN', `cannot prove the span of "${p.id}": ${why}`, p.startLine, { targetId: p.id });
    return undefined;
  };
  if (p.endLineExclusive <= p.startLine) return fail('empty line range');
  const [startByte, endByte] = lineByteRange(src, p.startLine, p.endLineExclusive);
  let slice: string;
  try {
    slice = decodeStrict.decode(src.bytes.subarray(startByte, endByte)).replace(/\r\n?/g, '\n');
  } catch {
    return fail('span is not on a UTF-8 boundary');
  }
  const lines = slice.replace(/\n$/, '').split('\n');
  if (!p.firstLine(lines[0] ?? '')) return fail('first line does not open the target');
  if (!p.lastLine(lines[lines.length - 1] ?? '')) return fail('last line does not close the target');
  if (endByte !== src.bytes.length && !slice.endsWith('\n')) return fail('span does not end at a line end');
  if (/\n[ \t]*\n$/.test(slice)) return fail('span ends with a blank line');
  const t: ParsedTarget = {
    id: p.id, kind: p.kind, origin: p.origin, attributes: p.attributes,
    startLine: p.startLine + 1, endLine: p.endLineExclusive, startByte, endByte,
  };
  if (p.tagName) t.tagName = p.tagName;
  return t;
}

function trimTrailingBlank(src: SourceText, endExclusive: number): number {
  let e = Math.min(endExclusive, src.lines.length);
  while (e > 0 && isBlank(src.lines[e - 1])) e--;
  return e;
}

function lineOfByte(src: SourceText, byte: number): number {
  let low = 0;
  let high = src.lineStart.length;
  while (low + 1 < high) {
    const middle = (low + high) >>> 1;
    if ((src.lineStart[middle] ?? Infinity) <= byte) low = middle;
    else high = middle;
  }
  return low + 1;
}

function findFrontmatterClose(lines: string[]): number {
  if (lines[0] !== '---') return -1;
  for (let i = 1; i < lines.length; i++) if (lines[i] === '---') return i;
  return -1;
}

/** §7.1 kind for an ordinary Markdown block. A paragraph holding only an image is a figure. */
export function blockKind(node: MNode): string {
  if (node.type === 'fence') return 'code';
  if (node.type === 'paragraph') {
    const inline = node.children?.[0];
    const parts = (inline?.children ?? []).filter((c) => !(c.type === 'text' && String(c.attributes['content'] ?? '').trim() === '') && c.type !== 'softbreak');
    if (parts.length === 1 && parts[0]!.type === 'image') return 'figure';
  }
  return node.type;
}

function parseFrontmatter(raw: unknown, report: Report): Record<string, unknown> {
  if (typeof raw !== 'string') return {};
  const doc = parseDocument(raw, { schema: 'core', uniqueKeys: true, merge: false, prettyErrors: false });
  if (doc.errors.length) {
    for (const e of doc.errors) report('E_SYNTAX', `frontmatter: ${e.message.split('\n')[0]}`, 0);
    return {};
  }
  let alias = false;
  visit(doc, { Alias: () => { alias = true; return visit.BREAK; } });
  if (alias) {
    report('E_SYNTAX', 'frontmatter: YAML aliases are not allowed', 0);
    return {};
  }
  const value = doc.toJS({ maxAliasCount: 0 }) as unknown;
  if (value === null || value === undefined) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    report('E_SYNTAX', 'frontmatter must be a mapping', 0);
    return {};
  }
  return value as Record<string, unknown>;
}

/** Raw HTML in prose is rejected; comment-shaped HTML tokens are comments (§6.5). */
function checkHtmlToken(tok: MToken, parentLine: number | undefined, report: Report) {
  const line = tok.map?.[0] ?? parentLine;
  if (tok.type === 'html_block' || tok.type === 'html_inline') {
    const c = tok.content.trim();
    if (c.startsWith('<!--')) {
      if (!/^<!--[\s\S]*-->$/.test(c) || /-->[\s\S]/.test(c)) report('E_SYNTAX', 'comment has text after -->', line);
      else if (/^<!--\s*vs:id\b/.test(c)) report('E_SYNTAX', 'vs:id marker must be a whole line before a top-level block', line);
    } else {
      report('E_UNSAFE_CONTENT', `raw HTML is not allowed: ${JSON.stringify(c.slice(0, 40))}`, line);
    }
  }
  for (const child of tok.children ?? []) checkHtmlToken(child, line, report);
}

/** Reject variables and functions anywhere; enforce §2.3 literal limits. */
function checkAttributes(node: MNode, report: Report) {
  const line = node.lines[0];
  const check = (v: unknown, depth: number) => {
    if (v instanceof Markdoc.Ast.Variable) return report('E_UNSAFE_CONTENT', 'variables are not allowed', line);
    if (v instanceof Markdoc.Ast.Function) return report('E_UNSAFE_CONTENT', 'functions are not allowed', line);
    if (typeof v === 'string') {
      if (node.type === 'tag' && utf8.encode(v).length > LIMITS.stringBytes) report('E_LIMIT', `string literal exceeds ${LIMITS.stringBytes} bytes`, line);
      return;
    }
    if (Array.isArray(v)) {
      if (depth + 1 > LIMITS.literalDepth) return report('E_LIMIT', `literal nesting exceeds depth ${LIMITS.literalDepth}`, line);
      if (v.length > LIMITS.arrayLength) return report('E_LIMIT', `array literal exceeds ${LIMITS.arrayLength} items`, line);
      for (const x of v) check(x, depth + 1);
      return;
    }
    if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
      if (depth + 1 > LIMITS.literalDepth) return report('E_LIMIT', `literal nesting exceeds depth ${LIMITS.literalDepth}`, line);
      for (const x of Object.values(v)) check(x, depth + 1);
    }
  };
  for (const v of Object.values(node.attributes ?? {})) check(v, 0);
}

/** Tag name, placement, one-line opening, own-line closing, and ID grammar (§6.3, §6.5). */
function checkTag(node: MNode, src: SourceText, report: Report): ParsedTarget | undefined {
  const name = node.tag ?? '';
  const line = node.lines[0];
  if (DYNAMIC_TAGS.has(name)) {
    report('E_UNSAFE_CONTENT', `Markdoc "${name}" is not allowed`, line);
    return undefined;
  }
  if (!INLINE_TAGS.has(name) && !BLOCK_TAGS.has(name)) {
    report('E_SYNTAX', `unknown tag "${name}"`, line);
    return undefined;
  }
  if (INLINE_TAGS.has(name)) {
    if (!node.inline) report('E_SYNTAX', `"${name}" is an inline tag and must be inside prose`, line);
    return undefined;
  }
  if (node.inline) {
    report('E_SYNTAX', `block tag "${name}" must start and end on its own lines`, line);
    return undefined;
  }
  const ls = node.lines;
  const [o0, o1, c0, c1] = [ls[0], ls[1], ls[2], ls[3]];
  if (o0 === undefined || o1 === undefined) {
    report('E_SPAN_UNPROVEN', `tag "${name}" has no line map`, line);
    return undefined;
  }
  if (o1 - o0 !== 1) {
    report('E_SYNTAX', `opening of "${name}" must fit on one line`, o0);
    return undefined;
  }
  const open = src.lines[o0] ?? '';
  const selfClosing = ls.length < 4;
  const openRe = new RegExp(`^ {0,3}\\{%\\s*${escapeRe(name)}\\b.*${selfClosing ? '\\/%\\}' : '%\\}'}[ \\t]*$`);
  if (!openRe.test(open)) {
    report('E_SYNTAX', `opening of "${name}" must be alone on its line`, o0);
    return undefined;
  }
  if (!selfClosing) {
    if (c0 === undefined || c1 === undefined || c1 - c0 !== 1 ||
      (name === 'equation' ? !standaloneEquationClose(src.lines[c0] ?? '') : (src.lines[c0] ?? '').trim() !== `{% /${name} %}`)) {
      report('E_SYNTAX', `closing of "${name}" must be alone on its line`, c0 ?? o0);
      return undefined;
    }
  }
  const id = node.attributes['id'];
  if (id === undefined) {
    report('E_ID_MISSING', `block tag "${name}" has no id`, o0, { suggestedAction: 'add an explicit id attribute' });
    return undefined;
  }
  if (typeof id !== 'string' || !TARGET_ID.test(id)) {
    report('E_SYNTAX', `invalid target ID ${JSON.stringify(id)}`, o0);
    return undefined;
  }
  const last = selfClosing ? o0 : c0!;
  return provenTarget(src, report, {
    id, kind: name, origin: 'tag', tagName: name, attributes: { ...node.attributes },
    startLine: o0, endLineExclusive: last + 1,
    firstLine: (l) => openRe.test(l),
    lastLine: (l) => (selfClosing ? openRe.test(l) : name === 'equation' ? standaloneEquationClose(l) : l.trim() === `{% /${name} %}`),
  });
}

function standaloneEquationClose(line: string): boolean {
  const trimmed = line.trim();
  return Markdoc.parseTags(trimmed).some((t) => {
    const token = t as typeof t & { start?: number; end?: number };
    return token.type === 'tag_close' && token.meta?.tag === 'equation' && token.start === 0 && token.end === trimmed.length - 1;
  });
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A comment inside a list, quote, or tag body may not be a marker (§6.4). */
function checkNestedComment(node: MNode, src: SourceText, report: Report) {
  const content = String(node.attributes['content'] ?? '');
  const s = node.lines[0];
  if (/^\s*vs:id\b/.test(content)) {
    report('E_SYNTAX', 'ID markers are allowed only at the top level; use a detail child with an explicit id', s);
    return;
  }
  if (node.inline) return; // An ordinary closed inline comment belongs to its prose block.
  checkCommentShape(node, src, report);
}

function checkCommentShape(node: MNode, src: SourceText, report: Report): boolean {
  const s = node.lines[0];
  const e = node.lines[node.lines.length - 1];
  if (s === undefined || e === undefined) return false;
  const first = (src.lines[s] ?? '').trim();
  const last = (src.lines[e - 1] ?? '').trim();
  if (!first.startsWith('<!--') || !last.endsWith('-->')) {
    report('E_SYNTAX', 'comment line has text before <!-- or after -->', s);
    return false;
  }
  return true;
}

/** Validate a top-level comment. Returns the marker it declares, if any (§6.3). */
function checkTopComment(
  node: MNode, next: MNode | undefined, src: SourceText, fmClose: number, report: Report,
): { id: string; line: number } | undefined {
  const content = String(node.attributes['content'] ?? '');
  const s = node.lines[0];
  const e = node.lines[node.lines.length - 1];
  if (s === undefined || e === undefined) return undefined;
  const prevOk = s === 0 || isBlank(src.lines[s - 1]) || s - 1 === fmClose;
  const isExId = /^\s*vs:id\b/.test(content);
  const m = e - s === 1 ? MARKER_LINE.exec(src.lines[s] ?? '') : null;
  if (!m) {
    if (isExId) {
      report('E_SYNTAX', 'malformed vs:id marker; a marker is one whole line', s);
      return undefined;
    }
    if (!checkCommentShape(node, src, report)) return undefined;
    if (!prevOk || !isBlank(src.lines[e])) report('E_SYNTAX', 'an ordinary comment must stand alone with blank lines around it', s);
    return undefined;
  }
  const id = m[1]!;
  if (!prevOk) {
    report('E_SYNTAX', `marker "${id}" must follow a blank line`, s, { targetId: id });
    return undefined;
  }
  if (!next) {
    report('E_SYNTAX', `marker "${id}" is not followed by a block`, s, { targetId: id });
    return undefined;
  }
  if (next.type === 'comment') {
    report('E_SYNTAX', `marker "${id}" is followed by another comment or marker`, s, { targetId: id });
    return undefined;
  }
  if (next.type === 'tag') {
    report('E_SYNTAX', `marker "${id}" precedes a custom tag; tags use their id attribute`, s, { targetId: id });
    return undefined;
  }
  if (!ADDRESSABLE_BLOCKS.has(next.type)) {
    report('E_SYNTAX', `marker "${id}" precedes a ${next.type}, which is not addressable`, s, { targetId: id });
    return undefined;
  }
  return { id, line: s };
}

/** Markdoc disables setext headings; reject their underlines (§6.5). */
function checkSetext(node: MNode, src: SourceText, report: Report) {
  const s = node.lines[0];
  const e = node.lines[node.lines.length - 1];
  if (s === undefined || e === undefined || e - s < 2) return;
  if (/^ {0,3}(=+|-+)[ \t]*$/.test(src.lines[e - 1] ?? '')) {
    report('E_SYNTAX', 'setext heading underline; use an ATX (#) heading', e - 1);
  }
}
