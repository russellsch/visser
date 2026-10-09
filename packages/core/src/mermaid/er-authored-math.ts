import {EMPTY_MATH_RESOURCE_TOTAL,MathPolicyError,reserveMathOccurrences,type MathResourceCost,type MathResourceTotal} from '../math/policy.ts';
import {ProvenanceText} from './source-provenance.ts';
import {MermaidSourceCoordinates,type LocatedSourceInterval} from './source-coordinates.ts';
import {validateMermaidMathLabel,type MermaidMathExpression,type MermaidMathText} from './math.ts';
import {mapERMathInput,traceERDisplayField,type ERDisplayNormalization} from './er-display-normalize.ts';
import {traceERDbNormalization,type ERDbNormalization} from './er-db-normalize.ts';
import type {ERLabels,ERLabelRecord} from './er-labels.ts';
import type {ERNormalizedDbEffects} from './er-db-effects.ts';

export type ERAuthoredMathVariant=Readonly<{input:ProvenanceText;parts:readonly (MermaidMathText|MermaidMathExpression)[];occurrences:readonly Readonly<{partIndex:number;key:string;cost:MathResourceCost}>[]}>;
export type ERAuthoredMathCharge=Readonly<{key:string;cost:MathResourceCost}>;
export type ERAuthoredFieldMath=Readonly<{
 variants:readonly ERAuthoredMathVariant[];canonical:ERAuthoredMathVariant;
 charges:readonly ERAuthoredMathCharge[];cost:MathResourceTotal;
 displays:readonly Readonly<{normalization:ERDisplayNormalization;variant:ERAuthoredMathVariant}>[];
}>;
const invalid=(message:string):never=>{throw new MathPolicyError('E_MATH_INVALID',`ER authored math: ${message}`);};

function inputs(value:ProvenanceText,db?:ERDbNormalization,displays:readonly ERDisplayNormalization[]=[]){
 let base=value;
 // These are independent semantic check views, never inputs to later sanitation.
 const result=[mapERMathInput(value,'edge')];
 if(db){
  const replay=traceERDbNormalization(value,db.role,db.witness);
  if(replay.sanitation.text!==db.sanitation.text||replay.dbValue.text!==db.dbValue.text)invalid('DB normalization differs');
  result.push(mapERMathInput(replay.sanitation,'group-cluster'),mapERMathInput(replay.dbValue,'group-cluster'));
  base=replay.dbValue;
 }
 const paths=new Set<string>(),normalizations:ERDisplayNormalization[]=[],displayIndices:number[]=[];
 for(const display of displays){
  if(paths.has(display.path))invalid('duplicate display path');
  paths.add(display.path);
  if(db&&display.htmlLabels!==db.witness.htmlLabels)invalid('display/DB label mode differs');
  const replay=traceERDisplayField(base,display.path,display.htmlLabels,display.witness);
  if(replay.nativeInput.text!==display.nativeInput.text||replay.mappedInput.text!==display.mappedInput.text)invalid('display normalization differs');
  result.push(mapERMathInput(base,db?'group-cluster':'edge'));
  displayIndices.push(result.length);result.push(replay.mappedInput);normalizations.push(replay);
 }
 return {values:result,displayIndices,normalizations};
}
/** One local root per grammar field, independent of possibly repeated original
 * source origins. Hidden/overwritten fields count once. Display candidates
 * extend this ledger; alternate paths are variants, never rendered copies. */
export function validateERAuthoredField(value:ProvenanceText,db?:ERDbNormalization,displays:readonly ERDisplayNormalization[]=[]):ERAuthoredFieldMath{
 const actual=inputs(value,db,displays),local=inputs(ProvenanceText.identity(value.text),db,displays);
 const charges=new Map<string,MathResourceCost>();
 const variants=actual.values.map((input,index)=>{
  const budgetInput=local.values[index]!;
  if(input.text!==budgetInput.text)invalid('local/source variant differs');
  const checked=validateMermaidMathLabel(input.text),occurrences:Array<{partIndex:number;key:string;cost:MathResourceCost}>=[];
  for(const [partIndex,part]of checked.parts.entries())if(part.kind==='math'){
   const origin=budgetInput.mapRange(part.start,part.end);
   const key=origin.synthetic||!origin.intervals.length?`synthetic:${index}:${part.start}`:JSON.stringify(origin.intervals);
   const prior=charges.get(key);
   occurrences.push(Object.freeze({partIndex,key,cost:Object.freeze({svgBytes:part.mathmlBytes,elementCount:part.elementCount})}));
   charges.set(key,Object.freeze({svgBytes:Math.max(prior?.svgBytes??0,part.mathmlBytes),elementCount:Math.max(prior?.elementCount??0,part.elementCount)}));
  }
  return Object.freeze({input,parts:Object.freeze(checked.parts.map(part=>Object.freeze({...part}))),occurrences:Object.freeze(occurrences)});
 });
 let cost=EMPTY_MATH_RESOURCE_TOTAL;
 const entries=[...charges].map(([key,charge])=>{cost=reserveMathOccurrences(cost,charge,1);return Object.freeze({key,cost:charge});});
 return Object.freeze({variants:Object.freeze(variants),canonical:variants[db?2:0]!,charges:Object.freeze(entries),cost:Object.freeze(cost),displays:Object.freeze(actual.normalizations.map((normalization,index)=>Object.freeze({normalization,variant:variants[actual.displayIndices[index]!]!})))});
}
export class LocatedERMathError extends MathPolicyError{
 readonly recordIndex:number;readonly role:ERLabelRecord['role'];readonly intervals:readonly LocatedSourceInterval[];readonly synthetic:boolean;
 readonly startLine:number|undefined;readonly startByte:number|undefined;readonly endByte:number|undefined;
 constructor(error:MathPolicyError,record:ERLabelRecord){
  super(error.code,`ER ${record.role} record ${record.recordIndex}: ${error.message}`);this.name='LocatedERMathError';
  this.recordIndex=record.recordIndex;this.role=record.role;this.intervals=record.intervals;this.synthetic=record.synthetic;
  this.startLine=record.intervals[0]?.startLine;this.startByte=record.intervals[0]?.startByte;this.endByte=record.intervals[0]?.endByte;
 }
}
/** Consumes complete collected/reconciled inputs; this is not a native parse
 * receipt or rendered-copy budget. Every record is visited in authored order. */
export function validateERAuthoredMath(original:string,labels:ERLabels,normalized:ERNormalizedDbEffects,initial:MathResourceTotal=EMPTY_MATH_RESOURCE_TOTAL,displays:ReadonlyMap<number,readonly ERDisplayNormalization[]>=new Map()){
 for(const index of displays.keys())if(!Number.isSafeInteger(index)||index<0||index>=labels.records.length)invalid('display record owner differs');
 const coordinates=new MermaidSourceCoordinates(original),db=new Map<number,ERDbNormalization>();
 for(const field of normalized.fields){
  const record=labels.records[field.recordIndex];
  if(!record||record.role!==field.normalization.role||db.has(field.recordIndex))invalid('DB field owner differs');
  db.set(field.recordIndex,field.normalization);
 }
 // Only the collector-established implicit header pair shares an authored
 // occurrence. Equal text or equal external origin ranges cannot establish it.
 const shared=new Map<number,number>();
 for(const effect of labels.effects)if(effect.method==='addSubGraph'&&effect.recordIndices.length===2){
  const [id,title]=effect.recordIndices as readonly [number,number];
  if(labels.records[id]?.role==='subgraph.id'&&labels.records[title]?.role==='subgraph.title'
    &&labels.records[id]!.mappedValue===labels.records[title]!.mappedValue)shared.set(title,id);
 }
 const ledgers=new Map<number,Map<string,MathResourceCost>>();
 let total=reserveMathOccurrences(initial,{svgBytes:0,elementCount:0},0);
 const records=labels.records.map((record,index)=>{
  try{
   if(record.recordIndex!==index||record.semanticValue!==record.mappedValue.text)invalid('record differs');
   coordinates.locateRange(record.mappedValue,0,record.mappedValue.length);
   if(['subgraph.title','accTitle','accDescr'].includes(record.role)&&!db.has(index))invalid('DB field normalization missing');
   const math=validateERAuthoredField(record.mappedValue,db.get(index),displays.get(index));
   const root=shared.get(index)??index,ledger=ledgers.get(root)??new Map<string,MathResourceCost>();
   for(const charge of math.charges){
    const prior=ledger.get(charge.key);
    const cost=Object.freeze({svgBytes:Math.max(prior?.svgBytes??0,charge.cost.svgBytes),elementCount:Math.max(prior?.elementCount??0,charge.cost.elementCount)});
    if(!prior)total=reserveMathOccurrences(total,cost,1);
    else total=reserveMathOccurrences({...total,svgBytes:total.svgBytes+cost.svgBytes-prior.svgBytes,elementCount:total.elementCount+cost.elementCount-prior.elementCount},{svgBytes:0,elementCount:0},0);
    ledger.set(charge.key,cost);
   }
   ledgers.set(root,ledger);
   const parts=math.canonical.parts.map(part=>{
    if(part.kind==='text')return part;
    const located=coordinates.locateRange(math.canonical.input,part.start,part.end);
    return Object.freeze({...part,origins:Object.freeze(located.intervals.map(interval=>Object.freeze(interval))),synthetic:located.synthetic});
   });
   return Object.freeze({recordIndex:index,budgetRoot:root,role:record.role,math,parts:Object.freeze(parts)});
  }catch(error){if(error instanceof MathPolicyError)throw new LocatedERMathError(error,record);throw error;}
 });
 return Object.freeze({records:Object.freeze(records),total:Object.freeze(total)});
}
