import {build} from 'esbuild';
import {expect,test} from '@playwright/test';
import {resolve} from 'node:path';
// @ts-expect-error checked build helper has no declarations.
import {mermaidMathPlugin} from '../../scripts/mermaid-build.mjs';
let bundle:string,upstream:string;
test.beforeAll(async()=>{const config={bundle:true,platform:'browser' as const,format:'iife' as const,write:false as const,minify:true};bundle=(await build({...config,entryPoints:[resolve('packages/runtime/src/mermaid-bundle.ts')],plugins:[mermaidMathPlugin(resolve('.'))]})).outputFiles[0]!.text;upstream=(await build({...config,stdin:{contents:"import mermaid from 'mermaid';globalThis.mermaidOriginal=mermaid;",resolveDir:resolve('.'),sourcefile:'radar-original.js'}})).outputFiles[0]!.text;});
const plain='radar-beta\ntitle Plain\naxis a,b,c\ncurve first {1,2,3}\n';
const math=String.raw`radar-beta
title $$\frac{title}{equation}$$
axis a["$$\\frac{a}{b}$$"],b["$$x$$"],c["$$\\begin{matrix}a&b\\\\c&d\\end{matrix}$$"],d["$$y$$"],e["$$e$$"],f["$$f$$"]
curve same["$$legend$$"]{1,2,3,2,1,3}
curve same["$$skipped$$"]{1,2}
curve third {3,2,1,2,3,1}
`;
const config={startOnLoad:false,securityLevel:'strict',theme:'base',themeVariables:{fontFamily:'Arial, sans-serif',fontSize:'14px'},themeCSS:'.radarLegendBox-0 {stroke-width:20px;} .radarCurve-0 {stroke-width:12px;} .radarAxisLine {stroke-width:8px;}',radar:{useMaxWidth:true,curveTension:0.8}};

test('plain Radar matches upstream geometry, labels and viewport',async({page})=>{
 await page.setContent('<!doctype html><main id="host"></main>');await page.addScriptTag({content:bundle});await page.addScriptTag({content:upstream});
 const result=await page.evaluate(async({plain,config})=>{const host=document.querySelector('#host')!,summary=(value:string)=>{host.innerHTML=value;const svg=host.querySelector('svg')!;return {viewBox:svg.getAttribute('viewBox'),text:[...svg.querySelectorAll('text')].map(n=>n.textContent),shapes:[...svg.querySelectorAll('circle,line,path,polygon,rect')].map(n=>[n.localName,...['class','r','d','points','x1','y1','x2','y2','width','height'].map(a=>n.getAttribute(a))]),stage:svg.querySelectorAll('.vs-radar-math').length};};const patched=(window as any).mermaid,native=(window as any).mermaidOriginal;patched.initialize(config);native.initialize(config);return {patched:summary((await patched.render('radar-plain',plain)).svg),native:summary((await native.render('radar-plain-native',plain)).svg)};},{plain,config});
 expect(result.patched).toEqual(result.native);expect(result.patched.stage).toBe(0);
});

test('measured Radar preserves native shapes and skipped-curve indices with contained disjoint labels',async({page})=>{
 await page.setContent('<!doctype html><main id="host"></main>');await page.addScriptTag({content:bundle});await page.addScriptTag({content:upstream});
 for(const graticule of ['circle','polygon'])for(const legend of [true,false]){
  const result=await page.evaluate(async({source,config,id})=>{
   const host=document.querySelector('#host')!,patched=(window as any).mermaid,native=(window as any).mermaidOriginal;patched.initialize(config);native.initialize(config);
   const box=(n:Element)=>{const b=n.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom};};
   const shapes=()=>[...host.querySelectorAll('circle,line,path,polygon,rect')].map(n=>[n.localName,...['class','r','d','points','x1','y1','x2','y2','width','height'].map(a=>n.getAttribute(a))]);
   host.innerHTML=(await patched.render(id,source)).svg;const svg=host.querySelector('svg')!,geometry=shapes(),outer=box(svg),labels=[...svg.querySelectorAll('[data-vs-mermaid-label]')].map(n=>({key:n.getAttribute('data-vs-mermaid-label'),box:box(n),ink:[...n.querySelectorAll('math,math *')].map(box).filter(b=>b.right>b.left&&b.bottom>b.top)}));
   const shapeBoxes=[...svg.querySelectorAll<SVGGraphicsElement>('circle,line,path,polygon,rect')].map(n=>{const bounds=box(n),style=getComputedStyle(n),scale=n.getScreenCTM()!,pad=style.stroke==='none'?0:parseFloat(style.strokeWidth)*Math.max(Math.abs(scale.a),Math.abs(scale.d));return {left:bounds.left-pad,right:bounds.right+pad,top:bounds.top-pad,bottom:bounds.bottom+pad};});
   const stage=svg.querySelectorAll('.vs-radar-math').length,leaks=svg.querySelectorAll('[data-vs-radar-stage]').length,leaders=svg.querySelectorAll('[data-vs-radar-leader]').length,curves=[...svg.querySelectorAll('[class^="radarCurve-"]')].map(n=>n.getAttribute('class'));
   host.innerHTML=(await native.render(id+'-native',source)).svg;return {geometry,nativeGeometry:shapes(),outer,labels,shapeBoxes,stage,leaks,leaders,curves};
  },{source:math+`graticule ${graticule}\nshowLegend ${legend}\n`,config,id:`radar-${graticule}-${legend}`});
  expect(result.geometry).toEqual(result.nativeGeometry);expect(result.stage).toBe(1);expect(result.leaks).toBe(0);expect(result.leaders).toBe(6);expect(result.curves).toEqual(['radarCurve-0','radarCurve-2']);
  expect(result.labels.map(n=>n.key)).toEqual(['axis:0','axis:1','axis:2','axis:3','axis:4','axis:5',...(legend?['curve:0','curve:1','curve:2']:[]),'title']);
  for(const b of result.shapeBoxes){expect(b.left).toBeGreaterThanOrEqual(result.outer.left-1);expect(b.right).toBeLessThanOrEqual(result.outer.right+1);expect(b.top).toBeGreaterThanOrEqual(result.outer.top-1);expect(b.bottom).toBeLessThanOrEqual(result.outer.bottom+1);}
  for(const label of result.labels){expect(label.box.left).toBeGreaterThanOrEqual(result.outer.left-1);expect(label.box.right).toBeLessThanOrEqual(result.outer.right+1);expect(label.box.top).toBeGreaterThanOrEqual(result.outer.top-1);expect(label.box.bottom).toBeLessThanOrEqual(result.outer.bottom+1);for(const ink of label.ink){expect(ink.left).toBeGreaterThanOrEqual(label.box.left-1);expect(ink.right).toBeLessThanOrEqual(label.box.right+1);expect(ink.top).toBeGreaterThanOrEqual(label.box.top-1);expect(ink.bottom).toBeLessThanOrEqual(label.box.bottom+1);}}
  for(let i=0;i<result.labels.length;i++)for(let j=i+1;j<result.labels.length;j++){const a=result.labels[i]!.box,b=result.labels[j]!.box;expect(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top).toBe(true);}
 }
});

test('Radar rejects nonfinite resulting geometry and recovers',async({page})=>{
 await page.setContent('<!doctype html><main id="host"></main>');await page.addScriptTag({content:bundle});
 const result=await page.evaluate(async({config})=>{const mermaid=(window as any).mermaid;mermaid.initialize(config);const failures=[];for(const source of ['radar-beta\naxis a["$$x$$"]\ncurve c {0}\n','radar-beta\naxis a["$$x$$"]\ncurve c {1}\nmin 1\nmax 1\n']){try{await mermaid.render('radar-fail-'+failures.length,source);failures.push(false);}catch{failures.push(true);}}const host=document.querySelector('#host')!;host.innerHTML=(await mermaid.render('radar-recover','radar-beta\naxis a["$$x$$"]\ncurve c {1}\n')).svg;return {failures,math:host.querySelectorAll('math').length,leaks:document.querySelectorAll('[data-vs-radar-stage]').length};},{config});
 expect(result).toEqual({failures:[true,true],math:1,leaks:0});
});


test('Radar retains zero, one and two axis native cardinalities',async({page})=>{
 await page.setContent('<!doctype html><main id="host"></main>');await page.addScriptTag({content:bundle});
 const result=await page.evaluate(async({config})=>{const mermaid=(window as any).mermaid;mermaid.initialize(config);const host=document.querySelector('#host')!,results=[];for(const [index,body]of ['', 'axis a\ncurve c {1}\n', 'axis a,b\ncurve c {1,2}\n'].entries()){host.innerHTML=(await mermaid.render('radar-small-'+index,'radar-beta\ntitle $$x$$\n'+body)).svg;results.push({axes:host.querySelectorAll('[data-vs-mermaid-label^="axis:"]').length,curves:host.querySelectorAll('[class^="radarCurve-"]').length,math:host.querySelectorAll('math').length});}return results;},{config});
 expect(result).toEqual([{axes:0,curves:0,math:1},{axes:1,curves:1,math:1},{axes:2,curves:1,math:1}]);
});
