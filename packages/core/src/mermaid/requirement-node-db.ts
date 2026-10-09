import {MathPolicyError} from '../math/policy.ts';
import {prepareSequenceSanitizer} from './sequence-sanitize.ts';
import {withStateSanitizer} from './state-node-db.ts';
import {captureRequirementDb,type RequirementDbSnapshot,type RequirementNativeDb} from './requirement-db.ts';
type Db=RequirementNativeDb&Record<string,unknown>;
type Transaction={cleared:boolean;generation:number;completed?:{source:string;snapshot:RequirementDbSnapshot}};
let installed:Promise<void>|undefined;
const transactions=new WeakMap<object,Transaction>();
let parsing=false;
function invalid(message:string):never{throw new MathPolicyError('E_MATH_INVALID',`Requirement native lifecycle: ${message}`);}

/** Source/bundle must first install the exact native artifact contract and
 * alias Mermaid's DOMPurify dependency to our private synchronous stub.
 */
export function installRequirementNodeDb():Promise<void>{
 if(!installed)installed=(async()=>{
  await prepareSequenceSanitizer();
  // @ts-expect-error pinned internal chunk has no declarations.
  const module=await import('mermaid/dist/chunks/mermaid.core/requirementDiagram-PLB6GJNP.mjs');
  if(module.visserRequirementContractVersion!==1)invalid('native contract patch is missing');
  const {diagram}=module,descriptor=Object.getOwnPropertyDescriptor(diagram,'db'),parser=diagram.parser;
  if(!descriptor?.get||!descriptor.configurable||parser?.parser!==parser||typeof parser.parse!=='function')invalid('native DB/parser binding changed');
  const nativeGet=descriptor.get,nativeParse=parser.parse;
  Object.defineProperty(diagram,'db',{...descriptor,get(){
   if(parsing)invalid('DB construction during native parse');
   const db=nativeGet.call(this)as Db;
   if(transactions.has(db)||!(db instanceof module.VisserRequirementDB))invalid('DB getter did not create a fresh native instance');
   for(const method of ['clear','setAccTitle','setAccDescription','setDiagramTitle','getRequirements','getElements','getClasses','getRelationships','getDirection','getDiagramTitle','getAccTitle','getAccDescription'])if(typeof db[method]!=='function')invalid('native DB interface changed');
   const state:Transaction={cleared:false,generation:0};transactions.set(db,state);
   const clear=db['clear']as (...args:unknown[])=>unknown;
   db['clear']=(...args:unknown[])=>{
    delete state.completed;state.cleared=false;state.generation++;
    const result=clear.apply(db,args);state.cleared=!parsing;return result;
   };
   for(const name of ['setAccTitle','setAccDescription','setDiagramTitle']){
    const setter=db[name]as (...args:unknown[])=>unknown;
    db[name]=(...args:unknown[])=>withStateSanitizer(()=>setter.apply(db,args));
   }
   return db;
  }});
  parser.parse=function(this:{yy?:object},source:unknown,...args:unknown[]){
   if(this!==parser)invalid('wrong parser receiver');
   const db=this.yy,state=db&&transactions.get(db);
   if(!state)invalid('parser DB is not a registered native instance');
   delete state.completed;
   if(parsing)invalid('overlapping native parse');
   if(!state.cleared)invalid('a fresh native clear is required');
   state.cleared=false;
   if(typeof source!=='string'||args.length)invalid('unexpected parser input');
   parsing=true;const generation=state.generation;
   try{
    const result=nativeParse.call(this,source);
    if(result&&typeof result.then==='function')invalid('native parser became asynchronous');
    if(generation!==state.generation)invalid('native state was cleared during parse');
    // No await between native success and capture: common metadata may change
    // immediately after this function returns to Diagram.fromText.
    state.completed={source,snapshot:captureRequirementDb(db as Db)};
    return result;
   }finally{parsing=false;}
  };
 })().catch(error=>{installed=undefined;throw error;});
 return installed;
}

/** Consume one detached, successful parse snapshot. It describes parse
 * completion, not later live DB mutations or globally shared metadata.
 */
export function captureRequirementNodeState(db:object,parserSource:string):RequirementDbSnapshot{
 const state=transactions.get(db),completed=state?.completed;
 if(!completed||parsing)invalid('no completed native parse snapshot');
 delete state!.completed;
 if(completed.source!==parserSource)invalid('completed parser input differs');
 return structuredClone(completed.snapshot);
}
