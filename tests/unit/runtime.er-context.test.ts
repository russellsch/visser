// @ts-expect-error jsdom has no declarations in this repository.
import {JSDOM} from 'jsdom';
import {describe,expect,it} from 'vitest';
import {withERField,withERLayoutHooks,erMeasuredGroup,erNativeGraph,erPreparedLayout,type ERRuntimeGraph} from '../../packages/runtime/src/mermaid-er-context.ts';
const setup=()=>{const dom=new JSDOM('<svg xmlns="http://www.w3.org/2000/svg"></svg>');return {dom,root:dom.window.document.querySelector('svg')!};};
const graph=(layoutAlgorithm='elk'):ERRuntimeGraph=>({type:'er',layoutAlgorithm,nodes:[],edges:[]});
const hooks={graph:()=>{},prepare:async()=>{}};
describe('native ER stage boundary lifecycle',()=>{
 it('uses resolved layout and one exact graph object before awaited preparation',async()=>{
  const {dom,root}=setup(),data=graph('dagre'),prepared={graph:'native'},events:string[]=[];
  try{
   const result=await withERLayoutHooks(root,{graph(value){expect(value).toBe(data);events.push('graph');value.nodes.push({id:'native'});},async prepare(value,layout){expect(value).toBe(data);expect(layout).toBe(prepared);events.push('prepare');await Promise.resolve();events.push('ready');}},async()=>{erNativeGraph(root,data);events.push('native preparation');await erPreparedLayout(root,data,prepared);events.push('native measure');return 42;});
   expect(result).toBe(42);expect(events).toEqual(['graph','native preparation','prepare','ready','native measure']);expect(data.nodes[0].id).toBe('native');
  }finally{dom.window.close();}
 });
 it('leaves inactive native rendering untouched',async()=>{
  const {dom,root}=setup(),data=graph('unknown');
  try{erNativeGraph(root,data);await erPreparedLayout(root,data,null);expect(data).toEqual(graph('unknown'));}finally{dom.window.close();}
 });
 it('rejects missing, repeated, out-of-order and substituted native boundaries then recovers',async()=>{
  const {dom,root}=setup();
  try{
   const bad=[async()=>{},async()=>{await erPreparedLayout(root,graph(),{});},async()=>{const data=graph();erNativeGraph(root,data);erNativeGraph(root,data);},async()=>{const data=graph();erNativeGraph(root,data);await erPreparedLayout(root,{...data},{});},async()=>{const data=graph();erNativeGraph(root,data);await erPreparedLayout(root,data,{});await erPreparedLayout(root,data,{});}];
   for(const draw of bad)await expect(withERLayoutHooks(root,hooks,draw)).rejects.toThrow(/ER layout hooks/);
   await expect(withERLayoutHooks(root,hooks,async()=>{const data=graph();erNativeGraph(root,data);await erPreparedLayout(root,data,{});})).resolves.toBeUndefined();
  }finally{dom.window.close();}
 });
 it('remembers caught failures and rejects overlap and unsupported layouts',async()=>{
  const {dom,root}=setup();
  try{
   await expect(withERLayoutHooks(root,hooks,async()=>{const data=graph();erNativeGraph(root,data);await erPreparedLayout(root,data,{});try{erNativeGraph(root,data);}catch{}})).rejects.toThrow(/invalidated/);
   await expect(withERLayoutHooks(root,hooks,async()=>{await expect(withERLayoutHooks(root,hooks,async()=>{})).rejects.toThrow(/overlapping/);})).rejects.toThrow(/invalidated/);
   await expect(withERLayoutHooks(root,hooks,async()=>{erNativeGraph(root,graph('unknown'));})).rejects.toThrow(/resolved layout/);
   await expect(withERLayoutHooks(root,hooks,async()=>{const data=graph();erNativeGraph(root,data);data.layoutAlgorithm='dagre';await erPreparedLayout(root,data,{});})).rejects.toThrow(/preparation boundary/);
   await expect(withERLayoutHooks(root,{...hooks,graph:async()=>{throw new Error('async callback');}},async()=>{erNativeGraph(root,graph());})).rejects.toThrow(/synchronous/);
  }finally{dom.window.close();}
 });
 it('rejects resolved family/layout drift during preparation and after native drawing',async()=>{
  const {dom,root}=setup();
  try{
   for(const field of ['type','layoutAlgorithm'] as const){
    await expect(withERLayoutHooks(root,{...hooks,async prepare(data){await Promise.resolve();data[field]='changed';}},async()=>{const data=graph();erNativeGraph(root,data);await erPreparedLayout(root,data,{});})).rejects.toThrow(/invalidated/);
    await expect(withERLayoutHooks(root,hooks,async()=>{const data=graph();erNativeGraph(root,data);await erPreparedLayout(root,data,{});data[field]='changed';})).rejects.toThrow(/invalidated/);
   }
   await expect(withERLayoutHooks(root,hooks,async()=>{const data=graph();erNativeGraph(root,data);await erPreparedLayout(root,data,{});})).resolves.toBeUndefined();
  }finally{dom.window.close();}
 });
 it('cleans up thrown callbacks and rejects a stale asynchronous completion',async()=>{
  const {dom,root}=setup();let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let pending!:Promise<void>;
  try{
   await expect(withERLayoutHooks(root,{...hooks,prepare:async()=>{throw new Error('planned failure');}},async()=>{const data=graph();erNativeGraph(root,data);await erPreparedLayout(root,data,{});})).rejects.toThrow('planned failure');
   await expect(withERLayoutHooks(root,{...hooks,prepare:()=>gate},async()=>{const data=graph();erNativeGraph(root,data);pending=erPreparedLayout(root,data,{});})).rejects.toThrow(/incomplete/);
   release();await expect(pending).rejects.toThrow(/closed/);
   await expect(withERLayoutHooks(root,hooks,async()=>{const data=graph();erNativeGraph(root,data);await erPreparedLayout(root,data,{});})).resolves.toBeUndefined();
  }finally{dom.window.close();}
 });
 it('requires an attached SVG and supports independent simultaneous stages',async()=>{
  const {dom,root}=setup();
  try{
   await expect(withERLayoutHooks(dom.window.document.createElement('div'),hooks,async()=>{})).rejects.toThrow(/SVG/);
   const other=root.cloneNode() as Element;root.after(other);
   await Promise.all([root,other].map(stage=>withERLayoutHooks(stage,hooks,async()=>{const data=graph();erNativeGraph(stage,data);await erPreparedLayout(stage,data,{});}))); 
   other.remove();await expect(withERLayoutHooks(other,hooks,async()=>{})).rejects.toThrow(/attached/);
  }finally{dom.window.close();}
 });
});

describe('native ER field lifecycle',()=>{
 const request={node:{id:'entity-A-0'},field:'header',copy:'single',path:'table',input:'$$x$$'} as const;
 const plan={key:'node:0:header:single',canonical:'$$x$$'};
 it('dispatches explicit slots only after preparation and leaves inactive calls native',async()=>{
  const {dom,root}=setup(),child=dom.window.document.createElementNS(root.namespaceURI,'g');root.append(child);
  let native=0,calls=0;
  try{
   expect(await withERField(child,request,async()=>0,async()=>++native)).toBe(1);
   await withERLayoutHooks(root,{...hooks,field(value){expect(value).toBe(request);calls++;return plan;}},async()=>{
    const data=graph();erNativeGraph(root,data);await erPreparedLayout(root,data,{});
    expect(await withERField(child,request,async value=>{expect(value).toBe(plan);return 42;},async()=>++native)).toBe(42);
   });
   expect(calls).toBe(1);expect(native).toBe(1);
  }finally{dom.window.close();}
 });
 it('poisons swallowed field errors and rejects pre-preparation or changed ancestry',async()=>{
  const {dom,root}=setup(),child=dom.window.document.createElementNS(root.namespaceURI,'g');root.append(child);
  try{
   for(const mode of ['early','callback','render','detach','layout']){
    await expect(withERLayoutHooks(root,{...hooks,field(){if(mode==='callback')throw new Error('callback failed');return plan;}},async()=>{
     const data=graph();erNativeGraph(root,data);
     if(mode!=='early')await erPreparedLayout(root,data,{});
     try{await withERField(child,request,async()=>{if(mode==='render')throw new Error('render failed');if(mode==='detach')child.remove();if(mode==='layout')data.layoutAlgorithm='dagre';return 0;},async()=>0);}catch{}
    })).rejects.toThrow(/invalidated/);
    root.append(child);
   }
   await withERLayoutHooks(root,{...hooks,field:()=>plan},async()=>{const data=graph();erNativeGraph(root,data);await erPreparedLayout(root,data,{});await withERField(child,request,async()=>0,async()=>0);});
  }finally{dom.window.close();}
 });
 it('rejects an unfinished field and its late completion even when draw forgets to await',async()=>{
  const {dom,root}=setup();let release!:()=>void,pending!:Promise<number>;const gate=new Promise<void>(resolve=>{release=resolve;});
  try{
   await expect(withERLayoutHooks(root,{...hooks,field:()=>plan},async()=>{const data=graph();erNativeGraph(root,data);await erPreparedLayout(root,data,{});pending=withERField(root,request,async()=>{await gate;return 1;},async()=>0);})).rejects.toThrow(/incomplete/);
   release();await expect(pending).rejects.toThrow(/closed/);
  }finally{dom.window.close();}
 });
});

it('does not normalize inactive fields and poisons a caught normalization failure',async()=>{
 const {dom,root}=setup();let normalized=0;
 const request=()=>{normalized++;throw new Error('normalization failed');};
 try{
  expect(await withERField(root,request,async()=>0,async()=>1)).toBe(1);expect(normalized).toBe(0);
  await expect(withERLayoutHooks(root,{...hooks,field:()=>({key:'header',canonical:'x'})},async()=>{
   const data=graph();erNativeGraph(root,data);await erPreparedLayout(root,data,{});
   try{await withERField(root,request,async()=>0,async()=>1);}catch{}
  })).rejects.toThrow(/invalidated/);
  expect(normalized).toBe(1);
 }finally{dom.window.close();}
});

it('rejects detachment after the last native boundary',async()=>{
 const {dom,root}=setup();
 try{
  await expect(withERLayoutHooks(root,hooks,async()=>{const data=graph();erNativeGraph(root,data);await erPreparedLayout(root,data,{});root.remove();})).rejects.toThrow(/invalidated/);
 }finally{dom.window.close();}
});

it('poisons caught failures from the synchronous measured-group boundary',async()=>{
 const {dom,root}=setup();
 try{
  for(const measuredGroup of [()=>{throw new Error('measurement failure');},async()=>{}]){
   await expect(withERLayoutHooks(root,{...hooks,measuredGroup},async()=>{
    const data=graph();erNativeGraph(root,data);await erPreparedLayout(root,data,{});
    try{erMeasuredGroup(root,{},0);}catch{}
   })).rejects.toThrow(/invalidated/);
  }
 }finally{dom.window.close();}
});
