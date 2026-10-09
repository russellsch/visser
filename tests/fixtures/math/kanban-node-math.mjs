import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {kanbanContractLoadHook} from '../../../scripts/mermaid-kanban-contract.mjs';
registerHooks({load:kanbanContractLoadHook(),resolve(specifier,context,next){
 return specifier==='dompurify'?{url:new URL('../../../packages/core/src/mermaid/dompurify-stub.ts',import.meta.url).href,shortCircuit:true}:next(specifier,context);
}});
const {installKanbanNodeDb,captureKanbanNodeState,readKanbanNodeConfig}=await import('../../../packages/core/src/mermaid/kanban-node-db.ts');
const {extractKanbanNodeMath,preflightKanbanNodeMath}=await import('../../../packages/core/src/mermaid/kanban-node-math.ts');
const {extractKanbanLabels}=await import('../../../packages/core/src/mermaid/kanban-labels.ts');
assert.throws(()=>readKanbanNodeConfig(),/unavailable/);
await installKanbanNodeDb();
const {default:mermaid}=await import('mermaid');
const {diagram}=await import('../../../node_modules/mermaid/dist/chunks/mermaid.core/kanban-definition-PNTS6WVX.mjs');
const db=diagram.db,parser=diagram.parser;
mermaid.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels:true});
const nativeAdd=db.addNode;let preflightCalls=0;
db.addNode=(...args)=>{preflightCalls++;return nativeAdd.apply(db,args);};
const denied='kanban\nc[Column]\n  i[Base]@{"\\u0069con": denied}\n';
await assert.rejects(preflightKanbanNodeMath(denied,denied),/not allowed/);
const aliasFields=Array.from({length:21},(_,i)=>i===0?'a0: &a0 [x]':`a${i}: &a${i} [*a${i-1}, *a${i-1}]`).join(', ');
const tooLarge=`kanban\nc[Column]\n  i[Base]@{${aliasFields}, label: *a20}\n`;
await assert.rejects(preflightKanbanNodeMath(tooLarge,tooLarge),/limit|exceed/i);
assert.equal(preflightCalls,0);db.addNode=nativeAdd;
const source='kanban\na[First]\n  i["雪 $$x$$"]@{label: ["$$y$$", "$$y$$"], ticket: "$$t$$"}\na[Second]\n  j["$$z$$"]\n';
const input=(await extractKanbanLabels(source)).parserSource;
for(const htmlLabels of [true,false]){
 mermaid.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels,mindmap:{padding:13,maxNodeWidth:241}});
 db.clear();parser.yy=db;parser.parse(input);
 const promise=extractKanbanNodeMath(source,source,db,input);
 db.clear();mermaid.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels:!htmlLabels,mindmap:{padding:1,maxNodeWidth:80}});
 const result=await promise;
 assert.equal(result.htmlLabels,htmlLabels);assert.deepEqual(result.options,{width:241,padding:13});
 assert.equal(result.snapshot.nodes[1].width,241);assert.equal(result.snapshot.nodes[1].padding,26);
 assert.equal(result.math.total.occurrences,17); // hidden x once; y twice + t + z each rendered four times.
 assert.deepEqual(result.math.renderPlan.counts,[1,4,1,4]);
 assert.throws(()=>captureKanbanNodeState(db,input),/no completed native parse/);
}
mermaid.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels:true});
db.clear();parser.yy=db;parser.parse(input);
await assert.rejects(extractKanbanNodeMath(source,source+' ',db,input),/source|fence/);
assert.throws(()=>captureKanbanNodeState(db,input),/no completed native parse/);
// Same-shaped data and equal formulas at different source positions cannot
// substitute for the exact source that native parsing completed.
db.clear();parser.parse(input);
await assert.rejects(extractKanbanNodeMath(source.replace('First','Other'),source.replace('First','Other'),db,input),/source differs/);
const bad='kanban\nc[Column]\n  i["$$\\badcommand$$"]\n';
const badInput=(await extractKanbanLabels(bad)).parserSource;
db.clear();parser.parse(badInput);await assert.rejects(extractKanbanNodeMath(bad,bad,db,badInput));
assert.throws(()=>captureKanbanNodeState(db,badInput),/no completed native parse/);
const next='kanban\nc["$$ok$$"]\n';
const viaApi=await mermaid.mermaidAPI.getDiagramFromText(next);
const recovered=await extractKanbanNodeMath(next,next,viaApi.db,viaApi.text);
assert.equal(recovered.math.total.occurrences,1);
assert.equal(recovered.snapshot.nodes[0].label,'$$ok$$');
assert.equal(globalThis.window,undefined);assert.equal(globalThis.document,undefined);
console.log(JSON.stringify({modes:2,detached:true,sourceBound:true,recovered:true}));
