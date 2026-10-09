// Compare the actual source worker to the release worker relocated away from
// node_modules. Run after npm run build with the supported Node runtime.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
const root = resolve(import.meta.dirname, '..');
const sources = [
  'stateDiagram-v2\naccTitle: <br/> &dollar;&dollar;t&dollar;&dollar;\naccDescr {\n first\n  $$d$$\n}\nstate "$$x < y$$" as A\nA: $$z$$\nnote right of A: $$n$$\nA --> B: $$e$$\n',
  'stateDiagram\nA: <br/> ﬂ°dollar¶ßﬂ°dollar¶ßxﬂ°dollar¶ßﬂ°dollar¶ß\n',
  'stateDiagram-v2\nnote right of A: plain\n',
  'stateDiagram-v2\nnote right of A: $$n$$\n',
  'stateDiagram-v2\nA --> B: after failure\n',
  'stateDiagram-v2\nstate Group {\n Child\n}\n',
  'stateDiagram-v2\naccTitle: $$\\badcommand$$\naccTitle: overwritten\nA\n',
  'stateDiagram-v2\nA: $$x$$\nA --> B\nclass A vsﬂ°°45¶ßmermaid-source\n',
];
const input=JSON.stringify({figures:sources.map((source,index)=>({figureId:`f${index}`,type:'state',source,originalSource:source}))});
const run=(worker,cwd)=>JSON.parse(execFileSync(process.execPath,[worker],{input,cwd,encoding:'utf8',stdio:['pipe','pipe','pipe']}));
const dir=mkdtempSync(join(tmpdir(),'visser-state-worker-'));
try {
  const source=run(join(root,'packages/core/src/mermaid/parse-worker.ts'),root);
  const relocated=join(dir,'mermaid-parse.cjs');
  copyFileSync(join(root,'dist/release/workers/mermaid-parse.cjs'),relocated);
  const bundled=run(relocated,dir);
  if(!isDeepStrictEqual(source,bundled)) throw new Error('Source and relocated release state results differ');
  if(source.results[0]?.stateMath?.total.occurrences!==6 || source.results[1]?.stateMath?.total.occurrences!==1 ||
      source.results[2]?.ok!==true || source.results[3]?.code!=='E_MATH' || source.results[4]?.ok!==true ||
      source.results[5]?.ok!==true || source.results[6]?.code!=='E_MATH' || source.results[7]?.stateMath?.total.occurrences!==1) throw new Error('State verification expectations failed');
  writeFileSync(join(root,'reports/math/state-worker-relocated.json'),JSON.stringify({equal:true,fixtureCount:sources.length,results:source.results},null,2)+'\n');
  console.log(`Source and relocated release worker agree on ${sources.length} state fixtures.`);
} finally {rmSync(dir,{recursive:true,force:true});}
