// Browser proof for the native ER table hook. It binds fields by the explicit
// native request contract; the assertions never infer a source slot from SVG.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {mermaidMathPlugin} from '../../../scripts/mermaid-build.mjs';

const root=resolve('.');
const built=await build({stdin:{contents:`import mermaid from 'mermaid'; import {withERLayoutHooks} from './packages/runtime/src/mermaid-er-context.ts'; import {erMathText} from './packages/core/src/mermaid/er-text.ts'; window.erTableProbe={mermaid,withERLayoutHooks,erMathText};`,resolveDir:root},bundle:true,format:'iife',platform:'browser',write:false,minify:true,logLevel:'warning',plugins:[mermaidMathPlugin(root)]});
const bundle=built.outputFiles[0].text,bundleSha256=createHash('sha256').update(bundle).digest('hex');
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage(),requests=[];
 await page.route('**/*',route=>{requests.push(route.request().url());return route.abort();});
 await page.setContent('<!doctype html><style>svg{font:16px sans-serif}text{font:16px sans-serif}</style><main></main>');
 await page.addScriptTag({content:bundle});
 const result=await page.evaluate(async()=>{
  const {mermaid,withERLayoutHooks,erMathText}=window.erTableProbe;
  // The quoted alias is the native ER form that retains delimiters in header
  // input. The two matching comments prove slots are identities, not text.
  const header=String.raw`$$\frac{1}{h}$$`;
  const fraction=value=>String.raw`$$\frac{1}{${value}}$$`;
  const source=`erDiagram
A["${header}"] {
 string plain
 int first "${fraction('x')}"
 bool second "${fraction('x')}"
}
`;
  const expectedFields=['header','row:0:type','row:0:name','row:0:keys','row:0:comment','row:1:type','row:1:name','row:1:keys','row:1:comment','row:2:type','row:2:name','row:2:keys','row:2:comment'];
  const expectedInputs=[header,'string','plain','','','int','first','',fraction('x'),'bool','second','',fraction('x')];
  const runs=[];
  const rect=node=>{const box=node.getBoundingClientRect();return {left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:box.width,height:box.height};};
  for(const layout of ['elk','dagre'])for(const htmlLabels of [true,false])for(const look of ['default','handDrawn']){
   mermaid.initialize({startOnLoad:false,securityLevel:'strict',layout,htmlLabels,look});
   const diagram=await mermaid.mermaidAPI.getDiagramFromText(source),id=`er-table-${layout}-${htmlLabels}-${look}`;
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.id=id;svg.append(document.createElementNS(svg.namespaceURI,'g'));document.body.append(svg);
   const calls=[];let graphCalls=0,prepareCalls=0,resolvedLayout;
   await withERLayoutHooks(svg,{graph(data){graphCalls++;resolvedLayout=data.layoutAlgorithm;},async prepare(){prepareCalls++;},field(request){
    calls.push({node:request.node,field:request.field,copy:request.copy,path:request.path,input:request.input});
    return {key:`${request.copy}:${request.field}`,canonical:erMathText(request.input,'table')};
   }},()=>diagram.render(id,'probe'));
   const nodeIds=new Set(calls.map(call=>call.node));
   const labels=[...svg.querySelectorAll('[data-vs-mermaid-label]')];
   const foreignObjects=[...svg.querySelectorAll('foreignObject')];
   const formulaObjects=foreignObjects.filter(node=>node.querySelector('math'));
   const mathElements=[...svg.querySelectorAll('math')];
   const contains=(container,box)=>box.left>=container.left-1&&box.right<=container.right+1&&box.top>=container.top-1&&box.bottom<=container.bottom+1;
   const fits=formulaObjects.every(object=>{
    const label=object.parentElement,table=label.parentElement,outline=table.querySelector(':scope > .outer-path');
    const box=rect(object);return outline&&box.width>0&&box.height>0&&contains(rect(outline),box);
   });
   const copies=look==='handDrawn'?['background','foreground']:['single'];
   const geometry=copies.map(copy=>{
    const byField=field=>labels.find(label=>label.getAttribute('data-vs-mermaid-label')===`${copy}:${field}`);
    const table=byField('header').parentElement;
    const backgrounds=[...table.querySelectorAll(':scope > .row-rect-odd,:scope > .row-rect-even')].map(rect);
    const rows=[0,1,2].map(index=>['type','name','keys','comment'].map(field=>byField(`row:${index}:${field}`)).filter(label=>label.textContent).map(rect));
    const intervals=rows.map(row=>({top:Math.min(...row.map(box=>box.top)),bottom:Math.max(...row.map(box=>box.bottom))}));
    return {
     rowsNonOverlapping:intervals.slice(1).every((box,index)=>box.top>=intervals[index].bottom-1),
     columnsNonOverlapping:rows.every(row=>row.slice(1).every((box,index)=>row[index].right<=box.left+1)),
     rowsContained:backgrounds.length===3&&rows.every((row,index)=>row.every(box=>contains(backgrounds[index],box))),
    };
   });
   const rowsNonOverlapping=geometry.every(row=>row.rowsNonOverlapping),columnsNonOverlapping=geometry.every(row=>row.columnsNonOverlapping),rowsContained=geometry.every(row=>row.rowsContained);
   const expectedCalls=copies.flatMap(copy=>expectedFields.map((field,index)=>({copy,field,path:'table',input:expectedInputs[index]})));
   const callMatch=JSON.stringify(calls.map(({copy,field,path,input})=>({copy,field,path,input})))===JSON.stringify(expectedCalls);
   const keyMatch=JSON.stringify(labels.map(label=>label.getAttribute('data-vs-mermaid-label')).sort())===JSON.stringify(expectedCalls.map(call=>`${call.copy}:${call.field}`).sort());
   runs.push({layout,resolvedLayout,htmlLabels,look,graphCalls,prepareCalls,calls:calls.map(({field,copy,path,input})=>({field,copy,path,input})),nodeCount:nodeIds.size,labelKeys:labels.map(label=>label.getAttribute('data-vs-mermaid-label')),mathElements:mathElements.length,mathObjects:formulaObjects.length,fits,rowsNonOverlapping,columnsNonOverlapping,rowsContained,callMatch,keyMatch,fractions:svg.querySelectorAll('mfrac').length});
   svg.remove();
  }
  // Field callback errors must poison the current stage; cleanup still allows
  // a new native rendering on the same attached SVG root.
  mermaid.initialize({startOnLoad:false,securityLevel:'strict',layout:'elk',htmlLabels:true,look:'default'});
  const diagram=await mermaid.mermaidAPI.getDiagramFromText(source),svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.id='er-table-recovery';svg.append(document.createElementNS(svg.namespaceURI,'g'));document.body.append(svg);
  let failure='';try{await withERLayoutHooks(svg,{graph(){},async prepare(){},field(){throw new Error('injected field callback failure');}},()=>diagram.render(svg.id,'probe'));}catch(error){failure=String(error);}
  svg.replaceChildren(document.createElementNS(svg.namespaceURI,'g'));let recovered=0;
  await withERLayoutHooks(svg,{graph(){},async prepare(){},field(request){recovered++;return {key:`recovery:${request.field}`,canonical:erMathText(request.input,'table')};}},()=>diagram.render(svg.id,'probe'));
  svg.remove();
  // With no context the patched native renderer stays an ordinary ER draw.
  const plain=await mermaid.render('er-table-inactive','erDiagram\nA[Plain] {\n string field\n}\n');
  return {runs,failure,recovered,plain:plain.svg.includes('Plain')&&plain.svg.includes('field')};
 });
 const fields=['header','row:0:type','row:0:name','row:0:keys','row:0:comment','row:1:type','row:1:name','row:1:keys','row:1:comment','row:2:type','row:2:name','row:2:keys','row:2:comment'];
 for(const run of result.runs){
  const copies=run.look==='handDrawn'?['background','foreground']:['single'];
  assert.equal(run.resolvedLayout,run.layout);assert.equal(run.graphCalls,1);assert.equal(run.prepareCalls,1);assert.equal(run.nodeCount,copies.length);
  assert.deepEqual(run.calls.map(call=>call.copy),copies.flatMap(copy=>fields.map(()=>copy)));
  assert.deepEqual(run.calls.map(call=>call.field),copies.flatMap(()=>fields));
  assert.ok(run.calls.every(call=>call.path==='table'));
  assert.equal(run.callMatch,true);assert.equal(run.keyMatch,true);assert.equal(run.fractions,copies.length*3);
  assert.equal(run.mathElements,copies.length*3);assert.equal(run.mathObjects,copies.length*3);
  assert.equal(run.fits,true);assert.equal(run.rowsNonOverlapping,true);assert.equal(run.columnsNonOverlapping,true);assert.equal(run.rowsContained,true);
 }
 assert.equal(result.runs.length,8);assert.match(result.failure,/injected field callback failure/);assert.equal(result.recovered,fields.length);assert.equal(result.plain,true);assert.deepEqual(requests,[]);
 console.log(JSON.stringify({bundleSha256,browser:browser.version(),runs:result.runs.map(({calls,...run})=>({...run,fieldCount:calls.length})),recovery:{failure:result.failure,recovered:result.recovered,plain:result.plain},networkAttempts:requests.length}));
}finally{await browser.close();}
