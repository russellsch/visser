// Disposable W0 probe: public Markdoc.Tokenizer.tokenize -> Markdoc.parse(tokens).
// This explores token-array surgery for raw blocks; it is not production code.
import assert from 'node:assert/strict';
import Markdoc from '@markdoc/markdoc';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const tokenizer = () => new Markdoc.Tokenizer({ allowComments: true, html: true });
const children = (node) => node.children ?? [];
const walk = (node, fn) => { fn(node); for (const child of children(node)) walk(child, fn); };
const byType = (node, type) => { const out = []; walk(node, (n) => { if (n.type === type) out.push(n); }); return out; };

function lineStarts(bytes) {
  const starts = [0];
  for (let i = 0; i < bytes.length; i++) if (bytes[i] === 10) starts.push(i + 1);
  return starts;
}

function byteSpan(bytes, firstLine, endLine) {
  const starts = lineStarts(bytes);
  const startByte = starts[firstLine];
  const endByte = starts[endLine] ?? bytes.length;
  assert(startByte !== undefined && endByte !== undefined);
  return { startByte, endByte, source: decoder.decode(bytes.subarray(startByte, endByte)) };
}

function rawEquation(source) {
  const bytes = encoder.encode(source);
  const tokens = tokenizer().tokenize(source);
  const openIndex = tokens.findIndex((t) => t.type === 'tag_open' && t.meta?.tag === 'equation');
  const closeIndex = tokens.findIndex((t, i) => i > openIndex && t.type === 'tag_close' && t.meta?.tag === 'equation');
  assert(openIndex >= 0 && closeIndex > openIndex);
  const open = tokens[openIndex];
  const close = tokens[closeIndex];
  const bodySpan = byteSpan(bytes, open.map[1], close.map[0]);
  const raw = bodySpan.source.replace(/\r\n?/g, '\n');
  const text = { ...tokens[openIndex + 2], type: 'text', tag: '', content: raw, children: null,
    map: [open.map[1], close.map[0]], nesting: 0, hidden: false, meta: null };
  const adapted = [...tokens.slice(0, openIndex + 1), text, ...tokens.slice(closeIndex)];
  const ast = Markdoc.parse(adapted);
  const equation = byType(ast, 'tag').find((n) => n.tag === 'equation');
  assert(equation);
  assert.equal(equation.children[0].attributes.content, raw);
  return { bodySpan, raw, parsedText: equation.children[0].attributes.content,
    originalChildTypes: tokens.slice(openIndex + 1, closeIndex).map((t) => t.type) };
}

function rawDisplay(source) {
  const bytes = encoder.encode(source);
  const tokens = tokenizer().tokenize(source);
  const i = tokens.findIndex((t) => t.type === 'paragraph_open' &&
    t.map && source.split(/\r?\n/)[t.map[0]] === '$$');
  assert(i >= 0);
  const open = tokens[i];
  const close = tokens[i + 2];
  assert.equal(close.type, 'paragraph_close');
  const fullSpan = byteSpan(bytes, open.map[0], open.map[1]);
  const normalized = fullSpan.source.replace(/\r\n?/g, '\n');
  const body = normalized.split('\n').slice(1, -2).join('\n') + '\n';
  const opening = { ...open, type: 'math_display_open', tag: '', map: [...open.map] };
  const content = { ...tokens[i + 1], type: 'text', tag: '', content: body,
    children: null, nesting: 0, map: [open.map[0] + 1, open.map[1] - 1] };
  const closing = { ...close, type: 'math_display_close', tag: '', map: [open.map[1] - 1, open.map[1]] };
  const ast = Markdoc.parse([...tokens.slice(0, i), opening, content, closing, ...tokens.slice(i + 3)]);
  const display = byType(ast, 'math_display')[0];
  assert(display);
  assert.equal(display.children[0].attributes.content, body);
  return { fullSpan, body, astType: display.type, originalTypes: tokens.slice(i, i + 3).map((t) => t.type) };
}

// A deliberately narrow source mapper: one top-level paragraph, with no Markdown
// container prefix. It proves byte accounting, not general inline tokenization.
function simpleInlineSpans(source) {
  const tokens = tokenizer().tokenize(source);
  const inline = tokens.find((t) => t.type === 'inline');
  assert(inline && inline.map?.[0] === 0 && inline.map?.[1] === 1);
  const start = source.indexOf(inline.content);
  assert(start >= 0);
  const matches = [...inline.content.matchAll(/\$([^$]+)\$/g)];
  return matches.map((match) => {
    const from = start + match.index;
    const to = from + match[0].length;
    const startByte = encoder.encode(source.slice(0, from)).length;
    const endByte = encoder.encode(source.slice(0, to)).length;
    return { startByte, endByte, source: decoder.decode(encoder.encode(source).subarray(startByte, endByte)) };
  });
}

const eqLF = '{% equation id="e" %}\n\\begin{matrix}a & b \\\\ c & d\\end{matrix}\n{% /equation %}\n';
const eqCRLF = '😀 heading\r\n' + eqLF.replaceAll('\n', '\r\n');
const display = '<!-- vs:id display -->\n$$\n\\frac{a}{b}\\\\c\n$$\n';
const fence = '```text\n$\\frac{a}{b}$\n{% equation id="fake" %}\n```\n';
const code = 'Here is `$x$` and $y$.\n';
const table = '| A | B |\n|---|---|\n| $|x|$ | right |\n';
const attr = '{% node id="n" role="service" label="$\\\\frac{a}{b}$" /%}\n';
const inlineRows = 'The rows are $\\begin{matrix}a & b \\\\ c & d\\end{matrix}$.\n';
const inlineUnicode = '😀 $\\alpha$ and $\\alpha$.\r\n';
const fencedTokens = tokenizer().tokenize(fence);
const codeTokens = tokenizer().tokenize(code);
const tableTokens = tokenizer().tokenize(table);
const attrAst = Markdoc.parse(tokenizer().tokenize(attr));
const inlineTokens = tokenizer().tokenize(inlineRows);

const output = {
  markdocVersion: '0.5.10',
  rawEquationLF: rawEquation(eqLF),
  rawEquationCRLF: rawEquation(eqCRLF),
  rawDisplay: rawDisplay(display),
  fenceTypes: fencedTokens.map((t) => t.type),
  codeChildren: codeTokens.find((t) => t.type === 'inline').children.map((t) => ({ type: t.type, content: t.content })),
  tableRowCells: tableTokens.filter((t) => t.type === 'td_open').length,
  tableInlineCells: tableTokens.filter((t) => t.type === 'inline').map((t) => t.content),
  decodedAttribute: byType(attrAst, 'tag')[0].attributes.label,
  inlineRaw: inlineTokens.find((t) => t.type === 'inline').content,
  inlineChildren: inlineTokens.find((t) => t.type === 'inline').children.map((t) => ({ type: t.type, content: t.content })),
  simpleInlineSpans: simpleInlineSpans(inlineUnicode),
};
assert.equal(output.tableRowCells, 2); // extra delimiter still corrupts the two intended cells.
assert(output.tableInlineCells.includes('$'));
assert.equal(output.decodedAttribute, '$\\frac{a}{b}$');
assert(output.fenceTypes.includes('fence'));
assert(output.codeChildren.some((t) => t.type === 'code_inline' && t.content === '$x$'));
assert.deepEqual(output.simpleInlineSpans.map((x) => x.source), ['$\\alpha$', '$\\alpha$']);
assert(output.simpleInlineSpans[0].startByte > 3); // UTF-8 emoji consumed four bytes.
console.log(JSON.stringify(output, null, 2));
