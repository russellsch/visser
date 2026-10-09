import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {copyFileSync,readFileSync,mkdtempSync,rmSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
const root=resolve(import.meta.dirname,'..');
const fixtures=[
 {source:'sankey\n"$$a$$","$$b$$",1\n"$$a$$","$$b$$",2\n',occurrences:4},
 {source:'sankey\n"$$x < y$$<br/>",a,1\n"$$x &lt; y$$<br/>",a,2\n',occurrences:2},
 {source:'sankey\n"&dollar;&dollar;a&dollar;&dollar;<br/>",a,1\n',occurrences:1},
 {source:'sankey\n"$$a$$",b,-0\n',occurrences:1},
 {source:'sankey-beta\n"$$a$$",b,5e-324\n',occurrences:1},
 {source:'sankey\n"style:x# $$a$$;",b,1\n',occurrences:1},
 {source:'sankey\n"$$\\text{say ""yes""}$$",b,1\n',occurrences:1},
 {source:'sankey\n"$$a$$",b,1\n',originalSource:'\uFEFF  sankey\r\n  "$$a$$",b,1\r\n',occurrences:1},
 {source:'sankey\n"$$a$$",b,1\n',omit:true,error:'E_MATH'},
 {source:'sankey\n"$$a$$",b,1\n',originalSource:'sankey\n"$$other$$",b,1\n',error:'E_MATH'},
 {source:'sankey\n"$$\\badSankeyCommand$$",b,1\n',error:'E_MATH'},
 {source:'sankey\n"$$a$$",b,Infinity\n',error:'E_MATH'},
 {source:'sankey\n"$$a$$",b,-1\n',error:'E_MATH'},
 {source:'sankey\na,b,2$$x$$\n',error:'E_MATH'},
 {source:'sankey\na,b,NaN\n',occurrences:0},
 {source:'sankey\nbad\n',error:true},
 {source:'sankey\n"$$recovered$$",b,2\n',occurrences:1},
 {source:'flowchart LR\nA --> B\n',sankey:false,type:'flowchart'},
 {source:'xychart\ntitle "$$x$$"\nline [1]\n',sankey:false,xy:true,xyOccurrences:1},
];
const figures=fixtures.map((f,i)=>({figureId:`sankey-${i}`,source:f.source,type:f.type??'other',sankey:f.sankey??true,...(f.xy?{xy:true}:{}),...(!f.omit?{originalSource:f.originalSource??f.source}:{})}));
const run=(file,cwd)=>JSON.parse(execFileSync(process.execPath,[file],{cwd,input:JSON.stringify({figures}),encoding:'utf8'}));
const dir=mkdtempSync(join(tmpdir(),'visser-sankey-worker-'));
try{
 const source=run(join(root,'packages/core/src/mermaid/parse-worker.ts'),root);
 const file=join(dir,'mermaid-parse.cjs');copyFileSync(join(root,'dist/release/workers/mermaid-parse.cjs'),file);
 const bundled=run(file,dir);assert.deepEqual(bundled,source);assert.equal(source.results.length,fixtures.length);
 for(const [i,fixture]of fixtures.entries()){
  const result=source.results[i];
  if(fixture.error){assert.equal(result.ok,false,JSON.stringify(result));if(typeof fixture.error==='string')assert.equal(result.code,fixture.error,JSON.stringify(result));}
  else{assert.equal(result.ok,true,JSON.stringify(result));if(fixture.occurrences)assert.equal(result.sankeyMath.total.occurrences,fixture.occurrences);else assert.equal(result.sankeyMath,undefined);if(fixture.xyOccurrences)assert.equal(result.xyMath.total.occurrences,fixture.xyOccurrences);}
 }
 assert.equal(source.results[3].sankeyMath.snapshot.graph.links[0].value,'-0');assert.equal(source.results[4].sankeyMath.snapshot.graph.links[0].value,'5e-324');
 assert.equal(source.results[1].sankeyMath.candidates.length,2);assert.equal(source.results[5].sankeyMath.snapshot.graph.nodes[0].id,'style:x# $$a$$');
 mkdirSync(join(root,'reports/math'),{recursive:true});writeFileSync(join(root,'reports/math/sankey-worker-relocated.json'),JSON.stringify({passed:true,fixtures:fixtures.length,workerSha256:createHash('sha256').update(readFileSync(file)).digest('hex'),releaseManifestSha256:createHash('sha256').update(readFileSync(join(root,'dist/release/release.json'))).digest('hex'),inputSha256:createHash('sha256').update(JSON.stringify({figures})).digest('hex'),results:source.results},null,2)+'\n');
 console.log(`Sankey source/relocated release worker parity passed: ${fixtures.length} fixtures`);
}finally{rmSync(dir,{recursive:true,force:true});}
