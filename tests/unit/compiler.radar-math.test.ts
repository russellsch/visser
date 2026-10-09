import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it} from 'vitest';
// @ts-expect-error jsdom is supplied by the test harness without declarations.
import {JSDOM} from 'jsdom';
import {loadBundle} from '../../packages/core/src/model/bundle.ts';
import {compileDocument} from '../../packages/core/src/compiler/compile.ts';

const frontmatter=readFileSync(new URL('../../examples/bounded-queue/index.md',import.meta.url),'utf8').split('---')[1];
it.each(['radar-beta','radar-beta:','radar-beta :'])('exports visible %s source owners through the public compiler',async(family)=>{
 const dir=mkdtempSync(join(tmpdir(),'visser-radar-public-'));
 try{
  const source=family+'\ntitle $$t$$\naxis a["$$a$$"],b\ncurve c["$$c$$"]{1,2}\nshowLegend true\n';
  writeFileSync(join(dir,'index.md'),`---${frontmatter}---\n\n{% mermaid id="figure" title="Radar" question="What changes?" %}\nThe chart has measured labels.\n\n\`\`\`mermaid\n${source}\`\`\`\n{% /mermaid %}\n`);
  const bundle=loadBundle(join(dir,'index.md'));expect(bundle.diagnostics.filter(d=>d.severity==='error')).toEqual([]);expect(bundle.model.mermaid.get('figure')!.radarMath?.total.occurrences).toBe(3);
  const compiled=await compileDocument(bundle,{version:'0.0.0',sha256:'a'.repeat(64),integrity:{'mermaid.js':'sha384-TESTDIGEST'}},{audience:'private',includeSource:false,layoutFallback:false});
  const html=new TextDecoder().decode(compiled.files.find(file=>file.path.endsWith('/index.html'))!.bytes),doc=new JSDOM(html).window.document,element=doc.querySelector('#x-figure')!;
  expect(element.hasAttribute('data-vs-mermaid-math')).toBe(true);const map=JSON.parse(element.getAttribute('data-vs-mermaid-source-map')!);
  expect(map.format).toBe('radar');expect(map.source).toBe(element.querySelector('.vs-mermaid-source code').textContent);expect(map.labels.map((label:any)=>label.key).sort()).toEqual(['axis:0','curve:0','title']);
  for(const label of map.labels)for(const expression of label.expressions){expect(expression.unrepresentable).toBeUndefined();expect(map.source.slice(expression.start,expression.end)).toBe(expression.rawSource);}
 }finally{rmSync(dir,{recursive:true,force:true});}
});

it('keeps an empty public source map for overwritten and accessibility-only Radar math',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'visser-radar-empty-map-'));
 try{
  const source='radar-beta\ntitle $$old$$\ntitle\naccTitle: $$access$$\naccDescr: $$description$$\naxis a,b\ncurve c {1,2}\nshowLegend false\n';
  writeFileSync(join(dir,'index.md'),`---${frontmatter}---\n\n{% mermaid id="figure" title="Radar" question="What changes?" %}\n\n\`\`\`mermaid\n${source}\`\`\`\n{% /mermaid %}\n`);
  const bundle=loadBundle(join(dir,'index.md'));expect(bundle.diagnostics.filter(d=>d.severity==='error')).toEqual([]);expect(bundle.model.mermaid.get('figure')!.radarMath?.total.occurrences).toBe(3);
  const compiled=await compileDocument(bundle,{version:'0.0.0',sha256:'a'.repeat(64),integrity:{'mermaid.js':'sha384-TESTDIGEST'}},{audience:'private',includeSource:false,layoutFallback:false});
  const html=new TextDecoder().decode(compiled.files.find(file=>file.path.endsWith('/index.html'))!.bytes),element=new JSDOM(html).window.document.querySelector('#x-figure')!;
  expect(element.hasAttribute('data-vs-mermaid-math')).toBe(true);expect(JSON.parse(element.getAttribute('data-vs-mermaid-source-map')!)).toMatchObject({format:'radar',labels:[]});
 }finally{rmSync(dir,{recursive:true,force:true});}
});
