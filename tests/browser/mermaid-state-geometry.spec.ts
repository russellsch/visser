import { build } from 'esbuild';
import { expect, test } from '@playwright/test';
// @ts-expect-error checked build script outside TS project
import { mermaidMathPlugin } from '../../scripts/mermaid-build.mjs';
let bundle:string;
test.beforeAll(async()=>{bundle=(await build({stdin:{contents:"import './packages/runtime/src/mermaid-bundle.ts';",resolveDir:process.cwd()},bundle:true,platform:'browser',format:'iife',write:false,plugins:[mermaidMathPlugin(process.cwd())]})).outputFiles[0]!.text;});
test('state label paths reserve tall and overhanging equation ink before layout',async({page})=>{
 await page.setContent('<!doctype html><main></main>');await page.addScriptTag({content:bundle});
 for(const tex of [String.raw`\frac{a}{b}`,String.raw`\rule{1em}{10em}`,String.raw`\rlap{\rule{20em}{1em}}x`]) {
  const result=await page.evaluate(async tex=>{
   const m=(window as any).mermaid;m.initialize({startOnLoad:false,securityLevel:'strict',theme:'base'});
   const source=`stateDiagram-v2\nstate "Title $$${tex}$$" as A\nA: Body $$${tex}$$\nstate "Single $$${tex}$$" as B\nnote right of A: Note $$${tex}$$\nA --> B: Edge $$${tex}$$\n`;
   const {db}=await m.mermaidAPI.getDiagramFromText(source);const titleDomId=db.getData().nodes.find((node:any)=>node.id==='A').domId;
   document.querySelector('main')!.innerHTML=(await m.render('stateGeometry',source)).svg;
   const svg=document.querySelector('main svg')!, failures:string[]=[];
   const rect=(e:Element)=>e.getBoundingClientRect();
   const contains=(a:DOMRect,b:DOMRect)=>b.left>=a.left-1&&b.right<=a.right+1&&b.top>=a.top-1&&b.bottom<=a.bottom+1;
   const viewport=rect(svg),formulas=[...svg.querySelectorAll('math[data-vs-mermaid-formula]')];
   for(const [index,math] of formulas.entries()) {
    const foreign=math.closest('foreignObject')!;
    const ink=[math,...math.querySelectorAll('*')].filter(e=>{const r=rect(e);return r.width>0&&r.height>0;});
    if(!ink.length)failures.push(`${index}: empty ink`);
    for(const e of ink) {if(!contains(rect(foreign),rect(e)))failures.push(`${index}: foreignObject clips ink`);if(!contains(viewport,rect(e)))failures.push(`${index}: viewBox clips ink`);}
   }
   const owner=[...svg.querySelectorAll('g')].find(node=>node.id===`stateGeometry-${titleDomId}`);
   const titleBody=owner?.querySelector(':scope > g.label');
   if(!titleBody) failures.push('missing title/body owner');
   if(titleBody) {
    const formulas=[...titleBody.querySelectorAll('math[data-vs-mermaid-formula]')];
    if(formulas.length!==2) failures.push('missing title/body formulas');
    if(formulas.length===2) {const a=rect(formulas[0]!),b=rect(formulas[1]!);if(a.bottom>b.top+1)failures.push('title/body overlap');}
   }
   return {count:formulas.length,failures};
  },tex);
  expect(result.count,tex).toBe(5);expect(result.failures,tex).toEqual([]);
 }
});
