import { execFileSync } from 'node:child_process';
import { readFileSync,mkdtempSync,writeFileSync,rmSync } from 'node:fs';
import { resolve,join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { expect,it } from 'vitest';
// @ts-expect-error build scripts are outside the TS project.
import { patchXYContract,xyContractPlugin } from '../../scripts/mermaid-xychart-contract.mjs';
const chunk=resolve('node_modules/mermaid/dist/chunks/mermaid.core/xychartDiagram-PMCCYNJV.mjs');
it('pins the entire native artifact and rejects missing bundled contract application',async()=>{
 const source=readFileSync(chunk,'utf8');
 expect(()=>patchXYContract(source+'\n')).toThrow(/artifact changed/);
 expect(()=>patchXYContract(patchXYContract(source))).toThrow(/artifact changed/);
 await expect(build({stdin:{contents:'export const x=1;',resolveDir:process.cwd()},write:false,plugins:[xyContractPlugin()]})).rejects.toThrow(/patched 0/);
});
it('captures equivalent detached native state in source and relocated bundle without changing drawables',async()=>{
 const root=process.cwd(),dir=mkdtempSync(join(tmpdir(),'visser-xy-contract-'));
 const url=(p:string)=>pathToFileURL(resolve(p)).href;
 const dbModule='packages/core/src/mermaid/xychart-db.ts';
 const stub=resolve('packages/core/src/mermaid/dompurify-stub.ts');
 // This fixture tests contract/drawable parity with plain labels only; actual
 // DOMPurify sanitation is exercised separately by xychart-native/db tests.
 const stubHook=`import {registerHooks} from 'node:module';registerHooks({resolve(specifier,context,next){return specifier==='dompurify'?{url:${JSON.stringify(url(stub))},shortCircuit:true}:next(specifier,context);}});\n`;
 const source='xychart horizontal\ntitle "title $$t$$"\nx-axis [a,a,b]\nline "one" [1 "$$p$$",2]\nx-axis [a,b,c]\nbar [3,4,5,999]\n';
 const parse=`const db=mod.diagram.db;db.clear();const parser=new mod.diagram.parser.parser.Parser();parser.yy=db;parser.parse(${JSON.stringify(source)});`;
 const body=`
import assert from 'node:assert/strict';
import {inspect} from 'node:util';
import {captureXYBaseline,captureXYDb} from ${JSON.stringify(url(dbModule))};
const mod=await import(${JSON.stringify(url(chunk))});
assert.equal(mod.visserXYContractVersion,1);
${parse}
const before=captureXYDb(db),saved=structuredClone(before);
assert.equal(before.data.title,'');assert.equal(before.title,'title $$t$$');
assert.equal(before.data.plots[0].data[2][1],undefined);
assert.equal(before.data.yAxis.max,5);
const built=db.getDrawableElem();
assert.equal(db.getXYChartData().title,before.title);
assert.deepEqual(before,saved);
before.data.plots[0].data[0][0]='changed';
assert.equal(db.getXYChartData().plots[0].data[0][0],'a');
db.clear();assert.equal(captureXYDb(db).data.plots.length,0);
assert.equal(saved.data.plots[0].data[2][1],undefined);
console.log(JSON.stringify({snapshot:inspect(saved,{depth:null}),built:inspect(built,{depth:null})}));
`;
 const hook=stubHook+`import {xyContractLoadHook} from ${JSON.stringify(url('scripts/mermaid-xychart-contract.mjs'))};registerHooks({load:xyContractLoadHook()});\n`;
 try{
  const file=join(dir,'source.mjs');writeFileSync(file,hook+body);
  const observed=JSON.parse(execFileSync(process.execPath,[file],{cwd:root,encoding:'utf8'}));
  const upstreamFile=join(dir,'upstream.mjs');
  writeFileSync(upstreamFile,stubHook+`import {inspect} from 'node:util';const mod=await import(${JSON.stringify(url(chunk))});${parse}console.log(JSON.stringify(inspect(db.getDrawableElem(),{depth:null})));`);
  const upstream=JSON.parse(execFileSync(process.execPath,[upstreamFile],{cwd:root,encoding:'utf8'}));
  expect(observed.built).toBe(upstream);
  const outfile=join(dir,'bundle.mjs');
  await build({stdin:{contents:body.replaceAll(url(chunk),chunk).replaceAll(url(dbModule),resolve(dbModule)),resolveDir:root,sourcefile:'xy-contract-entry.mjs'},bundle:true,platform:'node',format:'esm',outfile,alias:{dompurify:stub},plugins:[xyContractPlugin()]});
  const bundled=JSON.parse(execFileSync(process.execPath,[outfile],{cwd:dir,encoding:'utf8'}));
  expect(bundled).toEqual(observed);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
