import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {afterEach,expect,it} from 'vitest';
import {assertRequirementSourceTransport,clearMermaidParseCache,parseMermaid,setMermaidWorkerPath,workerPathFor} from '../../packages/core/src/mermaid/parse.ts';

const sourceWorker=workerPathFor(new URL('../../packages/core/src/mermaid/parse.ts',import.meta.url).href);
const request=(figureId:string,source='flowchart LR\nA --> B\n')=>({figureId,source,type:'flowchart' as const});
afterEach(()=>{setMermaidWorkerPath(sourceWorker);clearMermaidParseCache();});
function fake(body:string){const dir=mkdtempSync(join(tmpdir(),'visser-parse-correlation-')),file=join(dir,'worker.cjs');writeFileSync(file,body);setMermaidWorkerPath(file);return()=>rmSync(dir,{recursive:true,force:true});}

it('rejects duplicate request identities before cache lookup and does not establish Requirement authority',()=>{
 clearMermaidParseCache();expect(parseMermaid([request('same')]).get('same')).toMatchObject({ok:true});const duplicate=parseMermaid([request('same'),request('same','flowchart LR\nB --> C\n')]);expect([...duplicate.values()]).toEqual([{figureId:'same',ok:false,code:'E_SEMANTIC',error:'duplicate Mermaid parse request identity'}]);
});

it('rejects malformed worker correlations and does not cache or receipt-bind their output',()=>{
 const cases=[
  '({results:[{figureId:"a",ok:true,type:"flowchart"},{figureId:"a",ok:true,type:"flowchart"}]})',
  '({results:[{figureId:"a",ok:true,type:"flowchart"}]})',
  '({results:[{figureId:"a",ok:true,type:"flowchart"},{figureId:"extra",ok:true,type:"flowchart"}]})',
  '({results:[{figureId:"a",ok:true,type:"other"},{figureId:"b",ok:true,type:"flowchart"}]})',
  '({results:[{figureId:"a",ok:"true",type:"flowchart"},{figureId:"b",ok:true,type:"flowchart"}]})',
 ];
 for(const expression of cases){const cleanup=fake(`const fs=require('fs');fs.readFileSync(0,'utf8');process.stdout.write(JSON.stringify(${expression}));`);try{const results=parseMermaid([request('a'),request('b')]);for(const result of results.values())expect(result).toMatchObject({ok:false,code:'E_SEMANTIC',error:'the Mermaid parse worker returned mismatched result identities'});}finally{cleanup();setMermaidWorkerPath(sourceWorker);clearMermaidParseCache();}}
});

it('does not establish a Requirement receipt from a duplicate-ID batch with a coherent transport from another source',()=>{
 const sourceA='requirementDiagram\nrequirement one {\n text: "$$x$$"\n}\n',sourceB='requirementDiagram\nrequirement two {\n text: "$$x$$"\n}\n';clearMermaidParseCache();const valid:any=parseMermaid([{figureId:'captured',type:'other',requirement:true,source:sourceB,originalSource:sourceB}]).get('captured');expect(valid).toMatchObject({ok:true});const payload=valid.requirementMath,dir=mkdtempSync(join(tmpdir(),'visser-parse-receipt-')),file=join(dir,'worker.cjs');
 try{writeFileSync(file,`const fs=require('fs');fs.readFileSync(0,'utf8');const payload=${JSON.stringify(payload)};process.stdout.write(JSON.stringify({results:[{figureId:'a',ok:true,type:'other',requirementMath:payload},{figureId:'a',ok:true,type:'other',requirementMath:payload}]}));`);setMermaidWorkerPath(file);const batch=parseMermaid([{figureId:'a',type:'other',requirement:true,source:sourceA,originalSource:sourceA},{figureId:'b',type:'other',requirement:true,source:sourceB,originalSource:sourceB}]);for(const result of batch.values())expect(result).toMatchObject({ok:false,code:'E_SEMANTIC'});
  writeFileSync(file,"require('fs').readFileSync(0,'utf8');process.stdout.write(JSON.stringify({results:[]}));");expect(()=>assertRequirementSourceTransport(sourceA,sourceA,payload)).toThrow(/authenticated source ownership/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

it('accepts reordered unique worker responses and keeps distinct source cache keys independent',()=>{
 const cleanup=fake(`const fs=require('fs');const input=JSON.parse(fs.readFileSync(0,'utf8'));const results=[...input.figures].reverse().map(f=>({figureId:f.figureId,ok:true,type:f.type}));process.stdout.write(JSON.stringify({results}));`);try{const first=parseMermaid([request('first','flowchart LR\nA --> B\n'),request('second','flowchart LR\nC --> D\n')]);expect([...first.keys()]).toEqual(['first','second']);expect([...first.values()]).toEqual([{figureId:'first',ok:true,type:'flowchart'},{figureId:'second',ok:true,type:'flowchart'}]);const again=parseMermaid([request('third','flowchart LR\nA --> B\n'),request('fourth','flowchart LR\nC --> D\n')]);expect([...again.values()]).toEqual([{figureId:'third',ok:true,type:'flowchart'},{figureId:'fourth',ok:true,type:'flowchart'}]);}finally{cleanup();}});
