import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it} from 'vitest';
// @ts-expect-error jsdom is supplied by the test harness without declarations.
import {JSDOM} from 'jsdom';
import {loadBundle} from '../../packages/core/src/model/bundle.ts';
import {compileDocument} from '../../packages/core/src/compiler/compile.ts';
const frontmatter=readFileSync(new URL('../../examples/bounded-queue/index.md',import.meta.url),'utf8').split('---')[1];
async function compiled(source:string){const dir=mkdtempSync(join(tmpdir(),'visser-kanban-public-'));try{writeFileSync(join(dir,'index.md'),`---${frontmatter}---\n\n{% mermaid id="figure" title="Kanban" question="What changes?" %}\n\n\`\`\`mermaid\n${source}\`\`\`\n{% /mermaid %}\n`);const bundle=loadBundle(join(dir,'index.md'));expect(bundle.diagnostics.filter(d=>d.severity==='error')).toEqual([]);const output=await compileDocument(bundle,{version:'0.0.0',sha256:'a'.repeat(64),integrity:{'mermaid.js':'sha384-TESTDIGEST'}},{audience:'private',includeSource:false,layoutFallback:false});return {bundle,doc:new JSDOM(new TextDecoder().decode(output.files.find(file=>file.path.endsWith('/index.html'))!.bytes)).window.document};}finally{rmSync(dir,{recursive:true,force:true});}}
it('admits Kanban math publicly with copied field owners and original TeX', async () => {
  const source = String.raw`kanban
col["Header $$head$$"]
  card["Card $$\begin{matrix}a\\b\end{matrix}$$"]@{ticket: "$$ticket$$", assigned: "$$assigned$$"}
col["Duplicate $$second$$"]
`;
  const {bundle,doc}=await compiled(source);
  const figure:any=bundle.model.mermaid.get('figure');
  const element=doc.querySelector('#x-figure')!;
  expect(figure.kanbanMath.total.occurrences).toBe(14);
  expect(element.hasAttribute('data-vs-mermaid-math')).toBe(true);
  const map=JSON.parse(element.getAttribute('data-vs-mermaid-source-map')!);
  expect(map.format).toBe('kanban');
  expect(map.labels).toHaveLength(14);
  expect(new Set(map.labels.map((label:any)=>label.key)).size).toBe(14);
  for(const label of map.labels)for(const expression of label.expressions)
    expect(map.source.slice(expression.start,expression.end)).toBe(expression.rawSource);
});
it('keeps hidden authored math validated without claiming a visible owner', async () => {
  const {bundle,doc}=await compiled('kanban\ncol[Plain]\n  card["$$hidden$$"]@{label: "Plain override"}\n');
  const figure:any=bundle.model.mermaid.get('figure');
  expect(figure.kanbanMath.total.occurrences).toBe(1);
  expect(JSON.parse(doc.querySelector('#x-figure')!.getAttribute('data-vs-mermaid-source-map')!))
    .toMatchObject({format:'kanban',labels:[]});
});
