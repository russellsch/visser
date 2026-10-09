import {isDeepStrictEqual} from 'node:util';
import {EMPTY_MATH_RESOURCE_TOTAL,MathPolicyError,reserveMathOccurrences,type MathResourceCost,type MathResourceTotal} from '../math/policy.ts';
import type {prepareERPlannedMath} from './er-planned-math.ts';
import {erDisplayPathValid,erMathText,type ERDisplayPath} from './er-text.ts';
import {validateMermaidMathLabel,type MermaidMathExpression,type MermaidMathText} from './math.ts';

type Origin=Readonly<{sourceStart:number;sourceEnd:number;startByte:number;endByte:number;startLine:number;endLine:number;rawSource:string}>;
export type ERTransportPart=MermaidMathText|(MermaidMathExpression&Readonly<{chargeID:string;origins:readonly Origin[];synthetic:boolean}>);
export type ERTransportSlot=Readonly<{
 key:string;token:string;ownerKind:'entity'|'group'|'relationship';ownerIndex:number;recordIndex:number|null;
 field:string;path:ERDisplayPath;lifetime:'measurement'|'retained';copy:'single'|'background'|'foreground';
 input:string;hookInput:string;canonicalText:string;parts:readonly ERTransportPart[];
}>;
export type ERTransportCharge=Readonly<{id:string;proofs:readonly string[]}>;
export type ERRenderMath=Readonly<{
 version:1;layout:'elk'|'dagre';htmlLabels:boolean;slots:readonly ERTransportSlot[];
 charges:readonly ERTransportCharge[];total:MathResourceTotal;
}>;

const encoder=new TextEncoder();
function invalid(message:string):never{throw new MathPolicyError('E_MATH_INVALID',`ER transport: ${message}`);}
function object(value:unknown,required:readonly string[]):asserts value is Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||required.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>!required.includes(key)))invalid('object fields differ');
}
function integer(value:unknown,min=0):asserts value is number{if(!Number.isSafeInteger(value)||(value as number)<min)invalid('invalid integer');}
function plainJson(value:unknown,seen=new Set<object>()):void{
 if(value===null||typeof value==='string'||typeof value==='boolean')return;
 if(typeof value==='number'){if(!Number.isFinite(value))invalid('non-JSON number');return;}
 if(typeof value!=='object')invalid('non-JSON value');
 if(seen.has(value as object))invalid('cyclic value');seen.add(value as object);
 if(Array.isArray(value)){
  if(Object.getPrototypeOf(value)!==Array.prototype||Reflect.ownKeys(value).some(key=>typeof key!=='string'||(key!=='length'&&!/^(0|[1-9][0-9]*)$/.test(key))))invalid('non-plain JSON array');
  for(const item of value)plainJson(item,seen);
 }else {
  if(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)invalid('non-plain object');
  for(const key of Reflect.ownKeys(value)){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!descriptor?.enumerable||!Object.hasOwn(descriptor,'value'))invalid('non-plain JSON object');plainJson(descriptor.value,seen);}
 }
 seen.delete(value as object);
}
function totalShape(value:unknown):asserts value is MathResourceTotal{object(value,['svgBytes','elementCount','occurrences']);integer(value.svgBytes);integer(value.elementCount);integer(value.occurrences);}
function cost(part:MermaidMathExpression):MathResourceCost{return {svgBytes:part.mathmlBytes,elementCount:part.elementCount};}
function maximum(a:MathResourceCost,b:MathResourceCost):MathResourceCost{return {svgBytes:Math.max(a.svgBytes,b.svgBytes),elementCount:Math.max(a.elementCount,b.elementCount)};}
function proof(value:unknown):MermaidMathExpression{
 if(typeof value!=='string'||!value.startsWith('$$')||!value.endsWith('$$'))invalid('charge proof is not one equation');
 const checked=validateMermaidMathLabel(value);
 if(checked.parts.length!==1||checked.parts[0]?.kind!=='math'||checked.parts[0].start!==0||checked.parts[0].end!==value.length)invalid('charge proof is not one equation');
 return checked.parts[0];
}
function proofs(candidates:readonly Readonly<{source:string;cost:MathResourceCost}>[],target:MathResourceCost):readonly string[]{
 const unique=new Map(candidates.map(candidate=>[candidate.source,candidate.cost]));
 const eligible=[...unique].filter(([,value])=>value.svgBytes<=target.svgBytes&&value.elementCount<=target.elementCount);
 const bytes=eligible.find(([,value])=>value.svgBytes===target.svgBytes),elements=eligible.find(([,value])=>value.elementCount===target.elementCount);
 if(!bytes||!elements)invalid('cannot reproduce authored charge');
 return Object.freeze([...new Set([bytes[0],elements[0]])]);
}
function locatedParts(value:unknown,canonical:string,charges:ReadonlyMap<string,MathResourceCost>,physical:Map<string,MathResourceCost[]>):readonly ERTransportPart[]{
 if(!Array.isArray(value))invalid('parts are invalid');
 const checked=validateMermaidMathLabel(canonical),semantic=value.map(part=>{
  if(!part||typeof part!=='object'||Array.isArray(part))invalid('part is invalid');
  const entry=part as Record<string,unknown>;
  if(entry.kind==='text'){object(entry,['kind','source','start','end']);return entry;}
  object(entry,['kind','source','tex','start','end','mathmlBytes','elementCount','chargeID','origins','synthetic']);
  if(entry.kind!=='math'||typeof entry.chargeID!=='string'||typeof entry.synthetic!=='boolean'||!Array.isArray(entry.origins))invalid('math part is invalid');
  const charge=charges.get(entry.chargeID);if(!charge)invalid('math part charge is missing');
  for(const origin of entry.origins){
   object(origin,['sourceStart','sourceEnd','startByte','endByte','startLine','endLine','rawSource']);
   for(const name of ['sourceStart','sourceEnd','startByte','endByte']as const)integer(origin[name]);integer(origin.startLine,1);integer(origin.endLine,1);
   if(typeof origin.rawSource!=='string'||(origin.sourceEnd as number)-(origin.sourceStart as number)!==origin.rawSource.length||(origin.endByte as number)-(origin.startByte as number)!==encoder.encode(origin.rawSource).length||(origin.endLine as number)<(origin.startLine as number))invalid('origin is invalid');
  }
  const actual={svgBytes:entry.mathmlBytes as number,elementCount:entry.elementCount as number};
  if(!Number.isSafeInteger(actual.svgBytes)||!Number.isSafeInteger(actual.elementCount)||actual.svgBytes<0||actual.elementCount<0||actual.svgBytes>charge.svgBytes||actual.elementCount>charge.elementCount)invalid('math part charge does not dominate');
  const list=physical.get(entry.chargeID)??[];list.push(actual);physical.set(entry.chargeID,list);
  const {chargeID:_,origins:__,synthetic:___,...plain}=entry;return plain;
 });
 if(!isDeepStrictEqual(semantic,checked.parts))invalid('canonical parts differ');
 return value as readonly ERTransportPart[];
}
function slotIdentity(slot:Record<string,unknown>,layout:'elk'|'dagre'){
 if(typeof slot.key!=='string'||typeof slot.token!=='string'||!/^((node)|(edge)):(0|[1-9][0-9]*)$/.test(slot.token))invalid('slot identity differs');
 if(slot.ownerKind!=='entity'&&slot.ownerKind!=='group'&&slot.ownerKind!=='relationship')invalid('slot owner differs');integer(slot.ownerIndex);
 if((slot.ownerKind==='relationship')!==slot.token.startsWith('edge:'))invalid('slot token owner differs');
 if(slot.recordIndex!==null)integer(slot.recordIndex);
 if(typeof slot.field!=='string'||!erDisplayPathValid(slot.path)||!['measurement','retained'].includes(slot.lifetime as string)||!['single','background','foreground'].includes(slot.copy as string))invalid('slot fields differ');
 const expected=layout==='elk'?`${slot.token}:${slot.field}:${slot.lifetime}:${slot.copy}`:`${slot.token}:${slot.field}:${slot.copy}`;
 if(slot.key!==expected)invalid('layout slot key differs');
 if(layout==='dagre'&&slot.lifetime!=='retained')invalid('Dagre slot lifetime differs');
 if(slot.ownerKind==='relationship'){
  if(slot.field!=='role'||slot.path!=='edge'||slot.lifetime!=='retained'||slot.copy!=='single')invalid('relationship slot differs');
 }else if(slot.ownerKind==='group'){
  if(slot.field!=='title'||(slot.path!=='group-node'&&slot.path!=='group-cluster')||slot.copy!=='single')invalid('group slot differs');
  if(layout==='elk'&&((slot.path==='group-node')!==(slot.lifetime==='measurement')))invalid('ELK group lifetime differs');
 }else {
  const row=/^row:(0|[1-9][0-9]*):(type|name|keys|comment)$/.test(slot.field);
  if(slot.field==='header'){if(slot.path!=='simple-header'&&slot.path!=='table')invalid('header path differs');}
  else if(slot.field==='name'){if(slot.path!=='raw-cluster'||slot.copy!=='single')invalid('name path differs');}
  else if(!row||slot.path!=='table')invalid('entity slot differs');
  if(slot.lifetime!=='retained')invalid('entity slot lifetime differs');
 }
}

/** Project only bounded JSON rendering facts. Source completeness, source
 * identity and provenance remain the parser receipt's responsibility. */
export function erMathTransport(plan:Awaited<ReturnType<typeof prepareERPlannedMath>>,htmlLabels:boolean):ERRenderMath{
 if(typeof htmlLabels!=='boolean')invalid('invalid label mode');
 for(const record of plan.authored.records)for(const display of record.math.displays)if(display.normalization.htmlLabels!==htmlLabels)invalid('label mode differs');
 type Ledger={id:string;cost:MathResourceCost;candidates:Array<{source:string;cost:MathResourceCost}>};
 const ledgers=new Map<string,Ledger>(),pair=(root:number,key:string)=>`${root}\u0000${key}`;
 for(const record of plan.authored.records)for(const charge of record.math.charges){
  const identity=pair(record.budgetRoot,charge.key),prior=ledgers.get(identity)??{id:`c${ledgers.size}`,cost:{svgBytes:0,elementCount:0},candidates:[]};
  prior.cost=maximum(prior.cost,charge.cost);ledgers.set(identity,prior);
 }
 for(const record of plan.authored.records)for(const variant of record.math.variants)for(const occurrence of variant.occurrences){
  const ledger=ledgers.get(pair(record.budgetRoot,occurrence.key));if(!ledger)invalid('authored occurrence charge is missing');
  const part=variant.parts[occurrence.partIndex];if(!part||part.kind!=='math')invalid('authored occurrence part differs');
  ledger.candidates.push({source:part.source,cost:occurrence.cost});
 }
 const slots=plan.copies.map(copy=>{
  const math=(copy as typeof copy&{math?:{input:{text:string};parts:readonly (MermaidMathText|(MermaidMathExpression&{origins:readonly Origin[];synthetic:boolean}))[]}}).math;
  const token=(copy as typeof copy&{token?:unknown}).token;if(typeof token!=='string')invalid('copy token is missing');
  const recordIndex=copy.fieldOwner.kind==='record'?copy.fieldOwner.recordIndex:null,canonicalText=math?math.input.text:erMathText(copy.hookInput.text,copy.path);
  const occurrences=math&&recordIndex!==null?plan.authored.records[recordIndex]!.math.displays.find(display=>display.normalization.path===copy.path)?.variant.occurrences:undefined;
  const byPart=new Map((occurrences??[]).map(occurrence=>[occurrence.partIndex,ledgers.get(pair(plan.authored.records[recordIndex!]!.budgetRoot,occurrence.key))?.id]));
  const checked=math?math.parts:validateMermaidMathLabel(canonicalText).parts;
  const parts:ERTransportPart[]=checked.map((part,index)=>{
   if(part.kind==='text')return {...part};
   const located=part as MermaidMathExpression&Partial<{origins:readonly Origin[];synthetic:boolean}>;
   return {...part,chargeID:byPart.get(index)??invalid('selected occurrence charge is missing'),origins:located.origins??[],synthetic:located.synthetic??true};
  });
  if(recordIndex===null&&parts.some(part=>part.kind==='math'))invalid('generated field contains math');
  return {key:copy.key,token,ownerKind:copy.ownerKind,ownerIndex:copy.ownerIndex,recordIndex,field:copy.field,path:copy.path,lifetime:copy.lifetime,copy:copy.copy,input:copy.value.text,hookInput:copy.hookInput.text,canonicalText,parts};
 });
 const charges=[...ledgers.values()].map(ledger=>({id:ledger.id,proofs:proofs(ledger.candidates,ledger.cost)}));
 const payload={version:1 as const,layout:plan.layout,htmlLabels,slots,charges,total:{...plan.budget.total}};
 reserveERTransportMath(payload);return structuredClone(payload);
}

/** Recompute resource use from plain transport data. Structural consistency is
 * not proof of source provenance or of omitted native/parser state. */
export function reserveERTransportMath(payload:ERRenderMath,initial:MathResourceTotal=EMPTY_MATH_RESOURCE_TOTAL):MathResourceTotal{
 plainJson(payload);object(payload,['version','layout','htmlLabels','slots','charges','total']);
 if(payload.version!==1||(payload.layout!=='elk'&&payload.layout!=='dagre')||typeof payload.htmlLabels!=='boolean'||!Array.isArray(payload.slots)||!Array.isArray(payload.charges))invalid('unknown version or collections');
 totalShape(payload.total);totalShape(initial);let own:MathResourceTotal=EMPTY_MATH_RESOURCE_TOTAL,total=initial;reserveMathOccurrences(total,{svgBytes:0,elementCount:0},0);
 const charges=new Map<string,MathResourceCost>();
 for(const [index,entry]of payload.charges.entries()){
  object(entry,['id','proofs']);if(entry.id!==`c${index}`||charges.has(entry.id)||!Array.isArray(entry.proofs)||entry.proofs.length<1||entry.proofs.length>2||new Set(entry.proofs).size!==entry.proofs.length)invalid('charge differs');
  const computed=entry.proofs.map(proof).map(cost).reduce(maximum,{svgBytes:0,elementCount:0});charges.set(entry.id,computed);
  own=reserveMathOccurrences(own,computed,1);total=reserveMathOccurrences(total,computed,1);
 }
 const physical=new Map<string,MathResourceCost[]>(),keys=new Set<string>(),owners=new Map<string,string>(),copyGroups=new Map<string,Set<string>>();
 for(const entry of payload.slots){
  object(entry,['key','token','ownerKind','ownerIndex','recordIndex','field','path','lifetime','copy','input','hookInput','canonicalText','parts']);slotIdentity(entry,payload.layout);
  const slot=entry as unknown as ERTransportSlot;
  if(keys.has(slot.key))invalid('duplicate slot key');keys.add(slot.key);
  const identity=`${slot.ownerKind}:${slot.ownerIndex}`,prior=owners.get(slot.token);if(prior&&prior!==identity)invalid('token identity differs');owners.set(slot.token,identity);
  if(typeof slot.input!=='string'||typeof slot.hookInput!=='string'||typeof slot.canonicalText!=='string'||slot.canonicalText!==erMathText(slot.hookInput,slot.path))invalid('slot text differs');
  const group=`${slot.token}\u0000${slot.field}\u0000${slot.path}\u0000${slot.lifetime}\u0000${slot.input}\u0000${slot.hookInput}\u0000${slot.recordIndex}`;
  const copies=copyGroups.get(group)??new Set<string>();if(copies.has(slot.copy))invalid('duplicate physical copy');copies.add(slot.copy);copyGroups.set(group,copies);
  const parts=locatedParts(slot.parts,slot.canonicalText,charges,physical);if(slot.recordIndex===null&&parts.some(part=>part.kind==='math'))invalid('generated field contains math');
 }
 for(const copies of copyGroups.values())if(!(copies.size===1&&copies.has('single'))&&!(copies.size===2&&copies.has('background')&&copies.has('foreground')))invalid('physical copy set differs');
 for(const [id,costs]of physical){
  const charge=charges.get(id)!;let consumed:MathResourceCost|undefined;
  for(const value of costs){
   if(value.svgBytes>charge.svgBytes||value.elementCount>charge.elementCount)invalid('physical charge differs');
   if(consumed){const extra={svgBytes:Math.min(consumed.svgBytes,value.svgBytes),elementCount:Math.min(consumed.elementCount,value.elementCount)};own=reserveMathOccurrences(own,extra,1);total=reserveMathOccurrences(total,extra,1);}
   consumed=maximum(consumed??{svgBytes:0,elementCount:0},value);
  }
 }
 if(!isDeepStrictEqual(payload.total,own))invalid('total differs from owned charges');
 return total;
}
