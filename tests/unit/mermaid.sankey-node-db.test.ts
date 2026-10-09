import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {expect,it} from 'vitest';
it('requires the native marker, coalesces installation, and captures before asynchronous collection',()=>{
 const dir=mkdtempSync(join(tmpdir(),'visser-sankey-node-db-')),url=(p:string)=>pathToFileURL(resolve(p)).href,moduleUrl=url('packages/core/src/mermaid/sankey-node-db.ts');
 const missing=`import assert from 'node:assert/strict';const {installSankeyNodeDb}=await import(${JSON.stringify(moduleUrl)});await assert.rejects(installSankeyNodeDb(),/contract patch is missing/);console.log('missing rejected');`;
 const ready=`
import assert from 'node:assert/strict';import {registerHooks} from 'node:module';
import {sankeyContractLoadHook} from ${JSON.stringify(url('scripts/mermaid-sankey-contract.mjs'))};
registerHooks({load:sankeyContractLoadHook(),resolve(specifier,context,next){return specifier==='dompurify'?{url:${JSON.stringify(url('packages/core/src/mermaid/dompurify-stub.ts'))},shortCircuit:true}:next(specifier,context);}});
const {installSankeyNodeDb,captureSankeyNodeState}=await import(${JSON.stringify(moduleUrl)});
const {extractSankeyNodeMath}=await import(${JSON.stringify(url('packages/core/src/mermaid/sankey-node-math.ts'))});
const {default:stub}=await import(${JSON.stringify(url('packages/core/src/mermaid/dompurify-stub.ts'))});const originalSanitize=stub.sanitize;
await Promise.all([installSankeyNodeDb(),installSankeyNodeDb()]);
const {diagram}=await import(${JSON.stringify(url('node_modules/mermaid/dist/chunks/mermaid.core/sankeyDiagram-IPEJSGJF.mjs'))});const db=diagram.db,parser=diagram.parser;parser.yy=db;
assert.throws(()=>captureSankeyNodeState(db),/no native clear state/);assert.throws(()=>captureSankeyNodeState({}),/no native clear state/);
const source='sankey\\n"before<br/>&dollar;&dollar;x&dollar;&dollar;",target,1\\n';db.clear();parser.parse(source);
const captured=captureSankeyNodeState(db);assert.equal(captured.graph.nodes[0].id,'before<br>$$x$$');assert.equal(stub.sanitize,originalSanitize);
const pending=extractSankeyNodeMath(source,source,db);db.clear();const math=await pending;assert.equal(math.total.occurrences,1);assert.equal(math.snapshot.graph.nodes[0].id,'before<br>$$x$$');
assert.throws(()=>parser.parse('sankey\\nbad\\n'));
const next='sankey\\n"$$next$$",target,2\\n';db.clear();parser.parse(next);const recovered=await extractSankeyNodeMath(next,next,db);
assert.equal(recovered.snapshot.graph.nodes[0].id,'$$next$$');assert.equal(captured.graph.nodes[0].id,'before<br>$$x$$');
assert.equal(stub.sanitize,originalSanitize);assert.equal(globalThis.window,undefined);assert.equal(globalThis.document,undefined);db.clear();console.log('recovered');
`;
 try{
  const a=join(dir,'missing.mjs'),b=join(dir,'ready.mjs');writeFileSync(a,missing);writeFileSync(b,ready);
  expect(execFileSync(process.execPath,[a],{encoding:'utf8'}).trim()).toBe('missing rejected');
  expect(execFileSync(process.execPath,[b],{encoding:'utf8'}).trim()).toBe('recovered');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
