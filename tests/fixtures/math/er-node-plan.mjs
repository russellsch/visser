import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';

const [planModule,state,nodeDb,erHook,layoutHook,stub]=process.argv.slice(2);
const {erContractLoadHook}=await import(erHook),{erLayoutContractLoadHook}=await import(layoutHook);
const erLoad=erContractLoadHook(),layoutLoad=erLayoutContractLoadHook();
registerHooks({
 resolve(specifier,context,next){return specifier==='dompurify'?{url:stub,shortCircuit:true}:next(specifier,context);},
 load(url,context,next){return layoutLoad(url,context,(nextUrl,nextContext)=>erLoad(nextUrl,nextContext,next));},
});
const mermaid=(await import('mermaid')).default;
const {installERNodeDb}=await import(nodeDb),{reconcileERNodeState}=await import(state),{prepareERNodePlan}=await import(planModule);
await installERNodeDb();

async function plan(source,layout){
 mermaid.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels:true,look:'default',layout});
 const diagram=await mermaid.mermaidAPI.getDiagramFromText(source);
 const checked=await reconcileERNodeState(diagram.db,diagram.text,source);
 return prepareERNodePlan(checked,source);
}

const topology='erDiagram\nsubgraph g[Group]\n A\n B\nend\nA ||--|| B : "$$x$$"\n';
const defaultPlan=await plan(topology,'elk');
assert.equal(defaultPlan.layout,'elk');
assert.equal(defaultPlan.copies.some(copy=>copy.ownerKind==='group'),true);
assert.equal(defaultPlan.copies.filter(copy=>copy.ownerKind==='relationship').length,1);

const dagrePlan=await plan(topology,'dagre');
assert.equal(dagrePlan.layout,'dagre');
assert.equal(dagrePlan.copies.some(copy=>copy.path==='group-measurement'),false);
assert.equal(dagrePlan.copies.filter(copy=>copy.ownerKind==='relationship').length,1);

const fallback=await plan('erDiagram\nA ||--|| A : role\n','unregistered-layout');
assert.equal(fallback.layout,'dagre');
assert.equal(fallback.copies.filter(copy=>copy.ownerKind==='relationship').length,1);

await assert.rejects(plan('erDiagram\nsubgraph g[Group]\n g\nend\n','dagre'),/cycle/i);
const recovered=await plan('erDiagram\nsubgraph g[Group]\n A\nend\nA ||--|| X : role\n','dagre');
assert.equal(recovered.layout,'dagre');
assert.equal(recovered.copies.filter(copy=>copy.ownerKind==='group').length,1);

const collisions=await plan('erDiagram\nA[Alias]\nsubgraph entity-A-0[Group]\n B\nend\nA ||--|| A : first\nA ||--|| A : second\n','dagre');
assert.equal(collisions.copies.find(copy=>copy.ownerKind==='entity'&&copy.ownerIndex===0)?.path,'raw-cluster');
assert.deepEqual(collisions.copies.filter(copy=>copy.ownerKind==='relationship').map(copy=>copy.ownerIndex),[1]);
console.log('ok: ER native node layout plan covers ELK, Dagre, native fallback, reset recovery, collisions and self-loops');
