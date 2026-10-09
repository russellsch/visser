import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it} from 'vitest';
// @ts-expect-error jsdom is supplied by the test harness without declarations.
import {JSDOM} from 'jsdom';
import {loadBundle} from '../../packages/core/src/model/bundle.ts';
import {compileDocument} from '../../packages/core/src/compiler/compile.ts';

const frontmatter=readFileSync(new URL('../../examples/bounded-queue/index.md',import.meta.url),'utf8').split('---')[1];
it('exports visible xychart source owners through the public compiler',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'visser-xychart-public-'));
 try{
  const source='xychart\ntitle "$$t$$"\nx-axis "$$x$$" ["$$a$$","$$a$$"]\ny-axis "$$y$$" 0 --> 10\nline "$$series$$" [2 "$$p$$",8 "$$p$$"]\nbar "$$bar$$" [3,4]\n';
  writeFileSync(join(dir,'index.md'),`---${frontmatter}---\n\n{% mermaid id="figure" title="XY" question="What changes?" %}\nThe chart has measured labels.\n\n\`\`\`mermaid\n${source}\`\`\`\n{% /mermaid %}\n`);
  const bundle=loadBundle(join(dir,'index.md'));expect(bundle.diagnostics.filter(d=>d.severity==='error')).toEqual([]);expect(bundle.model.mermaid.get('figure')!.xyMath?.total.occurrences).toBe(9);
  const compiled=await compileDocument(bundle,{version:'0.0.0',sha256:'a'.repeat(64),integrity:{'mermaid.js':'sha384-TESTDIGEST'}},{audience:'private',includeSource:false,layoutFallback:false});
  const html=new TextDecoder().decode(compiled.files.find(file=>file.path.endsWith('/index.html'))!.bytes),doc=new JSDOM(html).window.document,element=doc.querySelector('#x-figure')!;
  expect(element.hasAttribute('data-vs-mermaid-math')).toBe(true);const map=JSON.parse(element.getAttribute('data-vs-mermaid-source-map')!);
  expect(map.format).toBe('xychart');expect(map.source).toBe(element.querySelector('.vs-mermaid-source code').textContent);expect(map.labels.map((label:any)=>label.key).sort()).toEqual(['category:0','category:1','point:0:0','point:0:1','series:0','series:1','title','xTitle','yTitle']);
  for(const label of map.labels)for(const expression of label.expressions){expect(expression.unrepresentable).toBeUndefined();expect(map.source.slice(expression.start,expression.end)).toBe(expression.rawSource);}
 }finally{rmSync(dir,{recursive:true,force:true});}
});

it('retains an empty public map for authored math in an ignored bar datum',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'visser-xychart-ignored-'));
 try{
  const source='xychart\nbar [3 "$$ignored$$"]\n';
  writeFileSync(join(dir,'index.md'),`---${frontmatter}---\n\n{% mermaid id="figure" title="XY" question="What changes?" %}\nIgnored datum ownership.\n\n\`\`\`mermaid\n${source}\`\`\`\n{% /mermaid %}\n`);
  const bundle=loadBundle(join(dir,'index.md'));expect(bundle.diagnostics.filter(d=>d.severity==='error')).toEqual([]);expect(bundle.model.mermaid.get('figure')!.xyMath?.total.occurrences).toBe(1);
  const compiled=await compileDocument(bundle,{version:'0.0.0',sha256:'a'.repeat(64),integrity:{'mermaid.js':'sha384-TESTDIGEST'}},{audience:'private',includeSource:false,layoutFallback:false});
  const html=new TextDecoder().decode(compiled.files.find(file=>file.path.endsWith('/index.html'))!.bytes),element=new JSDOM(html).window.document.querySelector('#x-figure')!,map=JSON.parse(element.getAttribute('data-vs-mermaid-source-map')!);
  expect(element.hasAttribute('data-vs-mermaid-math')).toBe(true);expect(map).toMatchObject({format:'xychart',labels:[]});
 }finally{rmSync(dir,{recursive:true,force:true});}
});
