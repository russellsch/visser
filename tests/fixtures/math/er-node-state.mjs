import assert from 'node:assert/strict';import {registerHooks} from 'node:module';
const [state,nodeDb,hook,stub]=process.argv.slice(2);const {erContractLoadHook}=await import(hook);registerHooks({load:erContractLoadHook(),resolve(specifier,context,next){return specifier==='dompurify'?{url:stub,shortCircuit:true}:next(specifier,context);}});
const mermaid=(await import('mermaid')).default,{installERNodeDb,captureERNodeState}=await import(nodeDb),{reconcileERNodeState}=await import(state);await installERNodeDb();const source='erDiagram\naccTitle: $$title$$\nsubgraph g[Group]\n A\nend\nA ||--o{ B : role\n';
for(const htmlLabels of [true,false]){mermaid.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels});const diagram=await mermaid.mermaidAPI.getDiagramFromText(source);const result=await reconcileERNodeState(diagram.db,diagram.text,source);assert.equal(result.normalized.effects.filter(e=>e.method==='addRelationship').length,1);await assert.rejects(reconcileERNodeState(diagram.db,diagram.text,source),/no completed/);const next=await mermaid.mermaidAPI.getDiagramFromText(source);const pending=reconcileERNodeState(next.db,next.text,source+' ');await assert.rejects(pending,/differs|source/);await assert.rejects(reconcileERNodeState(next.db,next.text,source),/no completed/);}
// Consumption occurs synchronously even while the collector is still pending.
mermaid.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels:true});
const pendingDiagram=await mermaid.mermaidAPI.getDiagramFromText(source);
const pending=reconcileERNodeState(pendingDiagram.db,pendingDiagram.text,source);
assert.throws(()=>captureERNodeState(pendingDiagram.db,pendingDiagram.text),/no completed/);
await pending;
const module=await import('../../../node_modules/mermaid/dist/chunks/mermaid.core/erDiagram-OPXOYQCR.mjs');
// Native live mutation and a new constructor's common clear cannot rewrite the
// historical completed snapshot consumed by the reconciliation bridge.
const historical=await mermaid.mermaidAPI.getDiagramFromText(source);
historical.db.addEntity('later');module.diagram.db;
const retained=await reconcileERNodeState(historical.db,historical.text,source);
assert.equal(retained.completed.snapshot.accTitle,'$$title$$');
assert.equal(retained.completed.snapshot.entities.some(([id])=>id==='later'),false);
assert.equal(retained.completed.data.nodes.some(node=>node.label==='later'),false);
for(const tamper of ['argument','extra-callback']) {
 const db=module.diagram.db;db.clear();const parser=module.diagram.parser;parser.yy=db;
 if(tamper==='argument') {
  const original=db.addEntity;db.addEntity=(name,...args)=>original(name==='A'?'forged':name,...args);
 } else {
  // Final DB values are identical; only the extra native callback exposes this.
  const original=db.setAccTitle;db.setAccTitle=(...args)=>{original(...args);original(...args);};
 }
 parser.parse(source+'\n');
 await assert.rejects(reconcileERNodeState(db,source+'\n',source),/callback trace differs/);
 await assert.rejects(reconcileERNodeState(db,source+'\n',source),/no completed/);
}
const groupedSource='erDiagram\ng[Alias] {\n string hidden\n}\nsubgraph g[First]\n A\n subgraph inner[Inner]\n  B\n end\nend\nsubgraph g[Empty]\n direction LR\nend\ng ||--o{ A : role\n';
const grouped=await mermaid.mermaidAPI.getDiagramFromText(groupedSource);
const checked=await reconcileERNodeState(grouped.db,grouped.text,groupedSource);
const beforeData=structuredClone(checked.completed.snapshot),data=grouped.db.getData();
const {config:renderConfig,...graphData}=data;assert.deepEqual(checked.completed.data,structuredClone(graphData));
assert.deepEqual(data.nodes.filter(node=>node.isGroup).map(node=>node.label),checked.owners.displayGroupOrder.map(i=>checked.completed.snapshot.subGraphs[i].title));
assert.deepEqual(data.nodes.filter(node=>!node.isGroup).map(node=>node.id),checked.owners.displayEntityOrder.map(i=>checked.owners.entities[i].nativeId));
assert.deepEqual(checked.completed.snapshot,beforeData);
assert.equal(checked.owners.entities.find(entity=>entity.entityKey==='g').suppressedByGroup,true);
assert.equal(checked.owners.entities.find(entity=>entity.entityKey==='A').suppressedByGroup,false);
// Authored validation is part of the consumed native receipt, even when an
// assignment is overwritten before the final DB snapshot.
assert.equal(retained.math.total.occurrences,1);
assert.equal(retained.completed.layout,'elk');
const invalidSource='erDiagram\naccTitle: $$\\href{x}{y}$$\naccTitle: safe\nA\n';
const invalidDiagram=await mermaid.mermaidAPI.getDiagramFromText(invalidSource);
await assert.rejects(reconcileERNodeState(invalidDiagram.db,invalidDiagram.text,invalidSource),/unsupported TeX/);
await assert.rejects(reconcileERNodeState(invalidDiagram.db,invalidDiagram.text,invalidSource),/no completed/);
const recovery=await mermaid.mermaidAPI.getDiagramFromText(source);
assert.equal((await reconcileERNodeState(recovery.db,recovery.text,source)).math.total.occurrences,1);
console.log('ok');
