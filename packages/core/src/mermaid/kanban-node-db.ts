import {isDeepStrictEqual} from 'node:util';
import {MathPolicyError} from '../math/policy.ts';
import {prepareSequenceSanitizer} from './sequence-sanitize.ts';
import {withStateSanitizer} from './state-node-db.ts';
import type {KanbanDbOptions,KanbanDbSnapshot} from './kanban-db.ts';

type Config={securityLevel:unknown;htmlLabels:unknown;mindmap:unknown};
type Db=Record<string,unknown>;
type Parser={yy?:unknown;parse(source:string):unknown;parser?:unknown};
type Module={
 diagram?:{db?:Db;parser?:Parser};
 visserKanbanContractVersion?:unknown;
 visserCaptureKanbanDb?:()=>KanbanDbSnapshot;
 visserCaptureKanbanConfig?:()=>Config;
 visserPrepareKanbanSanitizer?:()=>unknown;
};
type Completed={source:string;snapshot:KanbanDbSnapshot;options:KanbanDbOptions;htmlLabels:boolean};

let installed:Promise<void>|undefined;
let nativeDb:Db|undefined;
let transaction:{cleared:boolean;generation:number;completed?:Completed}|undefined;
let parsing=false;
let readConfig:(()=>Config)|undefined;

function invalid(message:string):never { throw new MathPolicyError('E_MATH_INVALID',`Kanban native lifecycle: ${message}`); }

function completedConfig(config:Config):{options:KanbanDbOptions;htmlLabels:boolean} {
 if(!config||typeof config!=='object'||config.securityLevel!=='strict') invalid('native securityLevel must be strict');
 if(typeof config.htmlLabels!=='boolean') invalid('native htmlLabels must be boolean');
 const mindmap=config.mindmap;
 if(!mindmap||typeof mindmap!=='object'||Array.isArray(mindmap)) invalid('native mindmap defaults are missing');
 const {maxNodeWidth,padding}=mindmap as Record<string,unknown>;
 if(typeof maxNodeWidth!=='number'||!Number.isFinite(maxNodeWidth)||typeof padding!=='number'||!Number.isFinite(padding)) invalid('native mindmap width or padding is invalid');
 return {options:{width:maxNodeWidth,padding},htmlLabels:config.htmlLabels};
}

/** Bind the pinned shared Kanban singleton to one clear/parse/capture receipt.
 * The receipt must be consumed before another singleton parse can begin.
 */
export function installKanbanNodeDb():Promise<void> {
 if(!installed) installed=(async()=>{
  await prepareSequenceSanitizer();
  // @ts-expect-error the contract export is injected while loading the pinned chunk.
  const module=await import('mermaid/dist/chunks/mermaid.core/kanban-definition-PNTS6WVX.mjs') as Module;
  const diagram=module.diagram,db=diagram?.db,parser=diagram?.parser;
  if(module.visserKanbanContractVersion!==3||typeof module.visserCaptureKanbanDb!=='function'||typeof module.visserCaptureKanbanConfig!=='function'||typeof module.visserPrepareKanbanSanitizer!=='function') invalid('native contract patch is missing');
  if(!db||!parser||parser.parser!==parser||typeof parser.parse!=='function'||typeof db.clear!=='function'||typeof db.addNode!=='function'||typeof db.decorateNode!=='function') invalid('native DB/parser binding changed');
  withStateSanitizer(()=>module.visserPrepareKanbanSanitizer!());
  const clear=db.clear as (...args:unknown[])=>unknown;
  const parse=parser.parse;
  nativeDb=db;
  readConfig=module.visserCaptureKanbanConfig;
  transaction={cleared:false,generation:0};
  db.clear=(...args:unknown[])=>{
   const state=transaction!;
   delete state.completed; state.cleared=false; state.generation++;
   const result=clear.apply(db,args);
   state.cleared=!parsing;
   return result;
  };
  parser.parse=function(this:Parser,source:string,...args:unknown[]):unknown {
   const state=transaction!;
   // Any parse attempt makes a prior receipt unusable, including malformed calls.
   delete state.completed;
   const hadClear=state.cleared;
   state.cleared=false;
   if(this!==parser) invalid('wrong parser receiver');
   if(this.yy!==db) invalid('parser DB is not the registered native singleton');
   if(parsing) invalid('overlapping native parse');
   if(!hadClear) invalid('a fresh native clear is required');
   if(typeof source!=='string'||args.length) invalid('unexpected parser input');
   parsing=true;
   const generation=state.generation;
   try {
    const before=module.visserCaptureKanbanConfig!();
    completedConfig(before);
    const result=withStateSanitizer(()=>parse.call(this,source));
    if(result&&typeof (result as {then?:unknown}).then==='function') invalid('native parser became asynchronous');
    if(generation!==state.generation) invalid('native state was cleared during parse');
    const after=module.visserCaptureKanbanConfig!();
    if(!isDeepStrictEqual(before,after)) invalid('native config changed during parse');
    const config=completedConfig(after);
    state.completed={source,snapshot:module.visserCaptureKanbanDb!(),...config};
    return result;
   } catch(error) {
    delete state.completed;
    throw error;
   } finally { parsing=false; state.cleared=false; }
  };
 })().catch(error=>{installed=undefined;nativeDb=undefined;transaction=undefined;readConfig=undefined;throw error;});
 return installed;
}

/** Read effective options for bounded preflight before native YAML coercion.
 * This is not a parse receipt; completion still captures and checks its own
 * configuration and native state independently.
 */
export function readKanbanNodeConfig():{options:KanbanDbOptions;htmlLabels:boolean}{
 if(!readConfig||parsing)invalid('configuration is unavailable before installation or during parse');
 return completedConfig(readConfig());
}

/** Consume one detached successful parse receipt for the exact parser source. */
export function captureKanbanNodeState(db:object,parserSource:string):Completed {
 const state=transaction,completed=state?.completed;
 if(db!==nativeDb||!completed||parsing) invalid('no completed native parse snapshot');
 delete state!.completed;
 if(completed.source!==parserSource) invalid('completed parser input differs');
 return structuredClone(completed);
}
