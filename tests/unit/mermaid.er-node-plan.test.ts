import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {expect,it} from 'vitest';

it('plans ER labels from pinned native layout preparation without leaking Dagre cluster state',()=>{
 const url=(path:string)=>pathToFileURL(resolve(path)).href;
 const args=[resolve('tests/fixtures/math/er-node-plan.mjs'),...[
  'packages/core/src/mermaid/er-node-plan.ts',
  'packages/core/src/mermaid/er-node-state.ts',
  'packages/core/src/mermaid/er-node-db.ts',
  'scripts/mermaid-er-contract.mjs',
  'scripts/mermaid-er-layout-contract.mjs',
  'packages/core/src/mermaid/dompurify-stub.ts',
 ].map(url)];
 expect(execFileSync(process.execPath,args,{encoding:'utf8'}).trim()).toBe('ok: ER native node layout plan covers ELK, Dagre, native fallback, reset recovery, collisions and self-loops');
});
