import {MathPolicyError,reserveMathOccurrences,type MathResourceCost} from '../math/policy.ts';
import type {validateERAuthoredMath} from './er-authored-math.ts';
import type {ERFieldOwner} from './er-owners.ts';
import type {ERDisplayPath} from './er-text.ts';
type PlannedCopy=Readonly<{key:string;path:ERDisplayPath;fieldOwner:ERFieldOwner;lifetime?:'measurement'|'retained'}>;
/** Extend a validated authored/display ledger with layout-planned copies. One
 * existing maximum charge credits the componentwise maximum physical cost for
 * each local source occurrence. Remaining physical costs are order independent. Temporary
 * work counts, but is distinguished from retained source-binding occurrences.
 * Inputs must be reconciled plans, not caller-supplied transport authority. */
export function reserveERPlannedMath(math:ReturnType<typeof validateERAuthoredMath>,copies:readonly PlannedCopy[]){
 let total=reserveMathOccurrences(math.total,{svgBytes:0,elementCount:0},0),retainedOccurrences=0,temporaryOccurrences=0;
 const keys=new Set<string>(),used=new Map<number,Map<string,MathResourceCost>>();
 for(const copy of copies){
  if(keys.has(copy.key))throw new MathPolicyError('E_MATH_INVALID','ER duplicate planned label copy');keys.add(copy.key);
  if(copy.lifetime!==undefined&&copy.lifetime!=='measurement'&&copy.lifetime!=='retained')throw new MathPolicyError('E_MATH_INVALID','ER invalid copy lifetime');
  const owner=copy.fieldOwner;
  if(owner.kind==='empty'||owner.kind==='joinedKeys')continue; // Native key enums cannot contain math.
  if(owner.kind!=='record')throw new MathPolicyError('E_MATH_INVALID','ER invalid copy owner');
  const record=math.records[owner.recordIndex];
  if(!record||record.recordIndex!==owner.recordIndex)throw new MathPolicyError('E_MATH_INVALID','ER missing copy record');
  const display=record.math.displays.find(display=>display.normalization.path===copy.path);
  if(!display)throw new MathPolicyError('E_MATH_INVALID','ER unvalidated copy path');
  const charged=new Set(record.math.charges.map(charge=>charge.key));
  const consumed=used.get(record.budgetRoot)??new Map<string,MathResourceCost>();used.set(record.budgetRoot,consumed);
  for(const occurrence of display.variant.occurrences){
   if(!charged.has(occurrence.key))throw new MathPolicyError('E_MATH_INVALID','ER missing occurrence charge');
   const prior=consumed.get(occurrence.key),cost=occurrence.cost;
   // Increment (sum - maximum) without reserving an overlarge intermediate.
   // The prepaid authored ledger covers both components of this maximum.
   if(prior)total=reserveMathOccurrences(total,{svgBytes:Math.min(prior.svgBytes,cost.svgBytes),elementCount:Math.min(prior.elementCount,cost.elementCount)},1);
   consumed.set(occurrence.key,{svgBytes:Math.max(prior?.svgBytes??0,cost.svgBytes),elementCount:Math.max(prior?.elementCount??0,cost.elementCount)});
   if(copy.lifetime==='measurement')temporaryOccurrences++;else retainedOccurrences++;
  }
 }
 return Object.freeze({total:Object.freeze(total),retainedOccurrences,temporaryOccurrences});
}
