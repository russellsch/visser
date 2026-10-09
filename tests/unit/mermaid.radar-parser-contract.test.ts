import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {expect,it} from 'vitest';
// @ts-expect-error Build scripts are outside the TS project.
import {patchRadarParserContract,radarParserContractPlugin} from '../../scripts/mermaid-radar-parser-contract.mjs';

const root=process.cwd();
const artifacts=[
 resolve('node_modules/@mermaid-js/parser/dist/mermaid-parser.core.mjs'),
 resolve('node_modules/@mermaid-js/parser/dist/chunks/mermaid-parser.core/chunk-FOHPRMQF.mjs'),
 resolve('node_modules/@mermaid-js/parser/dist/chunks/mermaid-parser.core/chunk-I5DQTOEV.mjs'),
 resolve('node_modules/@mermaid-js/parser/dist/chunks/mermaid-parser.core/radar-RG4KPBEZ.mjs')
];
const entry=artifacts[0]!;
const radar=String.raw`radar-beta
title old
title final $$title$$
accTitle: first
accTitle: access $$a$$
accDescr { first
  description $$d$$ }
axis dup["Axis \"one\""],dup,plain
curve same["Curve \"one\""]{dup: 1, plain: 2, dup: 3}
curve same {4,5}
showLegend false,showLegend true,ticks 2,ticks 3
`;
const projection=`const project=ast=>({title:ast.title,accTitle:ast.accTitle,accDescr:ast.accDescr,axes:ast.axes.map(axis=>({name:axis.name,label:axis.label})),curves:ast.curves.map(curve=>({name:curve.name,label:curve.label,entries:curve.entries.map(entry=>({axis:entry.axis?.$refText,value:entry.value}))})),options:ast.options.map(option=>({name:option.name,value:option.value}))});`;
const body=`import assert from 'node:assert/strict';const parser=await import(${JSON.stringify(pathToFileURL(entry).href)});assert.equal(parser.visserRadarParserContractVersion,1);${projection}console.log(JSON.stringify(project(await parser.parse('radar',${JSON.stringify(radar)}))));`;

it('pins all four Radar parser artifacts, rejects unknown paths, and requires one bundle application each',async()=>{
 for(const artifact of artifacts){const source=readFileSync(artifact,'utf8');expect(()=>patchRadarParserContract(artifact,source+'\n')).toThrow(/artifact changed/);expect(()=>patchRadarParserContract(artifact,patchRadarParserContract(artifact,source))).toThrow(/artifact changed/);}
 expect(()=>patchRadarParserContract('/tmp/not-radar.mjs','export {};')).toThrow(/Unknown Radar parser artifact/);
 await expect(build({stdin:{contents:'export const x=1;',resolveDir:root},write:false,logLevel:'silent',plugins:[radarParserContractPlugin()]})).rejects.toThrow(/patched 0/);
});

it('installs the source hook before import and keeps parser AST projection identical in a relocated patched bundle',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'visser-radar-parser-contract-')),url=(path:string)=>pathToFileURL(resolve(path)).href;
 try{
  const sourceFile=join(dir,'source.mjs');writeFileSync(sourceFile,`import {registerHooks} from 'node:module';import {radarParserContractLoadHook} from ${JSON.stringify(url('scripts/mermaid-radar-parser-contract.mjs'))};registerHooks({load:radarParserContractLoadHook()});\n`+body);
  const observed=JSON.parse(execFileSync(process.execPath,[sourceFile],{cwd:root,encoding:'utf8'}));
  expect(observed).toMatchObject({title:'final $$title$$',accTitle:'access $$a$$',accDescr:'first\ndescription $$d$$',axes:[{name:'dup',label:'Axis "one"'},{name:'dup'},{name:'plain'}],curves:[{name:'same',label:'Curve "one"',entries:[{axis:'dup',value:1},{axis:'plain',value:2},{axis:'dup',value:3}]},{name:'same',entries:[{value:4},{value:5}]}],options:[{name:'showLegend',value:false},{name:'showLegend',value:true},{name:'ticks',value:2},{name:'ticks',value:3}]});
  const bundled=join(dir,'radar-parser.mjs');const staticBody=body.replace(`const parser=await import(${JSON.stringify(pathToFileURL(entry).href)});`,`import * as parser from ${JSON.stringify(entry)};`);await build({stdin:{contents:staticBody,resolveDir:root,sourcefile:'radar-parser-contract-entry.mjs'},bundle:true,platform:'node',format:'esm',outfile:bundled,plugins:[radarParserContractPlugin()]});
  expect(JSON.parse(execFileSync(process.execPath,[bundled],{cwd:dir,encoding:'utf8'}))).toEqual(observed);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

it('cannot retrofit a source hook after the unpatched parser entry is already cached',()=>{
 const dir=mkdtempSync(join(tmpdir(),'visser-radar-parser-cache-')),url=(path:string)=>pathToFileURL(resolve(path)).href;
 try{const file=join(dir,'cached.mjs');writeFileSync(file,`import * as first from ${JSON.stringify(url(entry))};import {registerHooks} from 'node:module';import {radarParserContractLoadHook} from ${JSON.stringify(url('scripts/mermaid-radar-parser-contract.mjs'))};registerHooks({load:radarParserContractLoadHook()});const second=await import(${JSON.stringify(url(entry))});console.log(JSON.stringify({first:first.visserRadarParserContractVersion??null,second:second.visserRadarParserContractVersion??null,prospective:second.visserRadarParserContractVersion===1}));`);
  expect(JSON.parse(execFileSync(process.execPath,[file],{cwd:root,encoding:'utf8'}))).toEqual({first:null,second:null,prospective:false});
 }finally{rmSync(dir,{recursive:true,force:true});}
});

it('boots the source parse worker before parser import, while a preloaded unpatched parser fails its marker check',()=>{
 const worker=resolve('packages/core/src/mermaid/parse-worker.ts'),payload={figures:[
  {figureId:'pie',type:'other',pie:true,source:'pie\n"plain": 1\n'},
  {figureId:'sankey',type:'other',sankey:true,source:'sankey\na,b,1\n'}
 ]};
 const normal=JSON.parse(execFileSync(process.execPath,[worker],{cwd:root,input:JSON.stringify(payload),encoding:'utf8'}));expect(normal.results).toEqual([{figureId:'pie',ok:true,type:'other'},{figureId:'sankey',ok:true,type:'other'}]);
 const dir=mkdtempSync(join(tmpdir(),'visser-radar-worker-cache-')),url=(path:string)=>pathToFileURL(resolve(path)).href;
 try{const file=join(dir,'preloaded.mjs');writeFileSync(file,'await import('+JSON.stringify(url(entry))+');await import('+JSON.stringify(url(worker))+');');
  expect(()=>execFileSync(process.execPath,[file],{cwd:root,input:JSON.stringify(payload),encoding:'utf8',stdio:['pipe','pipe','pipe']})).toThrow(/Radar parser contract patch is missing/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

it('rejects a parser whose grammar or service dependency was cached before bootstrap',()=>{
 const dir=mkdtempSync(join(tmpdir(),'visser-radar-parser-partial-cache-'));
 try{
  for(const [index,dependency]of artifacts.slice(1).entries()){
   const file=join(dir,`partial-${index}.mjs`);
   writeFileSync(file,`await import(${JSON.stringify(pathToFileURL(dependency).href)});await import(${JSON.stringify(pathToFileURL(resolve('packages/core/src/mermaid/parse-worker.ts')).href)});`);
   expect(()=>execFileSync(process.execPath,[file],{cwd:root,input:JSON.stringify({figures:[]}),encoding:'utf8',stdio:['pipe','pipe','pipe']})).toThrow(/does not provide an export named|contract.*missing/);
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
