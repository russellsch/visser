import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {agentflowContractLoadHook} from '../../../scripts/mermaid-agentflow-contract.mjs';
const [labels,stub]=process.argv.slice(2);const hook=registerHooks({load:agentflowContractLoadHook(),resolve(specifier,context,next){return specifier==='dompurify'?{url:stub,shortCircuit:true}:next(specifier,context);}});
try{
 const {extractAgentflowLabels}=await import(labels);
 const source='agentflow-beta\r\n%% kept comment $$c$$\r\nflow f["Flow $$f$$"]\r\n  a["Å $$a$$"]@{ label: "Meta $$m$$" }\r\n  a["Again $$r$$"]\r\n  z\r\n  connector c["Connector $$k$$"]\r\n  a foo@-->|"Edge $$e$$"| c\r\nend\r\naccTitle: First $$t$$\r\naccTitle: Last $$u$$\r\naccDescr: Desc $$d$$\r\n';
 const result=await extractAgentflowLabels(source,source.replace(/\r\n/g,'\n'));
 const visible=result.records.filter(record=>record.active).map(record=>[record.role,record.ownerId,record.semanticValue]);
 assert.deepEqual(visible,[['subgraph','f','Flow $$f$$'],['node.explicit','a','Again $$r$$'],['node.bare','z','z'],['node.explicit','c','Connector $$k$$'],['edge',undefined,'Edge $$e$$'],['accTitle',undefined,'Last $$u$$'],['accDescr',undefined,'Desc $$d$$']]);
 assert.deepEqual(result.records.filter(record=>record.ownerId==='a').map(record=>[record.semanticValue,record.active]),[['Å $$a$$',false],['Again $$r$$',true]]);
 assert.equal(result.shapeData.length,1);assert.equal(result.shapeData[0].rawValue,' label: "Meta $$m$$" ');
 assert.equal(result.records.find(record=>record.ownerId==='a')?.provenance.intervals[0]?.startByte,source.indexOf('Å'));
 assert.equal(result.records.find(record=>record.role==='edge')?.edgeIds?.[0],'foo');
 assert.ok(result.parserSource.includes('%% kept comment'));

 const defaults=await extractAgentflowLabels('agentflow-beta\nconnector c\nflow f\nA\nA --> B\nend\n');
 assert.deepEqual(defaults.records.map(record=>[record.role,record.ownerId,record.semanticValue,record.labelType]),[
  ['node.explicit','c','c','text'],['subgraph','f','','text'],['node.bare','A','A','text'],['node.bare','B','B','text'],
 ]);
 const anonymous=await extractAgentflowLabels('agentflow-beta\nflow\nA\nend\n');
 assert.deepEqual(anonymous.records.map(record=>[record.role,record.ownerId,record.semanticValue,record.labelType]),[
  ['subgraph','subGraph0','','markdown'],['node.bare','A','A','text'],
 ]);
 const bareRefs=await extractAgentflowLabels('agentflow-beta\nA\nA --> B\nA\n');
 assert.deepEqual(bareRefs.records.map(record=>[record.role,record.ownerId,record.semanticValue]),[
  ['node.bare','A','A'],['node.bare','B','B'],
 ]);

 const repeated=await extractAgentflowLabels('agentflow-beta\nflow f["Old $$o$$"]\nA\nend\nflow g["G $$g$$"]\nB\nend\nflow f["New $$n$$"]\nC\nend\n');
 assert.deepEqual(repeated.records.filter(record=>record.role==='subgraph').map(record=>[record.ownerId,record.semanticValue,record.active]),[
  ['f','Old $$o$$',false],['g','G $$g$$',true],['f','New $$n$$',true],
 ]);

 const owners=await extractAgentflowLabels('agentflow-beta\nflow f["F"]@{label: "group $$g$$"}\nA["A"]@{label: "node $$n$$"}\nend\nconnector c["C"]\nc@{label: "connector $$c$$"}\nA foo@-->|"E"| c\nfoo@{label: "edge $$e$$"}\nconnectors@{label: "reserved $$r$$"}\n');
 assert.deepEqual(owners.shapeData.map(record=>[record.ownerId,record.targetKind,record.rawValue]),[
  ['f','subgraph','label: "group $$g$$"'],['A','node','label: "node $$n$$"'],
  ['c','connector','label: "connector $$c$$"'],['foo','edge','label: "edge $$e$$"'],
  ['connectors','connector','label: "reserved $$r$$"'],
 ]);
 console.log('ok: Agentflow collector preserves labels, metadata, comments, CRLF, unicode and overwritten accessibility fields');
}finally{hook.deregister();}
