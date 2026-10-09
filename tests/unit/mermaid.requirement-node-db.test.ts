import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {expect,it} from 'vitest';

it('authenticates Requirement parser completion and consumes detached native snapshots in isolated source workers',()=>{
 const root=process.cwd(),dir=mkdtempSync(join(tmpdir(),'visser-requirement-node-db-')),url=(path:string)=>pathToFileURL(resolve(path)).href;
 const nodeDb=url('packages/core/src/mermaid/requirement-node-db.ts'),nodeMath=url('packages/core/src/mermaid/requirement-node-math.ts'),stub=url('packages/core/src/mermaid/dompurify-stub.ts'),hook=url('scripts/mermaid-requirement-contract.mjs'),chunk=url('node_modules/mermaid/dist/chunks/mermaid.core/requirementDiagram-PLB6GJNP.mjs'),mermaid=url('node_modules/mermaid/dist/mermaid.core.mjs');
 const matrix=String.raw`$$\begin{matrix}a\\b\end{matrix}$$`,source=String.raw`requirementDiagram
accTitle: &dollar;&dollar;common&dollar;&dollar;<br/>
requirement req {
 text: "${matrix}"
}
`,invalid='requirementDiagram\naccTitle: &dollar;&dollar;failed&dollar;&dollar;<br/>\nrequirement req {\n text: \n}\n',recovered='requirementDiagram\nrequirement next {\n text: "$$next$$"\n}\n';
 const missing=`import assert from 'node:assert/strict';const {installRequirementNodeDb}=await import(${JSON.stringify(nodeDb)});await assert.rejects(installRequirementNodeDb(),/native contract patch is missing/);console.log('marker missing');`;
 const ready=[
  "import assert from 'node:assert/strict';import {registerHooks} from 'node:module';",
  'import {requirementContractLoadHook} from '+JSON.stringify(hook)+';',
  'registerHooks({load:requirementContractLoadHook(),resolve(specifier,context,next){return specifier==="dompurify"?{url:'+JSON.stringify(stub)+',shortCircuit:true}:next(specifier,context);}});',
  'const {installRequirementNodeDb,captureRequirementNodeState}=await import('+JSON.stringify(nodeDb)+');',
  'const {extractRequirementNodeMath}=await import('+JSON.stringify(nodeMath)+');',
  'const stubModule=await import('+JSON.stringify(stub)+'),originalSanitize=stubModule.default.sanitize;',
  'await Promise.all([installRequirementNodeDb(),installRequirementNodeDb()]);',
  'const module=await import('+JSON.stringify(chunk)+'),db=module.diagram.db,parser=module.diagram.parser;parser.yy=db;',
  'assert.throws(()=>captureRequirementNodeState(db,"x"),/no completed native parse snapshot/);assert.throws(()=>captureRequirementNodeState({},"x"),/no completed native parse snapshot/);',
  'const source='+JSON.stringify(source)+',parserInput=source+"\\n";',
  'parser.yy={};assert.throws(()=>parser.parse(parserInput),/registered native instance/);parser.yy=db;',
  'assert.throws(()=>parser.parse(parserInput),/fresh native clear/);db.clear();parser.parse(parserInput);assert.throws(()=>parser.parse.call({},parserInput),/wrong parser receiver/);',
  'assert.throws(()=>captureRequirementNodeState(db,"other"),/completed parser input differs/);assert.throws(()=>captureRequirementNodeState(db,parserInput),/no completed native parse snapshot/);',
  'db.clear();parser.parse(parserInput);const captured=captureRequirementNodeState(db,parserInput);assert.equal(captured.accTitle,"$$common$$<br>");assert.throws(()=>captureRequirementNodeState(db,parserInput),/no completed native parse snapshot/);assert.equal(captured.requirements[0][1].text,'+JSON.stringify(matrix)+');assert.equal(stubModule.default.sanitize,originalSanitize);',
  'db.clear();parser.parse(parserInput);const planned=extractRequirementNodeMath(source,source,db,parserInput);db.clear();const detached=await planned;assert.equal(detached.snapshot.requirements[0][1].text,'+JSON.stringify(matrix)+');assert.equal(detached.math.total.occurrences,2);assert.equal(captured.accTitle,"$$common$$<br>");',
  'db.clear();parser.parse(parserInput);await assert.rejects(extractRequirementNodeMath(source,source+" ",db,parserInput),/E_MATH_INVALID|displayed fence/);assert.throws(()=>captureRequirementNodeState(db,parserInput),/no completed native parse snapshot/);',
  'assert.throws(()=>parser.parse(parserInput),/fresh native clear/);assert.throws(()=>captureRequirementNodeState(db,parserInput),/no completed native parse snapshot/);',
  'const invalid='+JSON.stringify(invalid)+';db.clear();assert.throws(()=>parser.parse(invalid));assert.throws(()=>captureRequirementNodeState(db,invalid),/no completed native parse snapshot/);assert.throws(()=>parser.parse(parserInput),/fresh native clear/);',
  'db.clear();parser.parse(parserInput);db.clear();assert.throws(()=>captureRequirementNodeState(db,parserInput),/no completed native parse snapshot/);parser.parse(parserInput);assert.throws(()=>parser.parse(parserInput),/fresh native clear/);const recovered='+JSON.stringify(recovered)+',recoveredInput=recovered+"\\n";db.clear();parser.parse(recoveredInput);const next=await extractRequirementNodeMath(recovered,recovered,db,recoveredInput);assert.equal(next.snapshot.requirements[0][0],"next");assert.equal(captured.requirements[0][0],"req");',
  'parser.yy=db;const originalText=db.setNewReqText;db.setNewReqText=()=>parser.parse(parserInput);db.clear();assert.throws(()=>parser.parse(parserInput),/overlapping native parse/);assert.throws(()=>captureRequirementNodeState(db,parserInput),/no completed native parse snapshot/);db.setNewReqText=originalText;',
  'db.setNewReqText=(value)=>{originalText(value);db.clear();};db.clear();assert.throws(()=>parser.parse(parserInput),/cleared during parse/);assert.throws(()=>parser.parse(parserInput),/fresh native clear/);db.setNewReqText=originalText;',
  'const originalParse=parser.parse;parser.parse=function(...args){const output=originalParse.apply(this,args);queueMicrotask(()=>{void module.diagram.db;});return output;};const {default:mermaid}=await import('+JSON.stringify(mermaid)+');mermaid.initialize({startOnLoad:false,securityLevel:"strict"});const apiSource="requirementDiagram\\naccTitle: $$raced$$\\nrequirement api {\\n text: literal\\n}\\n";const viaApi=await mermaid.mermaidAPI.getDiagramFromText(apiSource);assert.equal(viaApi.db.getAccTitle(),"");const raced=captureRequirementNodeState(viaApi.db,viaApi.text);assert.equal(raced.accTitle,"$$raced$$");assert.equal(raced.requirements[0][1].text,"literal");',
  'assert.equal(stubModule.default.sanitize,originalSanitize);assert.equal(globalThis.window,undefined);assert.equal(globalThis.document,undefined);console.log("recovered");'
 ].join('\n');
 try{
  for(const [name,body,expected]of [['missing.mjs',missing,'marker missing'],['ready.mjs',ready,'recovered']]as const){const file=join(dir,name);writeFileSync(file,body);expect(execFileSync(process.execPath,[file],{cwd:root,encoding:'utf8'}).trim()).toBe(expected);}
 }finally{rmSync(dir,{recursive:true,force:true});}
});
