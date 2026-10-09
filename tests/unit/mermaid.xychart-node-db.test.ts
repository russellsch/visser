import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {expect,it} from 'vitest';
it('requires the full native contract and scopes baseline/sanitation to the actual DB',()=>{
 const dir=mkdtempSync(join(tmpdir(),'visser-xy-node-db-')),url=(p:string)=>pathToFileURL(resolve(p)).href;
 const moduleUrl=url('packages/core/src/mermaid/xychart-node-db.ts');
 const missing=`import assert from 'node:assert/strict';const {installXYNodeDb}=await import(${JSON.stringify(moduleUrl)});await assert.rejects(installXYNodeDb(),/contract patch is missing/);console.log('missing rejected');`;
 const ready=`
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {xyContractLoadHook} from ${JSON.stringify(url('scripts/mermaid-xychart-contract.mjs'))};
registerHooks({load:xyContractLoadHook(),resolve(specifier,context,next){return specifier==='dompurify'?{url:${JSON.stringify(url('packages/core/src/mermaid/dompurify-stub.ts'))},shortCircuit:true}:next(specifier,context);}});
const {installXYNodeDb,captureXYNodeState}=await import(${JSON.stringify(moduleUrl)});
const {extractXYNodeMath}=await import(${JSON.stringify(url('packages/core/src/mermaid/xychart-node-math.ts'))});
const {default:stub}=await import(${JSON.stringify(url('packages/core/src/mermaid/dompurify-stub.ts'))});
const plainSanitize=stub.sanitize;
await Promise.all([installXYNodeDb(),installXYNodeDb()]);
const {diagram}=await import(${JSON.stringify(url('node_modules/mermaid/dist/chunks/mermaid.core/xychartDiagram-PMCCYNJV.mjs'))});
const db=diagram.db;
assert.throws(()=>captureXYNodeState(db),/no native clear-state/);
assert.throws(()=>captureXYNodeState({}),/no native clear-state/);
const parser=new diagram.parser.parser.Parser();parser.yy=db;
const source='xychart horizontal\\ntitle "before<br/>&dollar;&dollar;x&dollar;&dollar;"\\nline [1]\\n';
db.clear();parser.parse(source);
const captured=captureXYNodeState(db);
assert.equal(captured.baseline.orientation,'vertical');assert.equal(captured.snapshot.orientation,'horizontal');
assert.equal(captured.snapshot.title,'before<br>$$x$$');
assert.equal(stub.sanitize,plainSanitize);
const math=await extractXYNodeMath(source,source,db);assert.equal(math.total.occurrences,1);
db.clear();assert.throws(()=>parser.parse('xychart\\nline [oops]\\n'));
const next='xychart\\ntitle "$$next$$"\\nline [2]\\n';db.clear();parser.parse(next);
const recovered=await extractXYNodeMath(next,next,db);
assert.equal(recovered.snapshot.orientation,'vertical');assert.equal(recovered.snapshot.title,'$$next$$');
assert.equal(captured.snapshot.title,'before<br>$$x$$');
assert.equal(stub.sanitize,plainSanitize);assert.equal(globalThis.window,undefined);assert.equal(globalThis.document,undefined);
console.log('recovered');
`;
 try{
  const a=join(dir,'missing.mjs'),b=join(dir,'ready.mjs');writeFileSync(a,missing);writeFileSync(b,ready);
  expect(execFileSync(process.execPath,[a],{encoding:'utf8'}).trim()).toBe('missing rejected');
  expect(execFileSync(process.execPath,[b],{encoding:'utf8'}).trim()).toBe('recovered');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
