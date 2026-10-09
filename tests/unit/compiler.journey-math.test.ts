import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
// @ts-expect-error jsdom is supplied by the test harness without declarations.
import { JSDOM } from 'jsdom';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { compileDocument } from '../../packages/core/src/compiler/compile.ts';
const frontmatter=readFileSync(new URL('../../examples/bounded-queue/index.md',import.meta.url),'utf8').split('---')[1];
it('exports journey source owners through the public compiler',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'visser-journey-public-'));
 try {
  const source='journey\ntitle Title $$x$$\naccTitle: $$accessible$$\nsection Section $$s$$\nTask $$x$$: 2: 10, 2, Actor $$a$$\nAgain $$x$$: 4: Actor $$a$$\n';
  writeFileSync(join(dir,'index.md'),`---${frontmatter}---\n\n{% mermaid id="figure" title="Journey" question="What changes?" %}\nTasks explain the journey.\n\n\`\`\`mermaid\n${source}\`\`\`\n{% /mermaid %}\n`);
  const bundle=loadBundle(join(dir,'index.md'));
  expect(bundle.diagnostics.filter(d=>d.severity==='error')).toEqual([]);
  expect(bundle.model.mermaid.get('figure')!.journeyMath?.total.occurrences).toBe(7);
  const compiled=await compileDocument(bundle,{version:'0.0.0',sha256:'a'.repeat(64),integrity:{'mermaid.js':'sha384-TESTDIGEST'}},{audience:'private',includeSource:false,layoutFallback:false});
  const html=new TextDecoder().decode(compiled.files.find(file=>file.path.endsWith('/index.html'))!.bytes);
  const doc=new JSDOM(html).window.document,element=doc.querySelector('#x-figure')!;
  expect(element.hasAttribute('data-vs-mermaid-math')).toBe(true);
  const map=JSON.parse(element.getAttribute('data-vs-mermaid-source-map')!);
  expect(map.format).toBe('journey');
  expect(map.source).toBe(element.querySelector('.vs-mermaid-source code').textContent);
  expect(map.labels.map((label:any)=>label.key).sort()).toEqual(['actor:2','section:0','task:0','task:1','title']);
  for(const label of map.labels) for(const expression of label.expressions) {
   expect(expression.unrepresentable).toBeUndefined();
   expect(map.source.slice(expression.start,expression.end)).toBe(expression.rawSource);
  }
 } finally {rmSync(dir,{recursive:true,force:true});}
});
