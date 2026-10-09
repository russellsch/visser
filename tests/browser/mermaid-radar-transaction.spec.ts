import {build} from 'esbuild';
import {test,expect} from '@playwright/test';
import {resolve} from 'node:path';
// @ts-expect-error Checked build helper has no declaration file.
import {mermaidMathPlugin} from '../../scripts/mermaid-build.mjs';

let bundle:string;
test.beforeAll(async()=>{bundle=(await build({entryPoints:[resolve('packages/runtime/src/mermaid-bundle.ts')],plugins:[mermaidMathPlugin(resolve('.'))],bundle:true,platform:'browser',format:'iife',write:false})).outputFiles[0]!.text;});

test('Radar restores the caller root and detached native DB after failures, hides its native stage, and recovers',async({page})=>{
 await page.setContent('<!doctype html><svg id="target" width="900" height="800" style="color: red" viewBox="0 0 900 800"><g id="existing"></g></svg>');await page.addScriptTag({content:bundle});
 const result=await page.evaluate(async()=>{
  const mermaid=(window as any).mermaid;mermaid.initialize({startOnLoad:false,securityLevel:'strict',radar:{useMaxWidth:true}});
  const root=document.getElementById('target')!,before=root.outerHTML;
  const bad='radar-beta\ntitle $$\\unknownRadar$$\naxis a["$$a$$"],b\ncurve c["$$c$$"]{1,2}\n';
  const good='radar-beta\ntitle $$x$$\naccTitle: radar access\naccDescr: radar description\naxis a["$$a$$"],b\ncurve c["$$c$$"]{1,2}\nshowLegend true\n';
  const snapshot=(db:any)=>JSON.stringify({axes:db.getAxes(),curves:db.getCurves(),options:db.getOptions(),title:db.getDiagramTitle(),accTitle:db.getAccTitle(),accDescr:db.getAccDescription()});
  const errors:string[]=[],same:boolean[]=[];
  const badDiagram=await mermaid.mermaidAPI.getDiagramFromText(bad);
  try{await badDiagram.renderer.draw(bad,'target','',badDiagram);}catch(error){errors.push(String(error));}
  same.push(root.outerHTML===before);
  const diagram=await mermaid.mermaidAPI.getDiagramFromText(good),dbBefore=snapshot(diagram.db);
  const measurement=Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect=function(){if(this.closest('foreignObject'))throw new Error('injected Radar measurement failure');return measurement.call(this);};
  try{await diagram.renderer.draw(good,'target','',diagram);}catch(error){errors.push(String(error));}
  finally{Element.prototype.getBoundingClientRect=measurement;}
  same.push(root.outerHTML===before);
  const set=root.setAttribute;let fail=true,observed=0,visible=0;
  root.setAttribute=function(name:string,value:string){if(name==='viewBox'&&fail){fail=false;throw new Error('injected Radar commit failure');}return set.call(this,name,value);};
  const rect=Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect=function(){if(this.closest('foreignObject')){const stage=root.querySelector('[data-vs-radar-stage]');if(stage){observed++;if(getComputedStyle(stage).visibility!=='hidden')visible++;}}return rect.call(this);};
  try{await diagram.renderer.draw(good,'target','',diagram);}catch(error){errors.push(String(error));}
  finally{root.setAttribute=set;Element.prototype.getBoundingClientRect=rect;}
  same.push(root.outerHTML===before);
  const dbSame=snapshot(diagram.db)===dbBefore;
  await diagram.renderer.draw(good,'target','',diagram);
  return {errors,same,dbSame,observed,visible,leaks:root.querySelectorAll('[data-vs-radar-stage]').length,math:root.querySelectorAll('math').length,existing:!!root.querySelector('#existing')};
 });
 expect(result.errors[0]).toContain('unknownRadar');expect(result.errors[1]).toContain('injected Radar measurement failure');expect(result.errors[2]).toContain('injected Radar commit failure');
 expect(result.same).toEqual([true,true,true]);expect(result.dbSame).toBe(true);expect(result.observed).toBeGreaterThan(0);expect(result.visible).toBe(0);expect(result.leaks).toBe(0);expect(result.math).toBe(3);expect(result.existing).toBe(true);
});
