import {MathPolicyError} from '../math/policy.ts';
import {ER_LAYOUT_OWNER,type observeERLayoutOwners,type tagERLayoutOwners} from './er-layout-owners.ts';
import type {ERDisplayPath} from './er-text.ts';

type ERScalar=
 | Readonly<{kind:'node';ordinal:number;field:'header'|'name'|'title'}>
 | Readonly<{kind:'attribute';ordinal:number;row:number;field:'type'|'name'|'keys'|'comment'}>
 | Readonly<{kind:'edge';ordinal:number;field:'role'}>;
export type ERRenderSlot=Readonly<{
 key:string;token:string;scalar:ERScalar;field:string;path:ERDisplayPath;
 lifetime:'measurement'|'retained';copy:'single'|'background'|'foreground';input:string;
}>;

function invalid(message:string):never { throw new MathPolicyError('E_MATH_INVALID',`ER render slots: ${message}`); }
type Tagged=ReturnType<typeof tagERLayoutOwners>;
type Observed=ReturnType<typeof observeERLayoutOwners>;
type Entry=Tagged['registry'][number];
type Native=Record<string,unknown>;

function registry(tagged:Tagged) {
 const entries=new Map<string,Entry>();
 for(const entry of tagged.registry) {
  if(entries.has(entry.token)||!/^((node)|(edge)):[0-9]+$/.test(entry.token)) invalid('duplicate or malformed registry token');
  entries.set(entry.token,entry);
 }
 if(entries.size!==tagged.registry.length) invalid('duplicate registry token');
 return entries;
}
function text(value:unknown,what:string):string { if(typeof value!=='string') invalid(`${what} is not text`); return value; }
function native(item:unknown,what:string):Native { if(!item||typeof item!=='object'||Array.isArray(item)) invalid(`${what} is invalid`); return item as Native; }
function tokenOrdinal(token:string,kind:'node'|'edge') {
 const match=new RegExp(`^${kind}:(0|[1-9][0-9]*)$`).exec(token);
 if(!match) invalid(`malformed ${kind} token`);
 const ordinal=Number(match[1]); if(!Number.isSafeInteger(ordinal)) invalid('unsafe token ordinal');
 return ordinal;
}
function copies(rough:boolean):readonly ('single'|'background'|'foreground')[] { return rough?['background','foreground']:['single']; }
function elkInput(value:string):string { return value.replace(/<\/?br\s*\/?>/gi,'\n'); }

/** Enumerate native ELK text calls from tagged getData entries. This deliberately
 * carries only native input strings and ordinal scalar identities; source joins
 * are performed later by the render worker. */
export function enumerateERElkSlots(tagged:Tagged):readonly ERRenderSlot[] {
 const entries=registry(tagged),used=new Set<string>(),keys=new Set<string>(),out:ERRenderSlot[]=[];
 const add=(token:string,scalar:ERScalar,field:string,path:ERDisplayPath,lifetime:ERRenderSlot['lifetime'],input:string,rough=false)=>{
  for(const copy of copies(rough)) {
   const key=`${token}:${field}:${lifetime}:${copy}`;
   if(keys.has(key)) invalid('duplicate slot key'); keys.add(key);
   out.push(Object.freeze({key,token,scalar:Object.freeze(scalar),field,path,lifetime,copy,input}));
  }
 };
 const owner=(item:Native,edge:boolean,ordinal:number)=>{
  const token=item[ER_LAYOUT_OWNER],entry=typeof token==='string'?entries.get(token):undefined;
  if(!entry||used.has(entry.token)||entry.nativeId!==text(item.id,'native id')||tokenOrdinal(entry.token,edge?'edge':'node')!==ordinal || (edge?entry.owner.kind!=='relationship':entry.owner.kind==='relationship')) invalid('native owner identity differs');
  used.add(entry.token); return entry;
 };
 for(let ordinal=0;ordinal<tagged.data.nodes.length;ordinal++) {
  const item=native(tagged.data.nodes[ordinal],`node ${ordinal}`),entry=owner(item,false,ordinal);
  if(entry.owner.kind==='group') {
   if(item.isGroup!==true||item.shape!=='rect') invalid('group native fields differ');
   const input=text(item.label,'group title'),scalar={kind:'node' as const,ordinal,field:'title' as const};
   if(input) add(entry.token,scalar,'title','group-node','measurement',input);
   add(entry.token,scalar,'title','group-cluster','retained',input);
  } else {
   if(item.isGroup!==false||item.shape!=='erBox'||!Array.isArray(item.attributes)) invalid('entity native fields differ');
   const label=text(item.label,'entity name'),alias=text(item.alias,'entity alias'),header=alias||label,rough=item.look==='handDrawn';
   add(entry.token,{kind:'node',ordinal,field:'header'},'header',item.attributes.length===0&&header?'simple-header':'table','retained',header,rough);
   for(let row=0;row<item.attributes.length;row++) {
    const attribute=native(item.attributes[row],`attribute ${row}`),keys=attribute.keys;
    if(!Array.isArray(keys)||keys.some(value=>typeof value!=='string')) invalid('attribute keys differ');
    for(const field of ['type','name','keys','comment'] as const) {
     const input=field==='keys'?keys.join(','):text(attribute[field],`attribute ${field}`);
     add(entry.token,{kind:'attribute',ordinal,row,field},`row:${row}:${field}`,'table','retained',input,rough);
    }
   }
  }
 }
 for(let ordinal=0;ordinal<tagged.data.edges.length;ordinal++) {
  const item=native(tagged.data.edges[ordinal],`edge ${ordinal}`),entry=owner(item,true,ordinal),input=elkInput(text(item.label,'relationship label'));
  if(input) add(entry.token,{kind:'edge',ordinal,field:'role'},'role','edge','retained',input);
 }
 if(used.size!==entries.size) invalid('unconsumed native owner');
 return Object.freeze(out);
}

/** Enumerate the original tagged scalar selected by Dagre's observed winner.
 * Observations decide which original node/edge survives native graph rewrites. */
export function enumerateERDagreSlots(tagged:Tagged,observed:Observed):readonly ERRenderSlot[] {
 const entries=registry(tagged),keys=new Set<string>(),out:ERRenderSlot[]=[];
 const original=(token:string,edge:boolean)=>{
  const entry=entries.get(token),ordinal=tokenOrdinal(token,edge?'edge':'node'),items=edge?tagged.data.edges:tagged.data.nodes;
  const item=items[ordinal];
  const original=native(item,'original native item');
  if(!entry||!item||original[ER_LAYOUT_OWNER]!==token||entry.nativeId!==text(original.id,'native id')||(edge?entry.owner.kind!=='relationship':entry.owner.kind==='relationship')) invalid('registry identity differs');
  return {entry,ordinal,item:original};
 };
 const select=(item:any,edge:boolean)=>{
  if(!item.owner) { if(item.label) invalid(`unowned native ${edge?'edge':'node'} label`); return; }
  if(!item.token||typeof item.token!=='string'||!item.owner||!Number.isSafeInteger(item.owner.index)||item.owner.index<0) invalid('owned native item lacks valid token');
  const selected=original(item.token,edge);
  if(selected.entry.owner.kind!==item.owner.kind||selected.entry.owner.index!==item.owner.index) invalid('observed owner differs');
  return selected;
 };
 const add=(token:string,scalar:ERScalar,field:string,path:ERDisplayPath,input:string,rough=false)=>{
  for(const copy of copies(rough)) {
   const key=`${token}:${field}:${copy}`; if(keys.has(key)) invalid('duplicate slot key'); keys.add(key);
   out.push(Object.freeze({key,token,scalar:Object.freeze(scalar),field,path,lifetime:'retained',copy,input}));
  }
 };
 for(const node of observed.nodes) {
  const chosen=select(node,false); if(!chosen) continue;
  const {entry,ordinal,item}=chosen,label=text(item.label,'entity or group label');
  if(node.label!==label) invalid('observed native label differs');
  if(entry.owner.kind==='group') {
   if(item.isGroup!==true||item.shape!=='rect') invalid('group native fields differ');
   if(node.route!=='node'&&node.route!=='cluster'&&node.route!=='extracted-cluster') invalid('group route differs');
   add(entry.token,{kind:'node',ordinal,field:'title'},'title',node.route==='node'?'group-node':'group-cluster',label);
  } else if(entry.owner.kind==='entity') {
   if(item.isGroup!==false) invalid('entity native fields differ');
   if(node.route!=='node') {
    if(node.route==='cluster'&&node.graphPath.length===0&&node.isGroup!==true) invalid('native top-level entity cluster cannot render');
    add(entry.token,{kind:'node',ordinal,field:'name'},'name','raw-cluster',label); continue;
   }
   if(node.shape!=='erBox'||item.shape!=='erBox'||!Array.isArray(item.attributes)) invalid('entity native shape differs');
   const alias=text(item.alias,'entity alias'); if((node.alias??'')!==alias) invalid('entity native alias differs');
   const header=alias||label,rough=node.look==='handDrawn';
   add(entry.token,{kind:'node',ordinal,field:'header'},'header',item.attributes.length===0&&header?'simple-header':'table',header,rough);
   for(let row=0;row<item.attributes.length;row++) {
    const attribute=native(item.attributes[row],`attribute ${row}`),keysValue=attribute.keys;
    if(!Array.isArray(keysValue)||keysValue.some(value=>typeof value!=='string')) invalid('attribute keys differ');
    for(const field of ['type','name','keys','comment'] as const) add(entry.token,{kind:'attribute',ordinal,row,field},`row:${row}:${field}`,'table',field==='keys'?keysValue.join(','):text(attribute[field],`attribute ${field}`),rough);
   }
  } else invalid('relationship owner on node');
 }
 for(const edge of observed.edges) {
  const chosen=select(edge,true); if(!chosen) continue;
  if(edge.selfLoopOrder!==undefined&&edge.selfLoopOrder!==1) { if(edge.label) invalid('self-loop outer label differs'); continue; }
  const input=text(chosen.item.label,'relationship label'); if(edge.label!==input) invalid('observed relationship label differs');
  add(chosen.entry.token,{kind:'edge',ordinal:chosen.ordinal,field:'role'},'role','edge',input);
 }
 return Object.freeze(out);
}
