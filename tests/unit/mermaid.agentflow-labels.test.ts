import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {expect,it} from 'vitest';
it('collects pinned Agentflow grammar labels with source provenance',()=>{const url=(path:string)=>pathToFileURL(resolve(path)).href;const args=[resolve('tests/fixtures/math/agentflow-labels.mjs'),url('packages/core/src/mermaid/agentflow-labels.ts'),url('packages/core/src/mermaid/dompurify-stub.ts')];expect(execFileSync(process.execPath,args,{encoding:'utf8'}).trim()).toBe('ok: Agentflow collector preserves labels, metadata, comments, CRLF, unicode and overwritten accessibility fields');});
