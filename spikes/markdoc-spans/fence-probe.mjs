// Spike 1, test C: fence content handling (Markdoc parses tags inside fences by default).
import Markdoc from '@markdoc/markdoc';
const t = new Markdoc.Tokenizer({ allowComments: true });
const cases = {
  valid_tag: '```markdown\n{% graph id="g" %}\n{% /graph %}\n```\n',
  broken_tag: '```markdown\n{% graph id="g\n```\n',
  unclosed_tag: '```markdown\n{% graph id="g" %}\nno close\n```\n',
  variable: '```text\nprice {% $x %}\n```\n',
  process_false: '```markdown {% process=false %}\n{% graph id="g" %}\n```\n',
};
const errs = (n, out = []) => { (n.errors || []).forEach((e) => out.push(e.id)); (n.children || []).forEach((c) => errs(c, out)); return out; };
for (const [name, src] of Object.entries(cases)) {
  const toks = t.tokenize(src);
  const fence = toks.find((k) => k.type === 'fence');
  const ast = Markdoc.parse(toks);
  const fnode = ast.children.find((c) => c.type === 'fence');
  const rendered = Markdoc.renderers.html(Markdoc.transform(ast, { variables: { x: 'INJECTED' } }));
  console.log(name.padEnd(14), 'raw content kept:', JSON.stringify(fence.content) === JSON.stringify(src.split('\n').slice(1, -2).join('\n') + '\n'),
    '| fence children:', (fnode.children || []).map((c) => c.type + (c.tag ? ':' + c.tag : '')).join(',') || '-',
    '| parse errors:', errs(ast).join(',') || '-',
    '| validate:', Markdoc.validate(ast).map((e) => e.error.id).join(',') || '-',
    '| default render:', JSON.stringify(rendered.slice(0, 80)));
}
