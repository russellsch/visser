import { test, expect } from '@playwright/test';
import { buildSync } from 'esbuild';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { compileDocument } from '../../packages/core/src/compiler/compile.ts';
import { FLOWCHART_READER_CONTRACT } from '../../packages/core/src/compiler/flowchart-contract.ts';
let markup:string;
let runtime:string;
let childFirstMarkup:string;
test.beforeAll(async()=>{
 const dir=mkdtempSync(join(tmpdir(),'visser-flow-browser-'));
 try{
 const source=`---
format: visser/1
docId: 7d2b9c1e-3f4a-4b5c-8d6e-9f0a1b2c3d4e
title: Flowchart interaction
kind: reference
capturedAt: 2026-10-10T00:00:00Z
visibility: private
---
{% flowchart id="process" title="Order review" question="Which order proceeds?" %}
{% group id="outer" label="Validate" color="teal" /%}
{% group id="inner" label="Checks" parent="outer" color="violet" /%}
{% start id="start" label="Received" /%}
{% action id="check" label="Check order" group="inner" %}
Inspect the order before choosing its outcome. See {% detail-link ref="existing_detail" %}existing component{% /detail-link %}.
{% /action %}
{% decision id="valid" label="Valid?" group="inner" /%}
{% end id="ready" label="Ready" /%}
{% flow id="f1" from="start" to="check" /%}
{% flow id="f2" from="check" to="valid" /%}
{% flow id="yes" from="valid" to="ready" label="Yes" %}
Accepted orders proceed to Ready.
{% /flow %}
{% flow id="no" from="valid" to="check" label="No" /%}
{% /flowchart %}
{% graph id="existing" mode="architecture" title="Existing graph" question="What exists?" %}
{% node id="oldnode" role="process" label="Existing component" %}
A shared inspector destination. Shared component detail.
{% /node %}
{% /graph %}
{% detail id="existing_detail" label="Existing detail" %}
Existing reader detail used by the same inspector.
{% /detail %}`;
 writeFileSync(join(dir,'index.md'),source);
 const bundle=loadBundle(join(dir,'index.md'));
 expect(bundle.diagnostics.filter(d=>d.severity==='error')).toEqual([]);
 const built=await compileDocument(bundle,{version:'0.0.0',sha256:'e'.repeat(64),readerContracts:[FLOWCHART_READER_CONTRACT]}, {audience:'private',includeSource:false,layoutFallback:false});
 markup=new TextDecoder().decode(built.files.find(f=>f.path.endsWith('/index.html'))!.bytes)
 .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/g,'').replace(/<script[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link[^>]*>/g,'');
 markup=markup.replace('</head>',`<style>${readFileSync('packages/runtime/src/reader.css','utf8')}</style></head>`);
 writeFileSync(join(dir,'index.md'),source.replace(/(\{% group id="outer"[^\n]+)\n(\{% group id="inner"[^\n]+)/,'$2\n$1'));
 const reversed=await compileDocument(loadBundle(join(dir,'index.md')),{version:'0.0.0',sha256:'e'.repeat(64),readerContracts:[FLOWCHART_READER_CONTRACT]}, {audience:'private',includeSource:false,layoutFallback:false});
 childFirstMarkup=new TextDecoder().decode(reversed.files.find(f=>f.path.endsWith('/index.html'))!.bytes).replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/g,'').replace(/<script[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link[^>]*>/g,'').replace('</head>',`<style>${readFileSync('packages/runtime/src/reader.css','utf8')}</style></head>`);
 runtime=buildSync({entryPoints:['packages/runtime/src/reader.ts'],bundle:true,write:false,format:'iife',platform:'browser',target:'es2022'}).outputFiles[0]!.text;
 } finally {rmSync(dir,{recursive:true,force:true});}
});
async function open(page: import('@playwright/test').Page,childFirst=false){await page.setContent(childFirst?childFirstMarkup:markup);await page.addScriptTag({content:runtime});}
async function landscapeOverview(page:import('@playwright/test').Page){
 const size=page.viewportSize()!;if(size.width<=size.height)return;
 const dialog=page.locator('.vs-figure-viewer');await dialog.locator('.vs-viewer-menu > summary').click();
 for(let i=0;i<4;i++)await dialog.getByRole('button',{name:'Zoom out',exact:true}).click();
 await dialog.locator('.vs-viewer-menu > summary').click();
}
test('blocks and groups reuse the shared inspector; folding preserves original selection @FC26 @FC27 @FC32',async({page},info)=>{
 test.skip(Boolean(info.project.use.hasTouch),'desktop right sidebar contract; narrow viewer covered separately');
 await open(page);
 await page.locator('#v-process\\.check').click();
 const sidebar=page.locator('#vs-inspector');
 await expect(sidebar).toBeVisible();await expect(sidebar.locator('details[data-vs-target="check"]')).toBeVisible();
 await page.locator('[data-vs-fold-toggle="outer"]').click();
 await expect(sidebar.locator('details[data-vs-target="check"]')).toBeVisible();
 await expect(page.locator('[data-vs-fold="outer"]')).toHaveAttribute('data-vs-contains-selection','');
 await page.locator('[data-vs-fold="outer"]').click();
 await expect(sidebar.locator('details[data-vs-target="outer"]')).toBeVisible();
 await expect(sidebar.locator('.vs-flow-members')).toContainText('Check order');
 await page.locator('[data-vs-fold-expand="outer"]').click();
 await expect(sidebar.locator('details[data-vs-target="outer"]')).toBeVisible();
 await page.locator('#v-process\\.check').click();
 await sidebar.getByRole('link',{name:'existing component',exact:true}).click();
 await expect(sidebar.locator('details[data-vs-target="existing_detail"]')).toBeVisible();
 await sidebar.getByRole('button',{name:/Back/}).click();
 await expect(sidebar.locator('details[data-vs-target="check"]')).toBeVisible();
 expect(await page.locator('#vs-inspector').count()).toBe(1);
 await sidebar.getByRole('button',{name:'Close',exact:true}).click();
 await expect(page.locator('#v-process\\.check')).toBeFocused();
});
test('bare node and nested group clicks identify the original target, with visible keyboard focus @FC28 @FC30',async({page},info)=>{
 test.skip(Boolean(info.project.use.hasTouch),'wide keyboard contract');await open(page);
 await page.locator('#v-process\\.valid').focus();await page.keyboard.press('Enter');
 await expect(page.locator('#vs-inspector details[data-vs-target="valid"]')).toBeVisible();
 await expect(page.locator('#vs-inspector')).toContainText('Context');
 await page.locator('#vs-inspector').getByRole('button',{name:'Close',exact:true}).click();
 await expect(page.locator('#v-process\\.valid')).toBeFocused();
 await page.locator('#v-process\\.inner .vs-group-label').click();
 await expect(page.locator('#vs-inspector details[data-vs-target="inner"]')).toBeVisible();
});
test('narrow touch opens existing viewer and its shared detail surface @FC15 @FC32',async({page},info)=>{
 test.skip(!info.project.use.hasTouch,'touch viewport');await open(page);
 await page.locator('#x-process .vs-viewport').tap({position:{x:4,y:4}});
 await expect(page.locator('.vs-figure-viewer')).toBeVisible();await landscapeOverview(page);
 await page.locator('#v-process\\.valid').tap();
 await expect(page.locator('.vs-inspector details[data-vs-target="valid"]')).toBeVisible();
 await expect(page.locator('.vs-inspector--sheet')).toBeVisible();
});
test('no-JS and print preserve complete process and group membership @nojs @FC14',async({page})=>{
 await page.setContent(markup);
 await expect(page.locator('#l-process\\.check')).toBeVisible();
 for(const id of ['f1','f2','yes','no'])await expect(page.locator(`#l-process\\.${id}`)).toBeVisible();
 await page.emulateMedia({media:'print'});
 await expect(page.locator('#l-process\\.valid')).toBeVisible();
});

test('nested fold state, hidden close focus, and member navigation @FC06 @FC27 @FC31',async({page},info)=>{
 test.skip(Boolean(info.project.use.hasTouch),'wide fold controls');await open(page);
 await page.locator('#v-process\\.check').click();
 await page.locator('[data-vs-fold-toggle="inner"]').click();
 await page.locator('[data-vs-fold-toggle="outer"]').click();
 await page.locator('#vs-inspector').getByRole('button',{name:'Close',exact:true}).click();
 await expect(page.locator('[data-vs-fold-expand="outer"]')).toBeFocused();
 await page.locator('[data-vs-fold-expand="outer"]').click();
 await expect(page.locator('[data-vs-fold="inner"]')).toBeVisible();
 await expect(page.locator('#v-process\\.check')).toBeHidden();
 await page.locator('[data-vs-fold="inner"]').click();
 await page.locator('#vs-inspector .vs-flow-members').getByRole('link',{name:'Check order',exact:true}).click();
 await expect(page.locator('#v-process\\.check')).toBeVisible();
 await expect(page.locator('#vs-inspector details[data-vs-target="check"]')).toBeVisible();
});
test('pointer movement does not activate a block @FC28',async({page},info)=>{
 await open(page);
 if(Boolean(info.project.use.hasTouch))await page.locator('#x-process .vs-viewport').tap({position:{x:4,y:4}});
 const node=page.locator('#v-process\\.valid');
 const b=await node.boundingBox();expect(b).toBeTruthy();
 await page.mouse.move(b!.x+b!.width/2,b!.y+b!.height/2);
 await page.mouse.down();await page.mouse.move(b!.x+b!.width/2+12,b!.y+b!.height/2+12,{steps:4});await page.mouse.up();
 await expect(page.locator('.vs-inspector:visible')).toHaveCount(0);
});
test('theme boundaries and selected details remain visible @FC05 @FC29',async({page},info)=>{
 test.skip(Boolean(info.project.use.hasTouch),'wide visual review');await open(page);
 for(const theme of ['light','dark'] as const){
  await page.emulateMedia({colorScheme:theme});
  await page.locator('#v-process\\.valid').click();
  await expect(page.locator('#vs-inspector')).toBeVisible();
  await page.screenshot({path:`docs/validation/native-flowchart/${theme}-sidebar.png`,fullPage:true});
 }
 await page.emulateMedia({forcedColors:'active'});
 const shape=page.locator('#v-process\\.outer > rect').first();
 const colors=await shape.evaluate(e=>({fill:getComputedStyle(e).fill,stroke:getComputedStyle(e).stroke}));
 expect(colors.fill).not.toBe(colors.stroke);
 await page.screenshot({path:'docs/validation/native-flowchart/forced-colors.png',fullPage:true});
});
test('every opaque nested palette pair meets text and boundary contrast @FC07 @FC08',async({page},info)=>{
 test.skip(Boolean(info.project.use.hasTouch),'palette measurement independent of viewport');await open(page);
 for(const colorScheme of ['light','dark'] as const){
  await page.emulateMedia({colorScheme});
  const results=await page.evaluate(()=>{
   const outer=document.getElementById('v-process.outer')!,inner=document.getElementById('v-process.inner')!;
   const colors=['neutral','teal','violet','amber'];
   const luminance=(s:string)=>{const c=s.match(/[\d.]+/g)!.slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]!*.2126+c[1]!*.7152+c[2]!*.0722;};
   const contrast=(a:string,b:string)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
   const rows=[];
   for(const parent of colors)for(const child of colors){
    for(const [el,color] of [[outer,parent],[inner,child]] as const){for(const target of [el,el.querySelector("rect")!]){for(const c of colors)target.classList.remove(`vs-flow-group-color-${c}`);target.classList.add(`vs-flow-group-color-${color}`);}}
    const fill=getComputedStyle(inner.querySelector('rect')!).fill;
    const border=getComputedStyle(inner.querySelector('rect')!).stroke;
    const label=getComputedStyle(inner.querySelector('.vs-group-label')!).fill;
    const parentFill=getComputedStyle(outer.querySelector('rect')!).fill;
    rows.push({parent,child,text:contrast(label,fill),inside:contrast(border,fill),outside:contrast(border,parentFill),opacity:getComputedStyle(inner.querySelector('rect')!).fillOpacity});
   }
   return rows;
  });
  for(const row of results){expect(row.text,JSON.stringify(row)).toBeGreaterThanOrEqual(4.5);expect(row.inside).toBeGreaterThanOrEqual(3);expect(row.outside).toBeGreaterThanOrEqual(3);expect(row.opacity).toBe('1');}
 }
});
test('orientation and 200 percent layout zoom retain the same process @FC10 @FC15',async({page})=>{
 await open(page);const svg=page.locator('#x-process svg');const viewBox=await svg.getAttribute('viewBox');
 for(const [width,height] of [[320,720],[720,320],[1440,1000]]){
  await page.setViewportSize({width:width!,height:height!});
  await expect(svg).toHaveAttribute('viewBox',viewBox!);
  expect(await svg.locator('[data-vs-target="valid"]').count()).toBe(1);
 }
 await page.evaluate(()=>{document.documentElement.style.zoom='2';});
 await page.locator('#x-process .vs-viewport').click({position:{x:4,y:4}});
 await expect(svg).toHaveAttribute('viewBox',viewBox!);
});

test('closing an expanded summary returns focus to its visible Fold control @FC31',async({page},info)=>{
 test.skip(Boolean(info.project.use.hasTouch),'wide controls');await open(page);
 await page.locator('[data-vs-fold-toggle="outer"]').click();
 await page.locator('[data-vs-fold="outer"]').click();
 await page.locator('[data-vs-fold-expand="outer"]').click();
 await page.locator('#vs-inspector').getByRole('button',{name:'Close',exact:true}).click();
 await expect(page.locator('[data-vs-fold-toggle="outer"]')).toBeFocused();
});

test('keyboard unfolding reaches revealed steps before leaving the diagram @FC15 @FC27',async({page},info)=>{
 test.skip(Boolean(info.project.use.hasTouch),'wide keyboard path');await open(page);
 await page.locator('[data-vs-fold-toggle="inner"]').focus();await page.keyboard.press('Enter');
 await expect(page.locator('[data-vs-fold-expand="inner"]')).toBeFocused();
 await page.keyboard.press('Enter');await expect(page.locator('[data-vs-fold-toggle="inner"]')).toBeFocused();
 await page.keyboard.press('Tab');
 expect(await page.evaluate(()=>document.querySelector('#x-process svg')!.contains(document.activeElement))).toBe(true);
 const reached=[];for(let i=0;i<8;i++){reached.push(await page.evaluate(()=>document.activeElement?.getAttribute('data-vs-target')));await page.keyboard.press('Tab');}
 expect(reached).toContain('check');expect(reached).toContain('valid');
});
test('bare and inspectable flows keep original identity before and after folding @FC28 @FC32',async({page},info)=>{
 test.skip(Boolean(info.project.use.hasTouch),'wide pointer targets');await open(page);
 await page.locator('#v-process\\.check').click();
 await page.locator('#v-process\\.no .vs-edge-label').click();
 await expect(page.locator('#vs-inspector details[data-vs-target="check"]')).toBeVisible();
 await page.locator('#v-process\\.yes .vs-edge-label').click();
 await expect(page.locator('#vs-inspector details[data-vs-target="yes"]')).toBeVisible();
 await page.locator('[data-vs-fold-toggle="outer"]').click();
 const proxy=page.locator('[data-vs-proxy-for="yes"]:visible .vs-edge-label').first();await proxy.click();
 await expect(page.locator('#vs-inspector details[data-vs-target="yes"]')).toBeVisible();
 await expect(page.locator('#vs-inspector')).toContainText('Valid?');await expect(page.locator('#vs-inspector')).toContainText('Ready');
 await page.locator('#vs-inspector').getByRole('button',{name:'Close',exact:true}).click();
 await page.getByRole('button',{name:'Reference mode',exact:true}).click();await proxy.click();
 await expect(page.locator('#vs-refpanel')).toContainText('Yes');
 await page.locator('#vs-refpanel').getByRole('button',{name:'Copy reference',exact:true}).click();
 await expect(page.locator('.vs-copy-fallback textarea')).toHaveValue(/targetId: "yes"/);
});
test('touch dragging pans both ways without opening flowchart details @FC28 @FC32',async({page},info)=>{
 test.skip(!info.project.use.hasTouch,'touch viewer');await open(page);
 await page.locator('#x-process .vs-viewport').tap({position:{x:4,y:4}});const dialog=page.locator('.vs-figure-viewer');await expect(dialog).toBeVisible();
 await expect(dialog.locator('.vs-inspector:visible')).toHaveCount(0);
 const svg=dialog.locator('svg[data-vs-flowchart]');const before=await svg.getAttribute('viewBox');
 const b=await svg.boundingBox();const x=b!.x+b!.width/2,y=b!.y+b!.height/2;
 const cdp=await page.context().newCDPSession(page);
 for(const dx of [45,-45]){
  const touch=(x:number)=>[{id:0,x,y,radiusX:2,radiusY:2,force:1}];
  const old=await svg.getAttribute('viewBox');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touch(x)});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:touch(x+dx)});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  expect(await svg.getAttribute('viewBox')).not.toBe(old);await expect(dialog.locator('.vs-inspector:visible')).toHaveCount(0);
 }
 await dialog.getByRole('button',{name:'Back to article'}).click();await expect(dialog).toHaveCount(0);await cdp.detach();
});

test('mobile sheet folding, hidden-member links, references and article return share the viewer lifecycle @FC15 @FC31 @FC32',async({page},info)=>{
 test.skip(!info.project.use.hasTouch,'touch viewer');await open(page);
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(new Error('denied'))}}));
 await page.locator('#v-process\\.check').tap();const dialog=page.locator('.vs-figure-viewer');await expect(dialog).toBeVisible();
 await expect(dialog.locator('.vs-inspector--sheet details[data-vs-target="check"]')).toBeVisible();
 await dialog.locator('.vs-inspector--sheet').getByRole('button',{name:'Close',exact:true}).click();
 await expect(dialog).toHaveCount(0);await expect(page.locator('.vs-viewer-placeholder')).toHaveCount(0);
 await page.locator('#v-process\\.check').tap();await expect(dialog.locator('.vs-inspector--sheet')).toBeVisible();
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
 await page.locator('#x-process').getByRole('button',{name:'Explore full diagram'}).click();await landscapeOverview(page);
 await page.locator('[data-vs-fold-toggle="outer"]').tap();
 await page.locator('[data-vs-fold="outer"]').tap();
 const sheet=dialog.locator('.vs-inspector--sheet');await expect(sheet.locator('details[data-vs-target="outer"]')).toBeVisible();
 await sheet.locator('.vs-flow-members').getByRole('link',{name:'Check order',exact:true}).click();
 await expect(sheet.locator('details[data-vs-target="check"]')).toBeVisible();await expect(page.locator('#v-process\\.check')).toBeVisible();
 await sheet.getByRole('button',{name:'Copy reference',exact:true}).click();
 await expect(dialog.locator('.vs-copy-fallback textarea')).toHaveValue(/targetId: "check"/);
 await page.keyboard.press('Escape');await expect(dialog.locator('.vs-copy-fallback')).toHaveCount(0);
 await sheet.getByRole('button',{name:'Close',exact:true}).click();await expect(sheet).toBeHidden();
 await dialog.getByRole('button',{name:'Back to article',exact:true}).click();await expect(dialog).toHaveCount(0);
 await expect(page.locator('#x-process')).toBeVisible();
 expect(await page.locator('[id="x-check"]').count()).toBe(1);expect(await page.locator('.vs-viewer-placeholder').count()).toBe(0);
});

test('child groups authored before parents retain their heading, boundary and whitespace targets @FC28',async({page},info)=>{
 test.skip(Boolean(info.project.use.hasTouch),'desktop hit regions');await open(page,true);
 const inner=page.locator('#v-process\\.inner');const box=await inner.locator('rect').first().boundingBox();const label=await inner.locator('.vs-group-label').boundingBox();
 for(const p of [{x:label!.x+3,y:label!.y+3},{x:box!.x+10,y:box!.y+45},{x:box!.x+1,y:box!.y+box!.height/2}]){
  await page.mouse.click(p.x,p.y);await expect(page.locator('#vs-inspector details[data-vs-target="inner"]')).toBeVisible();
  await page.locator('#vs-inspector').getByRole('button',{name:'Close',exact:true}).click();
 }
});
test('closing an inspected group after folding focuses its visible Expand control @FC31',async({page},info)=>{
 test.skip(Boolean(info.project.use.hasTouch),'desktop focus');
 for(const keyboard of [false,true]){
  await open(page);await page.locator('#v-process\\.outer .vs-group-label').click();
  const fold=page.locator('[data-vs-fold-toggle="outer"]');if(keyboard){await fold.focus();await page.keyboard.press('Enter');}else await fold.click();
  await expect(page.locator('#vs-inspector details[data-vs-target="outer"]')).toBeVisible();
  await page.locator('#vs-inspector').getByRole('button',{name:'Close',exact:true}).click();
  await expect(page.locator('[data-vs-fold-expand="outer"]')).toBeFocused();
 }
});

test('Locate on a selected folded group reaches its visible summary and preserves its depth cue @FC29 @FC31',async({page},info)=>{
 test.skip(Boolean(info.project.use.hasTouch),'desktop keyboard/pointer Locate');
 for(const keyboard of [false,true]){
  await open(page);await expect(page.locator('#v-process\\.outer .vs-depth-bar')).toHaveCount(2);
  await page.locator('#v-process\\.outer .vs-group-label').click();await page.locator('[data-vs-fold-toggle="outer"]').click();
  const locate=page.locator('#vs-inspector').getByRole('button',{name:'Locate in figure'});
  if(keyboard){await locate.focus();await page.keyboard.press('Enter');}else await locate.click();
  const summary=page.locator('[data-vs-fold="outer"]');await expect(summary).toBeFocused();await expect(summary.locator('.vs-depth-bar')).toHaveCount(2);
  await expect(page.locator('#vs-inspector')).toBeHidden();
 }
});

test('folding replaces the expanded boundary with a compact group and embedded Expand control @FC15 @FC28',async({page},info)=>{
 test.skip(Boolean(info.project.use.hasTouch),'geometry and print contract; mobile lifecycle checked separately');await open(page);
 const group=page.locator('#v-process\\.outer');
 await page.locator('[data-vs-fold-toggle="outer"]').click();
 const summary=page.locator('[data-vs-fold="outer"]');const expand=page.locator('[data-vs-fold-expand="outer"]');
 await expect(group).toBeHidden();await expect(page.locator('#v-process\\.inner')).toBeHidden();
 await expect(summary.locator('.vs-group-label')).toHaveText('Validate');await expect(summary.locator('.vs-fold-count')).toHaveText('2 steps');
 const body=await summary.locator('.vs-fold-shape').boundingBox();const control=await expand.boundingBox();
 expect(control!.x).toBeGreaterThanOrEqual(body!.x);expect(control!.y).toBeGreaterThanOrEqual(body!.y);
 expect(control!.x+control!.width).toBeLessThanOrEqual(body!.x+body!.width);expect(control!.y+control!.height).toBeLessThanOrEqual(body!.y+body!.height);
 await expect(summary).toHaveClass(/vs-flow-group-color-teal/);
 await page.screenshot({path:'docs/validation/native-flowchart/compact-group.png',fullPage:true});
 await summary.locator('.vs-group-label').click();await expect(page.locator('#vs-inspector details[data-vs-target="outer"]')).toBeVisible();
 await expand.click();await expect(group).toBeVisible();await expect(summary).toBeHidden();
 await page.locator('[data-vs-fold-toggle="outer"]').click();await page.emulateMedia({media:'print'});
 await expect(group).toBeVisible();await expect(summary).toBeHidden();await expect(expand).toBeHidden();
});
