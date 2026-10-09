import {EMPTY_MATH_RESOURCE_TOTAL,MathPolicyError,reserveMathOccurrences,type MathResourceTotal} from '../math/policy.ts';
import {ProvenanceText} from './source-provenance.ts';
import {traceMermaidHtmlPass} from './html-provenance.ts';
import {sequenceMathTextReplacements} from './sequence-text.ts';
import {requirementRowPrefix,requirementMathText} from './requirement-text.ts';
import {validateMermaidMathLabel} from './math.ts';
import type {RequirementLabelRole} from './requirement-labels.ts';
export type RequirementSanitation=readonly [string,string];
export const requirementIsCommon=(role:RequirementLabelRole)=>role==='accTitle'||role==='accDescr';
export function mapRequirementMathInput(value:ProvenanceText):ProvenanceText{
 const breaks=value.replaceRegex(/<\/?br\s*\/?>/gi,()=> '\n'),chunks:ProvenanceText[]=[];let cursor=0;
 for(const edit of sequenceMathTextReplacements(breaks.text)){
  const span=breaks.slice(edit.start,edit.end);chunks.push(breaks.slice(cursor,edit.start),span.replace(0,span.length,edit.text));cursor=edit.end;
 }
 const result=breaks.slice(0,0).concatAll([...chunks,breaks.slice(cursor,breaks.length)]);
 if(result.text!==requirementMathText(value.text))throw new MathPolicyError('E_MATH_INVALID','Requirement text normalization differs');
 return result;
}
export function requirementRowInputs(value:ProvenanceText,role:RequirementLabelRole){
 const row=value.synthetic(requirementRowPrefix(role)).concat(value);
 const decoded=requirementIsCommon(role)?value:row.replaceRegex(/ﬂ°°/g,()=> '&#').replaceRegex(/ﬂ°/g,()=> '&').replaceRegex(/¶ß/g,()=> ';');
 return {row,decoded};
}
/** Sanitation outputs are witnesses from the worker's native-compatible private
 * purifier. This pure tracer establishes provenance, not DOMPurify authenticity.
 */
export function normalizeRequirementRecord(value:ProvenanceText,role:RequirementLabelRole,sanitation:RequirementSanitation){
 const {row,decoded}=requirementRowInputs(value,role);
 let sanitized=decoded;
 for(const output of sanitation){
  if(typeof output!=='string'||(!sanitized.text.includes('<')&&output!==sanitized.text))throw new MathPolicyError('E_MATH_INVALID','Requirement sanitation fast path differs');
  sanitized=traceMermaidHtmlPass(sanitized,output);
 }
 let db=requirementIsCommon(role)?sanitized:value;
 if(role==='accTitle')db=db.slice(db.length-db.text.trimStart().length,db.length);
 if(role==='accDescr')db=db.replaceRegex(/\n\s+/g,()=> '\n');
 const nativeInput=requirementIsCommon(role)?db:sanitized,mappedInput=mapRequirementMathInput(nativeInput);
 return {db,nativeInput,mappedInput,inputs:[mapRequirementMathInput(row),mapRequirementMathInput(decoded),mappedInput] as const};
}
/** Budget identity is rooted locally in semanticValue, never supplied original
 * source origins. Separate records and positions cannot be forged into one.
 */
export function validateRequirementRecord(semanticValue:string,role:RequirementLabelRole,sanitation:RequirementSanitation){
 const normalized=normalizeRequirementRecord(ProvenanceText.identity(semanticValue),role,sanitation);
 const charges=new Map<string,{svgBytes:number;elementCount:number}>();
 const variants=normalized.inputs.map((input,variantIndex)=>{
  const checked=validateMermaidMathLabel(input.text);
  for(const part of checked.parts)if(part.kind==='math'){
   const location=input.mapRange(part.start,part.end);
   const key=location.synthetic||!location.intervals.length?`synthetic:${variantIndex}:${part.start}`:JSON.stringify(location.intervals);
   const prior=charges.get(key);charges.set(key,{svgBytes:Math.max(prior?.svgBytes??0,part.mathmlBytes),elementCount:Math.max(prior?.elementCount??0,part.elementCount)});
  }
  return checked.parts;
 });
 let cost:MathResourceTotal=EMPTY_MATH_RESOURCE_TOTAL;
 for(const charge of charges.values())cost=reserveMathOccurrences(cost,charge,1);
 return {...normalized,variants,cost,charges:[...charges.values()]};
}
