import { build } from 'esbuild';
import { expect, test } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error The checked build helper has no declaration file.
import { mermaidMathPlugin } from '../../scripts/mermaid-build.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const plain=`xychart
title "Plain title"
x-axis "X" [A,A,B]
y-axis "Y" 0 --> 10
line "line" [2,2,8]
bar "bar" [3,4,6]
`;
const math=String.raw`xychart
title "quoted $$\frac{a}{b}$$ title"
x-axis "$$x$$" ["$$A$$","$$A$$","$$B$$"]
y-axis "$$y$$" 0 --> 10
line "$$line$$" [2 "$$\rule{1em}{10em}$$",2 "$$\rlap{\rule{8em}{1em}}x$$",8 "$$\begin{matrix}a&b\\c&d\end{matrix}$$"]
bar "$$bar$$" [3,4,6]
`;
const keys=['title','xTitle','yTitle','category:0','category:1','category:2','series:0','series:1','point:0:0','point:0:1','point:0:2'];
let patched:string,upstream:string;
test.beforeAll(async()=>{
 const options={bundle:true,platform:'browser' as const,format:'iife' as const,minify:true,write:false as const};
 patched=(await build({...options,entryPoints:[resolve(root,'packages/runtime/src/mermaid-bundle.ts')],plugins:[mermaidMathPlugin(root)]})).outputFiles[0]!.text;
 upstream=(await build({...options,stdin:{contents:"import mermaid from 'mermaid';globalThis.mermaidOriginal=mermaid;",resolveDir:root,sourcefile:'xychart-original.js'}})).outputFiles[0]!.text;
});
const config=(orientation:'vertical'|'horizontal'='vertical',rotation=0,reserved=100)=>({startOnLoad:false,securityLevel:'strict',theme:'base',deterministicIds:true,themeVariables:{fontFamily:'Arial, sans-serif',fontSize:'14px'},xyChart:{width:180,height:120,chartOrientation:orientation,plotReservedSpacePercent:reserved,showLegend:true,showTitle:true,xAxis:{showTitle:true,showLabel:true,labelRotation:rotation},yAxis:{showTitle:true,showLabel:true}}});

test('plain xychart rendering preserves native viewBox, paths, rectangles, and text',async({page})=>{
 await page.setContent('<!doctype html><main id="rendered"></main>');await page.addScriptTag({content:patched});await page.addScriptTag({content:upstream});
 const result=await page.evaluate(async({plain,config})=>{
  const host=document.querySelector('#rendered')!,summary=(text:string)=>{host.innerHTML=text;const svg=host.querySelector('svg')!;return {viewBox:svg.getAttribute('viewBox'),paths:[...svg.querySelectorAll('path')].map(n=>n.getAttribute('d')),rects:[...svg.querySelectorAll('rect')].map(n=>[n.getAttribute('x'),n.getAttribute('y'),n.getAttribute('width'),n.getAttribute('height')]),text:[...svg.querySelectorAll('text')].map(n=>n.textContent),patched:svg.querySelectorAll('.vs-xy-math').length};};
  const mine=(window as any).mermaid,original=(window as any).mermaidOriginal;mine.initialize(config);original.initialize(config);
  return {mine:summary((await mine.render('xy-plain-patched',plain)).svg),original:summary((await original.render('xy-plain-original',plain)).svg)};
 },{plain,config:config()});
 expect(result.mine).toEqual(result.original);expect(result.mine.patched).toBe(0);
});

test('math xychart contains every visible role, native plots, leaders, and measured ink across orientations and constrained plots',async({page})=>{
 test.setTimeout(120_000);await page.setContent('<!doctype html><main id="rendered"></main>');await page.addScriptTag({content:patched});
 for(const orientation of ['vertical','horizontal'] as const)for(const rotation of [-35,0,35])for(const reserved of [0,100])for(const width of [320,1440])await test.step(`${orientation}/${rotation}/${reserved}/${width}`,async()=>{
  await page.setViewportSize({width,height:900});
  const result=await page.evaluate(async({math,config,id})=>{
   const mermaid=(window as any).mermaid;mermaid.initialize(config);const host=document.querySelector('#rendered')!;host.innerHTML=(await mermaid.render(id,math)).svg;
   const svg=host.querySelector<SVGSVGElement>('svg')!,rect=(node:Element)=>{const b=node.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom};};
   const labels=[...svg.querySelectorAll<SVGForeignObjectElement>('foreignObject[data-vs-mermaid-label]')].map(n=>({key:n.getAttribute('data-vs-mermaid-label'),box:rect(n),ink:[...n.querySelectorAll('math,math *')].map(rect).filter(b=>b.right>b.left&&b.bottom>b.top)}));
   const point=(value:string)=>value.trim().split(/[\s,]+/).map(Number) as [number,number];
   const leaders=[...svg.querySelectorAll<SVGPolylineElement>('[data-vs-xy-leader]')].map(n=>({key:n.getAttribute('data-vs-xy-leader'),first:point(n.getAttribute('points')!.split(/\s+/)[0]!),points:n.getAttribute('points')}));
   const line=svg.querySelector<SVGPathElement>('[data-vs-xy-shape="plot/line-plot-0"] path')!,path=line.getAttribute('d')!,native=[...path.matchAll(/[ML]([\d.-]+),([\d.-]+)/g)].map(m=>[Number(m[1]),Number(m[2])]);
   const bars=[...svg.querySelectorAll<SVGRectElement>('[data-vs-xy-shape="plot/bar-plot-1"] rect')].map(n=>({x:Number(n.getAttribute('x')),y:Number(n.getAttribute('y')),width:Number(n.getAttribute('width')),height:Number(n.getAttribute('height'))}));
   return {viewport:rect(svg),labels,leaders,native,bars,math:svg.querySelectorAll('math').length,keys:[...svg.querySelectorAll('[data-vs-mermaid-label]')].map(n=>n.getAttribute('data-vs-mermaid-label')),staged:svg.querySelectorAll('.vs-xy-math').length,temporary:document.querySelectorAll('svg:not(#rendered svg),.vs-xy-math-probe,[data-vs-xy-stage]').length};
  },{math,config:config(orientation,rotation,reserved),id:`xy-${orientation}-${rotation}-${reserved}-${width}`});
  expect(result.staged).toBe(1);expect(result.math).toBe(keys.length);expect(result.keys.sort()).toEqual([...keys].sort());expect(result.temporary).toBe(0);
  const contains=(outer:typeof result.viewport,inner:typeof result.viewport)=>inner.left>=outer.left-1&&inner.right<=outer.right+1&&inner.top>=outer.top-1&&inner.bottom<=outer.bottom+1;
  for(const label of result.labels){expect(contains(result.viewport,label.box),`${label.key} in viewport`).toBe(true);for(const ink of label.ink)expect(contains(label.box,ink),`${label.key} ink contained`).toBe(true);}
  for(const [index,a] of result.labels.entries())for(const b of result.labels.slice(index+1))expect(a.box.right<=b.box.left+1||b.box.right<=a.box.left+1||a.box.bottom<=b.box.top+1||b.box.bottom<=a.box.top+1,`${a.key}/${b.key}`).toBe(true);
  expect(result.labels.find(l=>l.key==='category:0')!.box).not.toEqual(result.labels.find(l=>l.key==='category:1')!.box);
  expect(result.leaders.filter(l=>l.key?.startsWith('category:'))).toHaveLength(3);expect(result.leaders.filter(l=>l.key?.startsWith('point:'))).toHaveLength(3);
  for(let index=0;index<3;index++)expect(result.leaders.find(l=>l.key===`point:0:${index}`)!.first.map(n=>Number(n.toFixed(3)))).toEqual(result.native[index]!.map(n=>Number(n.toFixed(3))));
  expect(result.bars).toHaveLength(3);for(const bar of result.bars)expect(Math.max(bar.width,bar.height)).toBeGreaterThan(0);
 });
});

test('XY render failure distinguishes Mermaid error output from adapter leaks, then recovers after caller cleanup',async({page})=>{
 await page.setContent('<!doctype html><main id="rendered"></main>');await page.addScriptTag({content:patched});
 const result=await page.evaluate(async({config})=>{const mermaid=(window as any).mermaid;mermaid.initialize(config);let failed=false;try{await mermaid.render('xy-failed','xychart\ny-axis 0 --> 10\nline [1 "$$\\unknownVisser$$"]');}catch{failed=true;}
  const callerError=document.querySelector('#dxy-failed');const adapterLeaks=document.querySelectorAll('[data-vs-xy-probe],[data-vs-xy-stage]').length;
  // Mermaid owns this default error SVG because render() was called without a host.
  callerError?.remove();const host=document.querySelector('#rendered')!;host.innerHTML=(await mermaid.render('xy-recover','xychart\ny-axis 0 --> 10\nline [1 "$$x$$"]')).svg;
  return {failed,callerError:Boolean(callerError),adapterLeaks,remainingCallerError:Boolean(document.querySelector('#dxy-failed')),staged:host.querySelectorAll('.vs-xy-math').length,keys:[...host.querySelectorAll('[data-vs-mermaid-label]')].map(n=>n.getAttribute('data-vs-mermaid-label'))};},{config:config()});
 expect(result).toEqual({failed:true,callerError:true,adapterLeaks:0,remainingCallerError:false,staged:1,keys:['point:0:0']});
});

test('sharp V paths with hidden zero-padding axes remain inside the measured viewport',async({page})=>{
 await page.setContent('<!doctype html><main id="rendered"></main>');await page.addScriptTag({content:patched});
 const result=await page.evaluate(async({config})=>{const mermaid=(window as any).mermaid;mermaid.initialize(config);const host=document.querySelector('#rendered')!;
  host.innerHTML=(await mermaid.render('xy-sharp-v',String.raw`xychart
title "hidden $$t$$"
x-axis "hidden $$x$$" ["$$a$$","$$b$$","$$c$$"]
y-axis "hidden $$y$$" 0 --> 10
line "hidden $$legend$$" [10 "$$v$$",0,10]
`)).svg;const svg=host.querySelector<SVGSVGElement>('svg')!,path=svg.querySelector<SVGPathElement>('[data-vs-xy-shape="plot/line-plot-0"] path')!,outer=svg.getBoundingClientRect(),matrix=path.getScreenCTM()!,style=getComputedStyle(path),points=[...path.getAttribute('d')!.matchAll(/[ML]([\d.-]+),([\d.-]+)/g)].map(match=>{const point=svg.createSVGPoint();point.x=Number(match[1]);point.y=Number(match[2]);const screen=point.matrixTransform(matrix);return {x:screen.x,y:screen.y};});return {points,outer:{left:outer.left,right:outer.right,top:outer.top,bottom:outer.bottom},stroke:Number.parseFloat(style.strokeWidth)*Math.max(1,Number.parseFloat(style.strokeMiterlimit))*Math.hypot(matrix.a,matrix.b),lineJoin:style.strokeLinejoin,labels:[...svg.querySelectorAll('[data-vs-mermaid-label]')].map(n=>n.getAttribute('data-vs-mermaid-label'))};},{config:{...config(),xyChart:{...config().xyChart,showTitle:false,showLegend:false,legendPadding:0,xAxis:{showLabel:false,showTitle:false,showTick:false,showAxisLine:false,labelPadding:0,titlePadding:0,tickLength:0},yAxis:{showLabel:false,showTitle:false,showTick:false,showAxisLine:false,labelPadding:0,titlePadding:0,tickLength:0}}}});
 expect(result.labels).toEqual(['point:0:0']);expect(result.lineJoin).toBe('miter');for(const point of result.points){expect(point.x-result.stroke).toBeGreaterThanOrEqual(result.outer.left-1);expect(point.x+result.stroke).toBeLessThanOrEqual(result.outer.right+1);expect(point.y-result.stroke).toBeGreaterThanOrEqual(result.outer.top-1);expect(point.y+result.stroke).toBeLessThanOrEqual(result.outer.bottom+1);}
});

test('generated bar values fit inside when possible and use leader-backed outside lanes when too small',async({page})=>{
 await page.setContent('<!doctype html><main id="rendered"></main>');await page.addScriptTag({content:patched});
 const result=await page.evaluate(async({config})=>{const mermaid=(window as any).mermaid;const source=String.raw`xychart
x-axis [a,b,c]
y-axis 0 --> 10
bar "$$bar$$" [3,4,6]
`;const tiny=source.replace('[3,4,6]','[0.1,0.2,0.3]');const draw=async(id:string,outside:boolean,input=source)=>{mermaid.initialize({...config,xyChart:{...config.xyChart,showDataLabel:true,showDataLabelOutsideBar:outside}});const host=document.querySelector('#rendered')!;host.innerHTML=(await mermaid.render(id,input)).svg;const svg=host.querySelector('svg')!,box=(n:Element)=>{const b=n.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom};};return {bars:[...svg.querySelectorAll<SVGRectElement>('[data-vs-xy-shape="plot/bar-plot-0"] rect')].map(box),values:[...svg.querySelectorAll<SVGForeignObjectElement>('[data-vs-xy-generated^="bar-value:"]')].map(n=>({key:n.getAttribute('data-vs-xy-generated'),text:n.textContent,inside:n.hasAttribute('data-vs-xy-inside'),box:box(n)})),leaders:[...svg.querySelectorAll('[data-vs-xy-leader^="bar-value:"]')].map(n=>n.getAttribute('data-vs-xy-leader'))};};return {inside:await draw('xy-bars-inside',false),outside:await draw('xy-bars-outside',true),tiny:await draw('xy-bars-tiny',false,tiny)};},{config:config()});
 for(const mode of [result.inside,result.outside])expect(mode.values.map(value=>value.text)).toEqual(['3','4','6']);
 for(let index=0;index<3;index++){const bar=result.inside.bars[index]!,value=result.inside.values[index]!.box;expect(value.left).toBeGreaterThanOrEqual(bar.left-1);expect(value.right).toBeLessThanOrEqual(bar.right+1);expect(value.top).toBeGreaterThanOrEqual(bar.top-1);expect(value.bottom).toBeLessThanOrEqual(bar.bottom+1);}
  for(let index=0;index<3;index++){const bar=result.outside.bars[index]!,value=result.outside.values[index]!.box;expect(value.right<=bar.left+1||bar.right<=value.left+1||value.bottom<=bar.top+1||bar.bottom<=value.top+1).toBe(true);}
 expect(result.inside.values.every(value=>value.inside)).toBe(true);expect(result.tiny.values.every(value=>!value.inside)).toBe(true);expect(result.tiny.leaders).toEqual(['bar-value:0:0','bar-value:0:1','bar-value:0:2']);
});

test('duplicate categories keep colliding bar values distinct by routing one to an outside leader lane',async({page})=>{
 await page.setContent('<!doctype html><main id="rendered"></main>');await page.addScriptTag({content:patched});
 const result=await page.evaluate(async({config})=>{const mermaid=(window as any).mermaid;mermaid.initialize({...config,xyChart:{...config.xyChart,showDataLabel:true,showDataLabelOutsideBar:false}});const host=document.querySelector('#rendered')!;host.innerHTML=(await mermaid.render('xy-bars-duplicate',String.raw`xychart
x-axis [a,a]
y-axis 0 --> 100
bar "$$bar$$" [100,99]
`)).svg;const svg=host.querySelector('svg')!,box=(n:Element)=>{const b=n.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom};};return {values:[...svg.querySelectorAll<SVGForeignObjectElement>('[data-vs-xy-generated^="bar-value:"]')].map(n=>({text:n.textContent,inside:n.hasAttribute('data-vs-xy-inside'),box:box(n)})),leaders:[...svg.querySelectorAll('[data-vs-xy-leader^="bar-value:"]')].map(n=>n.getAttribute('data-vs-xy-leader'))};},{config:config()});
 expect(result.values.map(value=>value.text)).toEqual(['100','99']);const [first,second]=result.values;expect(first!.box.right<=second!.box.left||second!.box.right<=first!.box.left||first!.box.bottom<=second!.box.top||second!.box.bottom<=first!.box.top).toBe(true);expect(result.values.filter(value=>value.inside)).toHaveLength(1);expect(result.leaders).toEqual(['bar-value:0:1']);
});
