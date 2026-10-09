import {isDeepStrictEqual} from 'node:util';
import {EMPTY_MATH_RESOURCE_TOTAL,MathPolicyError,reserveMathOccurrences,type MathResourceCost,type MathResourceTotal} from '../math/policy.ts';
import type {KanbanMathBinding,KanbanMathRecord,KanbanLocatedMath,extractKanbanMath} from './kanban-math.ts';
import type {KanbanRenderCopy} from './kanban-render-copies.ts';
import {validateMermaidMathLabel,type MermaidMathExpression,type MermaidMathText} from './math.ts';

type LocatedPart=MermaidMathText|(MermaidMathExpression&Readonly<{origins:KanbanLocatedMath['origins'];synthetic:boolean}>);
export type KanbanTransportRecord=Readonly<{
 recordIndex:number;nodeIndex:number;role:string;canonicalText:string;parts:readonly LocatedPart[];
 // One proof list per internal charge.  A single formula can attain both
 // dimensions; otherwise the two deterministic witnesses are retained.
 charges:readonly (readonly string[])[];
}>;
export type KanbanTransportBinding=KanbanMathBinding;
export type KanbanTransportDraw=KanbanRenderCopy&Readonly<{binding:KanbanTransportBinding}>;
export type KanbanRenderMath=Readonly<{version:1;records:readonly KanbanTransportRecord[];draws:readonly KanbanTransportDraw[];total:MathResourceTotal}>;

function invalid(message:string):never{throw new MathPolicyError('E_MATH_INVALID',`Kanban transport: ${message}`);}
function object(value:unknown,required:readonly string[],optional:readonly string[]=[]):asserts value is Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||required.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>!required.includes(key)&&!optional.includes(key)))invalid('object fields differ');
}
function integer(value:unknown,min=0):asserts value is number{if(!Number.isSafeInteger(value)||(value as number)<min)invalid('invalid integer');}
function cost(part:MermaidMathExpression):MathResourceCost{return {svgBytes:part.mathmlBytes,elementCount:part.elementCount};}
function maximum(a:MathResourceCost,b:MathResourceCost):MathResourceCost{return {svgBytes:Math.max(a.svgBytes,b.svgBytes),elementCount:Math.max(a.elementCount,b.elementCount)};}
function totalShape(value:unknown):asserts value is MathResourceTotal{
 object(value,['svgBytes','elementCount','occurrences']);integer(value.svgBytes);integer(value.elementCount);integer(value.occurrences);
}
function role(value:unknown):asserts value is string{
 if(typeof value!=='string'||!['id','label','decoration.icon','decoration.class','metadata.label','metadata.ticket','metadata.assigned','metadata.priority','metadata.icon','metadata.shape'].includes(value))invalid('unknown record role');
}
function locatedParts(value:unknown,canonical:string):readonly LocatedPart[]{
 if(!Array.isArray(value))invalid('parts are invalid');
 const checked=validateMermaidMathLabel(canonical),semantic=value.map(part=>{
  if(!part||typeof part!=='object')invalid('part is invalid');
  const entry=part as Record<string,unknown>;
  if(entry.kind==='text'){
   object(entry,['kind','source','start','end']);return entry;
  }
  object(entry,['kind','source','tex','start','end','mathmlBytes','elementCount','origins','synthetic']);
  if(entry.kind!=='math'||typeof entry.synthetic!=='boolean'||!Array.isArray(entry.origins))invalid('math part is invalid');
  for(const origin of entry.origins){
   object(origin,['sourceStart','sourceEnd','startByte','endByte','startLine','endLine','rawSource']);
   for(const name of ['sourceStart','sourceEnd','startByte','endByte']as const)integer(origin[name]);
   integer(origin.startLine,1);integer(origin.endLine,1);
   const interval=origin as Record<string,unknown>;
   if(typeof interval.rawSource!=='string'||(interval.sourceEnd as number)-(interval.sourceStart as number)!==interval.rawSource.length||(interval.endByte as number)-(interval.startByte as number)!==new TextEncoder().encode(interval.rawSource).length||(interval.endLine as number)<(interval.startLine as number))invalid('origin is invalid');
  }
  const {origins:_,synthetic:__,...plain}=entry;return plain;
 });
 if(!isDeepStrictEqual(semantic,checked.parts))invalid('canonical parts differ');
 return value as readonly LocatedPart[];
}
function proof(value:unknown):MermaidMathExpression{
 if(typeof value!=='string'||!value.startsWith('$$')||!value.endsWith('$$'))invalid('charge proof is not one equation');
 const checked=validateMermaidMathLabel(value);
 if(checked.parts.length!==1||checked.parts[0]?.kind!=='math'||checked.parts[0].start!==0||checked.parts[0].end!==value.length)invalid('charge proof is not one equation');
 return checked.parts[0];
}
function checkBinding(value:unknown,records:readonly KanbanTransportRecord[]):KanbanTransportBinding{
 object(value,['nodeIndex','role','labelRecord'],['ticketRecord','assignedRecord']);integer(value.nodeIndex);
 if(value.role!=='section'&&value.role!=='title')invalid('binding role differs');integer(value.labelRecord);
 const owned=(index:number,allowed:readonly string[])=>{
  const record=records[index];if(!record||record.nodeIndex!==value.nodeIndex||!allowed.includes(record.role))invalid('binding record ownership differs');
 };
 owned(value.labelRecord,['label','metadata.label']);
 for(const [name,allowed] of [['ticketRecord',['metadata.ticket']],['assignedRecord',['metadata.assigned']]] as const){
  const index=value[name];if(index!==undefined){integer(index);if(value.role!=='title')invalid('section has title-only binding');owned(index,allowed);}
 }
 return value as KanbanTransportBinding;
}
function canonicalMath(record:KanbanTransportRecord):boolean{return record.parts.some(part=>part.kind==='math');}

/** Projects bounded, JSON-safe rendering facts.  It deliberately does not
 * authenticate source omissions, bindings, origins, normalisation, native DB
 * state, or provenance; the parser's private receipt remains that gate. */
export function kanbanMathTransport(math:Awaited<ReturnType<typeof extractKanbanMath>>):KanbanRenderMath{
 const records=math.records.map(record=>Object.freeze({recordIndex:record.recordIndex,nodeIndex:record.nodeIndex,role:record.role,canonicalText:record.math.canonical.input.text,parts:structuredClone(record.parts),charges:record.math.chargeEntries.map(entry=>Object.freeze(proofs(record,entry.cost)))}));
 const eligible=new Set<number>();
 for(const binding of math.bindings){if([binding.labelRecord,binding.ticketRecord,binding.assignedRecord].some(index=>index!==undefined&&math.records[index]!.parts.some(part=>part.kind==='math')))eligible.add(binding.nodeIndex);}
 const bindings=new Map(math.bindings.map(binding=>[binding.nodeIndex,binding]));
 const draws=[...math.renderPlan.copies(eligible)].map(copy=>Object.freeze({...copy,binding:structuredClone(bindings.get(copy.nodeIndex)!)}));
 const result:KanbanRenderMath=Object.freeze({version:1,records:Object.freeze(records),draws:Object.freeze(draws),total:{...math.total}});
 reserveKanbanTransportMath(result);return result;
}
function proofs(record:KanbanMathRecord,target:MathResourceCost):readonly string[]{
 const candidates=new Map<string,MathResourceCost>();
 for(const variant of record.math.variants)for(const part of variant.parts)if(part.kind==='math')candidates.set(part.source,cost(part));
 const hits=[...candidates.entries()].filter(([,value])=>value.svgBytes<=target.svgBytes&&value.elementCount<=target.elementCount);
 const byte=hits.find(([,value])=>value.svgBytes===target.svgBytes),elements=hits.find(([,value])=>value.elementCount===target.elementCount);
 if(!byte||!elements)invalid(`cannot reproduce charge for record ${record.recordIndex}`);
 return Object.freeze([...new Set([byte[0],elements[0]])]);
}

/** Recompute bounded math charges from transport data.  This is structural
 * consistency only; callers must separately bind this projection to source. */
export function reserveKanbanTransportMath(payload:KanbanRenderMath,initial:MathResourceTotal=EMPTY_MATH_RESOURCE_TOTAL):MathResourceTotal{
 object(payload,['version','records','draws','total']);if(payload.version!==1||!Array.isArray(payload.records)||!Array.isArray(payload.draws))invalid('unknown version or collections');
 totalShape(payload.total);
 let own:MathResourceTotal=EMPTY_MATH_RESOURCE_TOTAL,total=initial;reserveMathOccurrences(total,{svgBytes:0,elementCount:0},0);
 const records:KanbanTransportRecord[]=payload.records.map((entry,index)=>{
  object(entry,['recordIndex','nodeIndex','role','canonicalText','parts','charges']);integer(entry.recordIndex);integer(entry.nodeIndex);role(entry.role);
  if(entry.recordIndex!==index||typeof entry.canonicalText!=='string'||!Array.isArray(entry.charges))invalid('record identity differs');
  const parts=locatedParts(entry.parts,entry.canonicalText);
  entry.charges.map(group=>{
   if(!Array.isArray(group)||group.length<1||group.length>2)invalid('charge proofs differ');
   const formulas=group.map(proof);if(new Set(group).size!==group.length)invalid('duplicate charge proof');
   const computed=formulas.map(cost).reduce(maximum,{svgBytes:0,elementCount:0});
   own=reserveMathOccurrences(own,computed,1);total=reserveMathOccurrences(total,computed,1);return computed;
  });
  return {recordIndex:entry.recordIndex,nodeIndex:entry.nodeIndex,role:entry.role,canonicalText:entry.canonicalText,parts,charges:entry.charges} as KanbanTransportRecord;
 });
 const counts=Array<number>(records.length).fill(0),keys=new Set<string>();
 for(const draw of payload.draws){
  object(draw,['key','nodeIndex','sectionIndex','displayIndex','kind','binding']);integer(draw.nodeIndex);integer(draw.sectionIndex);integer(draw.displayIndex);
  if((draw.kind!=='section'&&draw.kind!=='item')||typeof draw.key!=='string'||draw.key!==`kanban-render:${draw.sectionIndex}:${draw.displayIndex}:${draw.kind}`||keys.has(draw.key))invalid('draw key differs');keys.add(draw.key);
  const binding=checkBinding(draw.binding,records);if(binding.nodeIndex!==draw.nodeIndex||(draw.kind==='section')!== (binding.role==='section'))invalid('draw binding differs');
  const indexes=[binding.labelRecord,binding.ticketRecord,binding.assignedRecord].filter((index):index is number=>index!==undefined);
  if(!indexes.some(index=>canonicalMath(records[index]!)))invalid('draw has no canonical math');
  for(const index of indexes)counts[index]=(counts[index]??0)+1;
 }
 for(const [index,record] of records.entries())for(const part of record.parts)if(part.kind==='math'&&(counts[index]??0)>1){
  const extra=(counts[index]??0)-1,charge=cost(part);own=reserveMathOccurrences(own,charge,extra);total=reserveMathOccurrences(total,charge,extra);
 }
 if(!isDeepStrictEqual(payload.total,own))invalid('total differs from owned charges');
 return total;
}
