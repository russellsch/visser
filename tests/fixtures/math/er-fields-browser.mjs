import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {mermaidMathPlugin} from '../../../scripts/mermaid-build.mjs';
const root=resolve('.');
const compiled=await build({stdin:{contents:`import mermaid from 'mermaid';import {withERRenderStage} from './packages/runtime/src/mermaid-er-stage.ts';import {createERStagePlan} from './packages/runtime/src/mermaid-er-plan.ts';import {withERLayoutHooks} from './packages/runtime/src/mermaid-er-context.ts';import {erMathText} from './packages/core/src/mermaid/er-text.ts';import {tagERLayoutOwners,observeERLayoutOwners,ER_LAYOUT_OWNER} from './packages/core/src/mermaid/er-layout-owners.ts';import {enumerateERElkSlots,enumerateERDagreSlots} from './packages/core/src/mermaid/er-slots.ts';window.probe={withERRenderStage,createERStagePlan,mermaid,withERLayoutHooks,erMathText,tagERLayoutOwners,observeERLayoutOwners,ER_LAYOUT_OWNER,enumerateERElkSlots,enumerateERDagreSlots};`,resolveDir:root},bundle:true,platform:'browser',format:'iife',write:false,minify:true,logLevel:'warning',plugins:[mermaidMathPlugin(root)]});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage(),requests=[];
 await page.route('**/*',route=>{requests.push(route.request().url());return route.abort();});
 await page.setContent('<!doctype html><style>svg,text{font:16px sans-serif}</style>');await page.addScriptTag({content:compiled.outputFiles[0].text});
 const result=await page.evaluate(async()=>{
  const {withERRenderStage,createERStagePlan,mermaid,withERLayoutHooks,erMathText,tagERLayoutOwners,observeERLayoutOwners,ER_LAYOUT_OWNER,enumerateERElkSlots,enumerateERDagreSlots}=window.probe;
  const source=String.raw`erDiagram
subgraph g["$$\frac{1}{g}$$"]
 A["$$\frac{1}{a}$$"] {
  string field "$$\frac{1}{v}$$"
 }
 B["$$\frac{1}{b}$$"]
end
subgraph empty["$$\frac{1}{e}$$"]
end
A ||--|| B : "$$\frac{1}{r}$$"
A ||--|| A : "$$\frac{1}{s}$$"
`;
  const runs=[];
  for(const layout of ['elk','dagre'])for(const htmlLabels of [true,false])for(const look of ['default','handDrawn']){
   mermaid.initialize({startOnLoad:false,securityLevel:'strict',layout,htmlLabels,look});
   const diagram=await mermaid.mermaidAPI.getDiagramFromText(source),svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.id=`fields-${layout}-${htmlLabels}-${look}`;svg.append(document.createElementNS(svg.namespaceURI,'g'));document.body.append(svg);
   let resolved;const seen=new Set();
   const controller=createERStagePlan(svg,input=>input);
   const hooks={...controller.hooks,graph(data){resolved=data.layoutAlgorithm;controller.hooks.graph(data);},field(request){const plan=controller.hooks.field(request);seen.add(plan.key);return plan;}};
   await withERLayoutHooks(svg,hooks,()=>diagram.render(svg.id,'probe'));
   const slots=controller.finish();
   const rejectFinish=()=>{try{controller.finish();return false;}catch{return true;}};
   const firstLabel=svg.querySelector('[data-vs-mermaid-label]'),originalKey=firstLabel.getAttribute('data-vs-mermaid-label');
   firstLabel.setAttribute('data-vs-mermaid-label','forged');if(!rejectFinish())throw new Error('Accepted forged label');firstLabel.setAttribute('data-vs-mermaid-label',originalKey);
   const extra=document.createElementNS('http://www.w3.org/1998/Math/MathML','math');svg.append(extra);if(!rejectFinish())throw new Error('Accepted unowned formula');extra.remove();
   const temporary=document.createElementNS(svg.namespaceURI,'g');temporary.setAttribute('data-vs-er-measurement','leaked');svg.append(temporary);if(!rejectFinish())throw new Error('Accepted temporary measurement');temporary.remove();
   svg.remove();if(!rejectFinish())throw new Error('Accepted detached stage');document.body.append(svg);controller.finish();

   const labels=[...svg.querySelectorAll('[data-vs-mermaid-label]')],retained=slots.filter(slot=>slot.lifetime==='retained');
   const missing=slots.filter(slot=>!seen.has(slot.key)).map(slot=>slot.key);
   const labelKeys=labels.map(label=>label.getAttribute('data-vs-mermaid-label')).sort();
   const edgeMath=[...svg.querySelectorAll('.edgeLabels math')];
   const mathBounds=[...svg.querySelectorAll('math')].map(math=>{const box=math.getBoundingClientRect();return {width:box.width,height:box.height};});
   runs.push({layout,resolved,htmlLabels,look,missing,labelKeys,expected:retained.map(slot=>slot.key).sort(),math:svg.querySelectorAll('math').length,fractions:svg.querySelectorAll('mfrac').length,edgeMath:edgeMath.length,temporary:slots.filter(slot=>slot.lifetime==='measurement').length,remainingTemporary:svg.querySelectorAll('[data-vs-er-measurement]').length,mathBounds,paths:[...new Set(slots.map(slot=>slot.path))]});
   svg.remove();
   const target=document.createElementNS(svg.namespaceURI,'svg');target.id=svg.id+'-transaction';document.body.append(target);
   const fresh=await mermaid.mermaidAPI.getDiagramFromText(source);
   await withERRenderStage(target,input=>input,stage=>fresh.render(stage.id,'probe'));
   if(target.querySelectorAll('math').length!==(look==='handDrawn'?10:7)||target.querySelector('[data-vs-er-stage]'))throw new Error('Transactional commit differs');
   const second=await mermaid.mermaidAPI.getDiagramFromText(source);
   await withERRenderStage(target,input=>input,stage=>second.render(stage.id,'probe'));
   if(target.querySelectorAll('math').length!==(look==='handDrawn'?10:7))throw new Error('Successful rerender duplicated output');
   const committed=target.outerHTML;
   try{await withERRenderStage(target,input=>input,async stage=>{const failed=await mermaid.mermaidAPI.getDiagramFromText(source);await failed.render(stage.id,'probe');throw new Error('injected after native draw');});throw new Error('Expected failure');}catch(error){if(error.message!=='injected after native draw')throw error;}
   if(target.outerHTML!==committed)throw new Error('Failed render changed committed viewport');
   target.remove();
   const rendered=await mermaid.render(`public-${layout}-${htmlLabels}-${look}`,source);
   const parsed=new DOMParser().parseFromString(rendered.svg,'image/svg+xml');
   if(parsed.querySelectorAll('math').length!==(look==='handDrawn'?10:7)||parsed.querySelector('[data-vs-er-stage]'))throw new Error('Native renderer factory differs');
  }
  for(const layout of ['elk','dagre'])for(const endpoint of ['A','B']){
   mermaid.initialize({startOnLoad:false,securityLevel:'strict',layout});
   const diagram=await mermaid.mermaidAPI.getDiagramFromText(`erDiagram\nA ||--|| ${endpoint} : ""\n`);
   const target=document.createElementNS('http://www.w3.org/2000/svg','svg');target.id=`empty-${layout}-${endpoint}`;document.body.append(target);
   await withERRenderStage(target,input=>input,stage=>diagram.render(stage.id,'probe'));
   if(target.querySelectorAll('.edgeLabels [data-vs-mermaid-label]').length!==(layout==='dagre'?1:0))throw new Error('Empty role measurement differs');target.remove();
  }
  const plain=await mermaid.render('fields-plain','flowchart LR\nsubgraph g[Group]\n A[Plain] -->|Edge| B[Native]\nend\n');
  return {runs,plain:plain.svg.includes('Group')&&plain.svg.includes('Edge')};
 });
 for(const run of result.runs){
  assert.equal(run.resolved,run.layout);assert.deepEqual(run.missing,[]);assert.deepEqual(run.labelKeys,run.expected);assert.equal(run.labelKeys.length,run.look==='handDrawn'?16:10);
  const math=run.look==='handDrawn'?10:7;assert.equal(run.math,math);assert.equal(run.fractions,math);assert.equal(run.edgeMath,2);
  assert.equal(run.temporary,run.layout==='elk'?2:0);assert.equal(run.remainingTemporary,0);assert.ok(run.mathBounds.every(box=>box.width>0&&box.height>0));
  assert.deepEqual(run.paths.sort(),['edge','group-cluster','group-node','simple-header','table']);
 }
 assert.equal(result.plain,true);assert.deepEqual(requests,[]);console.log(JSON.stringify({browser:browser.version(),result,networkAttempts:requests.length}));
}finally{await browser.close();}
