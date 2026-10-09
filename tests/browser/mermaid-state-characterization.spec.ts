import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
// @ts-expect-error checked build script outside the TS project
import { mermaidMathPlugin } from '../../scripts/mermaid-build.mjs';
let bundle:string, observedBundle:string;
test.beforeAll(async()=>{
  bundle=(await build({stdin:{contents:"import './packages/runtime/src/mermaid-bundle.ts';",resolveDir:process.cwd()},bundle:true,platform:'browser',format:'iife',write:false,plugins:[mermaidMathPlugin(process.cwd())]})).outputFiles[0]!.text;
  observedBundle=(await build({stdin:{contents:`import './packages/runtime/src/mermaid-bundle.ts';
import { observeStateDb } from './packages/core/src/mermaid/state-observer.ts';
import { stateObserverVersion } from 'mermaid/dist/chunks/mermaid.core/stateDiagram-v2-GCMORJYK.mjs';
Object.assign(window,{observeStateDb,stateObserverVersion});`,resolveDir:process.cwd()},bundle:true,platform:'browser',format:'iife',write:false,plugins:[mermaidMathPlugin(process.cwd(),{observeState:true})]})).outputFiles[0]!.text;
});
const cases={
  equalId:`stateDiagram-v2
A: A
A: $$b$$
A: $$c$$
`,
  aliasColon:`stateDiagram-v2
state "$$a$$" as A:$$b$$:discarded
`,
  descriptions:`stateDiagram-v2
state "$$a$$" as A
A: $$b$$
A: $$c$$
A --> B: $$m$$
note right of A: $$n$$
note left of B
  $$q$$
end note
`,
  noteEdge:`stateDiagram-v2
A
note right of A: $$n$$
A --> B: $$m$$
`,
  repeatedNotes:`stateDiagram-v2
A
note right of A: $$n$$
note left of A: $$q$$
A --> B: ordinary
`,
  accessibility:`stateDiagram-v2
accTitle: Before
accTitle: Title<br/> &dollar;&dollar;a&dollar;&dollar;
accDescr {
 First<br> $$b$$
   Second
}
A: $$x$$
`,
};

for (const observed of [false,true]) test(`${observed?'observed':'native'} state fields and real label copies define the adapter contract`,async({page},testInfo)=>{
  await page.setContent('<!doctype html><main></main>');await page.addScriptTag({content:observed?observedBundle:bundle});
  const result=await page.evaluate(async cases=>{
    const m=(window as any).mermaid;const result:Record<string,any>={};
    for(const [name,source] of Object.entries(cases)){
      m.initialize({startOnLoad:false,securityLevel:'strict',theme:'base'});
      const {db}=await m.mermaidAPI.getDiagramFromText(source);
      const data=db.getData();
      const fields={states:[...db.getStates()].map(([id,value]:[string,any])=>({id,descriptions:value.descriptions,note:value.note})),
        nodes:data.nodes.map((node:any)=>({id:node.id,domId:node.domId,label:node.label,description:node.description,shape:node.shape,parentId:node.parentId})),
        edges:data.edges.map((edge:any)=>({id:edge.id,label:edge.label,start:edge.start,end:edge.end})),
        accTitle:db.getAccTitle(),accDescr:db.getAccDescription()};
      const events:Record<string,unknown>[]=[];
      const observe=(window as any).observeStateDb;
      if(observe && (window as any).stateObserverVersion!==1) throw new Error('wrong state observer marker');
      const stop=observe?.(db,(event:any)=>events.push({kind:event.kind,mode:event.mode,id:event.item?.id,nodeId:event.retained?.id,edgeId:event.edge?.id,noteId:event.note?.id}));
      db.extract(db.getRootDocV2());
      stop?.();
      const repeatedNodes=db.getData().nodes.map((node:any)=>({id:node.id,domId:node.domId,label:node.label,description:node.description,shape:node.shape,parentId:node.parentId}));
      document.querySelector('main')!.innerHTML=(await m.render(`state_${name}`,source)).svg;
      const svg=document.querySelector('main svg')!;
      result[name]={...fields,repeatedNodes,events,tex:[...svg.querySelectorAll('math[data-vs-mermaid-formula]')].map(e=>e.getAttribute('data-vs-mermaid-formula')),
        noteGroupMath:[...svg.querySelectorAll('.note-cluster')].map(e=>e.querySelectorAll('math').length),
        labelOwners:[...svg.querySelectorAll('foreignObject')].map(e=>({owner:e.parentElement?.parentElement?.id,tex:[...e.querySelectorAll('math[data-vs-mermaid-formula]')].map(a=>a.getAttribute('data-vs-mermaid-formula'))}))};
    }
    return result;
  },cases);
  writeFileSync(`reports/math/state-${observed?'observed':'native'}-${testInfo.project.name}.json`,JSON.stringify(result,null,2)+'\n');
  for (const value of Object.values(result) as any[]) expect(value.repeatedNodes).toEqual(value.nodes);
  if(observed){
    for(const value of Object.values(result) as any[]){
      expect(value.events[0].kind).toBe('begin');
      expect(value.events.at(-1).kind).toBe('end');
    }
    expect(result.noteEdge.events.filter((event:any)=>event.kind==='relation').map((event:any)=>event.edgeId)).toEqual(['edge1']);
    expect(result.repeatedNotes.events.filter((event:any)=>event.kind==='note')).toHaveLength(2);
    expect(result.repeatedNotes.events.filter((event:any)=>event.kind==='note-sanitized')).toHaveLength(2);
  }
  expect(result.aliasColon.nodes.find((n:any)=>n.id==='A')).toMatchObject({label:'$$a$$',description:['$$b$$']});
  expect(result.aliasColon.tex.sort()).toEqual(['a','b']);
  expect(result.equalId.nodes.find((n:any)=>n.id==='A')).toMatchObject({label:'A',description:['$$b$$','$$c$$']});
  expect(result.equalId.tex.sort()).toEqual(['b','c']);
  expect(result.descriptions.nodes.find((n:any)=>n.id==='A')).toMatchObject({label:'$$a$$',description:['$$b$$','$$c$$'],shape:'rectWithTitle'});
  expect(result.descriptions.tex.sort()).toEqual(['a','b','c','m','n','q']);
  expect(result.noteEdge.edges.find((e:any)=>e.label==='$$m$$')?.id).toBe('edge1');
  expect(result.noteEdge.nodes.filter((n:any)=>n.shape==='noteGroup')).toHaveLength(1);
  expect(result.noteEdge.noteGroupMath).toEqual([0]);
  expect(result.noteEdge.tex.sort()).toEqual(['m','n']);
  expect(result.repeatedNotes.nodes.filter((n:any)=>n.shape==='note')).toHaveLength(2);
  expect(result.repeatedNotes.tex.sort()).toEqual(['n','q']);
  expect(result.accessibility.accTitle).toBe('Title<br> $$a$$');
  expect(result.accessibility.accDescr).toBe('First<br> $$b$$\nSecond');
  expect(result.accessibility.tex).toEqual(['x']);
});
