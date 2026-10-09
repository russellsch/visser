import {MathPolicyError} from '../math/policy.ts';
import {captureRequirementNodeState} from './requirement-node-db.ts';
import {extractRequirementMath} from './requirement-math.ts';
import {reconcileRequirementRows} from './requirement-ownership.ts';

/** Consume the authenticated native completion before asynchronous collection.
 * The normal Mermaid Diagram supplies its DB instance and exact .text input.
 * This returns an internal plan, not a serialized worker payload.
 */
export async function extractRequirementNodeMath(original:string,rendered:string,db:object,parserSource:string){
 const snapshot=captureRequirementNodeState(db,parserSource);
 const math=await extractRequirementMath(original,undefined,rendered);
 if(math.labels.parserSource!==parserSource)throw new MathPolicyError('E_MATH_INVALID','Requirement source differs from completed native parser input');
 return {math,...reconcileRequirementRows(math.labels,math.records,snapshot)};
}
