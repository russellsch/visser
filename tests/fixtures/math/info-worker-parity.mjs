import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const source='info showInfo\ntitle $$old$$\ntitle $$new$$\naccTitle: $$a$$\naccDescr: plain\n';
const request=(figureId,text,extra={})=>({figureId,type:'other',info:true,source:text,originalSource:text,...extra});
const figures=[request('valid',source),request('invalid',source.replace('$$old$$',()=>String.raw`$$\notACommand$$`)),request('plain','info\n'),request('recovered',source),request('kanban','kanban\na[Column]\n  i["$$x$$"]\n',{info:false,kanban:true})];
function run(path){const child=spawnSync(process.execPath,['--max-old-space-size=512',path],{input:JSON.stringify({figures}),encoding:'utf8',timeout:30000,maxBuffer:64*1024*1024});assert.equal(child.status,0,child.stderr);return JSON.parse(child.stdout);}
const sourceResult=run('packages/core/src/mermaid/parse-worker.ts'),bundled=run('dist/release/workers/mermaid-parse.cjs');assert.deepEqual(bundled,sourceResult);
assert.equal(bundled.results[0].infoMath.total.occurrences,3);assert.equal(bundled.results[1].code,'E_MATH');assert.equal(bundled.results[1].line,2);assert.equal(bundled.results[2].ok,true);assert.equal(bundled.results[2].infoMath,undefined);assert.equal(bundled.results[3].infoMath.total.occurrences,3);assert.equal(bundled.results[4].kanbanMath.total.occurrences,1);
console.log(JSON.stringify({cases:5,sourceBundleParity:true,workerSha256:createHash('sha256').update(readFileSync('dist/release/workers/mermaid-parse.cjs')).digest('hex')}));
