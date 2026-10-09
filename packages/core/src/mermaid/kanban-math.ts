import {isDeepStrictEqual} from 'node:util';
import {EMPTY_MATH_RESOURCE_TOTAL,MathPolicyError,reserveMathOccurrences,type MathResourceTotal} from '../math/policy.ts';
import {prepareKanbanSource} from './kanban-source.ts';
import type {KanbanDbOptions} from './kanban-db.ts';
import {planKanbanRenderCopies} from './kanban-render-copies.ts';
import {normalizeKanbanField,type KanbanFieldRole,type KanbanNormalizedField} from './kanban-normalize.ts';
import {validateKanbanAuthoredField,validateKanbanMathField,mergeKanbanScalarChecks,reserveKanbanFieldMath,type KanbanFieldMath} from './kanban-field-math.ts';
import {ProvenanceText} from './source-provenance.ts';
import {MermaidSourceCoordinates,type LocatedSourceInterval} from './source-coordinates.ts';
import {normalizeMermaidSource} from './rules.ts';
import type {YamlTrace} from './yaml-provenance.ts';
import type {MermaidMathExpression,MermaidMathText} from './math.ts';

export type KanbanLocatedMath=MermaidMathExpression&Readonly<{origins:readonly LocatedSourceInterval[];synthetic:boolean}>;
export type KanbanMathRecord=Readonly<{
 recordIndex:number;nodeIndex:number;role:string;value:ProvenanceText;renderCopies:number;
 math:KanbanFieldMath;normalized?:KanbanNormalizedField;
 parts:readonly (MermaidMathText|KanbanLocatedMath)[];
}>;
export type KanbanMathBinding=Readonly<{nodeIndex:number;role:'section'|'title';labelRecord:number;ticketRecord?:number;assignedRecord?:number}>;
export class LocatedKanbanMathError extends MathPolicyError{
 readonly nodeIndex:number;readonly role:string;readonly intervals:readonly LocatedSourceInterval[];readonly synthetic:boolean;
 readonly startLine:number|undefined;readonly startByte:number|undefined;readonly endByte:number|undefined;
 constructor(error:MathPolicyError,nodeIndex:number,role:string,value:ProvenanceText,coordinates:MermaidSourceCoordinates){
  super(error.code,`Kanban ${role}${nodeIndex<0?'':` on node ${nodeIndex}`}: ${error.message}`);this.name='LocatedKanbanMathError';this.nodeIndex=nodeIndex;this.role=role;
  const located=coordinates.locateRange(value,0,value.length);this.intervals=Object.freeze(located.intervals.map(interval=>Object.freeze(interval)));this.synthetic=located.synthetic;
  this.startLine=this.intervals[0]?.startLine;this.startByte=this.intervals[0]?.startByte;this.endByte=this.intervals[0]?.endByte;
 }
}
/** Physical scalar occurrences in one recognized field, including mapping
 * keys/values hidden by native object stringification. Alias definitions are
 * visited once; this never expands an opaque alias DAG into display text.
 */
export function kanbanMetadataScalars(root:YamlTrace):readonly ProvenanceText[]{
 const pending:(YamlTrace|null|undefined)[]=[root],seen=new Set<YamlTrace>(),scalars:ProvenanceText[]=[];
 while(pending.length){
  const trace=pending.pop();if(!trace||seen.has(trace))continue;seen.add(trace);
  if(trace.kind==='alias')pending.push(trace.definition);
  else if(trace.kind==='sequence')for(let i=(trace.items?.length??0)-1;i>=0;i--)pending.push(trace.items![i]);
  else if(trace.kind==='mapping')for(let i=(trace.entries?.length??0)-1;i>=0;i--){const entry=trace.entries![i]!;pending.push(entry.value,entry.key);}
  else if(trace.decoded)scalars.push(trace.decoded);
 }
 return Object.freeze(scalars);
}

/** All recognized authored fields plus exact rendered multiplicities. Unknown
 * top-level YAML data is not a text surface; it is visited when referenced by
 * a recognized field. This internal result is not a worker transport receipt.
 */
export async function extractKanbanMath(original:string,options:KanbanDbOptions,initial:MathResourceTotal=EMPTY_MATH_RESOURCE_TOTAL,rendered=normalizeMermaidSource(original),htmlLabels=true){
 const coordinates=new MermaidSourceCoordinates(original);
 let total=reserveMathOccurrences(initial,{svgBytes:0,elementCount:0},0);
 let prepared:Awaited<ReturnType<typeof prepareKanbanSource>>;
 try{prepared=await prepareKanbanSource(original,options,rendered,htmlLabels);}
 catch(error){if(error instanceof MathPolicyError)throw new LocatedKanbanMathError(error,-1,'source',ProvenanceText.identity(original),coordinates);throw error;}
 const renderPlan=planKanbanRenderCopies(prepared),records:KanbanMathRecord[]=[],bindings:KanbanMathBinding[]=[];
 const located=<T>(nodeIndex:number,role:string,value:ProvenanceText,run:()=>T):T=>{
  try{return run();}catch(error){if(error instanceof MathPolicyError)throw new LocatedKanbanMathError(error,nodeIndex,role,value,coordinates);throw error;}
 };
 const append=(nodeIndex:number,role:string,value:ProvenanceText,math:KanbanFieldMath,renderCopies:number,normalized?:KanbanNormalizedField,diagnosticValue=value):number=>{
  total=located(nodeIndex,role,diagnosticValue,()=>reserveKanbanFieldMath(total,math,renderCopies));
  const parts=math.canonical.parts.map(part=>{
   if(part.kind==='text')return part;
   const origin=coordinates.locateRange(math.canonical.input,part.start,part.end);
   return Object.freeze({...part,origins:Object.freeze(origin.intervals.map(interval=>Object.freeze(interval))),synthetic:origin.synthetic});
  });
  const recordIndex=records.length;records.push(Object.freeze({recordIndex,nodeIndex,role,value,renderCopies,math,...(normalized?{normalized}:{}),parts:Object.freeze(parts)}));return recordIndex;
 };
 for(const effect of prepared.authored.effects){
  if(effect.kind==='decoration'){
   const decoration=prepared.authored.decorations[effect.decorationIndex]!,sanitation=prepared.decorations[effect.decorationIndex]!.sanitation;
   const role=`decoration.${decoration.kind}`;
   append(decoration.nodeIndex,role,decoration.value,located(decoration.nodeIndex,role,decoration.value,()=>validateKanbanAuthoredField(decoration.value,sanitation.witness)),0);
   continue;
  }
  const node=prepared.nodes[effect.nodeIndex]!,nodeIndex=node.nodeIndex;
  const role:'section'|'title'=prepared.groups.parents[nodeIndex]===undefined?'section':'title';
  const copies=renderPlan.counts[nodeIndex]!;
  const labelOverride=node.metadata?.fields.some(field=>field.name==='label'&&field.active)??false;
  const sameToken=node.authored.id.text===node.authored.label.text&&isDeepStrictEqual(node.authored.id.mapRange(0,node.authored.id.length),node.authored.label.mapRange(0,node.authored.label.length));
  if(!sameToken)append(nodeIndex,'id',node.authored.id,located(nodeIndex,'id',node.authored.id,()=>validateKanbanAuthoredField(node.authored.id,node.id.witness)),0);
  let labelRecord:number;
  if(labelOverride)labelRecord=append(nodeIndex,'label',node.authored.label,located(nodeIndex,'label',node.authored.label,()=>validateKanbanAuthoredField(node.authored.label,node.baseLabel.witness)),0);
  else{
   const normalized=await normalizeKanbanField(node.baseLabel.value,role,htmlLabels);
   const math=located(nodeIndex,'label',node.authored.label,()=>validateKanbanMathField(node.authored.label,role,htmlLabels,normalized.witnesses,node.baseLabel.witness));
   labelRecord=append(nodeIndex,'label',node.authored.label,math,copies,normalized);
  }
  let ticketRecord:number|undefined,assignedRecord:number|undefined;
  for(const field of node.metadata?.fields??[]){
   const metadataRole=`metadata.${field.name}`;
   const visibleRole:KanbanFieldRole|undefined=field.active?(field.name==='label'?role:role==='title'&&(field.name==='ticket'||field.name==='assigned')?field.name:undefined):undefined;
   // Active title/ticket/assignee values use native coercion even when hidden
   // on sections; remaining typed fields only have physical scalar checks.
   const value=field.mappedValue??node.authored.shapeData!.synthetic('');
   let normalized:KanbanNormalizedField|undefined,math:KanbanFieldMath;
   if(visibleRole){
    normalized=await normalizeKanbanField(value,visibleRole,htmlLabels);
    math=located(nodeIndex,metadataRole,value,()=>validateKanbanMathField(value,visibleRole,htmlLabels,normalized!.witnesses));
   }else math=located(nodeIndex,metadataRole,value,()=>validateKanbanAuthoredField(value));
   const scalars=function*(){for(const scalar of kanbanMetadataScalars(field.trace))yield located(nodeIndex,metadataRole,scalar,()=>validateKanbanAuthoredField(scalar));};
   math=located(nodeIndex,metadataRole,node.authored.shapeData!,()=>mergeKanbanScalarChecks(math,scalars()));
   const record=append(nodeIndex,metadataRole,value,math,visibleRole?copies:0,normalized,node.authored.shapeData!);
   if(field.name==='label'&&field.active)labelRecord=record;
   if(role==='title'&&field.active&&field.name==='ticket')ticketRecord=record;
   if(role==='title'&&field.active&&field.name==='assigned')assignedRecord=record;
  }
  bindings.push(Object.freeze({nodeIndex,role,labelRecord,...(ticketRecord===undefined?{}:{ticketRecord}),...(assignedRecord===undefined?{}:{assignedRecord})}));
 }
 return Object.freeze({prepared,renderPlan,records:Object.freeze(records),bindings:Object.freeze(bindings),total:Object.freeze(total)});
}
