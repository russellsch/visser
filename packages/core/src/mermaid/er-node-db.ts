import {isDeepStrictEqual} from 'node:util';
import {MathPolicyError} from '../math/policy.ts';
import {prepareSequenceSanitizer} from './sequence-sanitize.ts';
import {withStateSanitizer} from './state-node-db.ts';
import {captureERDb,replayERDb,type ERDbSnapshot,type ERDbOptions,type EREffect} from './er-db.ts';

import type {ERNativeData} from './er-layout-owners.ts';

type Db=Record<string,any>;
type Config={securityLevel:unknown;htmlLabels:unknown;look:unknown;layout:unknown;dompurifyConfig?:unknown;nodeSpacing:unknown;rankSpacing:unknown;erNodeSpacing:unknown;erRankSpacing:unknown};
export type ERCompletedState={source:string;snapshot:ERDbSnapshot;data:ERNativeData;planningConfig:Config;options:ERDbOptions;htmlLabels:boolean;layout:string;effects:EREffect[]};
type Transaction={cleared:boolean;generation:number;completed?:ERCompletedState};
const transactions=new WeakMap<object,Transaction>();
let installed:Promise<void>|undefined;
let readConfig:(()=>Config)|undefined;
let active:{db:Db;depth:number;effects:EREffect[];invalidated:boolean}|undefined;
const methods=['addEntity','addAttributes','addRelationship','setClass','setAccTitle','setAccDescription','setDirection','addSubGraph','addClass','addCssStyles','setDiagramTitle'];
function invalid(message:string):never {if(active)active.invalidated=true;throw new MathPolicyError('E_MATH_INVALID',`ER native lifecycle: ${message}`);}
function captureConfig():Config{try{return readConfig!();}catch{invalid('native planning config must be cloneable');}}
function checkedConfig(config:Config):{options:ERDbOptions;htmlLabels:boolean;layout:string} {
  if(!config||config.securityLevel!=='strict')invalid('native securityLevel must be strict');
  if(typeof config.htmlLabels!=='boolean')invalid('native htmlLabels must be boolean');
  if(typeof config.look!=='string')invalid('native look must be a string');
  if(typeof config.layout!=='string')invalid('native layout must be a string');
  if(config.dompurifyConfig)invalid('custom native purification is unsupported');
  return {options:{look:config.look},htmlLabels:config.htmlLabels,layout:config.layout};
}

/** Requires the pinned artifact contract and native DOMPurify alias to the
 * synchronous private stub. Receipts describe completed historical state;
 * they do not promise later live DB freshness. */
export function installERNodeDb():Promise<void> {
  if(!installed)installed=(async()=>{
    await prepareSequenceSanitizer();
    // @ts-expect-error injected pinned native contract has no declarations.
    const module=await import('mermaid/dist/chunks/mermaid.core/erDiagram-OPXOYQCR.mjs');
    if(module.visserERContractVersion!==3||typeof module.VisserErDB!=='function'
      ||typeof module.visserCaptureERData!=='function'||typeof module.visserCaptureERConfig!=='function'||typeof module.visserPrepareERSanitizer!=='function')invalid('native contract patch is missing');
    const {diagram}=module,descriptor=Object.getOwnPropertyDescriptor(diagram,'db'),parser=diagram.parser;
    if(!descriptor?.get||!descriptor.configurable||parser?.parser!==parser||typeof parser.parse!=='function')invalid('native DB/parser binding changed');
    const nativeGet=descriptor.get,nativeParse=parser.parse;
    withStateSanitizer(()=>module.visserPrepareERSanitizer());
    readConfig=module.visserCaptureERConfig;
    Object.defineProperty(diagram,'db',{...descriptor,get(){
      if(active)invalid('DB construction during native parse');
      const db=nativeGet.call(this) as Db;
      if(transactions.has(db)||!(db instanceof module.VisserErDB))invalid('DB getter did not create a fresh native instance');
      for(const name of ['clear',...methods,'getEntities','getClasses','getRelationships','getSubGraphs','getDirection','getDiagramTitle','getAccTitle','getAccDescription'])if(typeof db[name]!=='function')invalid('native DB interface changed');
      const state:Transaction={cleared:false,generation:0};transactions.set(db,state);
      const clear=db.clear;
      db.clear=(...args:unknown[])=>{
        if(active){active.invalidated=true;if(active.db!==db)invalid('foreign DB clear during native parse');}
        delete state.completed;state.cleared=false;state.generation++;
        const result=clear.apply(db,args);state.cleared=!active;return result;
      };
      for(const name of methods) {
        const native=db[name];
        db[name]=(...args:unknown[])=>{
          const transaction=active;
          if(transaction&&transaction.db!==db)invalid('foreign DB mutation during native parse');
          if(transaction&&transaction.depth===0)transaction.effects.push({method:name,args:structuredClone(args)});
          if(transaction)transaction.depth++;
          try{return withStateSanitizer(()=>native.apply(db,args));}
          finally{if(transaction)transaction.depth--;}
        };
      }
      return db;
    }});
    parser.parse=function(this:{yy?:Db},source:unknown,...args:unknown[]) {
      const db=this?.yy,state=db&&transactions.get(db);
      const hadClear=state?.cleared;
      // Attempts consume prior completion/clear authorization even on mismatch.
      if(state){delete state.completed;state.cleared=false;}
      if(this!==parser)invalid('wrong parser receiver');
      if(!db||!state)invalid('parser DB is not a registered native instance');
      if(active)invalid('overlapping native parse');
      if(!hadClear)invalid('a fresh native clear is required');
      if(typeof source!=='string'||args.length)invalid('unexpected parser input');
      const generation=state.generation,before=captureConfig(),config=checkedConfig(before);
      const baseline=captureERDb(db);
      const options={...config.options,initialDirection:baseline.direction};
      if(!isDeepStrictEqual(baseline,replayERDb([] ,options)))invalid('unsupported preparse state or metadata');
      const transaction={db,depth:0,effects:[] as EREffect[],invalidated:false};active=transaction;
      try {
        const result=withStateSanitizer(()=>nativeParse.call(this,source));
        if(transaction.invalidated)invalid('native transaction was invalidated');
        if(generation!==state.generation)invalid('native state was cleared during parse');
        if(!isDeepStrictEqual(before,captureConfig()))invalid('native config changed during parse');
        // No asynchronous gap: another DB constructor clears common metadata.
        const snapshot=captureERDb(db);
        let data:ERNativeData;
        try{data=module.visserCaptureERData(snapshot);}
        catch{invalid('native graph must be cloneable');}
        // Capture uses the native projector on a detached stored-state clone.
        // Publish only after every synchronous capture step has succeeded.
        const afterConfig=captureConfig();
        if(!isDeepStrictEqual(before,afterConfig))invalid('native config changed during data capture');
        if(transaction.invalidated)invalid('native transaction was invalidated during data capture');
        if(generation!==state.generation)invalid('native state was cleared during data capture');
        state.completed={source,snapshot,data,planningConfig:before,options,htmlLabels:config.htmlLabels,layout:config.layout,effects:transaction.effects};
        return result;
      } finally {active=undefined;}
    };
  })().catch(error=>{installed=undefined;throw error;});
  return installed;
}

export function readERNodeConfig():{options:ERDbOptions;htmlLabels:boolean;layout:string} {
  if(!readConfig||active)invalid('configuration unavailable before installation or during parse');
  return checkedConfig(captureConfig());
}

/** Consume before asynchronous collector/normalizer work. The detached receipt
 * remains valid across later DB mutation or another DB's common-metadata clear. */
export function captureERNodeState(db:object,parserSource:string):ERCompletedState {
  const state=transactions.get(db),completed=state?.completed;
  if(!completed||active)invalid('no completed native parse snapshot');
  delete state!.completed;
  if(completed.source!==parserSource)invalid('completed parser input differs');
  return structuredClone(completed);
}


/** Native graph plus only the inputs used by pinned ER/Dagre preparation.
 * ER draw overwrites flowchart spacing before common layout sees the data.
 * This is not the full native render config; browser rendering supplies that
 * independently and must check its own measured-render contract. */
export function erPlanningData(completed:ERCompletedState){
 const config=structuredClone(completed.planningConfig);
 return {...structuredClone(completed.data),config:{nodeSpacing:config.nodeSpacing,rankSpacing:config.rankSpacing,flowchart:{nodeSpacing:config.erNodeSpacing||140,rankSpacing:config.erRankSpacing||80}}};
}
