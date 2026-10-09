import {isDeepStrictEqual} from 'node:util';
import {EMPTY_MATH_RESOURCE_TOTAL,MathPolicyError,reserveMathOccurrences,type MathResourceTotal} from '../math/policy.ts';
import type {RequirementMath,RequirementMathRecord} from './requirement-math.ts';
import type {RequirementDbSnapshot,RequirementEffect} from './requirement-db.ts';
import {reconcileRequirementRows,type RequirementOwnedSlot,type RequirementOwnershipInput} from './requirement-ownership.ts';
import {validateRequirementRecord} from './requirement-normalize.ts';
import type {RequirementAuthoredEffect} from './requirement-labels.ts';
export type RequirementTransportRecord=Pick<RequirementMathRecord,'recordIndex'|'role'|'dbValue'|'sanitation'|'renderedValue'|'parts'|'cost'>&RequirementOwnershipInput['records'][number]&{
 nativeInput:string;variants:readonly {input:string;parts:RequirementMathRecord['parts']}[];
};
export type RequirementRenderMath=Readonly<{version:1;records:readonly RequirementTransportRecord[];effects:readonly RequirementAuthoredEffect[];snapshot:RequirementDbSnapshot;slots:readonly RequirementOwnedSlot[];total:MathResourceTotal}>;
const roles=['accTitle','accDescr','requirement.name','requirement.id','requirement.text','requirement.risk','requirement.verifyMethod','element.name','element.type','element.docRef'];
function invalid(message:string):never{throw new MathPolicyError('E_MATH_INVALID',`Requirement transport: ${message}`);}
function object(value:unknown,required:readonly string[],optional:readonly string[]=[]):void{
 if(!value||typeof value!=='object'||Array.isArray(value)||required.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>!required.includes(key)&&!optional.includes(key)))invalid('object fields differ');
}
function integer(value:unknown,min=0):asserts value is number{if(!Number.isSafeInteger(value)||Number(value)<min)invalid('invalid integer');}
function effectShape(entry:RequirementAuthoredEffect){
 object(entry,['effect'],['recordIndex']);if(entry.recordIndex!==undefined)integer(entry.recordIndex,1);
 object(entry.effect,['method','args']);const {method,args}=entry.effect;if(!Array.isArray(args))invalid('invalid effect arguments');
 if(['setCssStyle','setClass','defineClass'].includes(method)){
  if(args.length!==2||!args.every(value=>Array.isArray(value)&&value.every(item=>typeof item==='string')))invalid('invalid style effect');return;
 }
 const arity:Partial<Record<RequirementEffect['method'],number>>={setDirection:1,setAccTitle:1,setAccDescription:1,setNewReqId:1,setNewReqText:1,setNewReqRisk:1,setNewReqVerifyMethod:1,setNewElementType:1,setNewElementDocRef:1,addElement:1,addRequirement:2,addRelationship:3};
 if(!Object.hasOwn(arity,method)||args.length!==arity[method]||!args.every(value=>typeof value==='string'))invalid('invalid scalar effect');
 const domains:Partial<Record<RequirementEffect['method'],readonly [number,readonly string[]]>>={
  addRequirement:[1,['Requirement','Functional Requirement','Interface Requirement','Performance Requirement','Physical Requirement','Design Constraint']],
  addRelationship:[0,['contains','copies','derives','satisfies','verifies','refines','traces']],
  setDirection:[0,['TB','BT','RL','LR']],setNewReqRisk:[0,['Low','Medium','High']],
  setNewReqVerifyMethod:[0,['Analysis','Demonstration','Inspection','Test']],
 };
 const domain=domains[method];if(domain){const value=args[domain[0]];if(typeof value!=='string'||!domain[1].includes(value))invalid('effect enum differs from native grammar');}
}
function semanticParts(parts:RequirementMathRecord['parts']){
 if(!Array.isArray(parts))invalid('formula parts missing');
 return parts.map(part=>{
  if(!part||typeof part!=='object')invalid('formula part is not an object');
  if(part.kind==='text'){object(part,['kind','source','start','end']);return part;}
  object(part,['kind','source','tex','start','end','mathmlBytes','elementCount','origins','synthetic']);
  if(part.kind!=='math'||typeof part.synthetic!=='boolean'||!Array.isArray(part.origins))invalid('formula origin shape differs');
  for(const origin of part.origins){
   object(origin,['sourceStart','sourceEnd','startByte','endByte','startLine','endLine','rawSource']);
   for(const name of ['sourceStart','sourceEnd','startByte','endByte']as const)integer(origin[name]);
   integer(origin.startLine,1);integer(origin.endLine,1);
   if(typeof origin.rawSource!=='string'||origin.sourceEnd-origin.sourceStart!==origin.rawSource.length||origin.endByte-origin.startByte!==new TextEncoder().encode(origin.rawSource).length||origin.endLine<origin.startLine)invalid('source interval shape differs');
  }
  const {origins:_,synthetic:__,...semantic}=part;return semantic;
 });
}

export function requirementMathTransport(math:RequirementMath,snapshot:RequirementDbSnapshot,slots:readonly RequirementOwnedSlot[]):RequirementRenderMath{
 const result:RequirementRenderMath={version:1,snapshot:structuredClone(snapshot),slots:structuredClone(slots),effects:structuredClone(math.labels.effects),total:{...math.total},records:math.records.map((record,index)=>{
  const authored=math.labels.records[index]!;
  return {recordIndex:record.recordIndex,role:record.role,effectIndex:authored.effectIndex,semanticValue:authored.semanticValue,...(authored.declarationIndex===undefined?{}:{declarationIndex:authored.declarationIndex}),dbValue:record.dbValue,sanitation:[...record.sanitation],nativeInput:record.nativeInput.text,renderedValue:record.renderedValue,parts:structuredClone(record.parts),cost:{...record.cost},variants:record.variants.map(variant=>({input:variant.input.text,parts:structuredClone(variant.parts)}))};
 })};
 reserveRequirementTransportMath(result);return result;
}

/** Synchronous JSON consistency/charging. Local provenance, not transported
 * original origins, defines budget identities. Sanitation witnesses retain the
 * worker's purifier trust boundary; original source binding is a separate gate.
 */
export function reserveRequirementTransportMath(math:RequirementRenderMath,initial:MathResourceTotal=EMPTY_MATH_RESOURCE_TOTAL):MathResourceTotal{
 object(math,['version','records','effects','snapshot','slots','total']);
 if(math.version!==1||!Array.isArray(math.records)||!Array.isArray(math.effects)||!Array.isArray(math.slots))invalid('unknown version or collections');
 let own=EMPTY_MATH_RESOURCE_TOTAL,total=initial;reserveMathOccurrences(total,{svgBytes:0,elementCount:0},0);
 math.effects.forEach(effectShape);
 for(const [index,record]of math.records.entries()){
  object(record,['recordIndex','role','effectIndex','semanticValue','dbValue','sanitation','nativeInput','renderedValue','parts','cost','variants'],['declarationIndex']);
  if(record.recordIndex!==index+1||!roles.includes(record.role))invalid('record identity differs');integer(record.effectIndex);
  if(record.role.includes('.'))integer(record.declarationIndex);else if(record.declarationIndex!==undefined)invalid('metadata has declaration index');
  if(typeof record.semanticValue!=='string'||typeof record.dbValue!=='string'||typeof record.nativeInput!=='string'||typeof record.renderedValue!=='string'||!Array.isArray(record.sanitation)||record.sanitation.length!==2||!record.sanitation.every((value:unknown)=>typeof value==='string'))invalid('record text or sanitation differs');
  const checked=validateRequirementRecord(record.semanticValue,record.role,record.sanitation);
  if(record.dbValue!==checked.db.text||record.nativeInput!==checked.nativeInput.text||record.renderedValue!==checked.mappedInput.text)invalid('normalization differs');
  if(!Array.isArray(record.variants)||record.variants.length!==3)invalid('variant coverage differs');
  record.variants.forEach((variant:RequirementTransportRecord['variants'][number],variantIndex:number)=>{
   object(variant,['input','parts']);
   if(variant.input!==checked.inputs[variantIndex]!.text||!isDeepStrictEqual(semanticParts(variant.parts),checked.variants[variantIndex]))invalid('variant formulas differ');
  });
  if(!isDeepStrictEqual(record.parts,record.variants[2]!.parts)||!isDeepStrictEqual(semanticParts(record.parts),checked.variants[2])||!isDeepStrictEqual(record.cost,checked.cost))invalid('canonical formulas or cost differ');
  for(const charge of checked.charges){own=reserveMathOccurrences(own,charge,1);total=reserveMathOccurrences(total,charge,1);}
 }
 if(!isDeepStrictEqual(math.total,own))invalid('authored total differs');
 const plan=reconcileRequirementRows({records:math.records,effects:math.effects},math.records,math.snapshot);
 if(!isDeepStrictEqual(plan.slots,math.slots))invalid('visible row ownership differs');
 return total;
}
