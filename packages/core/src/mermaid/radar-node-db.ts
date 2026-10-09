import {MathPolicyError} from '../math/policy.ts';
import {prepareSequenceSanitizer} from './sequence-sanitize.ts';
import {withStateSanitizer} from './state-node-db.ts';
import {captureRadarDb,type RadarNativeDb} from './radar-db.ts';
type Db=RadarNativeDb&Record<string,(...args:unknown[])=>unknown>;
let installed:Promise<void>|undefined,nativeDb:Db|undefined;
let generation=0,ready=false,parsing=false,cleared=false;
function invalid(message:string):never{throw new MathPolicyError('E_MATH_INVALID',`Radar native lifecycle: ${message}`);}

export function installRadarNodeDb():Promise<void>{
 if(!installed)installed=(async()=>{
  const parser=await import('@mermaid-js/parser');
  if((parser as unknown as {visserRadarParserContractVersion?:number}).visserRadarParserContractVersion!==1)invalid('parser contract patch is missing');
  await prepareSequenceSanitizer();
  // @ts-expect-error pinned internal chunk has no declarations.
  const module=await import('mermaid/dist/chunks/mermaid.core/diagram-MPIPVDR6.mjs');
  if(module.visserRadarContractVersion!==1)invalid('native contract patch is missing');
  const db=module.diagram.db as Db,nativeParser=module.diagram.parser;
  const setters=['setDiagramTitle','setAccTitle','setAccDescription'];
  if(['clear','getAxes','getCurves','getOptions','getDiagramTitle','getAccTitle','getAccDescription',...setters].some(name=>typeof db[name]!=='function')||typeof nativeParser.parse!=='function')invalid('native DB/parser contract differs');
  const clear=db['clear']!,parse=nativeParser.parse;
  db['clear']=(...args:unknown[])=>{
   generation++;ready=false;cleared=false;
   const result=clear.apply(db,args);
   // A clear during an in-flight parse cannot authorize its successor: the
   // pending native parser can still populate that supposedly empty state.
   cleared=!parsing;return result;
  };
  for(const name of setters){const setter=db[name]!;db[name]=(...args:unknown[])=>withStateSanitizer(()=>setter.apply(db,args));}
  nativeParser.parse=async function(...args:unknown[]){
   if(parsing)invalid('overlapping native parse');
   ready=false;
   if(!cleared)invalid('a fresh native clear is required');
   cleared=false;parsing=true;const token=generation;
   try{
    const result=await parse.apply(this,args);
    if(token!==generation)invalid('native state was cleared during parse');
    ready=true;return result;
   }finally{parsing=false;}
  };
  nativeDb=db;
 })().catch(error=>{installed=undefined;throw error;});
 return installed;
}

/** Capture synchronously before source collection or any subsequent await. */
export function captureRadarNodeState(db:object){
 if(db!==nativeDb||!ready||parsing)invalid('no completed native parse state');
 return captureRadarDb(nativeDb);
}
