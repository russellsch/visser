import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {copyFileSync,readFileSync,mkdtempSync,rmSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
const root=resolve(import.meta.dirname,'..');
const matrix=String.raw`$$\begin{matrix}a\\b\end{matrix}$$`;
const source=`requirementDiagram
accTitle: &dollar;&dollar;access&dollar;&dollar;<br/>
accDescr: $$description$$
requirement req {
 text: "${matrix}"
}
requirement req {
 text: "$$hidden$$"
}
`;
const overBudget=`requirementDiagram
requirement visible {
 text: "$$visible$$"
}
requirement visible {
${Array.from({length:1000},()=> ' text: "$$x$$"').join('\n')}
}
`;
const fixtures=[
 {source,occurrences:4},
 {source,originalSource:'\uFEFF'+source.replaceAll('\n','\r\n'),occurrences:4},
 {source,omit:true,error:'E_MATH'},
 {source,originalSource:source.replace('$$hidden$$','$$other$$'),error:'E_MATH'},
 {source:source.replace('$$hidden$$',()=>String.raw`$$\badRequirementCommand$$`),error:'E_MATH'},
 {source:overBudget,error:'E_LIMIT'},
 {source:'requirementDiagram\nrequirement plain {\n text: plain\n}\n',occurrences:0},
 {source:'requirementDiagram\nrequirement broken {\n text: \n}\n',error:true},
 {source,occurrences:4},
 {source:'flowchart LR\nA --> B\n',requirement:false,type:'flowchart'},
 {source:'radar-beta\naxis a\ncurve c {1}\n',requirement:false,radar:true,type:'other'},
 {source,radar:true,error:'E_MATH'},
 {source,xy:true,error:'E_MATH'},
 {source:'flowchart LR\nA --> B\n',type:'flowchart',error:'E_MATH'},
];
const figures=fixtures.map((fixture,index)=>({figureId:`requirement-${index}`,source:fixture.source,type:fixture.type??'other',requirement:fixture.requirement??true,...(fixture.radar?{radar:true}:{}),...(fixture.xy?{xy:true}:{}),...(!fixture.omit?{originalSource:fixture.originalSource??fixture.source}:{})}));
const run=(file,cwd)=>JSON.parse(execFileSync(process.execPath,[file],{cwd,input:JSON.stringify({figures}),encoding:'utf8'}));
const dir=mkdtempSync(join(tmpdir(),'visser-requirement-worker-'));
try{
 const sourceResult=run(join(root,'packages/core/src/mermaid/parse-worker.ts'),root);
 const file=join(dir,'mermaid-parse.cjs');copyFileSync(join(root,'dist/release/workers/mermaid-parse.cjs'),file);
 const bundled=run(file,dir);assert.deepEqual(bundled,sourceResult);assert.equal(sourceResult.results.length,fixtures.length);
 for(const [index,fixture]of fixtures.entries()){
  const result=sourceResult.results[index];
  if(fixture.error){assert.equal(result.ok,false,JSON.stringify(result));if(typeof fixture.error==='string')assert.equal(result.code,fixture.error,JSON.stringify(result));}
  else {assert.equal(result.ok,true,JSON.stringify(result));if(fixture.occurrences)assert.equal(result.requirementMath.total.occurrences,fixture.occurrences);else assert.equal(result.requirementMath,undefined);}
 }
 assert.equal(sourceResult.results[0].requirementMath.snapshot.accTitle,'$$access$$<br>');
 assert.deepEqual(sourceResult.results[0].requirementMath.slots.map(slot=>slot.key),['requirement:0:name','requirement:0:text']);
 assert.equal(sourceResult.results[0].requirementMath.records.find(record=>record.role==='requirement.text').parts.find(part=>part.kind==='math').tex,String.raw`\begin{matrix}a\\b\end{matrix}`);
 mkdirSync(join(root,'reports/math'),{recursive:true});writeFileSync(join(root,'reports/math/requirement-worker-relocated.json'),JSON.stringify({passed:true,fixtures:fixtures.length,workerSha256:createHash('sha256').update(readFileSync(file)).digest('hex'),releaseManifestSha256:createHash('sha256').update(readFileSync(join(root,'dist/release/release.json'))).digest('hex'),inputSha256:createHash('sha256').update(JSON.stringify({figures})).digest('hex'),results:sourceResult.results},null,2)+'\n');
 console.log(`Requirement source/relocated release worker parity passed: ${fixtures.length} fixtures`);
}finally{rmSync(dir,{recursive:true,force:true});}
