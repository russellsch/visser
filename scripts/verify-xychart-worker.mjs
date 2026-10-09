import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {copyFileSync,mkdtempSync,rmSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
const root=resolve(import.meta.dirname,'..');
const all=`xychart horizontal
title "$$old$$"
title "$$t$$"
accTitle: $$a$$
accDescr { $$d$$ }
x-axis "$$x$$" ["<br/>&dollar;&dollar;c&dollar;&dollar;","<br/>$$c$$"]
y-axis "$$y$$" 0 --> 10
line "$$s$$" [1 "$$p$$",2,3 "$$truncated$$"]
bar "$$b$$" [4 "$$ignored$$"]
`;
const bound='1'+'0'.repeat(308);
const fixtures=[
 {source:all,occurrences:13},
 {source:'xychart\ntitle "before<br/>&dollar;&dollar;t&dollar;&dollar;"\nline [1]\n',occurrences:1},
 {source:'xychart\ntitle "雪 $$t$$"\nline [1 "😀 $$p$$"]\n',originalSource:'\uFEFF  xychart\r\n  title "雪 $$t$$"\r\n  line [1 "😀 $$p$$"]\r\n',occurrences:2},
 {source:'xychart\nbar [1 "$$\\unknownVisser$$"]\n',error:'E_MATH'},
 {source:'xychart\ntitle "$$t$$"\nline ['+'9'.repeat(400)+']\n',error:'E_MATH'},
 {source:'xychart\nline ['+'9'.repeat(400)+']\n',occurrences:0},
 {source:'xychart\ntitle "$$t$$"\nline [1]\n',omit:true,error:'E_MATH'},
 {source:'xychart\nx-axis [a,b]\nline [-0 "$$p$$"]\n',occurrences:1},
 {source:'xychart\nline "$$s$$" [2,4]\nx-axis [a,b,c]\nbar [5,6]\nx-axis 100 --> 200\nline [7]\n',occurrences:1},
 {source:'xychart-beta\ntitle "$$t$$"\nline [1]\n',occurrences:1},
 {source:'xychart\ntitle "$$t$$"\nline [1]\n',originalSource:'xychart\ntitle "$$other$$"\nline [1]\n',error:'E_MATH'},
 {source:'xychart\nx-axis -'+bound+' --> '+bound+'\nline "$$s$$" [1,2]\n',occurrences:1},
 {source:'xychart\nline "$$s$$" [0.'+'0'.repeat(323)+'5]\n',occurrences:1},
 {source:'xychart\nline [oops]\n',error:true},
 {source:'xychart\nline "recovered $$s$$" [1,2]\n',occurrences:1},
 {source:'flowchart LR\nA --> B\n',xy:false,type:'flowchart'},
 {source:'quadrantChart\nquadrant-1 "$$q$$"\n',xy:false,quadrant:true,quadrantOccurrences:1},
];
const figures=fixtures.map((f,i)=>({figureId:`xy-${i}`,source:f.source,type:f.type??'other',xy:f.xy??true,...(f.quadrant?{quadrant:true}:{}),...(!f.omit?{originalSource:f.originalSource??f.source}:{})}));
const run=(file,cwd)=>JSON.parse(execFileSync(process.execPath,[file],{cwd,input:JSON.stringify({figures}),encoding:'utf8'}));
const dir=mkdtempSync(join(tmpdir(),'visser-xy-worker-'));
try{
 const source=run(join(root,'packages/core/src/mermaid/parse-worker.ts'),root);
 const file=join(dir,'mermaid-parse.cjs');copyFileSync(join(root,'dist/release/workers/mermaid-parse.cjs'),file);
 const bundled=run(file,dir);assert.deepEqual(bundled,source);
 assert.equal(source.results.length,fixtures.length);
 for(const [i,f]of fixtures.entries()){
  const result=source.results[i];
  if(f.error){assert.equal(result.ok,false,JSON.stringify(result));if(typeof f.error==='string')assert.equal(result.code,f.error,JSON.stringify(result));}
  else{
   assert.equal(result.ok,true,JSON.stringify(result));
   if(f.occurrences)assert.equal(result.xyMath.total.occurrences,f.occurrences);else assert.equal(result.xyMath,undefined);
   if(f.quadrantOccurrences)assert.equal(result.quadrantMath.total.occurrences,f.quadrantOccurrences);
  }
 }
 assert.deepEqual(source.results[7].xyMath.snapshot.data.plots[0].data,[['a','-0'],['b','undefined']]);
 assert.deepEqual(source.results[8].xyMath.snapshot.data.plots.map(p=>p.data),[[['1','2'],['2','4']],[['a','5'],['b','6'],['c','undefined']],[['100','7']]]);
 assert.deepEqual(source.results[11].xyMath.snapshot.data.plots[0].data.map(d=>d[0]),['NaN','Infinity']);
 assert.equal(source.results[12].xyMath.snapshot.data.plots[0].data[0][1],'5e-324');
 const report={passed:true,fixtures:fixtures.length,results:source.results};
 mkdirSync(join(root,'reports/math'),{recursive:true});writeFileSync(join(root,'reports/math/xychart-worker-relocated.json'),JSON.stringify(report,null,2)+'\n');
 console.log(`XY source/relocated release worker parity passed: ${fixtures.length} fixtures`);
}finally{rmSync(dir,{recursive:true,force:true});}
