import {execFileSync} from 'node:child_process';
import {expect,it} from 'vitest';

it('reconciles Kanban math against consumed native state and captured configuration',()=>{
 const result=execFileSync(process.execPath,['tests/fixtures/math/kanban-node-math.mjs'],{cwd:process.cwd(),encoding:'utf8'});
 expect(JSON.parse(result.trim())).toEqual({modes:2,detached:true,sourceBound:true,recovered:true});
});
