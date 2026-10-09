import {MathPolicyError} from '../math/policy.ts';
import {captureKanbanNodeState,readKanbanNodeConfig} from './kanban-node-db.ts';
import {extractKanbanMath} from './kanban-math.ts';
import {reconcileKanbanDb} from './kanban-db.ts';

/** Reject denied metadata, excessive alias coercion and invalid authored math
 * before the native parser may perform its own unrestricted YAML coercion.
 * Native completion is still independently collected and reconciled below.
 */
export async function preflightKanbanNodeMath(original:string,rendered:string){
 const config=readKanbanNodeConfig();
 return extractKanbanMath(original,config.options,undefined,rendered,config.htmlLabels);
}

/** Consume native completion before asynchronous source collection. Captured
 * configuration belongs to that parse, independently of later singleton use.
 * This internal result does not authenticate serialized worker transport.
 */
export async function extractKanbanNodeMath(original:string,rendered:string,db:object,parserSource:string){
 const completed=captureKanbanNodeState(db,parserSource);
 const math=await extractKanbanMath(original,completed.options,undefined,rendered,completed.htmlLabels);
 if(math.prepared.authored.parserSource!==parserSource)throw new MathPolicyError('E_MATH_INVALID','Kanban source differs from completed native parser input');
 const snapshot=reconcileKanbanDb(math.prepared.effects,completed.options,completed.snapshot);
 return {math,snapshot,options:completed.options,htmlLabels:completed.htmlLabels};
}
