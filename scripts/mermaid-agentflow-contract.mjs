import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const artifact=/[/\\]diagram-22UHCM2B\.mjs$/;
const expected='f7192aef4952840d375a20f2a7bffa4b93c0fdb777c9a22aca1d70897393c0f8';
export function patchAgentflowContract(source){
 if(createHash('sha256').update(source).digest('hex')!==expected)throw new Error('Agentflow artifact changed; review parser, DB and renderer contract');
 return source+'\nexport const visserAgentflowContract = 1;\n';
}
export function agentflowContractLoadHook(){return (url,context,nextLoad)=>{
 const loaded=nextLoad(url,context);
 if(!artifact.test(url))return loaded;
 if(loaded.format!=='module'||loaded.source==null)throw new Error('Agentflow contract requires original ESM source');
 return {...loaded,source:patchAgentflowContract(typeof loaded.source==='string'?loaded.source:Buffer.from(loaded.source).toString('utf8'))};
};}
export function agentflowContractPlugin(){return {name:'visser-agentflow-contract',setup(build){
 let count=0;build.onStart(()=>{count=0;});
 build.onLoad({filter:artifact},({path})=>{count++;return {contents:patchAgentflowContract(readFileSync(path,'utf8')),loader:'js'};});
 build.onEnd(()=>count===1?undefined:{errors:[{text:`Expected one Agentflow artifact; checked ${count}`}]});
}};}
