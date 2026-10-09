import {execFileSync} from 'node:child_process';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {expect,it} from 'vitest';
// @ts-expect-error build scripts are outside the TS project.
import {patchSankeyContract,sankeyContractPlugin,patchSankeyRendererCapture} from '../../scripts/mermaid-sankey-contract.mjs';
const chunk=resolve('node_modules/mermaid/dist/chunks/mermaid.core/sankeyDiagram-IPEJSGJF.mjs');
it('pins the entire Sankey artifact and requires exactly one bundle application',async()=>{
 const source=readFileSync(chunk,'utf8');
 expect(()=>patchSankeyContract(source+'\n')).toThrow(/artifact changed/);
 expect(()=>patchSankeyContract(patchSankeyContract(source))).toThrow(/artifact changed/);
 await expect(build({stdin:{contents:'export const x=1;',resolveDir:process.cwd()},write:false,logLevel:'silent',plugins:[sankeyContractPlugin()]})).rejects.toThrow(/patched 0/);
});
it('preserves native graph snapshots in the source hook and relocated bundle',async()=>{
 const root=process.cwd(),dir=mkdtempSync(join(tmpdir(),'visser-sankey-contract-')),url=(p:string)=>pathToFileURL(resolve(p)).href;
 const dbModule='packages/core/src/mermaid/sankey-db.ts',stub=resolve('packages/core/src/mermaid/dompurify-stub.ts');
 // Plain IDs only: real sanitation is independently covered by native/DB tests.
 const stubHook=`import {registerHooks} from 'node:module';registerHooks({resolve(specifier,context,next){return specifier==='dompurify'?{url:${JSON.stringify(url(stub))},shortCircuit:true}:next(specifier,context);}});\n`;
 const source='sankey\na,b,2\na,b,3\na,c,-0\nb,d,NaN\n';
 const parse=`const db=mod.diagram.db;db.clear();mod.diagram.parser.yy=db;mod.diagram.parser.parse(${JSON.stringify(source)});`;
 const body=`import assert from 'node:assert/strict';import {inspect} from 'node:util';
import {captureSankeyDb} from ${JSON.stringify(url(dbModule))};
const mod=await import(${JSON.stringify(url(chunk))});assert.equal(mod.visserSankeyContractVersion,1);
${parse}
const captured=captureSankeyDb(db),saved=structuredClone(captured);
assert.equal(captured.graph.nodes.length,4);assert.equal(captured.graph.links.length,4);assert(Object.is(captured.graph.links[2].value,-0));assert(Number.isNaN(captured.graph.links[3].value));
captured.graph.nodes[0].id='mutated';captured.graph.links[0].source='mutated';assert.equal(db.getGraph().nodes[0].id,'a');assert.equal(db.getGraph().links[0].source,'a');
db.clear();assert.deepEqual(db.getGraph(),{nodes:[],links:[]});assert.equal(saved.graph.nodes[0].id,'a');
console.log(JSON.stringify(inspect(saved,{depth:null})));
`;
 try{
  const file=join(dir,'source.mjs');writeFileSync(file,stubHook+`import {sankeyContractLoadHook} from ${JSON.stringify(url('scripts/mermaid-sankey-contract.mjs'))};registerHooks({load:sankeyContractLoadHook()});\n`+body);
  const observed=JSON.parse(execFileSync(process.execPath,[file],{cwd:root,encoding:'utf8'}));
  const upstream=join(dir,'upstream.mjs');writeFileSync(upstream,stubHook+`import {inspect} from 'node:util';import {captureSankeyDb} from ${JSON.stringify(url(dbModule))};const mod=await import(${JSON.stringify(url(chunk))});${parse}console.log(JSON.stringify(inspect(captureSankeyDb(db),{depth:null})));`);
  expect(JSON.parse(execFileSync(process.execPath,[upstream],{cwd:root,encoding:'utf8'}))).toBe(observed);
  const outfile=join(dir,'bundle.mjs');await build({stdin:{contents:body.replaceAll(url(chunk),chunk).replaceAll(url(dbModule),resolve(dbModule)),resolveDir:root,sourcefile:'sankey-contract-entry.mjs'},bundle:true,platform:'node',format:'esm',outfile,alias:{dompurify:stub},plugins:[sankeyContractPlugin()]});
  expect(JSON.parse(execFileSync(process.execPath,[outfile],{cwd:dir,encoding:'utf8'}))).toBe(observed);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

it('pins the browser capture point before native viewport mutation',()=>{
 const source=readFileSync(chunk,'utf8');
 const patched=patchSankeyRendererCapture(source);
 expect(()=>patchSankeyRendererCapture(source+'\n')).toThrow(/artifact changed/);
 expect(()=>patchSankeyRendererCapture(patched)).toThrow(/artifact changed/);
 expect(patched.match(/diagObj\.visserCaptureSankey\(\{/g)).toHaveLength(1);
 expect(patched.indexOf('diagObj.visserCaptureSankey({')).toBeLessThan(patched.indexOf('setupGraphViewbox(void 0, svg, 0, useMaxWidth)'));
 expect(patched).toContain('Object.prototype.hasOwnProperty.call(diagObj, "visserCaptureSankey")');
 expect(patched).toContain('visserSankeyRendererCaptureVersion = 1');
});
