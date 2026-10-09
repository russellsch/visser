import {build} from 'esbuild';
import {test,expect} from '@playwright/test';
import {resolve} from 'node:path';
// @ts-expect-error Checked build helper has no declaration file.
import {mermaidMathPlugin} from '../../scripts/mermaid-build.mjs';
let bundle:string;
test.beforeAll(async()=>{bundle=(await build({entryPoints:[resolve('packages/runtime/src/mermaid-bundle.ts')],plugins:[mermaidMathPlugin(resolve('.'))],bundle:true,platform:'browser',format:'iife',write:false})).outputFiles[0]!.text;});
test('Sankey restores the root and DB after measurement and commit failures and keeps native staging hidden',async({page})=>{
 await page.setContent('<!doctype html><svg id="target" width="900" height="800" style="color: red" viewBox="0 0 900 800"><g id="existing"></g></svg>');await page.addScriptTag({content:bundle});
 const result=await page.evaluate(async()=>{
  const mermaid=(window as any).mermaid;mermaid.initialize({startOnLoad:false,securityLevel:'strict',sankey:{useMaxWidth:true}});
  const root=document.getElementById('target')!,before=root.outerHTML;
  const bad='sankey\n"$$\\unknownSankey$$",b,1\n',good='sankey\n"$$x$$",b,1\n';
  const errors:string[]=[],same:boolean[]=[];
  const badDiagram=await mermaid.mermaidAPI.getDiagramFromText(bad);
  try{await badDiagram.renderer.draw(bad,'target','',badDiagram);}catch(e){errors.push(String(e));}
  same.push(root.outerHTML===before);
  const diagram=await mermaid.mermaidAPI.getDiagramFromText(good),graphBefore=JSON.stringify(diagram.db.getGraph());
  const measurement=Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect=function(){if(this.closest('foreignObject'))throw new Error('injected Sankey measurement failure');return measurement.call(this);};
  try{await diagram.renderer.draw(good,'target','',diagram);}catch(e){errors.push(String(e));}
  finally{Element.prototype.getBoundingClientRect=measurement;}
  same.push(root.outerHTML===before);
  const set=root.setAttribute;let fail=true;
  root.setAttribute=function(name:string,value:string){if(name==='viewBox'&&fail){fail=false;throw new Error('injected Sankey commit failure');}return set.call(this,name,value);};
  const rect=Element.prototype.getBoundingClientRect;let observed=0,visible=0;
  Element.prototype.getBoundingClientRect=function(){if(this.closest('foreignObject')){const stage=root.querySelector('[data-vs-sankey-stage]');if(stage){observed++;if(getComputedStyle(stage).visibility!=='hidden')visible++;}}return rect.call(this);};
  try{await diagram.renderer.draw(good,'target','',diagram);}catch(e){errors.push(String(e));}
  finally{root.setAttribute=set;Element.prototype.getBoundingClientRect=rect;}
  same.push(root.outerHTML===before);
  const dbSame=JSON.stringify(diagram.db.getGraph())===graphBefore;
  await diagram.renderer.draw(good,'target','',diagram);
  return {errors,same,dbSame,observed,visible,leaks:root.querySelectorAll('[data-vs-sankey-stage]').length,math:root.querySelectorAll('math').length,existing:!!root.querySelector('#existing')};
 });
 expect(result.errors[0]).toContain('unknownSankey');expect(result.errors[1]).toContain('injected Sankey measurement failure');expect(result.errors[2]).toContain('injected Sankey commit failure');expect(result.same).toEqual([true,true,true]);expect(result.dbSame).toBe(true);expect(result.observed).toBeGreaterThan(0);expect(result.visible).toBe(0);expect(result.leaks).toBe(0);expect(result.math).toBe(1);expect(result.existing).toBe(true);
});
