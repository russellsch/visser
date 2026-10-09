import {EMPTY_MATH_RESOURCE_TOTAL,MathPolicyError,type MathResourceTotal} from '../math/policy.ts';
import {validateERAuthoredMath,LocatedERMathError} from './er-authored-math.ts';
import {normalizeERDisplayField,type ERDisplayNormalization} from './er-display-normalize.ts';
import type {ERDisplayPath} from './er-text.ts';
import type {ERLabels} from './er-labels.ts';
import type {ERNormalizedDbEffects} from './er-db-effects.ts';
import type {projectEROwners,ERFieldOwner} from './er-owners.ts';
import {materializeERField} from './er-field.ts';

export type ERDisplayBinding=Readonly<{
 ownerKind:'entity-header'|'attribute'|'relationship'|'group';ownerIndex:number;
 rowIndex?:number;field?:'type'|'name'|'keys'|'comment';recordIndex:number;path:ERDisplayPath;
}>;
/** Effective owner candidates, not final layout copies. Group routes remain
 * alternatives until layout chooses; native measurement can use group-node. */
export async function prepareERDisplayMath(original:string,labels:ERLabels,normalized:ERNormalizedDbEffects,owners:ReturnType<typeof projectEROwners>,htmlLabels:boolean,initial:MathResourceTotal=EMPTY_MATH_RESOURCE_TOTAL){
 if(typeof htmlLabels!=='boolean')throw new MathPolicyError('E_MATH_INVALID','ER display mode is invalid');
 const db=new Map(normalized.fields.map(field=>[field.recordIndex,field.normalization]));
 const requested=new Map<number,Set<ERDisplayPath>>(),bindings:ERDisplayBinding[]=[];
 const add=(owner:ERFieldOwner,binding:Omit<ERDisplayBinding,'recordIndex'>)=>{
  if(owner.kind!=='record'){
   const field=materializeERField(labels,owner);
   // Only native enum keys and missing fields lack one scalar owner. Neither
   // can manufacture a math occurrence at their synthetic join boundary.
   if(field.text.includes('$$'))throw new MathPolicyError('E_MATH_INVALID','ER generated field unexpectedly contains math');
   return;
  }
  const index=owner.recordIndex;
  if(!labels.records[index]||labels.records[index]!.recordIndex!==index)throw new MathPolicyError('E_MATH_INVALID','ER display owner differs');
  const paths=requested.get(index)??new Set<ERDisplayPath>();paths.add(binding.path);requested.set(index,paths);
  bindings.push(Object.freeze({...binding,recordIndex:index}));
 };
 for(const entity of owners.entities)if(!entity.suppressedByGroup){
  add(entity.header,{ownerKind:'entity-header',ownerIndex:entity.entityIndex,path:entity.headerPath==='simple'?'simple-header':'table'});
  for(const row of entity.rows)for(const field of ['type','name','keys','comment'] as const)add(row[field],{ownerKind:'attribute',ownerIndex:entity.entityIndex,rowIndex:row.rowIndex,field,path:'table'});
 }
 for(const relationship of owners.relationships)add({kind:'record',recordIndex:relationship.roleRecord},{ownerKind:'relationship',ownerIndex:relationship.relationshipIndex,path:'edge'});
 for(const group of owners.groups)for(const path of ['group-cluster','group-node'] as const)add({kind:'record',recordIndex:group.titleRecord},{ownerKind:'group',ownerIndex:group.groupIndex,path});
 const displays=new Map<number,readonly ERDisplayNormalization[]>();
 for(const [index,paths]of requested){
  const record=labels.records[index]!,normalization=db.get(index);
  try{
   if(normalization&&normalization.witness.htmlLabels!==htmlLabels)throw new MathPolicyError('E_MATH_INVALID','ER display/DB label mode differs');
   const input=normalization?.dbValue??record.mappedValue,values:ERDisplayNormalization[]=[];
   for(const path of paths)values.push(await normalizeERDisplayField(input,path,htmlLabels));
   displays.set(index,Object.freeze(values));
  }catch(error){if(error instanceof MathPolicyError)throw new LocatedERMathError(error,record);throw error;}
 }
 const math=validateERAuthoredMath(original,labels,normalized,initial,displays);
 return Object.freeze({...math,bindings:Object.freeze(bindings)});
}
