import {build} from 'esbuild';
import {test,expect} from '@playwright/test';
import {resolve} from 'node:path';
let bundle:string;
test.beforeAll(async()=>{
 bundle=(await build({stdin:{resolveDir:resolve('.'),sourcefile:'quadrant-transaction.ts',contents:`import {select} from 'd3';import {createQuadrantMathRenderer} from './packages/runtime/src/mermaid-quadrant.ts';globalThis.QuadrantTransaction={select,createQuadrantMathRenderer};`},bundle:true,platform:'browser',format:'iife',write:false})).outputFiles[0]!.text;
});
test('quadrant restores existing SVG after post-draw failure and recovers',async({page})=>{
 await page.setContent('<!doctype html><svg id="target" width="900" height="800" viewBox="0 0 900 800"><g id="existing"></g></svg>');await page.addScriptTag({content:bundle});
 const result=await page.evaluate(async()=>{
  const {select,createQuadrantMathRenderer}=(window as any).QuadrantTransaction;
  const svg=document.getElementById('target')!,before=svg.outerHTML;
  const text=(value:string)=>({text:value,fontSize:16,fill:'#000'});
  const snapshot={title:'$$t$$',data:{quadrant1Text:'',quadrant2Text:'',quadrant3Text:'',quadrant4Text:'',xAxisLeftText:'',xAxisRightText:'',yAxisBottomText:'',yAxisTopText:'',points:[{text:'$$p$$',x:0.5,y:0.5}]}};
  const built={title:text('$$t$$'),quadrants:Array.from({length:4},()=>({text:text(''),fill:'#eee'})),axisLabels:[],points:[{text:text('$$p$$'),radius:5,fill:'#333',strokeColor:'#000',strokeWidth:'1px'}],borderLines:Array.from({length:6},()=>({strokeWidth:1,strokeFill:'#000'}))};
  let fail=true;
  const draw=createQuadrantMathRenderer({select,getConfig:()=>({fontSize:16,fontFamily:'Arial',quadrantChart:{chartWidth:500,chartHeight:500}}),getSnapshot:()=>structuredClone(snapshot),original:()=>{throw new Error('unexpected plain draw');},configureSvgSize:(selection:any)=>{selection.attr('width',12).attr('data-mutated','yes');if(fail)throw new Error('injected draw failure');}});
  const diagram={db:{getQuadrantData:()=>structuredClone(built)}};
  let error='';try{await draw('','target','',diagram);}catch(caught){error=String(caught);}
  const same=svg.outerHTML===before,staged=svg.querySelectorAll('.vs-quadrant-math,foreignObject,svg').length;
  fail=false;await draw('','target','',diagram);
  return {error,same,staged,formulas:svg.querySelectorAll('math').length,existing:!!document.getElementById('existing')};
 });
 expect(result).toEqual({error:'Error: injected draw failure',same:true,staged:0,formulas:2,existing:true});
});
