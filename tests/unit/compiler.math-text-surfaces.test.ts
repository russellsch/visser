import { afterAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { compileDocument } from '../../packages/core/src/compiler/compile.ts';
// @ts-expect-error jsdom is supplied by the test harness without declarations.
import { JSDOM } from 'jsdom';
import Markdoc from '@markdoc/markdoc';

const dir=mkdtempSync(join(tmpdir(),'visser-math-text-surfaces-'));
afterAll(()=>rmSync(dir,{recursive:true,force:true}));
const frontmatter=readFileSync(new URL('../../examples/bounded-queue/index.md',import.meta.url),'utf8').split('---')[1];
const toolkit={version:'0.0.0',sha256:'a'.repeat(64),assets:{'math.js':'b'.repeat(64)}};
async function compile(body:string,title='Math surfaces $x$'){
 const source=`---${frontmatter!.replace(/^title:.*$/m,`title: "${title}"`)}---\n\n${body}`;
 writeFileSync(join(dir,'index.md'),source);const bundle=loadBundle(join(dir,'index.md'));
 expect(bundle.diagnostics.filter(d=>d.severity==='error')).toEqual([]);
 const result=await compileDocument(bundle,toolkit,{audience:'private',includeSource:false,layoutFallback:false});
 return {html:new TextDecoder().decode(result.files.find(file=>file.path.endsWith('/index.html'))!.bytes),markdown:new TextDecoder().decode(result.files.find(file=>file.path.endsWith('/document.md'))!.bytes)};
}

describe('math compiler text surfaces @M02 @M03 @M08 @M13',()=>{
 it('preserves distinct rich Markdown fields in scoped HTML and semantic Markdown', async()=>{
  const {html,markdown}=await compile(`<!-- vs:id heading -->
## Heading $h_1$

<!-- vs:id prose -->
Paragraph $p_1$, *emphasis $e_1$*, **strong $s_1$**, ~~strike $k_1$~~  
Break $b_1$ and [link $l_1$](https://example.invalid/).

{% graph id="graph" mode="architecture" title="Graph" question="Why?" %}
{% node id="node" role="process" label="Node" /%}
{% /graph %}

{% definition id="definition" term="Term" %}
Meaning.
{% /definition %}

{% detail id="detail" label="Detail" %}
Explanation.
{% /detail %}

<!-- vs:id references -->
{% term ref="definition" %}Term $r_t$ {% /term %}, {% detail-link ref="detail" %}Detail $r_d$ {% /detail-link %}, {% focus targets=["node"] %}Focus $f_1$ {% /focus %}.

<!-- vs:id list -->
- Item $i_1$

<!-- vs:id quote -->
> Quote $q_1$

<!-- vs:id table -->
| Header $t_h$ | Other |
| --- | --- |
| Cell $t_c$ | Plain |

<!-- vs:id literal -->
Inline \`$literal_i$\`.

<!-- vs:id fence -->
\`\`\`text
$literal_f$
\`\`\`
`);
  const document:Document=new JSDOM(html).window.document;
  const fields=[['#x-heading','h_1'],['#x-prose','p_1'],['#x-prose em','e_1'],
   ['#x-prose strong','s_1'],['#x-prose .vs-strike','k_1'],['#x-prose','b_1'],
   ['#x-prose a','l_1'],['#x-references .vs-term','r_t'],['#x-references .vs-detail-link','r_d'],
   ['#x-references [data-vs-focus]','f_1'],['#x-list li','i_1'],['#x-quote blockquote','q_1'],
   ['#x-table th','t_h'],['#x-table td','t_c']] as const;
  for(const [selector,tex] of fields){
   expect([...document.querySelector(selector)!.querySelectorAll('.vs-math-source')].map(node=>node.textContent),selector).toContain(`$${tex}$`);
   if(!selector.startsWith('#x-table')) expect(markdown,tex).toContain(`$${tex}$`);
  }
  expect(document.querySelectorAll('#x-prose br')).toHaveLength(1);
  expect(document.querySelector('#x-prose br ~ .vs-math .vs-math-source')!.textContent).toBe('$b_1$');
  expect(markdown).toContain('[link $l_1$](https://example.invalid/)');
  expect(markdown).toContain('## Heading $h_1$');
  // The established semantic projection flattens strike and Visser links to
  // their readable text; it preserves emphasis, strong and the line boundary.
  expect(markdown).toContain('Paragraph $p_1$, *emphasis $e_1$*, **strong $s_1$**, strike $k_1$\nBreak $b_1$ and [link $l_1$](https://example.invalid/).');
  expect(markdown).toContain('Term $r_t$ , Detail $r_d$ , Focus $f_1$ .');
  expect(markdown).toContain('- Item $i_1$');
  expect(markdown).toContain('> Quote $q_1$');
  const projected=Markdoc.parse(new Markdoc.Tokenizer({allowComments:true,html:true}).tokenize(markdown));
  const recovered:Document=new JSDOM(Markdoc.renderers.html(Markdoc.transform(projected))).window.document;
  expect(recovered.querySelectorAll('thead th')).toHaveLength(2);
  expect(recovered.querySelectorAll('tbody td')).toHaveLength(2);
  expect(recovered.querySelector('th')!.textContent).toBe('Header $t_h$');
  expect(recovered.querySelector('td')!.textContent).toBe('Cell $t_c$');
  expect(document.querySelector('#x-literal code')!.textContent).toBe('$literal_i$');
  expect(document.querySelector('#x-fence .vs-fence code')!.textContent).toBe('$literal_f$\n');
  expect(document.querySelectorAll('#x-literal .vs-math, #x-fence .vs-math')).toHaveLength(0);
  expect(markdown).toContain('Inline `$literal_i$`.');
  expect(markdown).toContain('```text\n$literal_f$\n```');
  expect([...projected.walk()].filter(node => node.type === 'fence').map(node => node.attributes['content'])).toContain('$literal_f$\n');
 });
 it('keeps rich prose, links, focus, lists, quotes and table cells as source-owned math placeholders',async()=>{
  const {html,markdown}=await compile(`<!-- vs:id p -->
*Em $x$* and **strong $x$** and ~~strike $x$~~  
line $x$ with [link $x$](https://example.invalid/destination).

{% graph id="g" mode="architecture" title="Graph" question="Why?" %}
{% node id="a" role="process" label="A" /%}
{% /graph %}

<!-- vs:id focus_p -->
{% focus targets=["a"] %}focus $x$ {% /focus %}.

<!-- vs:id list -->
- item $x$

<!-- vs:id quote -->
> quote $x$

<!-- vs:id table -->
| Head $x$ | Other |
| --- | --- |
| Cell $x$ | plain |
`);
  expect(html).toMatch(/<h1>Math surfaces <span class="vs-math"/);
  expect(html).toMatch(/<em>Em <span class="vs-math"/);
  expect(html).toMatch(/<strong>strong <span class="vs-math"/);
  expect(html).toMatch(/<span class="vs-strike">strike <span class="vs-math"/);
  expect(html).toMatch(/<br[^>]*>\s*line <span class="vs-math"/);
  expect(html).toMatch(/<a href="https:\/\/example\.invalid\/destination"[^>]*>link <span class="vs-math"/);
  expect(html).toMatch(/data-vs-focus="a"[^>]*>focus <span class="vs-math"/);
  expect(html).toMatch(/id="x-list"[^>]*><ul><li>item <span class="vs-math"/);
  expect(html).toMatch(/id="x-quote"[^>]*><blockquote><p>quote <span class="vs-math"/);
  expect(html).toMatch(/id="x-table"[^>]*><table><thead><tr><th scope="col">Head <span class="vs-math"/);
  expect(html).toMatch(/<tbody><tr><td>Cell <span class="vs-math"/);
  expect(markdown.match(/\$x\$/g)?.length).toBeGreaterThanOrEqual(6);
  expect(markdown).toContain('[link $x$](https://example.invalid/destination)');
 });

 it('keeps frontmatter title and image alt math as readable source without treating the image URL as math',async()=>{
  mkdirSync(join(dir,'assets'),{recursive:true});writeFileSync(join(dir,'assets','tiny.png'),Buffer.from([137,80,78,71]));
  const {html,markdown}=await compile(`<!-- vs:id image -->
![Image $a$](assets/tiny.png)
`,'Energy $E=mc^2$');
  expect(html).toContain('<title>Energy $E=mc^2$</title>');
  expect(html).toContain('class="vs-math-source">$E=mc^2$');
  expect(html).toContain('alt="Image $a$"');
  expect(html).toMatch(/src="assets\/[a-f0-9]{64}\.png"/);
  expect(html).not.toContain('class="vs-math-source">assets/tiny.png');
  expect(markdown).toContain('# Energy $E=mc^2$');
  expect(markdown).toContain('![Image $a$](assets/tiny.png)');
 });
});
