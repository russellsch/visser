import { build } from 'esbuild';
import { test, expect } from '@playwright/test';
let bundle: string;
test.beforeAll(async () => {
  bundle = (await build({ stdin: { contents: "import {prepareSequenceLabels} from './packages/runtime/src/mermaid-sequence-label.ts'; globalThis.prepareSequenceLabels = prepareSequenceLabels;", resolveDir: process.cwd() }, bundle: true, platform: 'browser', format: 'iife', write: false })).outputFiles[0]!.text;
});
test('sequence label preparation preserves role fonts, ink and explicit copy identities', async ({page}) => {
  await page.setContent('<!doctype html><style>svg .actor {font-size:24px;fill:rgb(10,20,30)} svg .noteText {font-size:12px}</style><svg width="1800" height="900" viewBox="0 0 1800 900"></svg><svg id="other"></svg>');
  await page.addScriptTag({content:bundle});
  const result = await page.evaluate(async () => {
    const svg = document.querySelector('svg')!;
    const text = String.raw`$$\rlap{\rule{20em}{1em}}x$$`;
    const inputs = [{key:'actor:A',text,className:'actor'},{key:'note:0',text,className:'noteText'}, {key:'message:0',text:String.raw`$$\rule{1em}{10em}$$`,className:'messageText'}];
    const pending = (window as any).prepareSequenceLabels(svg,inputs);
    inputs[1]!.text = '$$wrong$$';
    const labels = await pending;
    const a = labels.place('actor:A','actor:A:header',svg,20,20);
    const b = labels.place('actor:A','actor:A:footer',svg,20,200);
    const c = labels.place('note:0','note:0',svg,20,400);
    const d = labels.place('message:0','message:0',svg,20,600);
    const errors: string[] = [];
    for (const attempt of [() => labels.get('missing'), () => labels.place('actor:A','actor:A:header',svg,0,0), () => labels.place('actor:A','other',document.querySelector('#other'),0,0)]) {
      try {attempt();} catch(e) {errors.push(String(e));}
    }
    const rect = (e:Element) => e.getBoundingClientRect();
    return {a:labels.get('actor:A'),c:labels.get('note:0'),errors,
      keys:[a,b,c,d].map(e=>e.getAttribute('data-vs-mermaid-label')),
      tex:[a,b,c].map(e=>e.querySelector('[data-vs-mermaid-formula]').getAttribute('data-vs-mermaid-formula')),
      fonts:[a,c].map(e=>getComputedStyle(e.firstElementChild).fontSize),
      ink:[a,b,c,d].every(e=>[...e.querySelectorAll('math,math *')].every(n=> {const r=rect(n),f=rect(e);return !r.width || !r.height || (r.left>=f.left-1&&r.right<=f.right+1&&r.top>=f.top-1&&r.bottom<=f.bottom+1);})),
      children:svg.children.length};
  });
  expect(result.fonts).toEqual(['24px','12px']);
  expect(result.a.width).toBeGreaterThan(result.c.width * 1.9);
  expect(result.keys).toEqual(['actor:A:header','actor:A:footer','note:0','message:0']);
  expect(new Set(result.tex).size).toBe(1);
  expect(result.tex[0]).toBe(String.raw`\rlap{\rule{20em}{1em}}x`);
  expect(result.errors).toHaveLength(3);
  expect(result.children).toBe(4);
  expect(result.ink).toBe(true);
});
