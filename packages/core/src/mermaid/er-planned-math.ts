import {EMPTY_MATH_RESOURCE_TOTAL,MathPolicyError,type MathResourceTotal} from '../math/policy.ts';
import {validateERAuthoredMath,LocatedERMathError} from './er-authored-math.ts';
import {normalizeERDisplayField,mapERMathInput,type ERDisplayNormalization} from './er-display-normalize.ts';
import {reserveERPlannedMath} from './er-copy-budget.ts';
import {mapERElkEdgeInput,type ERElkLabel} from './er-elk-labels.ts';
import type {ERPreparedLabel} from './er-dagre-labels.ts';
import type {ERLabels} from './er-labels.ts';
import type {ERNormalizedDbEffects} from './er-db-effects.ts';
import type {ERDisplayPath} from './er-text.ts';
import {materializeERField} from './er-field.ts';
import {MermaidSourceCoordinates} from './source-coordinates.ts';

export type ERPlannedLabel=ERPreparedLabel|ERElkLabel;
function invalid(message:string):never{throw new MathPolicyError('E_MATH_INVALID',`ER planned math: ${message}`);}
/** Connect a reconciled layout plan to selected display normalization, work
 * accounting and original-source locations. This is not transport authority or
 * proof that native drawing completed. Native prepared input and semantic math
 * input remain distinct, notably after ELK's early edge break conversion. */
export async function prepareERPlannedMath(
 original:string,labels:ERLabels,normalized:ERNormalizedDbEffects,copies:readonly ERPlannedLabel[],
 layout:'elk'|'dagre',htmlLabels:boolean,initial:MathResourceTotal=EMPTY_MATH_RESOURCE_TOTAL,
){
 if(layout!=='elk'&&layout!=='dagre')invalid('unsupported resolved layout');
 if(typeof htmlLabels!=='boolean')invalid('invalid label mode');
 const db=new Map(normalized.fields.map(field=>[field.recordIndex,field.normalization]));
 const requested=new Map<number,Set<ERDisplayPath>>(),keys=new Set<string>();
 // Reconstruct values from reconciled source owners. Never adopt a plan's
 // externally supplied provenance, even when its text matches.
 const prepared=copies.map(copy=>{
  if(keys.has(copy.key))invalid('duplicate copy identity');keys.add(copy.key);
  const lifetime='lifetime'in copy?copy.lifetime:'retained';
  if(lifetime!=='measurement'&&lifetime!=='retained')invalid('invalid copy lifetime');
  if(layout==='dagre'&&lifetime==='measurement')invalid('Dagre has no temporary group measurement');
  if(lifetime==='measurement'&&(copy.ownerKind!=='group'||copy.path!=='group-node'))invalid('invalid temporary label');
  const owner=copy.fieldOwner;
  let value=materializeERField(labels,owner);
  if(owner.kind==='record'){
   const normalization=db.get(owner.recordIndex);
   if(normalization){
    if(normalization.witness.htmlLabels!==htmlLabels)invalid('display/DB label mode differs');
    value=normalization.dbValue;
   }
   const paths=requested.get(owner.recordIndex)??new Set<ERDisplayPath>();paths.add(copy.path);requested.set(owner.recordIndex,paths);
  }else if(value.text.includes('$$'))invalid('generated field contains math');
  if(layout==='elk'&&copy.path==='edge')value=mapERElkEdgeInput(value);
  if(value.text!==copy.value.text)invalid('native planned input differs');
  return Object.freeze({...copy,value,lifetime});
 });
 const displays=new Map<number,readonly ERDisplayNormalization[]>();
 for(const [index,paths]of requested){
  const record=labels.records[index];if(!record||record.recordIndex!==index)invalid('missing source owner');
  try{
   const base=db.get(index)?.dbValue??record.mappedValue,values:ERDisplayNormalization[]=[];
   for(const path of paths)values.push(await normalizeERDisplayField(base,path,htmlLabels));
   displays.set(index,Object.freeze(values));
  }catch(error){if(error instanceof MathPolicyError)throw new LocatedERMathError(error,record);throw error;}
 }
 const authored=validateERAuthoredMath(original,labels,normalized,initial,displays);
 const budget=reserveERPlannedMath(authored,prepared),coordinates=new MermaidSourceCoordinates(original);
 const bound=prepared.map(copy=>{
  if(copy.fieldOwner.kind!=='record')return Object.freeze({...copy,hookInput:copy.value});
  const record=authored.records[copy.fieldOwner.recordIndex]!;
  const display=record.math.displays.find(display=>display.normalization.path===copy.path)!;
  // ELK prepares edge breaks before the text hook. Other routes enter after
  // the normalization's prescribed renderer sanitation.
  const hookInput=layout==='elk'&&copy.path==='edge'?mapERElkEdgeInput(display.normalization.nativeInput):display.normalization.nativeInput;
  if(mapERMathInput(hookInput,copy.path).text!==display.variant.input.text)invalid('prepared hook input differs');
  const parts=display.variant.parts.map(part=>{
   if(part.kind==='text')return part;
   const origin=coordinates.locateRange(display.variant.input,part.start,part.end);
   return Object.freeze({...part,origins:Object.freeze(origin.intervals.map(interval=>Object.freeze(interval))),synthetic:origin.synthetic});
  });
  return Object.freeze({...copy,hookInput,math:Object.freeze({input:display.variant.input,parts:Object.freeze(parts)})});
 });
 return Object.freeze({layout,authored,budget,copies:Object.freeze(bound)});
}
