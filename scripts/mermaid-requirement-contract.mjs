import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const artifact=/[/\\]requirementDiagram-PLB6GJNP\.mjs$/;
const digest='78077a43ffafbf1f752fe3ea7d7c78a0c7f9af6ad00ab3a619e9c494fc74cb0a';
export function patchRequirementContract(source){
 if(createHash('sha256').update(source).digest('hex')!==digest)throw new Error('Mermaid Requirement artifact changed; review grammar, DB and renderer contract');
 return source+'\nexport const visserRequirementContractVersion = 1;\nexport { RequirementDB as VisserRequirementDB };\n';
}
export function requirementContractLoadHook(){return(url,context,nextLoad)=>{
 const loaded=nextLoad(url,context);if(!url.startsWith('file:')||!artifact.test(fileURLToPath(url)))return loaded;
 if(loaded.format!=='module'||loaded.source==null)throw new Error('Requirement contract requires original ESM source');
 const source=typeof loaded.source==='string'?loaded.source:Buffer.from(loaded.source).toString('utf8');return {...loaded,source:patchRequirementContract(source)};
};}
export function requirementContractPlugin(){return {name:'visser-requirement-contract',setup(build){
 let count=0;build.onStart(()=>{count=0;});build.onLoad({filter:artifact},({path})=>{count++;return {contents:patchRequirementContract(readFileSync(path,'utf8')),loader:'js'};});
 build.onEnd(()=>count===1?undefined:{errors:[{text:`Expected one Requirement contract artifact; patched ${count}`}]});
}};}
