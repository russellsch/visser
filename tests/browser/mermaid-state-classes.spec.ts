import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
// @ts-expect-error checked build script outside TS project
import { mermaidMathPlugin } from '../../scripts/mermaid-build.mjs';
let bundle:string;
test.beforeAll(async()=>{
 bundle=(await build({stdin:{contents:"import './packages/runtime/src/mermaid-bundle.ts';import {attachTargets} from './packages/runtime/src/mermaid.ts';import {highlight} from './packages/runtime/src/marks.ts';globalThis.classHooks={attachTargets,highlight};",resolveDir:process.cwd()},bundle:true,platform:'browser',format:'iife',write:false,plugins:[mermaidMathPlugin(process.cwd())]})).outputFiles[0]!.text;
});
test('state endpoint classes cannot impersonate toolkit CSS or selection state',async({page})=>{
 await page.setContent('<!doctype html><figure class="vs-figure vs-mermaid vs-mermaid-rendered"><div class="vs-viewport"></div><span data-vs-mermaid-key="state:A" data-vs-target="test_state"></span></figure>');
 await page.addStyleTag({content:readFileSync('packages/runtime/src/reader.css','utf8')});
 await page.addScriptTag({content:bundle});
 const result=await page.evaluate(async()=>{
  const m=(window as any).mermaid, failures:string[]=[];
  for(const math of [false,true])for(const klass of ['vs-mermaid-source','vs-selected','vs-math'])for(const encoding of ['literal','numeric','space']) {
   m.initialize({startOnLoad:false,securityLevel:'strict',theme:'base'});
   const encoded=encoding==='numeric'?klass.replaceAll('-', 'ﬂ°°45¶ß'):encoding==='space'?`ordinaryﬂ°Tab¶ß${klass.replaceAll('-', 'ﬂ°°x2d¶ß')}`:klass;
   const source=`stateDiagram-v2\nA: ${math?'$$x$$':'ordinary'}\nA --> B\nclass A ${encoded}\nclassDef ordinary fill:#f00\nclass B ordinary\n`;
   const {db}=await m.mermaidAPI.getDiagramFromText(source);
   const node=db.getData().nodes.find((n:any)=>n.id==='A');
   if(!node.cssClasses.includes('mermaid-authored-'))failures.push('DB class not isolated');
   const viewport=document.querySelector('.vs-viewport')!;viewport.innerHTML=(await m.render('stateClasses',source)).svg;
   const svg=viewport.querySelector('svg')!, tagged=[...svg.querySelectorAll('[class]')].filter(e=>e.classList.contains(`mermaid-authored-${klass}`));
   if(tagged.length!==1)failures.push(`${math}/${klass}: missing isolated node`);
   if(svg.querySelector('.vs-mermaid-source,.vs-selected,.vs-math'))failures.push('impersonation');
   if(tagged.some(e=>getComputedStyle(e).display==='none'||e.getBoundingClientRect().width<=0))failures.push('hidden node');
   if(math&&svg.querySelectorAll('math[data-vs-mermaid-formula]').length!==1)failures.push('missing equation');
   if(!svg.querySelector('.ordinary'))failures.push('ordinary class lost');
   const figure=document.querySelector('figure')!;
   if((window as any).classHooks.attachTargets(figure,svg,'stateClasses'))failures.push('missing target');
   (window as any).classHooks.highlight(['test_state'],'vs-selected');
   if(!svg.querySelector('[data-vs-target="test_state"].vs-selected'))failures.push('genuine highlight lost');
   const clone=svg.cloneNode(true) as SVGSVGElement;
   if(clone.querySelector('.vs-mermaid-source,.vs-math'))failures.push('clone impersonation');
  }
  const {db}=await m.mermaidAPI.getDiagramFromText('stateDiagram-v2\nA --> B\n');
  db.addStyleClass('vs-selected','fill:#f00');db.setCssClass('A','vs-selected ordinary');
  if(!db.getClasses().has('mermaid-authored-vs-selected')||db.getClasses().has('vs-selected'))failures.push('definition key differs');
  if(!db.getStates().get('A').classes.includes('mermaid-authored-vs-selected ordinary'))failures.push('assignment key differs');
  return failures;
 });
 expect(result).toEqual([]);
});
