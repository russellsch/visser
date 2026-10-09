import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {patchERMathGrammar} from './mermaid-er-grammar.mjs';
const artifact=/[/\\]erDiagram-OPXOYQCR\.mjs$/;
const digest='1437bfbd601358cd7f2e54d540410bdebc9bdd38131300d16c49705811f9de49';
export function patchERContract(source){
 if(createHash('sha256').update(source).digest('hex')!==digest)throw new Error('Mermaid ER artifact changed; review grammar, DB and renderer contract');
 return patchERMathGrammar(source)+`
export const visserERContractVersion = 3;
export { ErDB as VisserErDB };
export function visserCaptureERConfig() { const config = getConfig(); return structuredClone({ securityLevel: config.securityLevel, htmlLabels: config.htmlLabels, look: config.look ?? "default", layout: config.layout, dompurifyConfig: config.dompurifyConfig, nodeSpacing: config.nodeSpacing, rankSpacing: config.rankSpacing, erNodeSpacing: config.er?.nodeSpacing, erRankSpacing: config.er?.rankSpacing }); }
export function visserPrepareERSanitizer() { common_default.sanitizeText("visser-er-sanitizer", { ...getConfig(), htmlLabels: true, securityLevel: "strict" }); }
const visserERGetData = ErDB.prototype.getData;
const visserERGetSubGraphs = ErDB.prototype.getSubGraphs;
const visserERGetCompiledStyles = ErDB.prototype.getCompiledStyles;
export function visserCaptureERData(snapshot) {
  const state = structuredClone(snapshot);
  const detached = Object.assign(Object.create(null), state, {
    entities: new Map(state.entities), classes: new Map(state.classes),
    subGraphLookup: new Map(state.subGraphLookup),
    getSubGraphs: visserERGetSubGraphs, getCompiledStyles: visserERGetCompiledStyles
  });
  const { nodes, edges, other, direction } = visserERGetData.call(detached);
  return structuredClone({ nodes, edges, other, direction });
}
`;
}
export function erContractLoadHook(){return(url,context,nextLoad)=>{const loaded=nextLoad(url,context);if(!url.startsWith('file:')||!artifact.test(fileURLToPath(url)))return loaded;if(loaded.format!=='module'||loaded.source==null)throw new Error('ER contract requires original ESM source');const source=typeof loaded.source==='string'?loaded.source:Buffer.from(loaded.source).toString('utf8');return {...loaded,source:patchERContract(source)};};}
export function erContractPlugin(){return {name:'visser-er-contract',setup(build){let count=0;build.onStart(()=>{count=0;});build.onLoad({filter:artifact},({path})=>{count++;return {contents:patchERContract(readFileSync(path,'utf8')),loader:'js'};});build.onEnd(()=>count===1?undefined:{errors:[{text:`Expected one ER contract artifact; patched ${count}`}]});}};}
