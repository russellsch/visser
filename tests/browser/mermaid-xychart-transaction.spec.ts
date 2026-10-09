import {build} from 'esbuild';
import {test,expect} from '@playwright/test';
import {resolve} from 'node:path';
let bundle:string;
test.beforeAll(async()=>{
 bundle=(await build({stdin:{resolveDir:resolve('.'),sourcefile:'xy-transaction.ts',contents:`import {select} from 'd3';import {createXYMathRenderer} from './packages/runtime/src/mermaid-xychart.ts';globalThis.XYTransaction={select,createXYMathRenderer};`},bundle:true,platform:'browser',format:'iife',write:false})).outputFiles[0]!.text;
});
test('XY removes probes and restores the original SVG after measurement and staged failures',async({page})=>{
 await page.setContent('<!doctype html><svg id="target" width="900" height="800" viewBox="0 0 900 800"><g id="existing"></g></svg>');await page.addScriptTag({content:bundle});
 const result=await page.evaluate(async()=>{
  const {select,createXYMathRenderer}=(window as any).XYTransaction;
  const svg=document.getElementById('target')!,before=svg.outerHTML;
  const axis=()=>({boundingRect:{},setAxisPosition(){},getTickValues:()=>[],setRange(){},setBoundingBoxXY(){},getAxisOuterPadding:()=>0,getScaleValue:(n:number)=>n,getDrawableElements:()=>[]});
  const settings={showTitle:false,showLabel:false,showTick:false,showAxisLine:false,labelPadding:0,titlePadding:0,tickLength:0,axisLineWidth:0,tickWidth:0};
  const conf={width:100,height:100,showTitle:true,titleFontSize:20,xAxis:settings,yAxis:settings,legendPadding:0};
  let title='$$\\badcommand$$',fail=true;
  const draw=createXYMathRenderer({select,getConfig:()=>({fontSize:16,fontFamily:'Arial'}),components:()=>({xAxis:axis(),yAxis:axis(),plot:{calculateSpace(){},setBoundingBoxXY(){},setAxes(){},getDrawableElements:()=>[{type:'path',groupTexts:['plot','line-plot-0'],data:[{path:'M0,0L100,100',strokeWidth:2,strokeFill:'#000'}]}]}}),original:()=>{throw new Error('unexpected plain draw');},configureSvgSize:(selection:any)=>{selection.attr('width',12).attr('data-mutated','yes');if(fail)throw new Error('injected draw failure');}});
  const diagram={db:{getXYChartData:()=>({xAxis:{title:'',type:'linear'},yAxis:{title:'',type:'linear'},plots:[{type:'line',title:'',data:[[0,0],[100,100]],strokeWidth:2}]}),getChartConfig:()=>conf,getChartThemeConfig:()=>({titleColor:'#000',backgroundColor:'#fff'}),getDiagramTitle:()=>title}};
  let measurementError='',stageError='';try{await draw('','target','',diagram);}catch(error){measurementError=String(error);}
  const measurementSame=svg.outerHTML===before;
  title='$$t$$';try{await draw('','target','',diagram);}catch(error){stageError=String(error);}
  const stageSame=svg.outerHTML===before,leaks=svg.querySelectorAll('.vs-xy-math,[data-vs-xy-probe],foreignObject,svg').length;
  fail=false;await draw('','target','',diagram);
  return {measurementError,measurementSame,stageError,stageSame,leaks,formulas:svg.querySelectorAll('math').length,existing:!!document.getElementById('existing')};
 });
 expect(result.measurementError).toContain('badcommand');
 expect({...result,measurementError:undefined}).toEqual({measurementError:undefined,measurementSame:true,stageError:'Error: injected draw failure',stageSame:true,leaks:0,formulas:1,existing:true});
});
