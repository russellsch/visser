import assert from 'node:assert/strict';
import DOMPurify from 'dompurify';
import {JSDOM} from 'jsdom';
import {normalizeERDisplayField} from '../../../packages/core/src/mermaid/er-display-normalize.ts';
import {ProvenanceText} from '../../../packages/core/src/mermaid/source-provenance.ts';
const window=new JSDOM('').window,purifier=DOMPurify(window);
Object.assign(DOMPurify,{sanitize:purifier.sanitize,addHook:purifier.addHook});
const mermaid=(await import('mermaid')).default;
const {sanitizeText,getConfig}=await import('../../../node_modules/mermaid/dist/chunks/mermaid.core/chunk-O7XYJQB3.mjs');
const {decodeEntities}=await import('../../../node_modules/mermaid/dist/chunks/mermaid.core/chunk-ZIGJFQKS.mjs');
const {diagram}=await import('../../../node_modules/mermaid/dist/chunks/mermaid.core/erDiagram-OPXOYQCR.mjs');
mermaid.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels:true});
sanitizeText('prepare-native-hooks',getConfig());
const corpus=['','plain','$$x<y$$','$$a&amp;amp;b$$','ﬂ°lt¶ß $$xﬂ°amp¶ßy$$','<b>bold</b><br>$$x$$','<script>removed</script>$$x$$','<a target="_blank" href="https://example.test">$$x$$</a>',String.raw`Map~$$a,b~c$$~ $$\begin{matrix}a&b\\c&d\end{matrix}$$`];
let cases=0;
for(const htmlLabels of [false,true])for(const path of ['simple-header','table','edge','group-cluster','group-node','raw-cluster'])for(const raw of corpus) {
 mermaid.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels});
 let input=raw;
 if(path.startsWith('group-')){const db=diagram.db;db.addSubGraph({text:'g'},[],{text:raw});input=db.getSubGraphs()[0].title;}
 const nativeInput=path==='simple-header'||path==='group-node'?sanitizeText(decodeEntities(input),getConfig()):input;
 const actual=await normalizeERDisplayField(ProvenanceText.identity(input),path,htmlLabels);
 assert.equal(actual.nativeInput.text,nativeInput,`${path}/${htmlLabels}/${raw}`);
 assert.equal(actual.stages.length,path==='simple-header'||path==='group-node'?3:1);
 cases++;
}
window.close();console.log(JSON.stringify({cases}));
