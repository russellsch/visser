import Markdoc from '@markdoc/markdoc';

const samples = {
  inline: 'Before *a $\\frac{1}{2}$ b* and `$literal$` after.\n',
  table: '| A | B |\n|---|---|\n| $|x|$ | $a & b$ |\n',
  display: '<!-- vs:id display -->\n$$\n\\frac{a}{b}\\\\c\n$$\n',
  equation: '{% equation id="e" %}\n\\begin{matrix}a & b \\\\ c & d\\end{matrix}\n{% /equation %}\n',
  attrs: '{% node id="n" role="service" label="$\\\\frac{a}{b}$" /%}\n',
};

const shape = (t) => ({ type: t.type, tag: t.tag, content: t.content, map: t.map,
  position: t.position, meta: t.meta, nesting: t.nesting,
  children: t.children?.map(shape), errors: t.errors });

for (const [name, source] of Object.entries(samples)) {
  const tokens = new Markdoc.Tokenizer({ allowComments: true, html: true }).tokenize(source);
  const ast = Markdoc.parse(tokens);
  console.log(JSON.stringify({ name, source, tokens: tokens.map(shape), ast: ast.toJSON?.() ?? ast }, null, 2));
}
