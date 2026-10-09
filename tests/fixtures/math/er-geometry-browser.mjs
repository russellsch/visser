import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {mermaidMathPlugin} from '../../../scripts/mermaid-build.mjs';
const compiled=await build({stdin:{contents:`import mermaid from 'mermaid';window.mermaid=mermaid;`,resolveDir:resolve('.')},bundle:true,platform:'browser',format:'iife',write:false,minify:true,logLevel:'warning',plugins:[mermaidMathPlugin(resolve('.'))]});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage(),requests=[];await page.route('**/*',route=>{requests.push(route.request().url());return route.abort();});
 await page.setContent('<!doctype html><style>body{margin:0}main{max-width:100%;overflow:auto}svg{display:block}</style><main></main>');await page.addScriptTag({content:compiled.outputFiles[0].text});
 const runs=[];
 for(const width of [320,390,1440]){
  await page.setViewportSize({width,height:1000});
  const result=await page.evaluate(async width=>{
   const tall=String.raw`$$\frac{1+\frac{a}{b}}{1+\frac{c}{d}}$$`,matrix=String.raw`$$\begin{matrix}a&b\\c&d\\e&f\end{matrix}$$`,wide=String.raw`$$x_1+x_2+x_3+x_4+x_5+x_6+x_7+x_8$$`;
   const source=`erDiagram
subgraph outer["Group ${tall}"]
 A["Entity ${matrix}"] {
  string first "${tall}"
  int second "${wide}"
 }
 B["Simple ${tall}"]
 subgraph inner["Inner ${matrix}"]
 end
end
subgraph empty["Empty ${matrix}"]
end
A ||--|| B : "Role ${matrix}"
A ||--|| A : "Loop ${tall}"
empty ||--|| B : "Other ${wide}"
classDef large font-size:24px
class A large
classDef groupFont font-size:22px,font-weight:bold
class inner groupFont
style empty font-size:26px
`;
   const rect=element=>{const b=element.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height};};
   const fits=(outer,inner)=>inner.left>=outer.left-1&&inner.right<=outer.right+1&&inner.top>=outer.top-1&&inner.bottom<=outer.bottom+1;
   const intersects=(a,b)=>Math.min(a.right,b.right)>Math.max(a.left,b.left)+1&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top)+1;
   const results=[];
   for(const layout of ['elk','dagre'])for(const htmlLabels of [true,false])for(const look of ['default','handDrawn']){
    window.mermaid.initialize({startOnLoad:false,securityLevel:'strict',layout,htmlLabels,look,handDrawnSeed:42});
    const rendered=await window.mermaid.render(`geometry-${width}-${layout}-${htmlLabels}-${look}`,source),main=document.querySelector('main');main.innerHTML=rendered.svg;
    if(layout==='elk'&&htmlLabels&&look==='default')window.erGeometrySnapshot=rendered.svg;
    const svg=main.querySelector('svg'),labels=[...svg.querySelectorAll('[data-vs-mermaid-label]')].filter(label=>label.textContent),failures=[];
    const boxes=labels.map(label=>({key:label.getAttribute('data-vs-mermaid-label'),box:rect(label),label}));
    for(const formula of svg.querySelectorAll('math')){
     const object=formula.closest('foreignObject');if(!object||!fits(rect(object),rect(formula)))failures.push('formula exceeds reservation');
     const owner=formula.closest('.node,.rough-node,.cluster'),outline=owner?.classList.contains('cluster')?owner.firstElementChild:owner?.querySelector(':scope > .outer-path,:scope > rect,:scope > .basic')??owner?.firstElementChild;
     if(owner&&(!outline||outline.contains(formula)))failures.push('missing independent node outline');
     if(owner&&outline&&!fits(rect(outline),rect(formula)))failures.push(`formula exceeds shape ${JSON.stringify({outline:rect(outline),formula:rect(formula),node:owner.id})} ${formula.closest('[data-vs-mermaid-label]').getAttribute('data-vs-mermaid-label')}`);
    }
    for(const {label,box,key}of boxes){
     const owner=label.closest('.node,.rough-node,.cluster');if(!owner)continue;
     const outline=owner.classList.contains('cluster')?owner.firstElementChild:owner.querySelector(':scope > .outer-path,:scope > rect,:scope > .basic')??owner.firstElementChild;
     if(!outline||outline.contains(label)||!fits(rect(outline),box))failures.push(`mixed label exceeds shape ${key}`);
    }
    for(let a=0;a<boxes.length;a++)for(let b=a+1;b<boxes.length;b++){
     const left=boxes[a],right=boxes[b];
     // Rough background and foreground intentionally repeat the same field.
     if(left.key.replace(/:(background|foreground)$/,':copy')===right.key.replace(/:(background|foreground)$/,':copy'))continue;
     if(intersects(left.box,right.box))failures.push(`labels overlap ${left.key} / ${right.key}`);
    }
    const nodeLabels=boxes.filter(entry=>entry.label.closest('.node,.rough-node,.cluster'));
    let sampled=0;
    for(const path of svg.querySelectorAll('.edgePaths path')){
     const length=path.getTotalLength(),matrix=path.getScreenCTM();
     if(!matrix)throw new Error('Missing route matrix');
     for(let at=0;at<=length;at+=2){const p=path.getPointAtLength(at),point=new DOMPoint(p.x,p.y).matrixTransform(matrix);sampled++;
      for(const {box,key}of nodeLabels)if(point.x>box.left+1&&point.x<box.right-1&&point.y>box.top+1&&point.y<box.bottom-1)failures.push(`route crosses label ${key}`);
     }
    }
    const formulaCount=svg.querySelectorAll('math').length;
    if(formulaCount!==(look==='handDrawn'?14:10))failures.push(`formula count ${formulaCount}`);
    if(document.documentElement.scrollWidth>width)failures.push('document overflows');
    if(!sampled)failures.push('no route samples');
    results.push({width,layout,htmlLabels,look,formulaCount,sampled,failures:[...new Set(failures)]});
   }
   return results;
  },width);runs.push(...result);
  await page.screenshot({path:`reports/math/er-geometry-${width}.png`,fullPage:true});
  await page.evaluate(()=>{document.querySelector('main').innerHTML=window.erGeometrySnapshot;});
  await page.screenshot({path:`reports/math/er-geometry-elk-${width}.png`,fullPage:true});
 }
 console.log(JSON.stringify({runs,networkAttempts:requests.length,browser:browser.version()}));
 for(const run of runs)assert.deepEqual(run.failures,[],JSON.stringify(run));assert.deepEqual(requests,[]);
}finally{await browser.close();}
