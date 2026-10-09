import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it} from 'vitest';
// @ts-expect-error jsdom is supplied by the test harness without declarations.
import {JSDOM} from 'jsdom';
import {loadBundle} from '../../packages/core/src/model/bundle.ts';
import {compileDocument} from '../../packages/core/src/compiler/compile.ts';
const frontmatter=readFileSync(new URL('../../examples/bounded-queue/index.md',import.meta.url),'utf8').split('---')[1];
async function compiled(source:string){const dir=mkdtempSync(join(tmpdir(),'visser-requirement-public-'));try{writeFileSync(join(dir,'index.md'),`---${frontmatter}---\n\n{% mermaid id="figure" title="Requirement" question="What changes?" %}\n\n\`\`\`mermaid\n${source}\`\`\`\n{% /mermaid %}\n`);const bundle=loadBundle(join(dir,'index.md'));expect(bundle.diagnostics.filter(d=>d.severity==='error')).toEqual([]);const output=await compileDocument(bundle,{version:'0.0.0',sha256:'a'.repeat(64),integrity:{'mermaid.js':'sha384-TESTDIGEST'}},{audience:'private',includeSource:false,layoutFallback:false});return {bundle,doc:new JSDOM(new TextDecoder().decode(output.files.find(file=>file.path.endsWith('/index.html'))!.bytes)).window.document};}finally{rmSync(dir,{recursive:true,force:true});}}
it('admits Requirement math publicly and maps visible row owners',async()=>{const source=String.raw`requirementDiagram
requirement req {
 id: "$$id$$"
 text: "$$\begin{matrix}a\\b\end{matrix}$$"
 risk: high
 verifyMethod: inspection
}
element impl {
 type: "$$type$$"
 docRef: "$$doc$$"
}
`;const {bundle,doc}=await compiled(source),figure:any=bundle.model.mermaid.get('figure'),element=doc.querySelector('#x-figure')!;expect(figure.requirementMath.total.occurrences).toBe(4);expect(element.hasAttribute('data-vs-mermaid-math')).toBe(true);const map=JSON.parse(element.getAttribute('data-vs-mermaid-source-map')!);expect(map).toMatchObject({format:'requirement'});expect(map.labels.map((label:any)=>label.key)).toEqual(['requirement:0:id','requirement:0:text','element:0:type','element:0:docRef']);for(const label of map.labels)for(const expression of label.expressions)expect(map.source.slice(expression.start,expression.end)).toBe(expression.rawSource);});
it('emits an empty Requirement source map for metadata-only and hidden duplicate math',async()=>{const source='requirementDiagram\naccTitle: $$access$$\naccDescr: $$description$$\nrequirement req {\n text: plain\n}\nrequirement req {\n text: "$$hidden$$"\n}\n', {bundle,doc}=await compiled(source),figure:any=bundle.model.mermaid.get('figure'),element=doc.querySelector('#x-figure')!;expect(figure.requirementMath.total.occurrences).toBe(3);expect(JSON.parse(element.getAttribute('data-vs-mermaid-source-map')!)).toMatchObject({format:'requirement',labels:[]});});
