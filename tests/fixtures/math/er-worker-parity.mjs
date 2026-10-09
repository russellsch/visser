import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const source='erDiagram\naccTitle: Example\nsubgraph g["Group<br> label"]\n A[Alias] {\n  string name PK "comment"\n }\nend\ng ||--o{ B : role\n';
const figures=[{figureId:'valid',type:'other',source,originalSource:source},{figureId:'invalid',type:'other',source:'erDiagram\nA {\n string broken\n'},{figureId:'mismatch',type:'other',source,originalSource:source.replace('Example','Forged')},{figureId:'info',type:'other',info:true,source:'info\n'},{figureId:'recovery',type:'other',source:source.replace('Example','Recovery')},{figureId:'math',type:'other',source:'erDiagram\nA["$$x$$"]\n'}];
function run(path){const child=spawnSync(process.execPath,['--max-old-space-size=512',path],{input:JSON.stringify({figures}),encoding:'utf8',timeout:30000,maxBuffer:64*1024*1024});assert.equal(child.status,0,child.stderr);return JSON.parse(child.stdout);}
const sourceResult=run('packages/core/src/mermaid/parse-worker.ts'),bundled=run('dist/release/workers/mermaid-parse.cjs');
assert.deepEqual(bundled,sourceResult);assert.deepEqual(bundled.results.map(r=>r.ok),[true,false,false,true,true,false]);assert.equal(bundled.results[2].code,'E_MATH');assert.equal(bundled.results[5].code,'E_MATH');
console.log(JSON.stringify({cases:figures.length,sourceBundleParity:true,workerSha256:createHash('sha256').update(readFileSync('dist/release/workers/mermaid-parse.cjs')).digest('hex')}));
