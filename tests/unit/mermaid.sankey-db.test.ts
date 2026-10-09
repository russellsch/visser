import {afterAll,beforeAll,expect,it} from 'vitest';
import DOMPurify from 'dompurify';
// @ts-expect-error jsdom is supplied by the test harness without declarations.
import {JSDOM} from 'jsdom';
import {captureSankeyDb,reconcileSankeyDb} from '../../packages/core/src/mermaid/sankey-db.ts';
import {extractSankeyMath} from '../../packages/core/src/mermaid/sankey-math.ts';

const original=Object.getOwnPropertyDescriptors(DOMPurify);
beforeAll(()=>{const instance=DOMPurify(new JSDOM('').window);Object.assign(DOMPurify,{sanitize:instance.sanitize,addHook:instance.addHook});});
afterAll(()=>{for(const key of ['sanitize','addHook'])if(original[key])Object.defineProperty(DOMPurify,key,original[key]!);else Reflect.deleteProperty(DOMPurify,key);});
async function native(source:string){const {default:mermaid}=await import('mermaid');mermaid.initialize({startOnLoad:false,securityLevel:'strict'});const diagram=await mermaid.mermaidAPI.getDiagramFromText(source);return diagram.db as any;}
async function plan(source:string){const db=await native(source);try{const snapshot=captureSankeyDb(db);return {db,math:await extractSankeyMath(source),snapshot};}catch(error){db.clear();throw error;}}

it('reconciles first sanitized source ownership, repeated/parallel links, and never consults stale node maps',async()=>{
 const source='sankey\n"$$x < y$$<br/>",target,1\n"$$x &lt; y$$<br/>",target,2\ntarget,"$$x < y$$<br/>",3\n';const {db,math,snapshot}=await plan(source);
 const stale=db.nodesMap;
 try{db.nodesMap=new Map([['forged',{id:'forged'}]]);const result=reconcileSankeyDb(math,snapshot);
  expect(result.snapshot.graph.links).toEqual([{source:math.records[0]!.dbValue,target:math.records[1]!.dbValue,value:1},{source:math.records[2]!.dbValue,target:math.records[3]!.dbValue,value:2},{source:math.records[4]!.dbValue,target:math.records[5]!.dbValue,value:3}]);
  expect(result.candidates).toEqual([{key:'node:0',nodeIndex:0,recordIndex:1},{key:'node:1',nodeIndex:1,recordIndex:2}]);expect(stale).toBeDefined();
 }finally{db.nodesMap=stale;db.clear();}
});

it('keeps identical display formulas with distinct native IDs as distinct nodes',async()=>{
 const source=String.raw`sankey
"$$a\&b$$",a,1
"$$a\&amp;b$$",b,2
`;
 const {db,math,snapshot}=await plan(source);
 try{
  expect(math.records[0]!.renderedValue).toBe(math.records[2]!.renderedValue);
  expect(math.records[0]!.dbValue).not.toBe(math.records[2]!.dbValue);
  expect(reconcileSankeyDb(math,snapshot).candidates.map(slot=>slot.recordIndex)).toEqual([1,2,3,4]);
 }finally{db.clear();}
});

it('replays signed zero and NaN exactly, retaining empty names and source-before-target identity',async()=>{
 const {db,math,snapshot}=await plan('sankey-beta\n" ",a,-0\na," ",NaN\na,a,1\n');
 try{
  expect(Object.is(snapshot.graph.links[0]!.value,-0)).toBe(true);expect(Number.isNaN(snapshot.graph.links[1]!.value)).toBe(true);
  const result=reconcileSankeyDb(math,snapshot);
  expect(result.candidates).toEqual([{key:'node:0',nodeIndex:0,recordIndex:1},{key:'node:1',nodeIndex:1,recordIndex:2}]);
  expect(Object.is(result.snapshot.graph.links[0]!.value,-0)).toBe(true);expect(Number.isNaN(result.snapshot.graph.links[1]!.value)).toBe(true);
  const changed=structuredClone(snapshot);changed.graph.links[0]!.value=0;expect(()=>reconcileSankeyDb(math,changed)).toThrow();
 }finally{db.clear();}
});

it('captures detached graph snapshots, preserves native numeric values, and rejects hostile ownership/graph metadata changes',async()=>{
 const source='sankey\na,b,1\nb,c,2\n';const {db,math,snapshot}=await plan(source);
 try{const captured=captureSankeyDb(db);db.clear();expect(captured.graph.links).toHaveLength(2);expect(reconcileSankeyDb(math,snapshot).snapshot).toEqual(snapshot);
  const graphMutations:Array<(value:any)=>void>=[value=>value.graph.nodes.reverse(),value=>value.graph.links[0].source='forged',value=>value.title='forged'];
  const ownerMutations:Array<(value:any)=>void>=[value=>value.records.reverse(),value=>value.labels.records[0].rowIndex=9,value=>value.labels.rows[0].sourceRecord=99,value=>value.records.pop()];
  for(const mutate of graphMutations){const hostile=structuredClone(snapshot);mutate(hostile);expect(()=>reconcileSankeyDb(math,hostile)).toThrow();}
  for(const mutate of ownerMutations){const hostile={records:structuredClone(math.records),labels:structuredClone(math.labels)};mutate(hostile);expect(()=>reconcileSankeyDb(hostile,snapshot)).toThrow();}
 }finally{db.clear();}
});
