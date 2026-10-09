import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
// @ts-expect-error build-time native contract script
import {patchAgentflowContract,agentflowContractPlugin} from '../../scripts/mermaid-agentflow-contract.mjs';
it('pins the complete native Agentflow artifact and rejects upstream drift',()=>{
 const source=readFileSync('node_modules/mermaid/dist/chunks/mermaid.core/diagram-22UHCM2B.mjs','utf8');
 expect(patchAgentflowContract(source)).toContain('export const visserAgentflowContract = 1;');
 expect(()=>patchAgentflowContract(source+'\n')).toThrow(/artifact changed/);
});
it('fails the build if the expected native Agentflow artifact was not checked',()=>{
 let finish:()=>unknown=()=>undefined;
 agentflowContractPlugin().setup({onStart(){},onLoad(){},onEnd(callback:()=>unknown){finish=callback;}});
 expect(finish()).toEqual({errors:[{text:'Expected one Agentflow artifact; checked 0'}]});
});
