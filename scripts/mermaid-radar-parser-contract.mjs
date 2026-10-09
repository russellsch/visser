import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const artifacts = [
 {name:'entry',suffix:'/dist/mermaid-parser.core.mjs',sha:'f24c217b6de46efe9868e21b94d3bb3f84d8b550ec18d98127c4240d2e72e41c'},
 {name:'grammar',suffix:'/dist/chunks/mermaid-parser.core/chunk-FOHPRMQF.mjs',sha:'5c83305b04a62463567bdf6d82d9ba9dfc3795e516d8cc848e6981504af48068'},
 {name:'services',suffix:'/dist/chunks/mermaid-parser.core/chunk-I5DQTOEV.mjs',sha:'6bd3044bd1f707ce98870c26f19048133d59d762a8caa0546e06837de66ea647'},
 {name:'loader',suffix:'/dist/chunks/mermaid-parser.core/radar-RG4KPBEZ.mjs',sha:'3247f39c18daf737a0a70b0ba58bc01d22054421da6a505b2b9ff29feaf4a668'},
];
const identify=path=>artifacts.find(artifact=>path.replaceAll('\\','/').endsWith(artifact.suffix));
const marker=name=>`visserRadarParser_${name}`;

/** Pin the actual dispatcher, lazy loader, service wiring, grammar and converters. */
export function patchRadarParserContract(path,source){
 const artifact=identify(path);
 if(!artifact)throw new Error('Unknown Radar parser artifact');
 if(createHash('sha256').update(source).digest('hex')!==artifact.sha)throw new Error(`Radar parser ${artifact.name} artifact changed; review grammar and conversion contract`);
 let extra=`\nexport const ${marker(artifact.name)} = 1;\n`;
 if(artifact.name==='entry'){
  extra='';
  for(const dependency of artifacts.filter(item=>item.name!=='entry')){
   const relative='.'+dependency.suffix.slice('/dist'.length);
   extra+=`import { ${marker(dependency.name)} } from ${JSON.stringify(relative)};\n`;
   extra+=`if (${marker(dependency.name)} !== 1) throw new Error("Radar parser ${dependency.name} contract is missing");\n`;
  }
  extra+='export const visserRadarParserContractVersion = 1;\n';
 }
 return source+'\n'+extra;
}

/** Must be installed before any import of the parser package. */
export function radarParserContractLoadHook(){
 return (url,context,nextLoad)=>{
  const loaded=nextLoad(url,context);
  if(!url.startsWith('file:'))return loaded;
  const path=fileURLToPath(url);if(!identify(path))return loaded;
  if(loaded.format!=='module'||loaded.source==null)throw new Error('Radar parser contract requires original ESM source');
  const source=typeof loaded.source==='string'?loaded.source:Buffer.from(loaded.source).toString('utf8');
  return {...loaded,source:patchRadarParserContract(path,source)};
 };
}

export function radarParserContractPlugin(){
 return {name:'visser-radar-parser-contract',setup(build){
  const counts=new Map();build.onStart(()=>counts.clear());
  build.onLoad({filter:/[/\\](mermaid-parser\.core|chunk-FOHPRMQF|chunk-I5DQTOEV|radar-RG4KPBEZ)\.mjs$/},({path})=>{
   const artifact=identify(path);if(!artifact)return;
   counts.set(artifact.name,(counts.get(artifact.name)??0)+1);
   return {contents:patchRadarParserContract(path,readFileSync(path,'utf8')),loader:'js'};
  });
  build.onEnd(()=>{
   const wrong=artifacts.filter(artifact=>counts.get(artifact.name)!==1);
   return wrong.length?{errors:wrong.map(artifact=>({text:`Expected one Radar parser ${artifact.name} artifact; patched ${counts.get(artifact.name)??0}`}))}:undefined;
  });
 }};
}
