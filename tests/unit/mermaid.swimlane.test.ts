import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {expect,it} from 'vitest';
import {checkMermaidSource,diagramTypeOf} from '../../packages/core/src/mermaid/rules.ts';

it('classifies swimlane-beta as the verified flowchart family without classifying agentflow',()=>{
 expect(diagramTypeOf('swimlane-beta')).toBe('flowchart');
 expect(diagramTypeOf('agentflow-beta')).toBe('other');
 expect(checkMermaidSource('swimlane-beta\nA["$$x$$"]')).not.toContainEqual(expect.objectContaining({code:'E_MATH'}));
});

it('uses the unchanged swimlane header through native FlowDB reconciliation in TB and LR',()=>{
 const url=(path:string)=>pathToFileURL(resolve(path)).href;
 const args=[resolve('tests/fixtures/math/swimlane.mjs'),...[
  'packages/core/src/mermaid/flowchart-math.ts',
  'packages/core/src/mermaid/flowchart-db.ts',
  'packages/core/src/mermaid/dompurify-stub.ts',
 ].map(url)];
 expect(execFileSync(process.execPath,args,{encoding:'utf8'}).trim()).toBe('ok: swimlane-beta keeps native header provenance and reconciles lane/node/edge labels in TB and LR');
});
