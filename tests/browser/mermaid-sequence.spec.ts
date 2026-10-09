import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
// @ts-expect-error checked build script outside the TS project
import { mermaidMathPlugin } from '../../scripts/mermaid-build.mjs';
let bundle: string;
let original: string;
test.beforeAll(async () => {
  const options = {bundle:true,platform:'browser' as const,format:'iife' as const,minify:true,write:false as const};
  bundle = (await build({...options,stdin:{contents:"import './packages/runtime/src/mermaid-bundle.ts'; import {createSequenceDraw,sequenceActorDraw} from './packages/runtime/src/mermaid-sequence.ts'; import {bindSequenceMessage,drawSequenceMessage} from './packages/runtime/src/mermaid-sequence-message.ts'; import {attachTargets} from './packages/runtime/src/mermaid.ts'; import {highlight} from './packages/runtime/src/marks.ts'; globalThis.classHooks={attachTargets,highlight}; globalThis.sequenceHooks={createSequenceDraw,sequenceActorDraw,bindSequenceMessage,drawSequenceMessage};",resolveDir:process.cwd()},plugins:[mermaidMathPlugin(process.cwd())]})).outputFiles[0]!.text;
  original = (await build({...options,stdin:{contents:"import m from 'mermaid';globalThis.mermaidOriginal=m",resolveDir:process.cwd()}})).outputFiles[0]!.text;
});

test('sequence actor math reserves ink, preserves copies, and clears neighboring geometry', async ({page}) => {
  test.setTimeout(120_000);
  await page.setContent('<!doctype html><main></main>');
  await page.addScriptTag({content:bundle});
  const types = ['participant','actor','boundary','control','entity','database','collections','queue'];
  const formulas = [String.raw`\frac{a}{b}`,String.raw`\rlap{\rule{20em}{1em}}x`,String.raw`\rule{1em}{10em}`];
  for (const look of ['classic','neo']) for (const type of types) for (const tex of formulas) {
    await test.step(`${look}/${type}/${tex}`,async () => {
      const result = await page.evaluate(async ({look,type,tex}) => {
        const mermaid = (window as any).mermaid;
        mermaid.initialize({startOnLoad:false,securityLevel:'strict',look,sequence:{useMaxWidth:false,mirrorActors:true,actorFontSize:20},theme:'base'});
        const source = `sequenceDiagram\nparticipant A@{type: ${type}} as Before $$${tex}$$ after\nparticipant B as Plain neighbor\nA->>B: Plain message`;
        const output = await mermaid.render('sequenceMath',source);
        document.querySelector('main')!.innerHTML = output.svg;
        const svg = document.querySelector<SVGSVGElement>('main svg')!;
        const labels = [...svg.querySelectorAll('[data-vs-mermaid-label]')];
        const rect = (e:Element) => e.getBoundingClientRect();
        const contains = (a:DOMRect,b:DOMRect) => b.left>=a.left-1&&b.right<=a.right+1&&b.top>=a.top-1&&b.bottom<=a.bottom+1;
        const viewport = rect(svg);
        const inks = labels.map(label=>[...label.querySelectorAll('math, math *')].filter(e=>{const r=rect(e);return r.width>0&&r.height>0}));
        const message = svg.querySelector('.messageText')!;
        const m = rect(message);
        const neighbors = [...svg.querySelectorAll('text.actor')].filter(e=>e.textContent?.includes('Plain neighbor'));
        const overlap = (a:DOMRect,b:DOMRect)=>a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1;
        return {keys:labels.map(e=>e.getAttribute('data-vs-mermaid-label')).sort(),
          tex:labels.map(e=>e.querySelector('[data-vs-mermaid-formula]')?.getAttribute('data-vs-mermaid-formula')),
          contained:labels.every((e,i)=>contains(viewport,rect(e))&&inks[i]!.every(n=>contains(rect(e),rect(n)))),
          collisions:labels.some(e=>overlap(rect(e),m)||neighbors.some(n=>overlap(rect(e),rect(n)))),
          glyphCollisions:['actor','boundary','control','entity','database'].includes(type) && labels.some(e=>[...e.parentElement!.querySelectorAll('circle,line,path,ellipse')].some(n=>overlap(rect(e),rect(n)))),
          fonts:labels.map(e=>getComputedStyle(e.firstElementChild!).fontSize),
          math:svg.querySelectorAll('math').length};
      },{look,type,tex});
      expect(result.keys).toEqual(['actor:A:footer','actor:A:header']);
      expect(result.tex).toEqual([tex,tex]);
      expect(result.math).toBe(2);
      expect(result.fonts).toEqual(['20px','20px']);
      expect(result.contained).toBe(true);
      expect(result.collisions).toBe(false);
      expect(result.glyphCollisions).toBe(false);
    });
  }
});

test('plain sequence uses native rendering geometry', async ({page}) => {
  await page.setContent('<!doctype html><main></main>');
  await page.addScriptTag({content:bundle});
  await page.addScriptTag({content:original});
  const result = await page.evaluate(async () => {
    const source = 'sequenceDiagram\nparticipant A as Alpha\nactor B as Beta\nA->>B: A plain message\nnote over A,B: A note';
    const snapshots=[];
    for (const mermaid of [(window as any).mermaid,(window as any).mermaidOriginal]) {
      mermaid.initialize({startOnLoad:false,securityLevel:'strict',sequence:{useMaxWidth:false},deterministicIds:true});
      document.querySelector('main')!.innerHTML = (await mermaid.render('plainSequence',source)).svg;
      const svg=document.querySelector<SVGSVGElement>('main svg')!;
      snapshots.push({viewBox:svg.getAttribute('viewBox'),elements:[...svg.querySelectorAll('text,rect,path,line')].map(e=>({tag:e.tagName,text:e.textContent,x:e.getAttribute('x'),y:e.getAttribute('y'),width:e.getAttribute('width'),height:e.getAttribute('height'),d:e.getAttribute('d')}))});
    }
    return snapshots;
  });
  expect(result[0]).toEqual(result[1]);
});

test('sequence actor wrapping, visibility and lifecycle preserve planned copies across redraws', async ({page}) => {
  await page.setContent('<!doctype html><main></main>');
  await page.addScriptTag({content:bundle});
  const results = await page.evaluate(async () => {
    const mermaid = (window as any).mermaid;
    const results=[];
    for (const mirrorActors of [false,true]) for (const hideUnusedParticipants of [false,true]) {
      mermaid.initialize({startOnLoad:false,securityLevel:'strict',sequence:{useMaxWidth:false,mirrorActors,hideUnusedParticipants,wrap:true,width:150}});
      const source=String.raw`sequenceDiagram
participant A as Several ordinary words before $$\frac{x}{y}$$ and several more words afterwards
participant H as Hidden $$h$$
create participant B as Born $$b$$
A->>B: Create
B-->>A: Reply
 destroy B
B->>A: End`;
      document.querySelector('main')!.innerHTML=(await mermaid.render('sequenceCopies',source)).svg;
      const svg=document.querySelector<SVGSVGElement>('main svg')!;
      const labels=[...svg.querySelectorAll('[data-vs-mermaid-label]')];
      results.push({mirrorActors,hideUnusedParticipants,keys:labels.map(e=>e.getAttribute('data-vs-mermaid-label')).sort(),height:Number(labels.find(e=>e.getAttribute('data-vs-mermaid-label')==='actor:A:header')?.getAttribute('height')),
        tex:labels.filter(e=>e.getAttribute('data-vs-mermaid-label')?.startsWith('actor:A:')).map(e=>e.querySelector('[data-vs-mermaid-formula]')?.getAttribute('data-vs-mermaid-formula'))});
    }
    return results;
  });
  for (const result of results) {
    const owners=result.hideUnusedParticipants?['A','B']:['A','B','H'];
    const keys=owners.flatMap(owner=>result.mirrorActors?[`actor:${owner}:header`,`actor:${owner}:footer`]:[`actor:${owner}:header`]).sort();
    expect(result.keys).toEqual(keys);
    expect(result.height).toBeGreaterThan(60);
    expect(result.tex).toEqual(Array(result.mirrorActors?2:1).fill(String.raw`\frac{x}{y}`));
  }
});

test('sequence actor render failure releases ownership and omitted copies reject', async ({page}) => {
  await page.setContent('<!doctype html><svg id="hookSvg" width="1200" height="1200"></svg>');
  await page.addScriptTag({content:bundle});
  const results=await page.evaluate(async()=>{
    const {createSequenceDraw,sequenceActorDraw}=(window as any).sequenceHooks;
    const actor={name:'A',description:'$$x$$',type:'participant'};
    const db={getActors:()=>new Map([['A',actor]]),getMessages:()=>[],getBoxes:()=>[],getDiagramTitle:()=>''};
    const config=()=>({securityLevel:'strict',sequence:{width:150,wrapPadding:10,mirrorActors:false}});
    const errors=[];
    for(const mode of ['throw','omit','success']) {
      const draw=createSequenceDraw(async()=>{
        if(mode==='throw')throw new Error('Injected native failure');
        if(mode==='success')sequenceActorDraw(actor,false)(actor.description,{node:()=>document.querySelector('svg')},0,0,1000,1000);
      },config);
      try {await draw('', 'hookSvg','',{db});} catch(e){errors.push(String(e));}
    }
    return {errors,copies:document.querySelectorAll('[data-vs-mermaid-label]').length,boundAfter:!!sequenceActorDraw(actor,false)};
  });
  expect(results.errors).toEqual(['Error: Injected native failure','Error: Sequence actor math copies are missing']);
  expect(results.copies).toBe(1);
  expect(results.boundAfter).toBe(false);
});

test('hidden unused unknown actor types have no copies; visible unknown types reject', async ({page}) => {
  await page.setContent('<!doctype html><main></main>');
  await page.addScriptTag({content:bundle});
  const result=await page.evaluate(async()=>{
    const mermaid=(window as any).mermaid;
    const source='sequenceDiagram\nparticipant H@{type: not-a-renderer} as $$h$$\nparticipant A\nparticipant B\nA->>B: Message';
    const outcomes=[];
    for(const hideUnusedParticipants of [true,false,true]) {
      mermaid.initialize({startOnLoad:false,securityLevel:'strict',sequence:{hideUnusedParticipants}});
      try {
        document.querySelector('main')!.innerHTML=(await mermaid.render('hiddenUnknown',source)).svg;
        outcomes.push({copies:document.querySelectorAll('[data-vs-mermaid-label]').length});
      }catch(error){outcomes.push({error:String(error)});}
    }
    return outcomes;
  });
  expect(result).toEqual([{copies:0},{error:'Error: Sequence math actor has no renderer'},{copies:0}]);
});

test('sequence notes reserve math ink for every placement before surrounding layout', async ({page}) => {
  test.setTimeout(120_000);
  await page.setContent('<!doctype html><main></main>');
  await page.addScriptTag({content:bundle});
  const expressions=[String.raw`\frac{a}{b}`,String.raw`\rlap{\rule{20em}{1em}}x`,String.raw`\smash{\rule{1em}{10em}}y`];
  for (const placement of ['left of A','right of B','over A','over A,B','over B,A']) for (const wrap of [false,true]) for(const tex of expressions) {
    await test.step(`${placement}/${wrap}/${tex}`,async()=>{
      const result=await page.evaluate(async({placement,wrap,tex})=>{
        const mermaid=(window as any).mermaid;
        mermaid.initialize({startOnLoad:false,securityLevel:'strict',sequence:{useMaxWidth:false,wrap,noteFontSize:18}});
        const source=`sequenceDiagram\nparticipant A\nparticipant B\nA->>B: Before note\nnote ${placement}: Several words before $$${tex}$$ and several words after\nB->>A: After note`;
        document.querySelector('main')!.innerHTML=(await mermaid.render('sequenceNotes',source)).svg;
        const svg=document.querySelector<SVGSVGElement>('main svg')!;
        const labels=[...svg.querySelectorAll('[data-vs-mermaid-label]')];
        const label=labels[0]!;
        const note=label?.parentElement?.querySelector('rect');
        const rect=(e:Element)=>e.getBoundingClientRect();
        const contains=(a:DOMRect,b:DOMRect)=>b.left>=a.left-1&&b.right<=a.right+1&&b.top>=a.top-1&&b.bottom<=a.bottom+1;
        const overlap=(a:DOMRect,b:DOMRect)=>a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1;
        return {keys:labels.map(e=>e.getAttribute('data-vs-mermaid-label')),tex:label?.querySelector('[data-vs-mermaid-formula]')?.getAttribute('data-vs-mermaid-formula'),
          contained:!!label&&!!note&&contains(rect(svg),rect(note))&&contains(rect(note),rect(label))&&[...label.querySelectorAll('math, math *')].every(e=>{const r=rect(e);return !r.width||!r.height||contains(rect(label),r)}),
          collisions:!!note&&[...svg.querySelectorAll('.messageText,text.actor')].some(e=>overlap(rect(note),rect(e))),
          font:label&&getComputedStyle(label.firstElementChild!).fontSize,
          math:svg.querySelectorAll('math').length};
      },{placement,wrap,tex});
      expect(result.keys).toEqual(['message:1']);
      expect(result.tex).toBe(tex);
      expect(result.contained).toBe(true);
      expect(result.collisions).toBe(false);
      expect(result.font).toBe('18px');
      expect(result.math).toBe(1);
    });
  }
});

test('sequence message math reserves ink for forward, reverse and self arrows', async ({page}) => {
  test.setTimeout(120_000);
  await page.setContent('<!doctype html><main></main>');
  await page.addScriptTag({content:bundle});
  const expressions=[String.raw`\frac{a}{b}`,String.raw`\rlap{\rule{20em}{1em}}x`,String.raw`\smash{\rule{1em}{10em}}y`];
  for(const arrow of ['->>','-->>','->','-->','-x','--x','-)','--)']) for(const [from,to] of [['A','B'],['B','A'],['A','A']]) for(const wrap of [false,true]) for(const tex of expressions) {
    await test.step(`${from}${arrow}${to}/${wrap}/${tex}`,async()=>{
      const result=await page.evaluate(async({from,to,arrow,wrap,tex})=>{
        const mermaid=(window as any).mermaid;
        mermaid.initialize({startOnLoad:false,securityLevel:'strict',sequence:{useMaxWidth:false,wrap,messageFontSize:18}});
        const source=`sequenceDiagram\nparticipant A\nparticipant B\n${from}${arrow}${to}: Several words before $$${tex}$$ and several words after\nB->>A: After message`;
        document.querySelector('main')!.innerHTML=(await mermaid.render('sequenceMessages',source)).svg;
        const svg=document.querySelector<SVGSVGElement>('main svg')!;
        const labels=[...svg.querySelectorAll('[data-vs-mermaid-label]')];
        const label=labels[0];
        const rect=(e:Element)=>e.getBoundingClientRect();
        const contains=(a:DOMRect,b:DOMRect)=>b.left>=a.left-1&&b.right<=a.right+1&&b.top>=a.top-1&&b.bottom<=a.bottom+1;
        const overlap=(a:DOMRect,b:DOMRect)=>a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1;
        return {keys:labels.map(e=>e.getAttribute('data-vs-mermaid-label')),tex:label?.querySelector('[data-vs-mermaid-formula]')?.getAttribute('data-vs-mermaid-formula'),
          contained:!!label&&contains(rect(svg),rect(label))&&[...label.querySelectorAll('math, math *')].every(e=>{const r=rect(e);return !r.width||!r.height||contains(rect(label),r)}),
          collisions:!!label&&[...svg.querySelectorAll('text.messageText,text.actor')].some(e=>overlap(rect(label),rect(e))),
          arrowCollision:!!label&&[...svg.querySelectorAll('.messageLine0,.messageLine1')].some(e=>overlap(rect(label),rect(e))),
          font:label&&getComputedStyle(label.firstElementChild!).fontSize,math:svg.querySelectorAll('math').length};
      },{from:from!,to:to!,arrow,wrap,tex});
      expect(result.keys).toEqual(['message:0']);
      expect(result.tex).toBe(tex);
      expect(result.contained).toBe(true);
      expect(result.collisions).toBe(false);
      expect(result.arrowCollision).toBe(false);
      expect(result.font).toBe('18px');
      expect(result.math).toBe(1);
    });
  }
});

test('sequence math keeps geometry with activations, lifecycles, loops and numbering',async({page})=>{
  await page.setContent('<!doctype html><main></main>');
  await page.addScriptTag({content:bundle});
  const formula=String.raw`\rlap{\rule{20em}{1em}}x`;
  const fixtures=[
    {name:'activation',body:`participant A\nparticipant B\nautonumber\nA->>+B: $$${formula}$$\nB-->>-A: $$${formula}$$`,keys:['message:1','message:3']},
    {name:'lifecycle',body:`participant A\ncreate participant B\nA->>B: $$${formula}$$\ndestroy B\nB-->>A: $$${formula}$$`,keys:['message:0','message:1']},
    {name:'loop',body:`participant A\nparticipant B\nloop Repeat\nA->>B: $$${formula}$$\nnote over A,B: $$${formula}$$\nend`,keys:['message:1','message:2']},
    {name:'self',body:`participant A\nautonumber\nA->>A: $$${formula}$$\nA-->>A: $$${formula}$$`,keys:['message:1','message:2']},
  ];
  for(const fixture of fixtures)for(const look of ['classic','neo'])for(const rightAngles of [false,true]){
    await test.step(`${fixture.name}/${look}/${rightAngles}`,async()=>{
      const result=await page.evaluate(async({body,look,rightAngles})=>{
        const mermaid=(window as any).mermaid;
        mermaid.initialize({startOnLoad:false,securityLevel:'strict',look,sequence:{useMaxWidth:false,rightAngles}});
        document.querySelector('main')!.innerHTML=(await mermaid.render('sequenceInteractions',`sequenceDiagram\n${body}`)).svg;
        const svg=document.querySelector<SVGSVGElement>('main svg')!;
        const labels=[...svg.querySelectorAll('[data-vs-mermaid-label]')];
        const rect=(e:Element)=>e.getBoundingClientRect();
        const contains=(a:DOMRect,b:DOMRect)=>b.left>=a.left-1&&b.right<=a.right+1&&b.top>=a.top-1&&b.bottom<=a.bottom+1;
        const overlap=(a:DOMRect,b:DOMRect)=>a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1;
        const neighbors=[...svg.querySelectorAll('text.actor,text.messageText,.sequenceNumber,.messageLine0,.messageLine1')];
        return {keys:labels.map(e=>e.getAttribute('data-vs-mermaid-label')).sort(),contained:labels.every(e=>contains(rect(svg),rect(e))),
          collisions:labels.flatMap((e,i)=>neighbors.filter(n=>overlap(rect(e),rect(n))).map(n=>({label:i,tag:n.tagName,cls:n.getAttribute('class'),text:n.textContent}))),
          labelCollisions:labels.some((e,i)=>labels.slice(i+1).some(n=>overlap(rect(e),rect(n))))};
      },{body:fixture.body,look,rightAngles});
      expect(result.keys).toEqual(fixture.keys);
      expect(result.contained).toBe(true);
      expect(result.collisions).toEqual([]);
      expect(result.labelCollisions).toBe(false);
    });
  }
});

test('failed sequence messages remove partial math and release model ownership',async({page})=>{
  await page.setContent('<!doctype html><svg id="messageFailure" width="1200" height="1200"></svg>');
  await page.addScriptTag({content:bundle});
  const result=await page.evaluate(async()=>{
    const {createSequenceDraw,bindSequenceMessage,drawSequenceMessage}=(window as any).sequenceHooks;
    const messages=[{id:'0',type:0,message:'$$x$$'},{id:'1',type:0,message:'$$y$$'}];
    const db={getActors:()=>new Map(),getMessages:()=>messages,getBoxes:()=>[],getDiagramTitle:()=>''};
    const config=()=>({securityLevel:'strict',sequence:{width:150,wrapPadding:10,boxMargin:10,mirrorActors:false,noteMargin:10}});
    const parent={node:()=>document.querySelector('svg')};
    const makeModel=(text:string)=>({message:text,startx:0,stopx:600,starty:0,stopy:600,width:600,height:600,fromBounds:0,toBounds:600});
    const errors=[];const counts=[];let oldModel:any;
    for(const mode of ['throw','omit','success']){
      const draw=createSequenceDraw(async()=>{
        oldModel=bindSequenceMessage(messages[0],makeModel('$$x$$'));
        drawSequenceMessage(oldModel,parent,200);
        if(mode==='throw')throw new Error('Injected message draw failure');
        if(mode==='success')drawSequenceMessage(bindSequenceMessage(messages[1],makeModel('$$y$$')),parent,400);
      },config);
      try{await draw('','messageFailure','',{db});}catch(error){errors.push(String(error));}
      counts.push(document.querySelectorAll('[data-vs-mermaid-label]').length);
    }
    return {errors,counts,released:!drawSequenceMessage(oldModel,parent,600)};
  });
  expect(result.errors).toEqual(['Error: Injected message draw failure','Error: Sequence message math copies are missing']);
  expect(result.counts).toEqual([0,0,2]);
  expect(result.released).toBe(true);
});

test('sequence diagram and box titles reserve measured space for every visible run',async({page})=>{
  test.setTimeout(120_000);
  await page.setContent('<!doctype html><main></main>');
  await page.addScriptTag({content:bundle});
  const formulas=[String.raw`\frac{a}{b}`,String.raw`\rlap{\rule{20em}{1em}}x`,String.raw`\smash{\rule{1em}{10em}}x`,String.raw`x < y > z \& q`];
  for(const tex of formulas)for(const wrap of [false,true])for(const boxTextMargin of [5,30]){
    const result=await page.evaluate(async({tex,wrap,boxTextMargin})=>{
      const mermaid=(window as any).mermaid;
      mermaid.initialize({startOnLoad:false,securityLevel:'strict',sequence:{useMaxWidth:false,wrap,boxTextMargin}});
      const source=`sequenceDiagram\ntitle Analysis $$${tex}$$\nparticipant A\nparticipant B\nparticipant C\nbox Box $$${tex}$$\nparticipant A\nparticipant C\nend\nA->>B: First\nB->>C: Second`;
      document.querySelector('main')!.innerHTML=(await mermaid.render('sequenceTitles',source)).svg;
      const svg=document.querySelector<SVGSVGElement>('main svg')!;
      const labels=[...svg.querySelectorAll('[data-vs-mermaid-label]')];
      const rect=(e:Element)=>e.getBoundingClientRect();
      const contains=(a:DOMRect,b:DOMRect)=>b.left>=a.left-1&&b.right<=a.right+1&&b.top>=a.top-1&&b.bottom<=a.bottom+1;
      const overlap=(a:DOMRect,b:DOMRect)=>a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1;
      const ordinary=[...svg.querySelectorAll('text.actor,.messageLine0,text.messageText')];
      return {keys:labels.map(e=>e.getAttribute('data-vs-mermaid-label')).sort(),tex:labels.map(e=>e.querySelector('[data-vs-mermaid-formula]')?.getAttribute('data-vs-mermaid-formula')),
        contained:labels.every(e=>contains(rect(svg),rect(e))&&[...e.querySelectorAll('math,math *')].every(n=>{const r=rect(n);return !r.width||!r.height||contains(rect(e),r)})),
        collisions:labels.some((e,i)=>ordinary.some(n=>overlap(rect(e),rect(n)))||labels.slice(i+1).some(n=>overlap(rect(e),rect(n)))),
        boxXs:labels.filter(e=>e.getAttribute('data-vs-mermaid-label')?.startsWith('box:')).map(e=>rect(e).x),
        height:Number(svg.getAttribute('height')),viewHeight:svg.viewBox.baseVal.height};
    },{tex,wrap,boxTextMargin});
    expect(result.keys).toEqual(['box:0:run:0','box:0:run:1','title']);
    expect(result.tex).toEqual([tex,tex,tex]);
    expect(result.contained).toBe(true);
    expect(result.collisions).toBe(false);
    expect(result.boxXs[0]).not.toBe(result.boxXs[1]);
    expect(result.height).toBe(result.viewHeight);
  }
});

test('sequence title-only and filtered-out box titles retain valid geometry and copies',async({page})=>{
  await page.setContent('<!doctype html><main></main>');
  await page.addScriptTag({content:bundle});
  const result=await page.evaluate(async()=>{
    const mermaid=(window as any).mermaid;
    const results=[];
    const sources=[String.raw`sequenceDiagram
title $$\smash{\rule{1em}{10em}}x$$`,String.raw`sequenceDiagram
title $$\rlap{\rule{30em}{1em}}x$$
box Hidden $$h$$
participant H
end
box
participant A
participant B
end
A->>B: Plain`];
    for(const source of sources){
      mermaid.initialize({startOnLoad:false,securityLevel:'strict',look:'neo',sequence:{useMaxWidth:false,hideUnusedParticipants:true}});
      document.querySelector('main')!.innerHTML=(await mermaid.render('sequenceTitleOnly',source)).svg;
      const svg=document.querySelector<SVGSVGElement>('main svg')!;
      results.push({keys:[...svg.querySelectorAll('[data-vs-mermaid-label]')].map(e=>e.getAttribute('data-vs-mermaid-label')),height:svg.viewBox.baseVal.height,width:svg.viewBox.baseVal.width});
    }
    return results;
  });
  for(const entry of result){expect(entry.keys).toEqual(['title']);expect(entry.height).toBeGreaterThan(0);expect(entry.width).toBeGreaterThan(0);}
});

test('sequence newer arrow spellings and central connections preserve math clearance',async({page})=>{
  test.setTimeout(120_000);
  await page.setContent('<!doctype html><main></main>');
  await page.addScriptTag({content:bundle});
  const arrows=['<<->>','<<-->>','-|\\','-|/','-\\\\','-//','/|-','\\|-','//-','\\\\-','--|\\','--|/','--\\\\','--//','/|--','\\|--','//--','\\\\--'];
  for(const arrow of arrows)for(const direction of ['forward','reverse','self'])for(const connection of ['none','source','target','both']){
    await test.step(`${arrow}/${direction}/${connection}`,async()=>{
      const result=await page.evaluate(async({arrow,direction,connection})=>{
        const mermaid=(window as any).mermaid;
        const from=direction==='reverse'?'B':'A';const to=direction==='self'?'A':direction==='reverse'?'A':'B';
        const left=connection==='source'||connection==='both'?'()':'';const right=connection==='target'||connection==='both'?'()':'';
        mermaid.initialize({startOnLoad:false,securityLevel:'strict',look:connection==='both'?'neo':'classic',sequence:{useMaxWidth:false,rightAngles:connection==='source'}});
        const source=`sequenceDiagram\nparticipant A\nparticipant B\nautonumber\n${from}${left}${arrow}${right}${to}: $$\\rlap{\\rule{20em}{1em}}x$$`;
        document.querySelector('main')!.innerHTML=(await mermaid.render('sequenceArrowInventory',source)).svg;
        const svg=document.querySelector<SVGSVGElement>('main svg')!;const label=svg.querySelector('[data-vs-mermaid-label]');
        const rect=(e:Element)=>e.getBoundingClientRect();
        const contains=(a:DOMRect,b:DOMRect)=>b.left>=a.left-1&&b.right<=a.right+1&&b.top>=a.top-1&&b.bottom<=a.bottom+1;
        const overlap=(a:DOMRect,b:DOMRect)=>a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1;
        return {key:label?.getAttribute('data-vs-mermaid-label'),count:svg.querySelectorAll('math').length,
          contained:!!label&&contains(rect(svg),rect(label)),
          collisions:!!label&&[...svg.querySelectorAll('text.actor,.sequenceNumber,.messageLine0,.messageLine1,circle')].some(e=>overlap(rect(label),rect(e)))};
      },{arrow,direction,connection});
      expect(result.key).toBe('message:1');expect(result.count).toBe(1);expect(result.contained).toBe(true);expect(result.collisions).toBe(false);
    });
  }
});

test('sequence box math copies follow filtered actor runs',async({page})=>{
  await page.setContent('<!doctype html><main></main>');
  await page.addScriptTag({content:bundle});
  const result=await page.evaluate(async()=>{
    const mermaid=(window as any).mermaid;const results=[];
    const source='sequenceDiagram\nparticipant A\nparticipant B\nparticipant C\nbox Shared $$x$$\nparticipant A\nparticipant C\nend\nA->>C: Message';
    for(const hideUnusedParticipants of [false,true,false]){
      mermaid.initialize({startOnLoad:false,securityLevel:'strict',sequence:{hideUnusedParticipants}});
      document.querySelector('main')!.innerHTML=(await mermaid.render('sequenceBoxRuns',source)).svg;
      results.push([...document.querySelectorAll('[data-vs-mermaid-label]')].map(e=>e.getAttribute('data-vs-mermaid-label')).sort());
    }
    return results;
  });
  expect(result).toEqual([['box:0:run:0','box:0:run:1'],['box:0:run:0'],['box:0:run:0','box:0:run:1']]);
});

test('participant property classes cannot impersonate toolkit state in shapes or actor groups',async({page})=>{
  await page.setContent('<!doctype html><figure class="vs-figure vs-mermaid vs-mermaid-rendered"><div class="vs-viewport"></div><span data-vs-mermaid-key="participant:A" data-vs-target="test_actor"></span></figure>');
  await page.addStyleTag({content:readFileSync('packages/runtime/src/reader.css','utf8')});
  await page.addScriptTag({content:bundle});
  const result=await page.evaluate(async()=>{
    const m=(window as any).mermaid;
    const failures:string[]=[];
    for(const type of ['participant','collections','queue','database'])for(const math of [false,true])for(const property of ['actor vs-mermaid-source vs-selected vs-math', ['vs-mermaid-source vs-selected'],42]) {
      m.initialize({startOnLoad:false,securityLevel:'strict',sequence:{mirrorActors:true}});
      const source=`sequenceDiagram\nparticipant A@${JSON.stringify({type,alias:math?'$$x$$':'ordinary'})}\nproperties A: ${JSON.stringify({class:property})}\nA->>A: ordinary`;
      const viewport=document.querySelector('.vs-viewport')!;
      viewport.innerHTML=(await m.render('classBoundary',source)).svg;
      const svg=viewport.querySelector('svg')!;
      const tagged=[...svg.querySelectorAll('[class]')].filter(e=>e.classList.contains('mermaid-authored-vs-mermaid-source'));
      if(typeof property!=='number' && tagged.length!==2)failures.push(`${type}/${math}: copies ${tagged.length}`);
      if(svg.querySelector('.vs-mermaid-source,.vs-selected,.vs-math'))failures.push(`${type}/${math}: impersonation`);
      if(tagged.some(e=>getComputedStyle(e).display==='none'||e.getBoundingClientRect().width<=0))failures.push(`${type}/${math}: hidden shape`);
      if(math&&svg.querySelectorAll('[data-vs-mermaid-formula]').length!==2)failures.push(`${type}: missing formulas`);
      const figure=document.querySelector('figure')!;
      const missing=(window as any).classHooks.attachTargets(figure,svg,'classBoundary');
      if(missing)failures.push(`${type}: missing target`);
      (window as any).classHooks.highlight(['test_actor'],'vs-selected');
      if(!svg.querySelector('[data-vs-target="test_actor"].vs-selected'))failures.push(`${type}: real highlighting missing`);
      const clone=svg.cloneNode(true) as SVGSVGElement;
      const host=document.createElement('div');host.className='vs-mermaid-rendered';host.append(clone);document.body.append(host);
      if(clone.querySelector('.vs-mermaid-source,.vs-math'))failures.push(`${type}: clone impersonation`);
      if(!clone.querySelector('[data-vs-target="test_actor"].vs-selected'))failures.push(`${type}: clone lost real highlight`);
      host.remove();
    }
    return failures;
  });
  expect(result).toEqual([]);
});
