// Actual pinned native draw through the installed browser build plugin. This
// probes hook ordering/identity; it does not claim ER math rendering acceptance.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {mermaidMathPlugin} from '../../../scripts/mermaid-build.mjs';
const root=resolve('.');
const built=await build({stdin:{contents:`import mermaid from 'mermaid'; import {withERLayoutHooks} from './packages/runtime/src/mermaid-er-context.ts'; window.erProbe={mermaid,withERLayoutHooks};`,resolveDir:root},bundle:true,format:'iife',platform:'browser',write:false,minify:true,logLevel:'warning',plugins:[mermaidMathPlugin(root)]});
const bundle=built.outputFiles[0].text,bundleSha256=createHash('sha256').update(bundle).digest('hex');
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage(),requests=[];
 await page.route('**/*',route=>{requests.push(route.request().url());return route.abort();});
 await page.setContent('<!doctype html><style>svg{font:16px sans-serif}text{font:16px sans-serif}</style><main></main>');await page.addScriptTag({content:bundle});
 const result=await page.evaluate(async()=>{
  const {mermaid,withERLayoutHooks}=window.erProbe,runs=[];
  const source='erDiagram\nsubgraph g[Group]\n A[Header] {\n string field "Comment"\n }\nend\nA ||--|| B : Role\n';
  for(const layout of ['elk','dagre','not-registered'])for(const htmlLabels of [true,false]){
   mermaid.initialize({startOnLoad:false,securityLevel:'strict',layout,htmlLabels,look:'default'});
   const diagram=await mermaid.mermaidAPI.getDiagramFromText(source),id=`boundary-${layout}-${htmlLabels}`,svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.id=id;svg.append(document.createElementNS(svg.namespaceURI,'g'));document.body.append(svg);
   let graph,preparedKind,counts=[],calls=[];
   await withERLayoutHooks(svg,{graph(data){graph=data;calls.push('graph');counts.push(svg.querySelectorAll('.node,.edgeLabel,.cluster-label').length);},async prepare(data,prepared){
    if(data!==graph)throw new Error('graph identity differs');
    if(graph.layoutAlgorithm==='dagre'&&typeof prepared?.graph?.nodes!=='function')throw new Error('missing native Dagre graph');
    if(graph.layoutAlgorithm==='elk'&&(!prepared||!Object.hasOwn(prepared,'algorithm')))throw new Error('missing native ELK preparation');
    preparedKind=prepared.graph?'dagre':'elk';calls.push('prepare');
    await new Promise(resolve=>setTimeout(resolve,10));
    counts.push(svg.querySelectorAll('.node,.edgeLabel,.cluster-label').length);calls.push('ready');
   }},()=>diagram.render(id,'probe'));
   runs.push({layout,htmlLabels,resolved:graph.layoutAlgorithm,preparedKind,calls,counts,nodes:svg.querySelectorAll('.node').length,roles:[...svg.querySelectorAll('.edgeLabels > g.edgeLabel')].filter(node=>node.textContent.trim()==='Role').length});svg.remove();
  }
  // An active preparation failure must propagate before any node label exists;
  // context cleanup then permits a new native drawing on the same attached SVG.
  mermaid.initialize({startOnLoad:false,securityLevel:'strict',layout:'elk',htmlLabels:true});
  const diagram=await mermaid.mermaidAPI.getDiagramFromText('erDiagram\nA\n'),svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.id='boundary-recovery';svg.append(document.createElementNS(svg.namespaceURI,'g'));document.body.append(svg);
  let failure='';try{await withERLayoutHooks(svg,{graph(){},async prepare(){throw new Error('injected preparation failure');}},()=>diagram.render(svg.id,'probe'));}catch(error){failure=String(error);}
  const failedLabels=svg.querySelectorAll('.node,.edgeLabel,.cluster-label').length;
  svg.replaceChildren(document.createElementNS(svg.namespaceURI,'g'));
  await withERLayoutHooks(svg,{graph(){},async prepare(){}},()=>diagram.render(svg.id,'probe'));
  const recoveredNodes=svg.querySelectorAll('.node').length;svg.remove();
  // Native plain flowchart also traverses the patched shared boundary but has
  // no registered ER context and must remain functional.
  const plain=await mermaid.render('boundary-plain','flowchart LR\n A[Plain] --> B[Native]\n');
  return {runs,failure,failedLabels,recoveredNodes,plain:plain.svg.includes('Plain')&&plain.svg.includes('Native')};
 });
 for(const row of result.runs){assert.equal(row.resolved,row.layout==='not-registered'?'dagre':row.layout);assert.equal(row.preparedKind,row.resolved);assert.deepEqual(row.calls,['graph','prepare','ready']);assert.deepEqual(row.counts,[0,0]);assert.equal(row.nodes,2);assert.equal(row.roles,1);}
 assert.equal(result.runs.length,6);assert.match(result.failure,/injected preparation failure/);assert.equal(result.failedLabels,0);assert.equal(result.recoveredNodes,1);assert.equal(result.plain,true);assert.deepEqual(requests,[]);
 console.log(JSON.stringify({bundleSha256,browser:browser.version(),result,networkAttempts:requests.length}));
}finally{await browser.close();}
