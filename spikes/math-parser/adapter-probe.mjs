import assert from 'node:assert/strict';
import Markdoc from '@markdoc/markdoc';
import { createMathTokenizer } from './adapter.mjs';

const walk = (node, fn) => { fn(node); for (const child of node.children ?? []) walk(child, fn); };
const nodes = (node, type) => { const found = []; walk(node, (n) => { if (n.type === type) found.push(n); }); return found; };
const plain = (node) => ({ type: node.type, tag: node.tag, inline: node.inline,
  attributes: node.attributes, lines: node.lines, children: (node.children ?? []).map(plain),
  errors: node.errors?.map((e) => ({ id: e.id, message: e.message })) ?? [] });
const text = (source, span) => new TextDecoder().decode(new TextEncoder().encode(source).subarray(span.startByte, span.endByte));
const baseline = (source) => Markdoc.parse(new Markdoc.Tokenizer({ allowComments: true, html: true }).tokenize(source));
const adapter = createMathTokenizer();

const nonMath = [
  '<!-- vs:id p -->\nA *marked* paragraph with [a link](https://example.invalid).\n',
  '<!-- vs:id l -->\n- first\n- second with `code`\n',
  '<!-- vs:id q -->\n> A quoted paragraph.\n',
  '<!-- vs:id t -->\n| A | B |\n|---|---|\n| one | two |\n',
  '{% detail id="d" label="Details" %}\nA {% cite ref="s" /%} tag.\n{% /detail %}\n',
  '---\ntitle: T\n---\n\n# Heading\n',
];
const parity = nonMath.map((source, i) => ({ i, equal: JSON.stringify(plain(baseline(source))) === JSON.stringify(plain(adapter.analyze(source).ast)) }));
assert(parity.every((row) => row.equal));

const source = [
  '<!-- vs:id intro -->',
  '😀 A *$\\frac{a}{b}$* in prose and literal `$not_math$`.',
  '',
  '<!-- vs:id t -->',
  '| Name | Formula |',
  '|---|---|',
  '| absolute | $\\left|a & b\\right|$ |',
  '',
  '{% equation id="eq_matrix" %}',
  '\\begin{matrix}a & b \\\\ c & d\\end{matrix}',
  '{% /equation %}',
  '',
  '<!-- vs:id display -->',
  '$$',
  '\\frac{a}{b} = c',
  '$$',
  '',
  '<!-- vs:id c -->',
  '```text',
  '$fenced$ {% eqref ref="eq_matrix" /%}',
  '```',
].join('\r\n') + '\r\n';
const result = adapter.analyze(source);
const body = result.ast;
const formulas = nodes(body, 'math_inline').map((n) => n.children[0]?.attributes.content);
const table = nodes(body, 'table')[0];
const dataCells = nodes(table, 'td');
const equation = nodes(body, 'tag').find((n) => n.tag === 'equation');
const display = nodes(body, 'math_display')[0];

assert.deepEqual(formulas, ['\\frac{a}{b}', '\\left|a & b\\right|']);
assert.equal(dataCells.length, 2);
assert.equal(equation.children[0].attributes.content, '\\begin{matrix}a & b \\\\ c & d\\end{matrix}\n');
assert.equal(display.children[0].attributes.content, '\\frac{a}{b} = c\n');
assert.equal(nodes(body, 'fence').length, 1);
assert.equal(nodes(nodes(body, 'fence')[0], 'math_inline').length, 0);
assert.equal(result.unmapped.length, 0);
assert.equal(result.spans.length, 4);
assert(result.spans.every((span) => {
  const slice = text(source, span);
  return span.kind === 'inline' ? slice === `$${span.tex}$` : slice.includes(span.tex.trim());
}));

const nested = '> first $x$\r\n> second $y$\r\n\r\n- first $x$\r\n  second $y$\r\n\r\n[see $z$](https://example.invalid/$not_math$)\r\n';
const nestedResult = adapter.analyze(nested);
assert.equal(nestedResult.unmapped.length, 0);
assert.deepEqual(nestedResult.spans.map((span) => text(nested, span)), ['$x$', '$y$', '$x$', '$y$', '$z$']);
assert.equal(nodes(nestedResult.ast, 'math_inline').length, 5);

const fencedEquation = '{% equation id="raw" %}\n{% $variable %}\n$not_inline$\n{% /equation %}\n';
const rawResult = adapter.analyze(fencedEquation);
assert.equal(nodes(rawResult.ast, 'tag')[0].children[0].attributes.content, '{% $variable %}\n$not_inline$\n');
assert.equal(nodes(rawResult.ast, 'math_inline').length, 0);

const attr = '{% node id="ratio" role="service" label="$\\\\frac{a}{b}$" /%}\n';
assert.equal(nodes(adapter.analyze(attr).ast, 'tag')[0].attributes.label, '$\\frac{a}{b}$');

const currencyTable = '| A | B |\n|---|---|\n| $5 | right |\n';
const currencyCells = nodes(nodes(adapter.analyze(currencyTable).ast, 'table')[0], 'td');
assert.deepEqual(currencyCells.map((cell) => cell.children[0].children[0].attributes.content), ['$5', 'right']);

const escapedBar = '| A | B |\n|---|---|\n| $a\\|b$ | right |\n';
const escapedBarResult = adapter.analyze(escapedBar);
assert.equal(nodes(escapedBarResult.ast, 'td').length, 2);
assert.equal(nodes(escapedBarResult.ast, 'math_inline')[0].children[0].attributes.content, 'a\\|b');

const nestedEquation = '{% detail id="d" label="D" %}\nText.\n{% equation id="e" %}\n\\frac{1}{2}\n{% /equation %}\n{% /detail %}\n';
const nestedEquationResult = adapter.analyze(nestedEquation);
const detail = nodes(nestedEquationResult.ast, 'tag').find((n) => n.tag === 'detail');
assert(detail?.children.some((n) => n.type === 'tag' && n.tag === 'equation'));
assert.equal(nestedEquationResult.spans.length, 1);
assert.equal(nodes(adapter.analyze('$$\nx\n').ast, 'error')[0].errors[0].id, 'parse-error');
assert.equal(nodes(adapter.analyze('{% equation id="e" %}\nx\n').ast, 'error')[0].errors[0].id, 'parse-error');

console.log(JSON.stringify({ parity, formulae: formulas, tableCells: dataCells.length,
  spans: result.spans.map((s) => ({ ...s, slice: text(source, s) })), unmapped: result.unmapped,
  nestedSpans: nestedResult.spans.map((s) => text(nested, s)), rawEquationLiteral: true,
  attributeEscape: true, currencyTableCells: currencyCells.length, escapedBarCells: 2,
  nestedEquation: true, unclosedDiagnostics: true }, null, 2));
