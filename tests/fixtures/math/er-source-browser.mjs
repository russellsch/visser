import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {mermaidMathPlugin} from '../../../scripts/mermaid-build.mjs';
import {parseMermaid} from '../../../packages/core/src/mermaid/parse.ts';
import {erMathSourceMap} from '../../../packages/core/src/mermaid/er-source-map.ts';
const sources=[String.raw`erDiagram
subgraph g["Group 雪 $$g$$"]
 A["$$\frac{1}{a}$$"] {
  string field "$$\frac{1}{v}$$"
 }
 B
end
A ||--|| B : "$$r$$"
`,String.raw`erDiagram
A["$$\frac{1}{x}$$"]
A ||--|| A : "$$s$$"
A ||--|| A : "$$t$$"
`,String.raw`erDiagram
subgraph g["$$x < y$$"]
 A["$$a < b$$"]
end
`,String.raw`erDiagram
"$$\frac{1}{n}$$" ||--|| Plain : "$$q$$"
`];
const cases=sources.map((source,index)=>{
 const original='\uFEFF  '+source.replaceAll('\n','\r\n  '),figureId=`source-${index}`;
 const parsed=parseMermaid([{figureId,source,originalSource:original,type:'other',er:true}]).get(figureId);
 assert.ok(parsed?.ok&&parsed.erMath,JSON.stringify(parsed));
 return {source,map:erMathSourceMap({source,mathBodyStartByte:0,erMath:parsed.erMath},new TextEncoder().encode(original))};
});
const compiled=await build({stdin:{contents:`import mermaid from 'mermaid';import {bindMermaidSource,mermaidSourceSelection} from './packages/runtime/src/mermaid-source.ts';window.probe={mermaid,bindMermaidSource,mermaidSourceSelection};`,resolveDir:resolve('.')},bundle:true,platform:'browser',format:'iife',write:false,minify:true,logLevel:'warning',plugins:[mermaidMathPlugin(resolve('.'))]});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage(),requests=[];await page.route('**/*',route=>{requests.push(route.request().url());return route.abort();});
 await page.setContent('<!doctype html><body></body>');await page.addScriptTag({content:compiled.outputFiles[0].text});
 const results=await page.evaluate(async cases=>{
  const {mermaid,bindMermaidSource,mermaidSourceSelection}=window.probe;
  mermaid.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels:true});
  const output=[];
  for(const [index,item]of cases.entries()){
   const rendered=await mermaid.render(`er-source-${index}`,item.source),figure=document.createElement('figure');
   figure.setAttribute('data-vs-mermaid-source-map',JSON.stringify(item.map));
   const source=document.createElement('pre');source.className='vs-mermaid-source';const code=document.createElement('code');code.textContent=item.map.source;source.append(code);
   const drawing=document.createElement('div');drawing.setAttribute('data-vs-mermaid-render','');drawing.innerHTML=rendered.svg;figure.append(source,drawing);document.body.append(figure);
   const svg=drawing.querySelector('svg');bindMermaidSource(figure,svg);
   const copies=[];
   for(const formula of svg.querySelectorAll('[data-vs-mermaid-formula]')){
    const range=document.createRange();range.selectNodeContents(formula);const selected=mermaidSourceSelection(range);
    if(selected.kind!=='source')throw new Error('Expected representable authored equation');
    copies.push({tex:formula.getAttribute('data-vs-mermaid-formula'),source:selected.range.toString()});
   }
   const extra=document.createElementNS(svg.namespaceURI,'g');extra.setAttribute('data-vs-mermaid-label','forged');svg.append(extra);
   let rejected=false;try{bindMermaidSource(figure,svg);}catch{rejected=true;}extra.remove();if(!rejected)throw new Error('Accepted extra retained label');
   bindMermaidSource(figure,svg);output.push({labels:svg.querySelectorAll('[data-vs-mermaid-label]').length,copies});
  }
  return output;
 },cases);
 await page.screenshot({path:'reports/math/er-source-browser.png',fullPage:true});
 assert.deepEqual(results.map(result=>result.copies.length),[4,3,2,2]);
 assert.ok(results[0].copies.some(copy=>copy.source===String.raw`$$\frac{1}{a}$$`));
 assert.ok(results[2].copies.some(copy=>copy.source.includes('<')));
 assert.deepEqual(requests,[]);console.log(JSON.stringify({results,networkAttempts:requests.length,browser:browser.version()}));
}finally{await browser.close();}
