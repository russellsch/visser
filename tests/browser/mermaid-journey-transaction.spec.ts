import { build } from 'esbuild';
import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';

let bundle:string;
test.beforeAll(async()=>{
  bundle=(await build({stdin:{resolveDir:resolve('.'),sourcefile:'journey-transaction.ts',contents:`
    import {select} from 'd3';
    import {createJourneyMathRenderer} from './packages/runtime/src/mermaid-journey.ts';
    globalThis.JourneyTransaction={select,createJourneyMathRenderer};
  `},bundle:true,platform:'browser',format:'iife',write:false})).outputFiles[0]!.text;
});

test('journey removes staged graphics and restores SVG attributes after a drawing failure',async({page})=>{
  await page.setContent('<!doctype html><svg id="target" width="900" height="800" viewBox="0 0 900 800" data-before="kept"><g id="existing"></g></svg>');
  await page.addScriptTag({content:bundle});
  const result=await page.evaluate(async()=>{
    const {select,createJourneyMathRenderer}=(window as any).JourneyTransaction;
    const svg=document.getElementById('target')!,before=svg.outerHTML;
    const config={fontSize:16,journey:{width:150,height:50,taskMargin:50,diagramMarginX:50,diagramMarginY:10,leftMargin:150,taskFontSize:14,sectionFills:['#222'],sectionColours:['#fff'],actorColours:['#0f0']}};
    let fail=true,reads=0;
    const draw=createJourneyMathRenderer({getConfig:()=>config,select,original:()=>{throw new Error('unexpected plain dispatch');},
      initGraphics:(group:any)=>group.append('defs').append('marker').attr('id','staged-marker'),
      drawFace:()=>{},drawCircle:()=>{},
      configureSvgSize:(group:any)=>{group.attr('data-mutated','yes').attr('width',12);if(fail)throw new Error('injected draw failure');},
    });
    const diagram={db:{getTasks:()=>{reads++;return[{task:'$$x$$',section:'',people:[],score:3}];},getActors:()=>[],getDiagramTitle:()=>''}};
    let error='';try{await draw('','target','',diagram);}catch(caught){error=String(caught);}
    const afterFailure={same:svg.outerHTML===before,groups:svg.querySelectorAll('.vs-journey-math').length,markers:svg.querySelectorAll('marker').length,probes:svg.querySelectorAll('svg,foreignObject').length};
    fail=false;await draw('','target','',diagram);
    return {error,afterFailure,reads,recovered:svg.querySelectorAll('.vs-journey-math math').length,existing:!!document.getElementById('existing')};
  });
  expect(result.error).toContain('injected draw failure');
  expect(result.afterFailure).toEqual({same:true,groups:0,markers:0,probes:0});
  expect(result.reads).toBe(2);
  expect(result.recovered).toBe(1);
  expect(result.existing).toBe(true);
});
