import {execFileSync} from 'node:child_process';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {expect,it} from 'vitest';
// @ts-expect-error Build scripts are outside the TS project.
import {patchRadarContract,radarContractPlugin} from '../../scripts/mermaid-radar-contract.mjs';
const chunk=resolve('node_modules/mermaid/dist/chunks/mermaid.core/diagram-MPIPVDR6.mjs');
it('requires the exact reviewed Radar artifact and one bundle application',async()=>{
 const source=readFileSync(chunk,'utf8');expect(()=>patchRadarContract(source+'\n')).toThrow(/artifact changed/);expect(()=>patchRadarContract(patchRadarContract(source))).toThrow(/artifact changed/);
 await expect(build({stdin:{contents:'export const x=1;',resolveDir:process.cwd()},write:false,logLevel:'silent',plugins:[radarContractPlugin()]})).rejects.toThrow(/patched 0/);
});
it('retains native DB state through the source hook and a relocated bundle',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'visser-radar-contract-')),url=(path:string)=>pathToFileURL(resolve(path)).href;
 const body=`import assert from 'node:assert/strict';const mod=await import(${JSON.stringify(url(chunk))});assert.equal(mod.visserRadarContractVersion,1);
 const db=mod.diagram.db;db.clear();db.setAxes([{name:'a'},{name:'a',label:'other'}]);db.setCurves([{name:'c',entries:[{axis:{$refText:'a'},value:2},{axis:{$refText:'a'},value:9}]}]);db.setOptions([{name:'ticks',value:40},{name:'showLegend',value:false}]);console.log(JSON.stringify({axes:db.getAxes(),curves:db.getCurves(),options:db.getOptions()}));`;
 try{
  const file=join(dir,'source.mjs');writeFileSync(file,`import {registerHooks} from 'node:module';import {radarContractLoadHook} from ${JSON.stringify(url('scripts/mermaid-radar-contract.mjs'))};registerHooks({load:radarContractLoadHook()});\n`+body);
  const source=JSON.parse(execFileSync(process.execPath,[file],{encoding:'utf8'}));
  expect(source.curves[0].entries).toEqual([2,2]);expect(source.options.ticks).toBe(32);
  const original=join(dir,'native.mjs');writeFileSync(original,body.replace('assert.equal(mod.visserRadarContractVersion,1);',''));
  expect(JSON.parse(execFileSync(process.execPath,[original],{encoding:'utf8'}))).toEqual(source);
  const bundle=join(dir,'bundle.mjs');await build({stdin:{contents:body.replace(url(chunk),chunk),resolveDir:process.cwd(),sourcefile:'radar-contract.mjs'},bundle:true,platform:'node',format:'esm',outfile:bundle,plugins:[radarContractPlugin()]});
  expect(JSON.parse(execFileSync(process.execPath,[bundle],{cwd:dir,encoding:'utf8'}))).toEqual(source);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
