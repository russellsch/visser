import {EMPTY_MATH_RESOURCE_TOTAL,MathPolicyError,reserveMathOccurrences,type MathResourceTotal} from '../math/policy.ts';
import {extractInfoLabels,type InfoLabelRecord,type InfoLabels} from './info-labels.ts';
import {validateMermaidMathLabel,type MermaidMathExpression,type MermaidMathText} from './math.ts';
import {normalizeMermaidSource} from './rules.ts';
import {MermaidSourceCoordinates,type LocatedSourceInterval} from './source-coordinates.ts';

export type InfoMathExpression=MermaidMathExpression&{origins:readonly LocatedSourceInterval[];synthetic:boolean};
export type InfoMathRecord=Readonly<{recordIndex:number;role:InfoLabelRecord['role'];active:boolean;parts:readonly (MermaidMathText|InfoMathExpression)[];cost:MathResourceTotal}>;
export type InfoMath=Readonly<{labels:InfoLabels;records:readonly InfoMathRecord[];total:MathResourceTotal}>;
export class LocatedInfoMathError extends MathPolicyError{
 readonly recordIndex:number;readonly role:InfoLabelRecord['role'];readonly intervals:readonly LocatedSourceInterval[];readonly synthetic:boolean;readonly startLine:number|undefined;readonly startByte:number|undefined;readonly endByte:number|undefined;
 constructor(error:MathPolicyError,record:InfoLabelRecord){super(error.code,`Info ${record.role} record ${record.recordIndex}: ${error.message}`);this.name='LocatedInfoMathError';this.recordIndex=record.recordIndex;this.role=record.role;this.intervals=record.intervals;this.synthetic=record.synthetic;this.startLine=record.intervals[0]?.startLine;this.startByte=record.intervals[0]?.startByte;this.endByte=record.intervals[0]?.endByte;}
}
/** Validate every parsed Info assignment, including overwritten declarations. */
export async function extractInfoMath(original:string,initial:MathResourceTotal=EMPTY_MATH_RESOURCE_TOTAL,rendered=normalizeMermaidSource(original)):Promise<InfoMath>{
 const labels=await extractInfoLabels(original,rendered),coordinates=new MermaidSourceCoordinates(original);let total=initial;
 reserveMathOccurrences(total,{svgBytes:0,elementCount:0},0);
 const records:InfoMathRecord[]=[];
 for(const record of labels.records)try{
  const previous=total,checked=validateMermaidMathLabel(record.semanticValue,total);total=checked.total;
  const parts=checked.parts.map(part=>part.kind==='text'?part:(()=>{const located=coordinates.locateRange(record.mappedValue,part.start,part.end);return {...part,origins:Object.freeze(located.intervals),synthetic:located.synthetic};})());
  records.push(Object.freeze({recordIndex:record.recordIndex,role:record.role,active:record.active,parts:Object.freeze(parts),cost:Object.freeze({svgBytes:total.svgBytes-previous.svgBytes,elementCount:total.elementCount-previous.elementCount,occurrences:total.occurrences-previous.occurrences})}));
 }catch(error){if(error instanceof MathPolicyError)throw new LocatedInfoMathError(error,record);throw error;}
 return Object.freeze({labels,records:Object.freeze(records),total});
}
