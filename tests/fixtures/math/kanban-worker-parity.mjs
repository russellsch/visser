import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const source='kanban\na[Column]\n  i["$$x$$"]@{priority: &p\n  self: *p\n  hidden: "$$y$$"\n}\na[Duplicate]\n  j["$$z$$"]\n';
const request=(figureId,text,extra={})=>({figureId,type:'other',kanban:true,source:text,originalSource:text,...extra});
const bad=source.replace('$$y$$',()=>String.raw`$$\badKanbanCommand$$`);
const input=JSON.stringify({figures:[request('valid',source),request('invalid',bad),request('plain','kanban\nc[Column]\n  i[Card]\n'),request('recovered',source),request('other','requirementDiagram\nrequirement r {\n text: "$$r$$"\n}\n',{kanban:false,requirement:true})]});
function run(path){
 const child=spawnSync(process.execPath,['--max-old-space-size=512',path],{input,encoding:'utf8',timeout:30000,maxBuffer:64*1024*1024});
 assert.equal(child.status,0,child.stderr);return JSON.parse(child.stdout);
}
const sourceResult=run('packages/core/src/mermaid/parse-worker.ts');
const bundled=run('dist/release/workers/mermaid-parse.cjs');
assert.deepEqual(bundled,sourceResult);
assert.equal(bundled.results[0].kanbanMath.total.occurrences,9);
assert.equal(bundled.results[1].ok,false);assert.equal(bundled.results[1].code,'E_MATH');
assert.equal(bundled.results[2].ok,true);assert.equal(bundled.results[2].kanbanMath,undefined);
assert.equal(bundled.results[3].kanbanMath.total.occurrences,9);
assert.equal(bundled.results[4].requirementMath.total.occurrences,1);
const workerSha256=createHash('sha256').update(readFileSync('dist/release/workers/mermaid-parse.cjs')).digest('hex');
console.log(JSON.stringify({cases:5,sourceBundleParity:true,workerSha256}));
