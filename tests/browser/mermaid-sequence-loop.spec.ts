import { build } from 'esbuild';
import { test, expect } from '@playwright/test';
// @ts-expect-error checked build script outside the TS project
import { mermaidMathPlugin } from '../../scripts/mermaid-build.mjs';

let bundle: string;
let original: string;
test.beforeAll(async () => {
  const options = {bundle: true, platform: 'browser' as const, format: 'iife' as const, minify: true, write: false as const};
  bundle = (await build({
    ...options,
    stdin: { contents: "import './packages/runtime/src/mermaid-bundle.ts'; import {prepareSequenceLoops,sequenceLoopAdvance} from './packages/runtime/src/mermaid-sequence-loop.ts'; globalThis.sequenceLoopHooks={prepareSequenceLoops,sequenceLoopAdvance};", resolveDir: process.cwd() },
    plugins: [mermaidMathPlugin(process.cwd())],
  })).outputFiles[0]!.text;
  original = (await build({...options,stdin:{contents:"import mermaid from 'mermaid'; globalThis.sequenceOriginal=mermaid",resolveDir:process.cwd()}})).outputFiles[0]!.text;
});

test('plain loop and branch geometry stays on the native path', async ({page}) => {
  await page.setContent('<!doctype html><main></main>');
  await page.addScriptTag({content:bundle});
  await page.addScriptTag({content:original});
  const snapshots=await page.evaluate(async()=>{
    const source='sequenceDiagram\nparticipant A\nparticipant B\nloop Plain\nA->>B: One\nalt Yes\nB-->>A: Two\nelse No\nA->>B: Three\nend\nend';
    const snapshots=[];
    for(const mermaid of [(window as any).mermaid,(window as any).sequenceOriginal]){
      mermaid.initialize({startOnLoad:false,securityLevel:'strict',sequence:{useMaxWidth:false},deterministicIds:true});
      document.querySelector('main')!.innerHTML=(await mermaid.render('plainLoop',source)).svg;
      const svg=document.querySelector<SVGSVGElement>('main svg')!;
      snapshots.push({viewBox:svg.getAttribute('viewBox'),elements:[...svg.querySelectorAll('text,rect,path,line,polygon')].map(node=>({
        tag:node.tagName,text:node.textContent,x:node.getAttribute('x'),y:node.getAttribute('y'),
        width:node.getAttribute('width'),height:node.getAttribute('height'),
        d:node.getAttribute('d'),points:node.getAttribute('points'),x1:node.getAttribute('x1'),
        x2:node.getAttribute('x2'),y1:node.getAttribute('y1'),y2:node.getAttribute('y2'),
      }))});
    }
    return snapshots;
  });
  expect(snapshots[0]).toEqual(snapshots[1]);
});

const wide = String.raw`\rlap{\rule{20em}{1em}}x`;
const tall = String.raw`\smash{\rule{1em}{10em}}y`;
const fraction = String.raw`\frac{a}{b}`;
const cases = [
  {name:'loop', body:`loop Repeat $$${wide}$$\nA->>B: Inside\nend`, keys:['message:0']},
  {name:'opt', body:`opt If $$${tall}$$\nA->>B: Inside\nend`, keys:['message:0']},
  {name:'alt/else', body:`alt First $$${fraction}$$\nA->>B: Yes\nelse Second $$${tall}$$\nB->>A: No\nend`, keys:['message:0','message:2']},
  {name:'par/and', body:`par First $$${wide}$$\nA->>B: One\nand Second $$${fraction}$$\nB->>A: Two\nend`, keys:['message:0','message:2']},
  {name:'par_over/and', body:`par_over First $$${wide}$$\nA->>B: One\nand Second $$${fraction}$$\nB->>A: Two\nend`, keys:['message:0','message:2']},
  {name:'critical/option', body:`critical First $$${tall}$$\nA->>B: Try\noption Second $$${wide}$$\nB->>A: Recover\nend`, keys:['message:0','message:2']},
  {name:'break', body:`break Stop $$${fraction}$$\nA->>B: Halt\nend`, keys:['message:0']},
  {name:'branch-only', body:`alt Plain opener\nA->>B: Yes\nelse Second $$${wide}$$\nB->>A: No\nend`, keys:['message:2']},
  {name:'nested', body:`loop Outer $$${fraction}$$\nalt Inner $$${tall}$$\nA->>B: Yes\nelse Other $$${wide}$$\nB->>A: No\nend\nend`, keys:['message:0','message:1','message:3']},
  {name:'empty-loop', body:`loop Empty $$${fraction}$$\nend`, keys:['message:0']},
  {name:'empty-alt-branch', body:`alt Plain\nelse Empty $$${fraction}$$\nend`, keys:['message:1']},
];

test('sequence loop and branch math reserves source-owned copies inside native frames', async ({page}) => {
  test.setTimeout(120_000);
  await page.setContent('<!doctype html><main></main>');
  await page.addScriptTag({content:bundle});
  for (const fixture of cases) for (const wrap of [false,true]) {
    await test.step(`${fixture.name}/${wrap}`, async () => {
      const result = await page.evaluate(async ({body,wrap}) => {
        const mermaid = (window as any).mermaid;
        mermaid.initialize({startOnLoad:false, securityLevel:'strict', sequence:{useMaxWidth:false,wrap,width:160,messageFontSize:18}});
        const source = `sequenceDiagram\nparticipant A\nparticipant B\n${body}\nB->>A: After structure`;
        document.querySelector('main')!.innerHTML = (await mermaid.render('sequenceLoopMath',source)).svg;
        const svg = document.querySelector<SVGSVGElement>('main svg')!;
        const labels = [...svg.querySelectorAll<SVGElement>('[data-vs-mermaid-label]')];
        const groups = [...svg.querySelectorAll<SVGElement>('g[data-et="control-structure"]')];
        const box = (element:Element) => element.getBoundingClientRect();
        const inside = (outer:DOMRect,inner:DOMRect) => inner.left>=outer.left-1 && inner.right<=outer.right+1 && inner.top>=outer.top-1 && inner.bottom<=outer.bottom+1;
        const overlap = (a:DOMRect,b:DOMRect) => a.left<b.right-1 && a.right>b.left+1 && a.top<b.bottom-1 && a.bottom>b.top+1;
        const after = [...svg.querySelectorAll('text.messageText')].find(node=>node.textContent?.includes('After structure'));
        const frame = groups.at(-1)!;
        const frameLines = [...frame.querySelectorAll('line.loopLine')];
        const coords = frameLines.flatMap(line => [Number(line.getAttribute('x1')),Number(line.getAttribute('x2')),Number(line.getAttribute('y1')),Number(line.getAttribute('y2'))]);
        const outer = {
          left:Math.min(...frameLines.map(line=>box(line).left)),right:Math.max(...frameLines.map(line=>box(line).right)),
          top:Math.min(...frameLines.map(line=>box(line).top)),bottom:Math.max(...frameLines.map(line=>box(line).bottom)),
        };
        return {
          keys:labels.map(label=>label.getAttribute('data-vs-mermaid-label')),
          formulas:labels.map(label=>label.querySelector('[data-vs-mermaid-formula]')?.getAttribute('data-vs-mermaid-formula')),
          widths:labels.map(label=>Number(label.getAttribute('width'))),
          inFrame:labels.every(label=>{
            const lines=[...label.parentElement!.querySelectorAll('line.loopLine')];
            const r={left:Math.min(...lines.map(line=>box(line).left)),right:Math.max(...lines.map(line=>box(line).right)),
              top:Math.min(...lines.map(line=>box(line).top)),bottom:Math.max(...lines.map(line=>box(line).bottom))};
            return inside(r as DOMRect,box(label));
          }),
          inViewport:labels.every(label=>inside(box(svg),box(label))),
          ink:labels.every(label=>[...label.querySelectorAll('math,math *')].every(node=>{
            const r=box(node);return (!r.width&&!r.height)||inside(box(label),r);
          })),
          below:!!after && box(after).top>=outer.bottom-1,
          collisions:labels.some(label=>[...label.parentElement!.querySelectorAll('polygon.labelBox')].some(badge=>overlap(box(label),box(badge))) ||
            [...svg.querySelectorAll('text.messageText')].some(text=>overlap(box(label),box(text)))),
          finite:coords.every(Number.isFinite),
          fonts:labels.map(label=>getComputedStyle(label.firstElementChild!).fontSize),
        };
      },{body:fixture.body,wrap});
      expect(result.keys.sort()).toEqual(fixture.keys.sort());
      expect(result.formulas.every(Boolean)).toBe(true);
      expect(result.widths.every(width=>width>0)).toBe(true);
      expect(result.inFrame).toBe(true);
      expect(result.inViewport).toBe(true);
      expect(result.ink).toBe(true);
      expect(result.below).toBe(true);
      expect(result.collisions).toBe(false);
      expect(result.finite).toBe(true);
      expect(result.fonts).toEqual(Array(fixture.keys.length).fill('18px'));
    });
  }
});

test('sequence loop scope fails closed and releases message ownership after incomplete drawing', async ({page}) => {
  await page.setContent('<!doctype html><svg id="loopHook" width="800" height="500"></svg>');
  await page.addScriptTag({content:bundle});
  const result = await page.evaluate(async () => {
    const svg=document.querySelector<SVGSVGElement>('svg')!;
    const hooks=(window as any).sequenceLoopHooks;
    const message={id:'0',type:10,message:'$$x$$'};
    const conf={width:160,wrapPadding:10,boxMargin:10,boxTextMargin:5,labelBoxHeight:20,labelBoxWidth:50};
    const errors:string[]=[];
    const first=await hooks.prepareSequenceLoops(svg,[message],conf);
    try {first.assertComplete();} catch(error) {errors.push(String(error));}
    first.dispose(false);
    const second=await hooks.prepareSequenceLoops(svg,[message],conf);
    message.message='$$changed$$';
    try {hooks.sequenceLoopAdvance({},message,10,10,()=>{}, {bumpVerticalPos:()=>{}},conf);} catch(error) {errors.push(String(error));}
    second.dispose(false);
    return {errors,copies:svg.querySelectorAll('[data-vs-mermaid-label]').length};
  });
  expect(result).toEqual({errors:['Error: Sequence loop math copy is missing',
    'Error: Sequence loop source or layout changed before measurement'],copies:0});
});

test('actorless empty and nested control structures keep measured math in finite frames', async ({page}) => {
  await page.setContent('<!doctype html><main></main>');
  await page.addScriptTag({content:bundle});
  const fixtures=[
    {source:'sequenceDiagram\nloop $$x$$\nend',keys:['message:0']},
    {source:'sequenceDiagram\nalt Plain\nelse $$x$$\nend',keys:['message:1']},
    {source:'sequenceDiagram\nloop $$x$$\nalt Plain\nelse $$y$$\nend\nend',keys:['message:0','message:2']},
  ];
  for(const fixture of fixtures){
    const result=await page.evaluate(async({source})=>{
      const mermaid=(window as any).mermaid;
      mermaid.initialize({startOnLoad:false,securityLevel:'strict',sequence:{useMaxWidth:false,width:160}});
      document.querySelector('main')!.innerHTML=(await mermaid.render('actorlessLoop',source)).svg;
      const svg=document.querySelector<SVGSVGElement>('main svg')!;
      const labels=[...svg.querySelectorAll<SVGElement>('[data-vs-mermaid-label]')];
      const box=(element:Element)=>element.getBoundingClientRect();
      const contains=(a:DOMRect,b:DOMRect)=>b.left>=a.left-1&&b.right<=a.right+1&&b.top>=a.top-1&&b.bottom<=a.bottom+1;
      const frames=[...svg.querySelectorAll('g[data-et="control-structure"]')];
      const lines=frames.flatMap(frame=>[...frame.querySelectorAll('line.loopLine')]);
      const finite=lines.every(line=>['x1','x2','y1','y2'].every(key=>Number.isFinite(Number(line.getAttribute(key)))));
      const framed=labels.every(label=>{
        const own=[...label.parentElement!.querySelectorAll('line.loopLine')].map(box);
        const frame={left:Math.min(...own.map(r=>r.left)),right:Math.max(...own.map(r=>r.right)),
          top:Math.min(...own.map(r=>r.top)),bottom:Math.max(...own.map(r=>r.bottom))};
        return contains(frame as DOMRect,box(label));
      });
      return {keys:labels.map(label=>label.getAttribute('data-vs-mermaid-label')).sort(),
        finite,framed,viewport:labels.every(label=>contains(box(svg),box(label))),
        ink:labels.every(label=>[...label.querySelectorAll('math,math *')].every(node=>{
          const r=box(node);return (!r.width&&!r.height)||contains(box(label),r);
        }))};
    },fixture);
    expect(result.keys).toEqual(fixture.keys);
    expect(result.finite).toBe(true);
    expect(result.framed).toBe(true);
    expect(result.viewport).toBe(true);
    expect(result.ink).toBe(true);
  }
});
