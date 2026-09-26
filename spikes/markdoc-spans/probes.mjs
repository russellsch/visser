// Spike 1, test B: probes for §6.3–6.5 profile rules on Markdoc 0.5.10.
import Markdoc from '@markdoc/markdoc';
import { loadSource, parse, collectTargets } from './adapter.mjs';

const enc = (s) => new TextEncoder().encode(s);
const run = (text, opts) => {
  const src = loadSource(enc(text));
  const { tokens, ast } = parse(src.text, opts);
  return { src, tokens, ast, ...collectTargets(src, ast) };
};
const walk = (node, fn, depth = 0) => { fn(node, depth); for (const c of node.children || []) walk(c, fn, depth + 1); };
const find = (ast, pred) => { const out = []; walk(ast, (n, d) => { if (pred(n, d)) out.push({ n, d }); }); return out; };
const types = (ast) => { const t = new Set(); walk(ast, (n) => t.add(n.type)); return [...t].join(','); };
const tokTypes = (tokens) => { const t = new Set(); const f = (ts) => ts.forEach((k) => { t.add(k.type); if (k.children) f(k.children); }); f(tokens); return t; };

const rows = [];
const check = (id, what, pass, evidence) => rows.push({ id, what, pass, evidence });

// P1: tags and markers inside a fence are inert.
{
  const r = run('<!-- ex:id ex_code -->\n```markdown\n<!-- ex:id inside -->\n{% graph id="g" %}\n{% /graph %}\n```\n');
  const ids = r.targets.map((t) => t.id);
  check('P1', 'markers/tags in a fence are inert', ids.join() === 'ex_code' && find(r.ast, (n) => n.type === 'tag').length === 0, `targets=${ids}`);
}
// P1b: same input with Markdoc's default fence processing (no adapter fix).
{
  const r = run('<!-- ex:id ex_code -->\n```markdown\n<!-- ex:id inside -->\n{% graph id="g" %}\n{% /graph %}\n```\n', { processFences: true });
  check('P1b', 'Markdoc default: tags inside a fence are inert (no adapter fix)', r.targets.length === 1, `targets=${r.targets.map((t) => t.id)} (fence tags parsed; see fence-probe.mjs)`);
}
// P2: marker followed by marker is detectable.
{
  const r = run('<!-- ex:id a -->\n<!-- ex:id b -->\nText.\n');
  check('P2', 'marker followed by marker is detected', r.errors.some((e) => /followed by comment/.test(e)), r.errors.join('; '));
}
// P3: marker before each block kind.
for (const [kind, body] of [
  ['list', '- one\n- two\n'], ['table', '| a | b |\n|---|---|\n| 1 | 2 |\n'], ['blockquote', '> quoted\n'],
  ['heading', '# Title\n'], ['fence', '```js\nx()\n```\n'], ['hr', '---\n'],
]) {
  const r = run(`Intro.\n\n<!-- ex:id t_${kind} -->\n${body}\nAfter.\n`);
  const t = r.targets.find((x) => x.id === `t_${kind}`);
  check(`P3-${kind}`, `marker binds to a following ${kind}`, !!t && r.errors.length === 0, t ? `kind=${t.kind} lines=${t.lines[0] + 1}-${t.lines[1]}` : r.errors.join('; '));
}
// P3-setext: lheading is disabled by Markdoc.
{
  const r = run('<!-- ex:id t_setext -->\nTitle\n=====\n');
  const t = r.targets.find((x) => x.id === 't_setext');
  check('P3-setext', 'setext heading parses as a heading', t && t.kind === 'heading', `kind=${t && t.kind} (Markdoc disables lheading)`);
}
// P3-blank: blank line between marker and block.
{
  const r = run('<!-- ex:id gap -->\n\nParagraph.\n');
  check('P3-gap', 'marker + blank line + block binds (next nonblank token)', r.targets.some((t) => t.id === 'gap'), r.errors.join('; ') || 'bound');
}
// P4: marker inside a list item surfaces for rejection.
for (const [name, text] of [
  ['tight', '- one\n  <!-- ex:id inner -->\n  two\n- three\n'],
  ['loose', '- one\n\n  <!-- ex:id inner -->\n  two\n\n- three\n'],
  ['quote', '> a\n>\n> <!-- ex:id inner -->\n> b\n'],
]) {
  const r = run(text);
  const nested = find(r.ast, (n, d) => n.type === 'comment' && d > 1 && /ex:id/.test(n.attributes.content || ''));
  check(`P4-${name}`, `marker inside ${name} list/quote surfaces as a nested comment`, nested.length > 0, `nested comments=${nested.length}`);
}
// P4-tag: marker inside a custom tag body surfaces (rev 1.3 forbids it).
{
  const r = run('{% detail id="d" label="L" %}\n<!-- ex:id inner -->\nBody.\n{% /detail %}\n');
  const nested = find(r.ast, (n, d) => n.type === 'comment' && d > 1 && /ex:id/.test(n.attributes.content || ''));
  check('P4-tag', 'marker inside a custom tag body surfaces as a nested comment', nested.length === 1, `nested comments=${nested.length}; top-level targets=${r.targets.map((t) => t.id)}`);
}
// P5: marker edge cases.
{
  const r = run('Para line one\n<!-- ex:id x -->\nNext para.\n');
  const t = r.targets.find((q) => q.id === 'x');
  check('P5a', 'marker directly after a paragraph line interrupts it and binds', !!t, t ? `kind=${t.kind}` : r.errors.join('; '));
}
{
  const r = run('<!-- ex:id x --> trailing words\nPara.\n');
  const text = []; walk(r.ast, (n) => { if (n.type === 'text') text.push(n.attributes.content); });
  check('P5b', 'text after --> on a marker line is preserved (not silently dropped)', text.join(' ').includes('trailing'), `text nodes=${JSON.stringify(text)}; errors=${r.errors.join('; ')}`);
}
{
  const r = run('Some text <!-- ex:id x --> more text.\n');
  const inl = find(r.ast, (n) => n.type === 'comment' && /ex:id/.test(n.attributes.content || ''));
  check('P5c', 'inline marker in prose is visible as an inline comment node', inl.length === 1 && inl[0].n.inline, `inline comment nodes=${inl.length}`);
}
{
  const r = run('<!--\nex:id x\n-->\nPara.\n');
  const cm = find(r.ast, (n) => n.type === 'comment');
  check('P5d', 'multi-line ex:id comment is visible (content check needed, raw-line regex misses it)', cm.length === 1 && /ex:id x/.test(cm[0].n.attributes.content), `content=${JSON.stringify(cm[0] && cm[0].n.attributes.content)} targets=${r.targets.length} errors=${r.errors.length}`);
}
{
  const r = run('    <!-- ex:id x -->\nPara.\n');
  check('P5e', '4-space-indented marker is rejected by the grammar', r.errors.some((e) => /malformed/.test(e)), r.errors.join('; '));
}
{
  const r = run('<!-- ex:id x\nPara.\n');
  const cm = find(r.ast, (n) => n.type === 'comment');
  check('P5f', 'unclosed marker comment falls back to text (detectable by raw scan only)', cm.length === 0, `comments=${cm.length}`);
}
{
  const r = run('<!-- ex:id x -->\n{% detail id="d" label="L" %}\nBody.\n{% /detail %}\n');
  check('P5g', 'marker before a custom tag is detectable', r.errors.some((e) => /before custom tag/.test(e)), r.errors.join('; '));
}
// P6: raw HTML.
const html = '<div class="x">block</div>\n\nText with <span>inline</span> and <img src=x onerror=alert(1)> here.\n\n```html\n<div>code</div>\n```\n\nInline `<span>code</span>`.\n';
for (const [name, opts] of [['default', {}], ['html:true', { html: true }]]) {
  const r = run(html, opts);
  const tt = tokTypes(r.tokens);
  const textHasTag = find(r.ast, (n) => n.type === 'text' && /<(div|span|img)\b/.test(n.attributes.content || '')).length;
  check(`P6-${name}`, `raw HTML surfacing with ${name}`, true,
    `token types html_block=${tt.has('html_block')} html_inline=${tt.has('html_inline')}; AST types=${types(r.ast)}; text nodes containing tags=${textHasTag}`);
}
{
  const r = run(html, { html: true });
  const hb = []; const f = (ts) => ts.forEach((k) => { if (/^html_/.test(k.type)) hb.push(k.content.trim()); if (k.children) f(k.children); }); f(r.tokens);
  const inCode = hb.some((c) => /code/.test(c));
  check('P6-detect', 'html:true yields html tokens for prose HTML only (none from fence/inline code)', hb.length >= 3 && !inCode, JSON.stringify(hb));
  const cm = run('<!-- ex:id x -->\nPara.\n', { html: true });
  check('P6-comments', 'with html:true, ex:id markers still become comment tokens (not html_block)', cm.targets.some((t) => t.id === 'x'), `targets=${cm.targets.map((t) => t.id)}`);
}
// P7: attribute literals and variables/functions.
{
  const r = run('{% t arr=[1, 2.5, "s"] obj={a: {b: [true, null]}} f=1.5 n=-3 v=$x fn=upper("a") %}\n{% /t %}\n');
  const tag = find(r.ast, (n) => n.type === 'tag')[0];
  const a = tag ? tag.n.attributes : {};
  const ctor = (x) => (x && x.constructor ? x.constructor.name : typeof x);
  const isVar = a.v instanceof Markdoc.Ast.Variable, isFn = a.fn instanceof Markdoc.Ast.Function;
  check('P7-literals', 'array/object/float/negative literals parse to JS values', Array.isArray(a.arr) && a.arr[1] === 2.5 && a.obj?.a?.b?.[0] === true && a.f === 1.5 && a.n === -3, JSON.stringify({ arr: a.arr, obj: a.obj, f: a.f, n: a.n }));
  check('P7-varfn', 'variables and functions are distinct AST classes (rejectable before transform)', isVar && isFn, `v=${ctor(a.v)} fn=${ctor(a.fn)}`);
  const deep = run('{% t x=[[[[[[[[[[1]]]]]]]]]] %}\n{% /t %}\n');
  const dtag = find(deep.ast, (n) => n.type === 'tag')[0];
  check('P7-depth', 'deeply nested literal parses (depth limit must be ours)', !!dtag && Array.isArray(dtag.n.attributes.x), `parsed=${!!dtag}`);
}
// P8: multi-line tag opening.
{
  const r = run('{% graph id="g"\n   title="T" %}\nBody.\n{% /graph %}\n');
  const tag = find(r.ast, (n) => n.type === 'tag')[0];
  const errs = []; walk(r.ast, (n) => (n.errors || []).forEach((e) => errs.push(e.id)));
  check('P8', 'multi-line tag opening is REJECTED by Markdoc (else we must enforce one-line)', !tag || errs.length > 0, tag ? `accepted as tag ${tag.n.tag} attrs=${JSON.stringify(tag.n.attributes)} lines=${tag.n.lines}` : `not a tag; AST=${types(r.ast)} errors=${errs}`);
}
// P9: inline tags belong to their paragraph.
{
  const r = run('<!-- ex:id p -->\nThis is {% term ref="d" %}backpressure{% /term %} and {% cite ref="s" /%} and {% focus targets=["a", "b"] %}this{% /focus %}.\n');
  const inl = find(r.ast, (n) => n.type === 'tag');
  const allInline = inl.every((x) => x.n.inline);
  const para = r.ast.children.find((c) => c.type === 'paragraph');
  const within = inl.every((x) => x.n.lines[0] === para.lines[0]);
  check('P9', 'inline term/cite/focus are inline tags within the paragraph lines', inl.length === 3 && allInline && within, `inline=${inl.map((x) => `${x.n.tag}@${x.n.lines}`)} para=${para.lines} targets=${r.targets.map((t) => t.id)}`);
}
// P10: tables by default.
{
  const r = run('| a | b |\n|---|---|\n| 1 | 2 |\n');
  check('P10', 'GFM tables parse by default', r.ast.children[0]?.type === 'table', `type=${r.ast.children[0]?.type}`);
}
// P11: tag syntax inside inline code is inert.
{
  const r = run('Use `{% graph id="g" %}` inline.\n');
  check('P11', 'tag syntax in inline code is inert', find(r.ast, (n) => n.type === 'tag').length === 0, types(r.ast));
}
// P12: if/partial and unknown tags are ordinary tag names (rejectable by name).
{
  const r = run('{% if $x %}\nA\n{% /if %}\n\n{% partial file="x.md" /%}\n');
  const tags = find(r.ast, (n) => n.type === 'tag').map((x) => x.n.tag);
  check('P12', 'if/partial surface as tag names before transform', tags.includes('if') && tags.includes('partial'), `tags=${tags}`);
}
// P13: block tag close on same line / tag not on its own line.
{
  const r = run('Text {% detail id="d" label="L" %}\nBody\n{% /detail %}\n');
  const tag = find(r.ast, (n) => n.type === 'tag')[0];
  check('P13', 'block tag not on its own line is distinguishable (inline tag)', tag && tag.n.inline === true, `inline=${tag && tag.n.inline} errors=${JSON.stringify(tag && tag.n.errors)}`);
}

const pad = (s, n) => String(s).padEnd(n);
for (const r of rows) console.log(pad(r.id, 13), pad(r.pass ? 'PASS' : 'FAIL', 5), pad(r.what, 88), r.evidence);
