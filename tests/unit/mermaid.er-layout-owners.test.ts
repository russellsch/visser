import {execFileSync} from 'node:child_process';
import {expect,it} from 'vitest';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {tagERLayoutOwners,observeERLayoutOwners} from '../../packages/core/src/mermaid/er-layout-owners.ts';
it('retains native winner identities through pinned Dagre preparation',()=>{
 const url=(path:string)=>pathToFileURL(resolve(path)).href;
 const args=[resolve('tests/fixtures/math/er-layout-owners.mjs'),...['packages/core/src/mermaid/er-layout-owners.ts','packages/core/src/mermaid/er-node-state.ts','packages/core/src/mermaid/er-node-db.ts','scripts/mermaid-er-contract.mjs','scripts/mermaid-er-layout-contract.mjs','packages/core/src/mermaid/dompurify-stub.ts'].map(url)];
 expect(execFileSync(process.execPath,args,{encoding:'utf8'}).trim()).toBe('ok: 12 native topology and selected-math cases; no draw-copy proof');
});
it('rejects owner cardinality, repeated ordinals and invalid graph registries',()=>{
 const data={nodes:[{id:'a'},{id:'b'}],edges:[]};
 expect(()=>tagERLayoutOwners(data,[],[])).toThrow(/cardinality/);
 expect(()=>tagERLayoutOwners(data,[{kind:'entity',index:0},{kind:'entity',index:0}],[])).toThrow(/repeated/);
 expect(()=>tagERLayoutOwners(data,[{kind:'entity',index:-1},{kind:'group',index:0}],[])).toThrow(/invalid owner/);
 const registry=tagERLayoutOwners({nodes:[{id:'a'}],edges:[]},[{kind:'entity',index:0}],[]).registry;
 expect(()=>observeERLayoutOwners({} as never,[...registry,...registry])).toThrow(/duplicate registry/);
 expect(()=>observeERLayoutOwners({} as never,registry)).toThrow(/invalid or repeated graph/);
});
