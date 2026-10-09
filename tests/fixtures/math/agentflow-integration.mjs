import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {agentflowContractLoadHook} from '../../../scripts/mermaid-agentflow-contract.mjs';
const stub=pathToFileURL(resolve('packages/core/src/mermaid/dompurify-stub.ts')).href;
const hook=registerHooks({load:agentflowContractLoadHook(),resolve(specifier,context,next){return specifier==='dompurify'?{url:stub,shortCircuit:true}:next(specifier,context);}});
try {
 const {extractAgentflowMath}=await import('../../../packages/core/src/mermaid/agentflow-math.ts');
 const {reconcileFlowchartData}=await import('../../../packages/core/src/mermaid/flowchart-db.ts');
 const mermaid=(await import('mermaid')).default;
 const cases=[
  'agentflow-beta\nA --> B\n',
  'agentflow-beta\nA["$$a$$"]\nA --> B\n',
  'agentflow-beta\nconnector c\nA["$$a$$"] --> c\n',
  'agentflow-beta\nflow f\nA["$$a$$"]\nend\n',
  'agentflow-beta\nflow f["Old $$o$$"]\nA\nend\nflow f["New $$n$$"]\nB\nend\n',
  'agentflow-beta\nflow f["$$f$$"]@{view: collapsed}\nA["$$a$$"]\nend\nconnector c["$$c$$"]\nA -->|"$$e$$"| c\n',
  'agentflow-beta\nA@{label: ["$$x$$", "$$y$$"]}\n',
  'agentflow-beta\nA@{label: true}\n',
  'agentflow-beta\nA["$$x$$"]@{label: []}\n',
  'agentflow-beta\nconnector c["$$c$$"]\nc@{label: "$$hidden$$"}\n',
  'agentflow-beta\nflow f["Old $$o$$"]\nA\nend\nflow g["$$g$$"]\nB\nend\nflow f["New $$n$$"]\nC\nend\n',
 ];
 const results=[];
 for(const [index,source] of cases.entries()) {
  try {
   mermaid.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels:true,logLevel:'fatal'});
   const math=await extractAgentflowMath(source);
   const diagram=await mermaid.mermaidAPI.getDiagramFromText(source);
   assert.equal(diagram.type,'agentflow');
   const plan=reconcileFlowchartData(diagram.db,math.records);
   results.push({index,slots:plan.slots.map(s=>s.key),hidden:plan.hiddenKeys,occurrences:math.total.occurrences});
  } catch(error) {results.push({index,error:String(error),stack:error.stack});}
 }
 console.log(JSON.stringify(results,null,2));
 assert.equal(results.filter(r=>r.error).length,0,'Every accepted field profile must reconcile');
} finally {hook.deregister();}
