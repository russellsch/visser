import {execFileSync} from 'node:child_process';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {expect,it} from 'vitest';
// @ts-expect-error Build scripts are outside the TS project.
import {patchRequirementContract,requirementContractPlugin} from '../../scripts/mermaid-requirement-contract.mjs';
const chunk=resolve('node_modules/mermaid/dist/chunks/mermaid.core/requirementDiagram-PLB6GJNP.mjs');
it('requires the exact reviewed Requirement artifact and one bundle application',async()=>{
 const source=readFileSync(chunk,'utf8');expect(()=>patchRequirementContract(source+'\n')).toThrow(/artifact changed/);expect(()=>patchRequirementContract(patchRequirementContract(source))).toThrow(/artifact changed/);
 await expect(build({stdin:{contents:'export const x=1;',resolveDir:process.cwd()},write:false,logLevel:'silent',plugins:[requirementContractPlugin()]})).rejects.toThrow(/patched 0/);
});
it('retains native DB state through the source hook and a relocated bundle',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'visser-requirement-contract-')),url=(path:string)=>pathToFileURL(resolve(path)).href;
 const authored='requirementDiagram\nrequirement req {\nid: 1\ntext: "$$x$$"\nrisk: low\nverifymethod: test\n}\nelement impl {\ntype: "$$kind$$"\ndocref: document\n}\nimpl - satisfies -> req\n';
 const body=`import assert from 'node:assert/strict';const mod=await import(${JSON.stringify(url(chunk))});assert.equal(mod.visserRequirementContractVersion,1);
 const db=mod.diagram.db;mod.diagram.parser.yy=db;mod.diagram.parser.parse(${JSON.stringify(authored)});
 db.setNewReqText('ignored');db.addRequirement('req','Other');db.setClass(['req'],['emphasis']);db.defineClass(['emphasis'],['color:red','stroke:blue,fill:white']);
 const snapshot={requirements:[...db.getRequirements()],elements:[...db.getElements()],relations:db.getRelationships(),classes:[...db.getClasses()]};
 const isolated=mod.VisserRequirementDB?new mod.VisserRequirementDB():mod.diagram.db;assert.notEqual(isolated,db);assert.equal(isolated.getRequirements().size,0);
 console.log(JSON.stringify(snapshot));`;
 try{
  const file=join(dir,'source.mjs');writeFileSync(file,`import {registerHooks} from 'node:module';import {requirementContractLoadHook} from ${JSON.stringify(url('scripts/mermaid-requirement-contract.mjs'))};registerHooks({load:requirementContractLoadHook()});\n`+body);
  const source=JSON.parse(execFileSync(process.execPath,[file],{encoding:'utf8'}));
  expect(source.requirements[0][1].text).toBe('$$x$$');expect(source.relations).toEqual([{type:'satisfies',src:'impl',dst:'req'}]);
  const original=join(dir,'native.mjs');writeFileSync(original,body.replace('assert.equal(mod.visserRequirementContractVersion,1);',''));
  expect(JSON.parse(execFileSync(process.execPath,[original],{encoding:'utf8'}))).toEqual(source);
  const bundle=join(dir,'bundle.mjs');await build({stdin:{contents:body.replace(url(chunk),chunk),resolveDir:process.cwd(),sourcefile:'requirement-contract.mjs'},bundle:true,platform:'node',format:'esm',outfile:bundle,plugins:[requirementContractPlugin()]});
  expect(JSON.parse(execFileSync(process.execPath,[bundle],{cwd:dir,encoding:'utf8'}))).toEqual(source);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
