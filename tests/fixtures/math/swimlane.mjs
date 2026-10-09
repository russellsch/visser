import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';

const [math,db,stub]=process.argv.slice(2);
const hook=registerHooks({resolve(specifier,context,next){return specifier==='dompurify'?{url:stub,shortCircuit:true}:next(specifier,context);}});
try {
 const mermaid=(await import('mermaid')).default;
 const {extractFlowchartMath}=await import(math),{reconcileFlowchartData}=await import(db);
 for(const direction of ['TB','LR']) {
  const source=`swimlane-beta ${direction}\nsubgraph lane["Lane $$l$$"]\n A["Node $$a$$"]\nend\nA -->|"Edge $$e$$"| B["Node $$b$$"]\n`;
  mermaid.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels:true,logLevel:'fatal'});
  // The pinned Flowchart grammar accepts the swimlane header itself; this
  // collector never rewrites it to flowchart before source provenance binds.
  const planned=await extractFlowchartMath(source);
  const diagram=await mermaid.mermaidAPI.getDiagramFromText(source);
  assert.equal(diagram.type,'swimlane');
  const result=reconcileFlowchartData(diagram.db,planned.records);
  assert.deepEqual(result.slots.map(slot=>slot.key).sort(),['edge:L_A_B_0','node:A','node:B','subgraph:lane']);
  assert.equal(result.hiddenKeys.length,0);
  assert.equal(planned.total.occurrences,4);
 }
 console.log('ok: swimlane-beta keeps native header provenance and reconciles lane/node/edge labels in TB and LR');
} finally {hook.deregister();}
