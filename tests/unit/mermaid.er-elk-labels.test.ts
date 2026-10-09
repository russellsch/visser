import {execFileSync} from 'node:child_process';import {expect,it} from 'vitest';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
import {mapERElkEdgeInput} from '../../packages/core/src/mermaid/er-elk-labels.ts';
import {ProvenanceText} from '../../packages/core/src/mermaid/source-provenance.ts';
it('plans default ELK labels from native getData ordinals with separate temporary copies',()=>{
 const url=(path:string)=>pathToFileURL(resolve(path)).href;
 const args=[resolve('tests/fixtures/math/er-elk-labels.mjs'),...['packages/core/src/mermaid/er-node-state.ts','packages/core/src/mermaid/er-node-db.ts','scripts/mermaid-er-contract.mjs','packages/core/src/mermaid/dompurify-stub.ts'].map(url)];
 expect(execFileSync(process.execPath,args,{encoding:'utf8'}).trim()).toBe('ok');
});
it('retains exact break-tag provenance without decoding entities',()=>{
 const text='😀a<BR />b&amp;c',value=mapERElkEdgeInput(ProvenanceText.identity(text));
 expect(value.text).toBe('😀a\nb&amp;c');expect(value.mapRange(3,4)).toEqual({synthetic:false,intervals:[{start:3,end:9}]});
});
