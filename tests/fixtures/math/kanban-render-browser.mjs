import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {parseMermaid} from '../../../packages/core/src/mermaid/parse.ts';
import {kanbanMathSourceMap} from '../../../packages/core/src/mermaid/kanban-source-map.ts';

const tall=String.raw`$$\begin{matrix}a\\b\\c\end{matrix}$$`;
const fraction=String.raw`$$\frac{1}{\frac{2}{3}}$$`;
const wide=String.raw`$$\text{abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz}$$`;
const source=`kanban\na["Head ${fraction}"]\n  i["Title ${tall}"]@{ticket: ${JSON.stringify(fraction)}, assigned: ${JSON.stringify(wide)}}\na[Other]\n  j[Plain card]@{assigned: "$$z$$"}\n`;
const result=parseMermaid([{figureId:'kanban-browser',source,originalSource:source,type:'other',kanban:true}]).get('kanban-browser');
assert.equal(result?.ok,true,JSON.stringify(result));
const sourceMap=kanbanMathSourceMap({source,mathBodyStartByte:0,kanbanMath:result.kanbanMath},new TextEncoder().encode(source));
const binder=await build({entryPoints:[resolve('packages/runtime/src/mermaid-source.ts')],bundle:true,write:false,format:'iife',globalName:'VisserKanbanSource',platform:'browser',logLevel:'silent'});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),network=[];
 await page.route('**/*',route=>{network.push(route.request().url());return route.abort();});
 await page.setContent('<!doctype html><main></main>');
 await page.addScriptTag({path:resolve('dist/release/browser/mermaid.js')});
 await page.addScriptTag({content:binder.outputFiles[0].text});
 const resultsByViewport=[];
 for(const viewportWidth of [1440,320]){
  await page.setViewportSize({width:viewportWidth,height:1000});
  const results=await page.evaluate(async({source,sourceMap,viewportWidth})=>{
  const m=window.mermaid,rows=[];
  const check=(condition,message)=>{if(!condition)throw new Error(message);};
  const contains=(outer,inner,tolerance=1)=>inner.left>=outer.left-tolerance&&inner.top>=outer.top-tolerance&&inner.right<=outer.right+tolerance&&inner.bottom<=outer.bottom+tolerance;
  for(const htmlLabels of [true,false])for(const look of ['classic','handDrawn']){
   m.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels,look,mindmap:{useMaxWidth:false},kanban:{useMaxWidth:false}});
   const id=`kanbanMath${viewportWidth}${htmlLabels}${look}`,out=await m.render(id,source);
   const figure=document.createElement('figure'),render=document.createElement('div'),pre=document.createElement('pre'),code=document.createElement('code');
   figure.setAttribute('data-vs-mermaid-source-map',JSON.stringify(sourceMap));render.setAttribute('data-vs-mermaid-render','');render.innerHTML=out.svg;pre.className='vs-mermaid-source';code.textContent=sourceMap.source;pre.append(code);figure.append(render,pre);document.body.append(figure);
   const svg=render.querySelector('svg');window.VisserKanbanSource.bindMermaidSource(figure,svg);
   const cards=[...svg.querySelectorAll('[data-vs-kanban-card]')],columns=[...svg.querySelectorAll('[data-vs-kanban-column]')];
   check(cards.length===8&&columns.length===2,`copy count ${cards.length}/${columns.length}`);
   const ids=[...svg.querySelectorAll('[id]')].map(node=>node.id);check(new Set(ids).size===ids.length,'duplicate DOM ids');
   const labels=[...svg.querySelectorAll('[data-vs-mermaid-label]')];
   check(new Set(labels.map(node=>node.getAttribute('data-vs-mermaid-label'))).size===labels.length,'duplicate field keys');
   let formulas=0;
   for(const shape of [...cards,...columns]){
    const outline=shape.querySelector('[data-vs-kanban-outline]');check(outline,'missing outline');
    const bounds=outline.getBoundingClientRect();
    for(const label of shape.querySelectorAll('[data-vs-mermaid-label]'))for(const formula of label.querySelectorAll('[data-vs-mermaid-formula]')){
     formulas++;
     for(const descendant of [formula,...formula.querySelectorAll('*')]){
      const rect=descendant.getBoundingClientRect();if(rect.width&&rect.height)check(contains(bounds,rect),`formula overflow ${shape.getAttribute('data-vs-kanban-card')??shape.getAttribute('data-vs-kanban-column')} ${descendant.tagName}`);
     }
     const range=document.createRange();range.selectNodeContents(formula);const selection=window.VisserKanbanSource.mermaidSourceSelection(range);
     check(selection.kind==='source'&&selection.range.toString().includes('$$'),'source selection differs');
    }
   }
   for(const card of cards){
    const ticket=card.querySelector('[data-vs-mermaid-label$=":ticket"]'),assigned=card.querySelector('[data-vs-mermaid-label$=":assigned"]');
    if(ticket&&assigned&&ticket.textContent&&assigned.textContent)check(ticket.getBoundingClientRect().right<=assigned.getBoundingClientRect().left+1,'metadata overlaps');
   }
   const columnBounds=columns.map(node=>node.querySelector('[data-vs-kanban-outline]').getBoundingClientRect());
   check(columnBounds[0].right<=columnBounds[1].left+1,'columns overlap');
   for(let section=0;section<2;section++){
    const matching=cards.filter(node=>node.getAttribute('data-vs-kanban-card').startsWith(`kanban-render:${section}:`));
    let bottom=-Infinity;for(const card of matching){const rect=card.getBoundingClientRect();check(rect.top>=bottom-1,'cards overlap');check(contains(columnBounds[section],rect),'card outside column');bottom=rect.bottom;}
   }
   const root=svg.getBoundingClientRect();for(const formula of svg.querySelectorAll('[data-vs-mermaid-formula]'))check(contains(root,formula.getBoundingClientRect()),'formula outside viewport');
   check(m.mermaidAPI.getConfig().htmlLabels===htmlLabels,'configuration changed');
   check(!svg.querySelector('[data-vs-kanban-stage]'),'stage leaked');
   rows.push({htmlLabels,look,cards:cards.length,columns:columns.length,formulas});
   if(viewportWidth===320&&htmlLabels&&look==='classic')figure.setAttribute('data-vs-kanban-representative','');else figure.remove();
  }
  // Failure must leave later renders usable, with no stale stage/context.
  const descriptor=Object.getOwnPropertyDescriptor(window,'MathMLElement');
  let failed=false;
  try{Object.defineProperty(window,'MathMLElement',{value:undefined,configurable:true});await m.render(`kanbanFail${viewportWidth}`,source);}catch{failed=true;}finally{if(descriptor)Object.defineProperty(window,'MathMLElement',descriptor);else delete window.MathMLElement;}
  check(failed,'measurement failure did not reject');check(!document.querySelector('[data-vs-kanban-stage]'),'failed stage leaked');
  const recovered=await m.render(`kanbanRecovered${viewportWidth}`,source);check(recovered.svg.includes('data-vs-kanban-card'),'recovery failed');
  const plain=await m.render(`kanbanPlain${viewportWidth}`,'kanban\nc[Column]\n  i[Card]\n');check(!plain.svg.includes('data-vs-kanban-card'),'plain path changed');
  return {viewportWidth,rows,recovered:true,plainNative:true};
 },{source,sourceMap,viewportWidth});
  resultsByViewport.push(results);
 }
 await page.locator('[data-vs-kanban-representative] [data-vs-mermaid-render]').screenshot({path:resolve('reports/math/kanban-render.png')});
 assert.equal(network.length,0);console.log(JSON.stringify({resultsByViewport,networkAttempts:network.length}));
}finally{await browser.close();}
