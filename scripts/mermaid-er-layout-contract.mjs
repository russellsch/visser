import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const registry=/[/\\]chunk-GNY47TPC\.mjs$/;
const dagre=/[/\\]dagre-6A5THRUB\.mjs$/;
const common=/[/\\]chunk-3FUC2YCW\.mjs$/;
const hashes=Object.freeze({
 registry:'624eeefcd2d27b96c0f75db3f8edd1ff4997b5bdeb9e6404433219c6bfbe4804',
 dagre:'392dc592c9b166686e674abce5afd09c3bc817d8cd18474724cdeb2ec5cbd050',
 common:'eb671be62e44b68716a51e6f9c0b611afd39df4feb70389e219c43c82152027c',
});

function patch(source,kind){
 if(createHash('sha256').update(source).digest('hex')!==hashes[kind])throw new Error(`Mermaid ER ${kind} layout artifact changed; review native layout contract`);
 const exported=kind==='registry'?'getRegisteredLayoutAlgorithm as visserERResolveLayoutAlgorithm':kind==='dagre'?'prepareLayoutForDagre as visserERPrepareLayoutForDagre':'clear4 as visserERResetDagreClusterState';
 return `${source}\nexport { ${exported} };\n`;
}

function kindFor(path){return registry.test(path)?'registry':dagre.test(path)?'dagre':common.test(path)?'common':undefined;}

/** Hash-pinned Node source hook for the native layout functions used by the
 * ER parse worker. The reset is intentionally exported only through this
 * contract so callers cannot silently rely on a private Mermaid symbol. */
export function erLayoutContractLoadHook(){return(url,context,nextLoad)=>{
 const loaded=nextLoad(url,context),kind=url.startsWith('file:')&&kindFor(fileURLToPath(url));
 if(!kind)return loaded;
 if(loaded.format!=='module'||loaded.source==null)throw new Error('ER layout contract requires original ESM source');
 const source=typeof loaded.source==='string'?loaded.source:Buffer.from(loaded.source).toString('utf8');
 return {...loaded,source:patch(source,kind)};
};}

/** esbuild counterpart of erLayoutContractLoadHook. */
export function erLayoutContractPlugin(){return {name:'visser-er-layout-contract',setup(build){
 let patched=Object.create(null);build.onStart(()=>{patched=Object.create(null);});
 build.onLoad({filter:/(chunk-GNY47TPC|dagre-6A5THRUB|chunk-3FUC2YCW)\.mjs$/},({path})=>{
  const kind=kindFor(path);if(!kind)return;
  patched[kind]=(patched[kind]??0)+1;
  return {contents:patch(readFileSync(path,'utf8'),kind),loader:'js'};
 });
 build.onEnd(()=>{const missing=Object.keys(hashes).filter(kind=>patched[kind]!==1);return missing.length?{errors:[{text:`Expected one ER layout ${missing.join(', ')} artifact; patched ${JSON.stringify(patched)}`}]}:undefined;});
}};}
