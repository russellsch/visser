import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
// @ts-expect-error checked build script outside the TS project
import { mermaidMathPlugin } from '../../scripts/mermaid-build.mjs';

let bundle: string;
test.beforeAll(async () => {
  bundle = (await build({ stdin: { resolveDir: process.cwd(), contents: `
import './packages/runtime/src/mermaid-bundle.ts';
import DOMPurify from 'dompurify';
import { diagram, stateObserverVersion } from 'mermaid/dist/chunks/mermaid.core/stateDiagram-v2-GCMORJYK.mjs';
import { extractStateLabels } from './packages/core/src/mermaid/state-labels.ts';
import { observeStateDb } from './packages/core/src/mermaid/state-observer.ts';
import { createStateProvenance } from './packages/core/src/mermaid/state-provenance.ts';
import { validateStateMathRecords } from './packages/core/src/mermaid/state-math.ts';
import { planStateRenderCopies } from './packages/core/src/mermaid/state-render-plan.ts';
import { stateMathSourceMap } from './packages/core/src/mermaid/state-source-map.ts';
import { stampStateMathLabels } from './packages/runtime/src/mermaid-state-source.ts';
import { bindMermaidSource, mermaidSourceSelection } from './packages/runtime/src/mermaid-source.ts';
import { stateMathTransport } from './packages/core/src/mermaid/state-transport.ts';
import { traceMermaidHtmlPass } from './packages/core/src/mermaid/html-provenance.ts';
const sanitize=value=>{
 const first=traceMermaidHtmlPass(value,DOMPurify.sanitize(value.text));
 return traceMermaidHtmlPass(first,DOMPurify.sanitize(first.text,{FORBID_TAGS:['style']}));
};
window.stateProvenanceProbe=async source=>{
 if(stateObserverVersion!==1) throw new Error('wrong state observer version');
 window.mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'base'});
 const labels=await extractStateLabels(source);
 const provenance=createStateProvenance(labels,sanitize), db=diagram.db;
 const stop=observeStateDb(db,provenance.listener);
 const leaf=v=>Array.isArray(v)?v.map(leaf):v?{text:v.mapped.text,origins:v.mapped.mapRange(0,v.mapped.length),records:v.recordIndices}:undefined;
 const snapshot=()=>{const r=provenance.result();let plan,planError;try {const authored=validateStateMathRecords(source,labels,r,sanitize);plan=stateMathTransport(authored.records,planStateRenderCopies(source,r,authored.records,sanitize));} catch(error) {planError=String(error);} return {plan:plan,planError,nodes:[...r.nodes].map(([n,v])=>({id:n.id,shape:n.shape,label:leaf(v.label),description:leaf(v.description)})),edges:[...r.edges].map(([e,v])=>({id:e.id,label:leaf(v.label)})),promoted:r.promotedImplicitRecordIndices}};
 try {
  db.setRootDoc([...labels.root]); const first=snapshot();
  db.extract(db.getRootDocV2()); const second=snapshot();
  let svg='',renderError;
  try {svg=(await window.mermaid.render('state_provenance_fixture',source)).svg;} catch(error){renderError=String(error);}
  const root=new DOMParser().parseFromString(svg,'image/svg+xml').documentElement;
  const renderedTex=[...root.querySelectorAll('math[data-vs-mermaid-formula]')].map(node=>node.getAttribute('data-vs-mermaid-formula'));
  let copied=[];
  if(!renderError && second.plan) {
    const map=stateMathSourceMap({source,mathBodyStartByte:0,stateMath:second.plan},new TextEncoder().encode(source));
    const slots=second.plan.slots.filter(slot=>slot.parts.some(part=>part.kind==='math')).map(slot=>({...slot,formulas:slot.parts.filter(part=>part.kind==='math').map(part=>part.tex)}));
    stampStateMathLabels(root,'state_provenance_fixture',slots);
    const figure=document.createElement('figure'),viewport=document.createElement('div'),pre=document.createElement('pre'),code=document.createElement('code');
    viewport.setAttribute('data-vs-mermaid-render','');viewport.append(root);
    figure.setAttribute('data-vs-mermaid-source-map',JSON.stringify(map));pre.className='vs-mermaid-source';code.textContent=map.source;pre.append(code);figure.append(viewport,pre);document.body.append(figure);
    bindMermaidSource(figure,root);
    copied=[...root.querySelectorAll('math[data-vs-mermaid-formula]')].map(formula=>{const range=document.createRange();range.selectNodeContents(formula);const selection=mermaidSourceSelection(range);return selection.kind==='source'?selection.range.toString():selection.kind;});
    figure.remove();
  }
  return {first,second,renderedTex,renderError,copied,records:labels.records.map(r=>({index:r.recordIndex,role:r.role,value:r.semanticValue,ownerId:r.ownerId}))};
 } finally {stop();}
};` }, bundle: true, platform: 'browser', format: 'iife', write: false,
    plugins: [mermaidMathPlugin(process.cwd(), {observeState:true})] })).outputFiles[0]!.text;
});

test('native state extraction preserves exact provenance through sanitization, updates and repeated passes', async ({ page }, testInfo) => {
  await page.setContent('<!doctype html><main></main>');
  await page.addScriptTag({ content: bundle });
  const fixtures = [
    `stateDiagram-v2
state "$$a$$" as A
A: $$b$$
note right of A
note<br/> &dollar;&dollar;n&dollar;&dollar;
end note
note left of A: $$q$$
A --> B: $$m$$
[*] --> A
B --> [*]
`,
    `stateDiagram-v2
state "$$x$$" as A:$$x$$
A: $$x$$
B
state "later" as B
B --> A: $$x$$
`,
    `stateDiagram-v2
note right of $$z$$: $$n$$
`,
    `stateDiagram-v2
state " " as A
`,
    `stateDiagram-v2
A: <br> ﬂ°dollar¶ßﬂ°dollar¶ßxﬂ°dollar¶ßﬂ°dollar¶ß
`,
    `stateDiagram-v2
A: <br> ﬂ°dollar¶ßﬂ°dollar¶ßxﬂ°dollar¶ßﬂ°dollar¶ß
A: body
`,
    `stateDiagram-v2
A: $$x < y$$
A: $$x > y$$
note right of A: $$a < b$$
A --> B: $$c < d$$
`,
    `stateDiagram-v2
A: plain title
A: $$body$$
A --> A: $$self$$
`,
    `stateDiagram-v2
A: $$title$$
A: plain body
`,
  ];
  const results = await page.evaluate(async sources => {
    const output = [];
    for (const source of sources) output.push(await (window as any).stateProvenanceProbe(source));
    return output;
  }, fixtures);
  writeFileSync(`reports/math/state-source-${testInfo.project.name}.json`, JSON.stringify(results, null, 2) + '\n');
  for (const result of results) expect(result.second).toEqual(result.first);
  for (const [index,result] of results.entries()) {
    if(index===2) {expect(result.first.planError).toContain('no renderable shape'); continue;}
    expect(result.first.planError).toBeUndefined();
    expect(result.renderError).toBeUndefined();
    const planned=result.first.plan.slots.flatMap((slot:any)=>slot.parts.filter((part:any)=>part.kind==='math').map((part:any)=>part.tex));
    expect([...result.renderedTex].sort()).toEqual([...planned].sort());
    expect(result.copied).toHaveLength(planned.length);
    expect(result.copied).not.toContain('unchanged');
    expect(result.copied).not.toContain('unrepresentable');
  }
  expect(results[4].renderedTex).toEqual(['x']);
  expect(results[4].copied).toEqual(['ﬂ°dollar¶ßﬂ°dollar¶ßxﬂ°dollar¶ßﬂ°dollar¶ß']);
  expect(results[5].renderedTex).toEqual([]);
  const first = results[0].first;
  const note = first.nodes.find((node: any) => node.id === 'A----note-0');
  expect(note.label.text).toBe('note<br> $$n$$');
  expect(note.label.origins.synthetic).toBe(false);
  expect(note.label.origins.intervals.map((span: any) => fixtures[0]!.slice(span.start, span.end)).join(''))
    .toBe('note<br/> &dollar;&dollar;n&dollar;&dollar;');
  expect(first.nodes.find((node: any) => node.shape === 'noteGroup').label).toBeUndefined();
  const arrayNode = results[1].first.nodes.find((node: any) => node.id === 'A');
  expect([arrayNode.label.text, ...arrayNode.description.map((part: any) => part.text)]).toEqual(['$$x$$', '$$x$$', '$$x$$']);
  expect(new Set([arrayNode.label, ...arrayNode.description].map((part: any) => part.origins.intervals[0].start)).size).toBe(3);
  const promoted = results[1].records.filter((record: any) => results[1].first.promoted.includes(record.index));
  expect(promoted.map((record: any) => record.value)).toEqual(['B']);
  expect(results[0].renderError).toBeUndefined();
  expect(results[1].renderError).toBeUndefined();
  expect(results[2].renderError).toContain('No such shape: undefined');
  const noteOnlyPromoted=results[2].records.filter((record:any)=>results[2].first.promoted.includes(record.index));
  expect(noteOnlyPromoted).toEqual([]);
  expect(results[3].renderError).toBeUndefined();
  const fallback=results[3].first.nodes.find((node:any)=>node.id==='A').label;
  expect(fallback.text).toBe('A');
  expect(fallback.origins.synthetic).toBe(false);
  expect(results[3].first.promoted).toEqual(fallback.records);
});
