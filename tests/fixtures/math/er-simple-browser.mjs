// Native simple-header measurements through the production build transforms.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {mermaidMathPlugin} from '../../../scripts/mermaid-build.mjs';
const root=resolve('.');
const built=await build({stdin:{contents:`import mermaid from 'mermaid';import {withERLayoutHooks} from './packages/runtime/src/mermaid-er-context.ts';import {erMathText} from './packages/core/src/mermaid/er-text.ts';window.probe={mermaid,withERLayoutHooks,erMathText};`,resolveDir:root},bundle:true,format:'iife',platform:'browser',write:false,minify:true,logLevel:'warning',plugins:[mermaidMathPlugin(root)]});
const bundle=built.outputFiles[0].text,browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage(),requests=[];
 await page.route('**/*',route=>{requests.push(route.request().url());return route.abort();});
 await page.setContent('<!doctype html><style>svg,text{font:16px sans-serif}</style>');await page.addScriptTag({content:bundle});
 const result=await page.evaluate(async()=>{
  const {mermaid,withERLayoutHooks,erMathText}=window.probe;
  const inputs=[String.raw`$$\frac{1}{x}$$`,'$$'+Array(35).fill('x').join('+')+'$$','Plain'];
  const source=`erDiagram\nA["${inputs[0]}"]\nB["${inputs[1]}"]\nC[Plain]\nA ||--|| B : role\nB ||--|| C : plain\n`;
  const runs=[];
  for(const layout of ['elk','dagre'])for(const htmlLabels of [true,false])for(const look of ['default','handDrawn']){
   mermaid.initialize({startOnLoad:false,securityLevel:'strict',layout,htmlLabels,look,er:{minEntityWidth:180}});
   const diagram=await mermaid.mermaidAPI.getDiagramFromText(source),svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.id=`simple-${layout}-${htmlLabels}-${look}`;svg.append(document.createElementNS(svg.namespaceURI,'g'));document.body.append(svg);
   const calls=[];let resolved;
   await withERLayoutHooks(svg,{graph(data){resolved=data.layoutAlgorithm;data.nodes.forEach((node,index)=>{node.__fixtureOwner=index;});},async prepare(){},field(request){
    const owner=request.node.__fixtureOwner;
    if(request.path!=='simple-header'||request.field!=='header'||request.input!==inputs[owner])throw new Error('Unexpected native simple field');
    const key=`${owner}:${request.copy}:header`;calls.push(key);return {key,canonical:erMathText(request.input,request.path)};
   }},()=>diagram.render(svg.id,'probe'));
   const copies=look==='handDrawn'?['background','foreground']:['single'];
   const labels=[...svg.querySelectorAll('[data-vs-mermaid-label]')];
   const geometry=labels.map(label=>{
    const key=label.getAttribute('data-vs-mermaid-label'),outline=label.parentElement.querySelector(':scope > .label-container');
    const shapeBox=outline.getBBox(),outlineBox=outline.getBoundingClientRect(),math=label.querySelector('math'),object=label.querySelector('foreignObject'),box=object?.getBoundingClientRect();
    return {key,width:shapeBox.width,math:!!math,contained:!math||(box.width>0&&box.height>0&&box.left>=outlineBox.left-1&&box.right<=outlineBox.right+1&&box.top>=outlineBox.top-1&&box.bottom<=outlineBox.bottom+1)};
   });
   runs.push({layout,resolved,htmlLabels,look,calls,expected:inputs.flatMap((_,owner)=>copies.map(copy=>`${owner}:${copy}:header`)),geometry,math:svg.querySelectorAll('math').length,fractions:svg.querySelectorAll('mfrac').length});svg.remove();
  }
  mermaid.initialize({startOnLoad:false,securityLevel:'strict',layout:'elk',htmlLabels:false});
  const plain=await mermaid.render('simple-native','erDiagram\nA[Plain]\n');
  return {runs,plain:plain.svg.includes('Plain')};
 });
 for(const run of result.runs){
  const copies=run.look==='handDrawn'?2:1;
  assert.equal(run.resolved,run.layout);assert.deepEqual([...run.calls].sort(),[...run.expected].sort());
  assert.deepEqual(run.geometry.map(row=>row.key).sort(),[...run.expected].sort());assert.equal(run.math,2*copies);assert.equal(run.fractions,copies);
  for(const row of run.geometry){assert.equal(row.contained,true,`${run.layout}/${run.htmlLabels}/${run.look}/${row.key}`);if(row.key.startsWith('0:')&&!row.key.includes(':foreground:'))assert.ok(Math.abs(row.width-180)<1,JSON.stringify(row));if(row.key.startsWith('1:'))assert.ok(row.width>500,JSON.stringify(row));}
 }
 assert.equal(result.runs.length,8);assert.equal(result.plain,true);assert.deepEqual(requests,[]);
 console.log(JSON.stringify({bundleSha256:createHash('sha256').update(bundle).digest('hex'),browser:browser.version(),result,networkAttempts:requests.length}));
}finally{await browser.close();}
