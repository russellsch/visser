import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {copyFileSync,readFileSync,mkdtempSync,rmSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
const root=resolve(import.meta.dirname,'..');
const base='radar-beta\naxis a["$$x$$"],a\ncurve c["$$legend$$"]{a:1}\n';
const fixtures=[
 {source:base,occurrences:2},
 {source:base.replace('radar-beta','radar-beta:'),occurrences:2},
 {source:base.replace('radar-beta','radar-beta :'),occurrences:2},
 {source:base+'showLegend false\n',occurrences:2},
 {source:'radar-beta\ntitle $$old$$\ntitle\naxis a["$$x$$"]\ncurve c {0}\n',occurrences:2},
 {source:base,originalSource:'\uFEFF'+base.replaceAll('\n','\r\n'),occurrences:2},
 {source:base,omit:true,error:'E_MATH'},
 {source:base,originalSource:base.replace('$$x$$',()=>'$$other$$'),error:'E_MATH'},
 {source:base.replace('$$x$$',()=>'$$\\\\badRadarCommand$$'),error:'E_MATH'},
 {source:'radar-beta\naxis a\ncurve c {1}\n',occurrences:0},
 {source:'radar-beta\naxis a\ncurve c {1,}\n',error:true},
 {source:base,occurrences:2},
 {source:'flowchart LR\nA --> B\n',radar:false,type:'flowchart'},
 {source:'xychart\ntitle "$$x$$"\nline [1]\n',radar:false,xy:true,xyOccurrences:1},
];
const figures=fixtures.map((f,i)=>({figureId:`radar-${i}`,source:f.source,type:f.type??'other',radar:f.radar??true,...(f.xy?{xy:true}:{}),...(!f.omit?{originalSource:f.originalSource??f.source}:{})}));
const run=(file,cwd)=>JSON.parse(execFileSync(process.execPath,[file],{cwd,input:JSON.stringify({figures}),encoding:'utf8'}));
const dir=mkdtempSync(join(tmpdir(),'visser-radar-worker-'));
try{
 const source=run(join(root,'packages/core/src/mermaid/parse-worker.ts'),root);
 const file=join(dir,'mermaid-parse.cjs');copyFileSync(join(root,'dist/release/workers/mermaid-parse.cjs'),file);
 const bundled=run(file,dir);assert.deepEqual(bundled,source);assert.equal(source.results.length,fixtures.length);
 for(const [i,fixture]of fixtures.entries()){
  const result=source.results[i];
  if(fixture.error){assert.equal(result.ok,false,JSON.stringify(result));if(typeof fixture.error==='string')assert.equal(result.code,fixture.error,JSON.stringify(result));}
  else{assert.equal(result.ok,true,JSON.stringify(result));if(fixture.occurrences)assert.equal(result.radarMath.total.occurrences,fixture.occurrences);else assert.equal(result.radarMath,undefined);if(fixture.xyOccurrences)assert.equal(result.xyMath.total.occurrences,fixture.xyOccurrences);}
 }
 assert.equal(source.results[4].radarMath.snapshot.curves[0].entries[0],'0');
 assert.equal(source.results[0].radarMath.snapshot.curves[0].entries.length,2);
 assert.equal(source.results[3].radarMath.slots.length,2);
 mkdirSync(join(root,'reports/math'),{recursive:true});writeFileSync(join(root,'reports/math/radar-worker-relocated.json'),JSON.stringify({passed:true,fixtures:fixtures.length,workerSha256:createHash('sha256').update(readFileSync(file)).digest('hex'),releaseManifestSha256:createHash('sha256').update(readFileSync(join(root,'dist/release/release.json'))).digest('hex'),inputSha256:createHash('sha256').update(JSON.stringify({figures})).digest('hex'),results:source.results},null,2)+'\n');
 console.log(`Radar source/relocated release worker parity passed: ${fixtures.length} fixtures`);
}finally{rmSync(dir,{recursive:true,force:true});}
