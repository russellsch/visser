import assert from 'node:assert/strict';
import DOMPurify from 'dompurify';
import {JSDOM} from 'jsdom';
import {normalizeERDbField} from '../../../packages/core/src/mermaid/er-db-normalize.ts';
import {ProvenanceText} from '../../../packages/core/src/mermaid/source-provenance.ts';
const window=new JSDOM('').window,purifier=DOMPurify(window);
Object.assign(DOMPurify,{sanitize:purifier.sanitize,addHook:purifier.addHook});
const mermaid=(await import('mermaid')).default;
const {sanitizeText,getConfig}=await import('../../../node_modules/mermaid/dist/chunks/mermaid.core/chunk-O7XYJQB3.mjs');
const {diagram}=await import('../../../node_modules/mermaid/dist/chunks/mermaid.core/erDiagram-OPXOYQCR.mjs');
// The private witness purifier includes the native link hooks. The later ER
// lifecycle contract must prepare those same hooks before SVG-only parsing.
mermaid.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels:true});
sanitizeText('<a target="_blank" href="https://example.test">prepare</a>',getConfig());
const corpus=['','plain','  Group <b>x</b>  ',' \t\u00a0 ','a\n\n\u00a0b\r\n\t c','$$x<y$$',String.raw`$$\begin{matrix}a&b\\c&d\end{matrix}$$`,'<script>$$bad$$</script>safe','<style>x</style><br>$$x$$','<a href="https://example.test" target="_blank">$$x$$</a>','$$x&amp;y$$'];
let cases=0;
for(const htmlLabels of [false,true])for(const raw of corpus)for(const role of ['subgraph.title','accTitle','accDescr']) {
 mermaid.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels});
 const db=diagram.db; // This clears shared common metadata; capture immediately.
 let actual;
 if(role==='subgraph.title'){db.addSubGraph({text:' g '},[],{text:raw});actual=db.getSubGraphs().at(-1).title;}
 else if(role==='accTitle'){db.setAccTitle(raw);actual=db.getAccTitle();}
 else{db.setAccDescription(raw);actual=db.getAccDescription();}
 const field=await normalizeERDbField(ProvenanceText.identity(raw),role,htmlLabels);
 assert.equal(field.dbValue.text,actual,`${role} htmlLabels=${htmlLabels}: ${JSON.stringify(raw)}`);
 cases++;
}
window.close();console.log(JSON.stringify({cases,nativeHooksPrepared:true}));
