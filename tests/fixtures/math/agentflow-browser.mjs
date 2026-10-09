import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {mermaidMathPlugin} from '../../../scripts/mermaid-build.mjs';
const compiled=await build({stdin:{contents:`import mermaid from 'mermaid';import {stampFlowchartMathLabels} from './packages/runtime/src/mermaid-flowchart-source.ts';import {findDrawn} from './packages/runtime/src/mermaid.ts';window.agentflowProbe={mermaid,stampFlowchartMathLabels,findDrawn};`,resolveDir:resolve('.')},bundle:true,platform:'browser',format:'iife',write:false,minify:true,logLevel:'warning',plugins:[mermaidMathPlugin(resolve('.'))]});
const browser=await chromium.launch();
try {
 const page=await browser.newPage(),attempts=[];
 await page.route('**/*',route=>{attempts.push(route.request().url());return route.abort();});
 await page.setContent('<!doctype html><style>body{margin:0}main{max-width:100vw;overflow:auto}svg{display:block}</style><main></main>');
 await page.addScriptTag({content:compiled.outputFiles[0].text});
 const results=[];
 for(const width of [320,1440]) {
  await page.setViewportSize({width,height:900});
  results.push(...await page.evaluate(async width=>{
   const {mermaid,stampFlowchartMathLabels,findDrawn}=window.agentflowProbe;
   mermaid.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels:true,agentflow:{useMaxWidth:false},logLevel:'fatal'});
   const output=[];
   const assertRole=svg=>{if(svg.getAttribute('aria-roledescription')!=='agentflow')throw new Error('Agentflow native role changed');};
   for(const collapsed of [false,true]) {
    const source=String.raw`agentflow-beta TB
flow group["Flow $$\frac{1}{g}$$"]${collapsed?'@{view: collapsed}':''}
 A["Node $$\frac{1+\frac{a}{b}}{c}$$"]
end
connector c["Connector $$x_1+x_2+x_3+x_4+x_5$$"]
A -->|"Edge $$\frac{1}{e}$$"| c
`;
    const id=`agentflow-${width}-${collapsed}`,rendered=await mermaid.render(id,source);
    const host=document.querySelector('main');host.innerHTML=rendered.svg;
    const svg=host.querySelector('svg');
    assertRole(svg);
    const slots=[{kind:'subgraph',id:'group'},{kind:'node',id:'c'},{kind:'edge',id:'L_A_c_0'},...collapsed?[]:[{kind:'node',id:'A'}]].map(slot=>({...slot,key:slot.kind+':'+slot.id}));
    stampFlowchartMathLabels(svg,id,slots);
    if(findDrawn(svg,id,'node:c').length!==1)throw new Error('Agentflow connector target missing');
    const formulas=[...svg.querySelectorAll('math[data-vs-mermaid-formula]')];
    const failures=[];
    for(const formula of formulas) {
     const inner=formula.getBoundingClientRect(),outer=formula.closest('foreignObject')?.getBoundingClientRect();
     if(!outer||inner.width<=0||inner.height<=0||inner.left<outer.left-1||inner.right>outer.right+1||inner.top<outer.top-1||inner.bottom>outer.bottom+1)failures.push('formula exceeds reservation');
    }
    output.push({width,collapsed,formulas:formulas.map(f=>f.getAttribute('data-vs-mermaid-formula')),owners:[...svg.querySelectorAll('foreignObject')].map(fo=>({parent:fo.parentElement?.outerHTML.slice(0,250),owner:fo.parentElement?.parentElement?.getAttribute('id')})),failures});
   }
   return output;
  },width));
 }
 for(const result of results){assert.equal(result.formulas.length,result.collapsed?3:4,JSON.stringify(result));assert.deepEqual(result.failures,[],JSON.stringify(result));}
 assert.deepEqual(attempts,[]);console.log(JSON.stringify({results,networkAttempts:attempts.length,browser:browser.version()},null,2));
} finally {await browser.close();}
