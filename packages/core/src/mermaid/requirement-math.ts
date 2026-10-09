import {EMPTY_MATH_RESOURCE_TOTAL,MathPolicyError,reserveMathOccurrences,type MathResourceTotal} from '../math/policy.ts';
import {extractRequirementLabels,type RequirementLabelRecord,type RequirementLabels} from './requirement-labels.ts';
import {normalizeMermaidSource} from './rules.ts';
import {prepareSequenceSanitizer,sanitizeMermaidHtmlPass} from './sequence-sanitize.ts';
import {MermaidSourceCoordinates,type LocatedSourceInterval} from './source-coordinates.ts';
import type {ProvenanceText} from './source-provenance.ts';
import {type MermaidMathExpression,type MermaidMathText} from './math.ts';
import {requirementRowInputs,normalizeRequirementRecord,validateRequirementRecord,type RequirementSanitation} from './requirement-normalize.ts';
export {mapRequirementMathInput} from './requirement-normalize.ts';
export type RequirementMathExpression=MermaidMathExpression&{origins:readonly LocatedSourceInterval[];synthetic:boolean};
export type RequirementMathVariant=Readonly<{input:ProvenanceText;parts:readonly (MermaidMathText|RequirementMathExpression)[]}>;
export type RequirementMathRecord=Readonly<{recordIndex:number;role:RequirementLabelRecord['role'];dbValue:string;sanitation:RequirementSanitation;nativeInput:ProvenanceText;mappedInput:ProvenanceText;renderedValue:string;parts:readonly (MermaidMathText|RequirementMathExpression)[];variants:readonly RequirementMathVariant[];cost:MathResourceTotal}>;
export type RequirementMath=Readonly<{labels:RequirementLabels;records:readonly RequirementMathRecord[];total:MathResourceTotal}>;
export class LocatedRequirementMathError extends MathPolicyError{
 readonly recordIndex:number;readonly intervals:readonly LocatedSourceInterval[];readonly synthetic:boolean;
 readonly startLine:number|undefined;readonly startByte:number|undefined;readonly endByte:number|undefined;
 constructor(error:MathPolicyError,record:RequirementLabelRecord){
  super(error.code,`Requirement ${record.role} record ${record.recordIndex}: ${error.message}`);this.name='LocatedRequirementMathError';this.recordIndex=record.recordIndex;
  this.intervals=record.intervals;this.synthetic=record.synthetic;this.startLine=record.intervals[0]?.startLine;this.startByte=record.intervals[0]?.startByte;this.endByte=record.intervals[0]?.endByte;
 }
}
/** Validate every authored occurrence before sanitation can erase it, then
 * validate the exact proposed prelayout-hook input. Public math stays guarded
 * until that hook, native reconciliation and source binding are integrated.
 */
export async function extractRequirementMath(original:string,initial:MathResourceTotal=EMPTY_MATH_RESOURCE_TOTAL,rendered=normalizeMermaidSource(original)):Promise<RequirementMath>{
 const labels=await extractRequirementLabels(original,rendered),coordinates=new MermaidSourceCoordinates(original);
 if(labels.records.some(record=>record.semanticValue.includes('<')))await prepareSequenceSanitizer();
 const records:RequirementMathRecord[]=[];let total=initial;
 // Check caller totals even for a diagram without authored fields.
 reserveMathOccurrences(total,{svgBytes:0,elementCount:0},0);
 for(const record of labels.records)try{
  const {decoded}=requirementRowInputs(record.mappedValue,record.role);
  const first=decoded.text.includes('<')?sanitizeMermaidHtmlPass(decoded.text):decoded.text;
  const second=first.includes('<')?sanitizeMermaidHtmlPass(first,{FORBID_TAGS:['style']}):first;
  const sanitation:RequirementSanitation=Object.freeze([first,second]);
  const checked=validateRequirementRecord(record.semanticValue,record.role,sanitation);
  const normalized=normalizeRequirementRecord(record.mappedValue,record.role,sanitation);
  const variants=normalized.inputs.map((input,index)=>{
   if(input.text!==checked.inputs[index]!.text)throw new MathPolicyError('E_MATH_INVALID','Requirement local/source normalization differs');
   const parts=checked.variants[index]!.map(part=>{
    if(part.kind==='text')return part;
    const location=coordinates.locateRange(input,part.start,part.end);
    return {...part,origins:Object.freeze(location.intervals),synthetic:location.synthetic};
   });
   return Object.freeze({input,parts:Object.freeze(parts)});
  });
  for(const charge of checked.charges)total=reserveMathOccurrences(total,charge,1);
  const {db,nativeInput,mappedInput}=normalized,canonical=variants[variants.length-1]!;
  records.push(Object.freeze({recordIndex:record.recordIndex,role:record.role,dbValue:db.text,sanitation,nativeInput,mappedInput,renderedValue:mappedInput.text,parts:canonical.parts,variants:Object.freeze(variants),cost:checked.cost}));
 }catch(error){if(error instanceof MathPolicyError)throw new LocatedRequirementMathError(error,record);throw error;}
 return Object.freeze({labels,records:Object.freeze(records),total});
}
