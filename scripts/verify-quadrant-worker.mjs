import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {copyFileSync,mkdtempSync,rmSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
const root=resolve(import.meta.dirname,'..');
const fixtures=[
 {source:'quadrantChart\ntitle $$t$$\naccTitle: $$accessible$$\nx-axis $$l$$ --> $$r$$\ny-axis $$b$$ --> $$top$$\nquadrant-1 "$$q < x$$"\n"$$p$$": [0.1, 0.2]\n"$$p$$": [0.1, 0.2]\n',occurrences:9},
 {source:'quadrantChart\nquadrant-1 "before<br/>&dollar;&dollar;q&dollar;&dollar;"\n',occurrences:1},
 {source:'quadrantChart\ntitle 雪 $$x$$\n"😀 $$p$$": [0, 1]\n',originalSource:'\uFEFF  quadrantChart\r\n  title 雪 $$x$$\r\n  "😀 $$p$$": [0, 1]\r\n',occurrences:2},
 {source:'quadrantChart\nquadrant-1 "$$\\unknownVisser$$"\nquadrant-1 safe\n',error:'E_MATH'},
 {source:'quadrantChart\n"$$p$$": [0a2, 0.3]\n',error:'E_MATH'},
 {source:'quadrantChart\nplain: [0a2, 0.3]\n',occurrences:0},
 {source:'quadrantChart\ntitle $$x$$\n',omit:true,error:'E_MATH'},
 {source:'quadrantChart\nclassDef hot color:#ff0000\nclassDef hot color:#00ff00\n"$$p$$":::hot: [0.3, 0.4] radius:7\n',occurrences:1},
 {source:'flowchart LR\nA --> B\n',quadrant:false,type:'flowchart'},
];
const figures=fixtures.map((f,i)=>({figureId:`q-${i}`,source:f.source,type:f.type??'other',quadrant:f.quadrant??true,...(!f.omit?{originalSource:f.originalSource??f.source}:{})}));
const run=(file,cwd)=>JSON.parse(execFileSync(process.execPath,[file],{cwd,input:JSON.stringify({figures}),encoding:'utf8'}));
const dir=mkdtempSync(join(tmpdir(),'visser-quadrant-worker-'));
try{
 const source=run(join(root,'packages/core/src/mermaid/parse-worker.ts'),root);
 const file=join(dir,'mermaid-parse.cjs');copyFileSync(join(root,'dist/release/workers/mermaid-parse.cjs'),file);
 const bundled=run(file,dir);assert.deepEqual(bundled,source);
 assert.equal(source.results.length,fixtures.length);
 for(const [i,f]of fixtures.entries()){
  const result=source.results[i];
  if(f.error)assert.equal(result.code,f.error,JSON.stringify(result));
  else{assert.equal(result.ok,true,JSON.stringify(result));if(f.occurrences)assert.equal(result.quadrantMath.total.occurrences,f.occurrences);else assert.equal(result.quadrantMath,undefined);}
 }
 const report={passed:true,fixtures:fixtures.length,results:source.results};
 mkdirSync(join(root,'reports/math'),{recursive:true});writeFileSync(join(root,'reports/math/quadrant-worker-relocated.json'),JSON.stringify(report,null,2)+'\n');
 console.log(`Quadrant source/relocated worker parity passed: ${fixtures.length} fixtures`);
}finally{rmSync(dir,{recursive:true,force:true});}
