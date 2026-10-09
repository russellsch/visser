import {captureRadarNodeState} from './radar-node-db.ts';
import {extractRadarMath} from './radar-math.ts';
import {reconcileRadarMathDb} from './radar-math-db.ts';

/** Detach completed native state before asynchronous source collection.
 * This is an internal ownership plan, not a serializable worker payload.
 */
export async function extractRadarNodeMath(original:string,rendered:string,db:object){
 const snapshot=captureRadarNodeState(db);
 const math=await extractRadarMath(original,undefined,rendered);
 const plan=reconcileRadarMathDb(math,snapshot);
 return {math,...plan};
}
