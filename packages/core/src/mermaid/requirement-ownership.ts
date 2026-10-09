import {requirementRowPrefix} from './requirement-text.ts';
import {MathPolicyError} from '../math/policy.ts';
import {reconcileRequirementDb,type RequirementDbSnapshot,type RequirementEffect} from './requirement-db.ts';
import type {RequirementLabels,RequirementLabelRecord,RequirementLabelRole} from './requirement-labels.ts';

export type RequirementOwnershipInput=Pick<RequirementLabels,'effects'>&{records:readonly Pick<RequirementLabelRecord,'recordIndex'|'role'|'declarationIndex'|'effectIndex'|'semanticValue'>[]};
export type RequirementDbRecord=Readonly<{recordIndex:number;role:RequirementLabelRole;dbValue:string}>;
export type RequirementOwnedSlot=Readonly<{key:string;recordIndex:number;kind:'requirement'|'element';nodeIndex:number;nodeName:string;role:RequirementLabelRole;prefix:string}>;
function invalid(message:string):never{throw new MathPolicyError('E_MATH_INVALID',`Requirement row ownership: ${message}`);}
const bodyRoles:Partial<Record<RequirementEffect['method'],RequirementLabelRole>>={setNewReqId:'requirement.id',setNewReqText:'requirement.text',setNewReqRisk:'requirement.risk',setNewReqVerifyMethod:'requirement.verifyMethod',setNewElementType:'element.type',setNewElementDocRef:'element.docRef'};
type Owners=Map<RequirementLabelRole,number>;

/** Trusted collector and normalized records only, before native getData().
 * Preserve native first declarations and reverse body setter order; charge all
 * authored occurrences separately before selecting these visible row owners.
 * Cross-map names remain distinct here; safe DOM/relationship namespaces are a
 * later renderer integration obligation, not established by these slot keys.
 */
export function reconcileRequirementRows(labels:RequirementOwnershipInput,records:readonly RequirementDbRecord[],native:RequirementDbSnapshot):{snapshot:RequirementDbSnapshot;effects:readonly RequirementEffect[];slots:readonly RequirementOwnedSlot[]}{
 if(records.length!==labels.records.length)invalid('record coverage differs');
 records.forEach((record,index)=>{
  const authored=labels.records[index]!;
  if(record.recordIndex!==index+1||authored.recordIndex!==record.recordIndex||record.role!==authored.role||typeof record.dbValue!=='string')invalid('record order or role differs');
  if(record.role!=='accTitle'&&record.role!=='accDescr'&&record.dbValue!==authored.semanticValue)invalid('literal body DB value changed');
 });
 const requirements=new Map<string,Owners>(),elements=new Map<string,Owners>();
 let pendingRequirement:Owners=new Map(),pendingElement:Owners=new Map();
 const seen=new Set<number>(),effects:RequirementEffect[]=[];
 for(const [effectIndex,entry] of labels.effects.entries()){
  const {effect,recordIndex}=entry;
  const authored=recordIndex===undefined?undefined:labels.records[recordIndex-1];
  if(recordIndex!==undefined&&(!authored||authored.recordIndex!==recordIndex||authored.effectIndex!==effectIndex||seen.has(recordIndex)))invalid('effect record reference differs');
  if(recordIndex!==undefined)seen.add(recordIndex);
  const expectedRole=bodyRoles[effect.method]??(effect.method==='addRequirement'?'requirement.name':effect.method==='addElement'?'element.name':effect.method==='setAccTitle'?'accTitle':effect.method==='setAccDescription'?'accDescr':undefined);
  if(expectedRole!==authored?.role)invalid('effect role coverage differs');
  if(authored&&effect.args[0]!==authored.semanticValue)invalid('effect value differs from authored record');
  if(effect.method==='setAccTitle'||effect.method==='setAccDescription'){
   effects.push({method:effect.method,args:[records[recordIndex!-1]!.dbValue]});continue;
  }
  effects.push(structuredClone(effect));
  if(bodyRoles[effect.method]){
   const owners=authored!.role.startsWith('requirement.')?pendingRequirement:pendingElement;
   owners.set(authored!.role,recordIndex!);
  }else if(effect.method==='addRequirement'||effect.method==='addElement'){
   const kind=effect.method==='addRequirement'?'requirement':'element',owners=kind==='requirement'?pendingRequirement:pendingElement;
   if(authored!.declarationIndex===undefined)invalid('declaration index missing');
   for(const index of owners.values())if(labels.records[index-1]!.declarationIndex!==authored!.declarationIndex)invalid('body belongs to another declaration');
   owners.set(authored!.role,recordIndex!);
   const table=kind==='requirement'?requirements:elements;
   if(!table.has(effect.args[0]))table.set(effect.args[0],owners);
   if(kind==='requirement')pendingRequirement=new Map();else pendingElement=new Map();
  }else if(effect.method==='clear')invalid('collector unexpectedly cleared state');
 }
 if(seen.size!==records.length||pendingRequirement.size||pendingElement.size)invalid('unowned authored fields');
 const snapshot=reconcileRequirementDb(effects,native),slots:RequirementOwnedSlot[]=[];
 const append=(kind:'requirement'|'element',nodes:RequirementDbSnapshot['requirements']|RequirementDbSnapshot['elements'],table:Map<string,Owners>)=>{
  nodes.forEach(([nodeName,node],nodeIndex)=>{
   const owners=table.get(nodeName);if(!owners)invalid('native node has no declaration');
   const rows:Array<[RequirementLabelRole,string]> = kind==='requirement'
    ? [['requirement.name',node.name],['requirement.id','requirementId' in node?node.requirementId:''],['requirement.text','text' in node?node.text:''],['requirement.risk','risk' in node?node.risk:''],['requirement.verifyMethod','verifyMethod' in node?node.verifyMethod:'']]
    : [['element.name',node.name],['element.type',node.type],['element.docRef','docRef' in node?node.docRef:'']];
   for(const [role,value] of rows){
    const recordIndex=owners.get(role);
    if(recordIndex!==undefined&&records[recordIndex-1]!.dbValue!==value)invalid('row value differs from owner');
    if(!value)continue;
    if(recordIndex===undefined)invalid('visible native row has no owner');
    slots.push(Object.freeze({key:`${kind}:${nodeIndex}:${role.split('.')[1]}`,recordIndex,kind,nodeIndex,nodeName,role,prefix:requirementRowPrefix(role)}));
   }
  });
 };
 append('requirement',snapshot.requirements,requirements);append('element',snapshot.elements,elements);
 return {snapshot,effects:Object.freeze(effects),slots:Object.freeze(slots)};
}
