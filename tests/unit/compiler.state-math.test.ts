import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
// @ts-expect-error jsdom is supplied by the test harness without declarations.
import { JSDOM } from 'jsdom';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { compileDocument } from '../../packages/core/src/compiler/compile.ts';
const frontmatter=readFileSync(new URL('../../examples/bounded-queue/index.md',import.meta.url),'utf8').split('---')[1];
it.each(['stateDiagram','stateDiagram-v2'])('exports all state label paths through the public %s compiler',async declaration=>{
 const dir=mkdtempSync(join(tmpdir(),'visser-state-public-'));
 try {
  const source=`${declaration}\naccTitle: $$accessible$$\naccDescr: $$description$$\nstate "Title $$x < y$$" as A\nA: Body $$b$$\nstate "Single $$s$$" as B\nnote right of A: Note $$n$$\nA --> B: Edge $$e$$\nB: <br/> ﬂ°dollar¶ßﬂ°dollar¶ßencodedﬂ°dollar¶ßﬂ°dollar¶ß\nclass A vsﬂ°°45¶ßselected\n`;
  // Keep encoded math in a separate scalar path; title/body paths deliberately
  // do not perform the native labelHelper sentinel decoder.
  const actual=source.replace('B: <br/>','C: <br/>');
  const body=`---${frontmatter}---\n\n{% mermaid id="figure" title="State" question="What changes?" %}\nState labels explain the transitions.\n\n\`\`\`mermaid\n${actual}\`\`\`\n{% /mermaid %}\n`;
  writeFileSync(join(dir,'index.md'),body);
  const bundle=loadBundle(join(dir,'index.md'));
  expect(bundle.diagnostics.filter(d=>d.severity==='error')).toEqual([]);
  const figure=bundle.model.mermaid.get('figure')!;
  expect(figure.stateMath?.total.occurrences).toBe(8);
  const compiled=await compileDocument(bundle,{version:'0.0.0',sha256:'a'.repeat(64),integrity:{'mermaid.js':'sha384-TESTDIGEST'}},{audience:'private',includeSource:false,layoutFallback:false});
  const html=new TextDecoder().decode(compiled.files.find(file=>file.path.endsWith('/index.html'))!.bytes);
  const doc=new JSDOM(html).window.document,element=doc.querySelector('#x-figure')!;
  expect(element.hasAttribute('data-vs-mermaid-math')).toBe(true);
  const slots=JSON.parse(element.getAttribute('data-vs-mermaid-state-slots')!);
  const map=JSON.parse(element.getAttribute('data-vs-mermaid-source-map')!);
  expect(map.format).toBe('state');
  expect(map.source).toBe(element.querySelector('.vs-mermaid-source code').textContent);
  expect(slots.flatMap((slot:any)=>slot.formulas).sort()).toEqual(['b','e','encoded','n','s','x < y']);
  expect(map.labels.map((label:any)=>label.key).sort()).toEqual(slots.map((slot:any)=>slot.key).sort());
  for(const label of map.labels) for(const expression of label.expressions) {
   expect(expression.unrepresentable).toBeUndefined();
   expect(map.source.slice(expression.start,expression.end)).toBe(expression.rawSource);
  }
 } finally {rmSync(dir,{recursive:true,force:true});}
});
