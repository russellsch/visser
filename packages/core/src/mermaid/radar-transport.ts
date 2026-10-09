import {isDeepStrictEqual} from 'node:util';
import {EMPTY_MATH_RESOURCE_TOTAL,MathPolicyError,reserveMathOccurrences,type MathResourceTotal} from '../math/policy.ts';
import {validateMermaidMathLabel} from './math.ts';
import {radarDisplayTextReplacements,radarMathTextReplacements} from './radar-text.ts';
import {reconcileRadarDb,type RadarDbInput,type RadarDbSnapshot} from './radar-db.ts';
import type {RadarMath,RadarMathRecord} from './radar-math.ts';
import type {RadarLabelRecord} from './radar-labels.ts';
import type {RadarOwnedSlot} from './radar-math-db.ts';

type EncodedSnapshot=Omit<RadarDbSnapshot,'curves'|'options'>&{
 curves:Array<{name:string;label:string;entries:string[]}>;
 options:Omit<RadarDbSnapshot['options'],'ticks'|'max'|'min'>&{ticks:string;max:string|null;min:string};
};
type Input={
 axes:Array<{name:string;label?:string}>;
 curves:Array<{name:string;label?:string;entries:Array<{value:string;axis?:{$refText:string}}>}>;
 options:Array<{name:keyof RadarDbSnapshot['options'];value:string|boolean}>;
};
export type RadarTransportRecord=Pick<RadarMathRecord,'recordIndex'|'role'|'dbValue'|'renderedValue'|'parts'> & Pick<RadarLabelRecord,'itemIndex'|'active'|'semanticValue'>;
export type RadarRenderMath=Readonly<{version:1;snapshot:EncodedSnapshot;input:Input;slots:readonly RadarOwnedSlot[];records:readonly RadarTransportRecord[];total:MathResourceTotal}>;
function invalid(message:string):never{throw new MathPolicyError('E_MATH_INVALID',`Radar transport: ${message}`);}
function keys(value:object,allowed:readonly string[]):void{if(Object.keys(value).some(key=>!allowed.includes(key)))invalid('unexpected input field');}
const encode=(value:number)=>Object.is(value,-0)?'-0':String(value);
function decode(value:string):number{
 if(typeof value!=='string')invalid('numeric field is not a canonical number');
 const result=Number(value);if(encode(result)!==value)invalid('numeric field is not canonical');return result;
}
// Preserve native sentinels and signed zero through JSON. Drawable geometry is
// a separate renderer gate; lossless transport must not silently turn NaN to null.
export function decodeRadarTransportSnapshot(snapshot:EncodedSnapshot):RadarDbSnapshot{
 return {...snapshot,axes:structuredClone(snapshot.axes),curves:snapshot.curves.map(curve=>({...curve,entries:curve.entries.map(decode)})),
  options:{...snapshot.options,ticks:decode(snapshot.options.ticks),max:snapshot.options.max===null?null:decode(snapshot.options.max),min:decode(snapshot.options.min)}};
}
function edit(text:string,changes:readonly {start:number;end:number;text:string}[]):string{
 let result='',cursor=0;for(const change of changes){result+=text.slice(cursor,change.start)+change.text;cursor=change.end;}return result+text.slice(cursor);
}
export function radarMathTransport(math:RadarMath,snapshot:RadarDbSnapshot,slots:readonly RadarOwnedSlot[]):RadarRenderMath{
 const {ast}=math.labels;
 const item=(value:{name:string;label?:string})=>({name:value.name,...(value.label===undefined?{}:{label:value.label})});
 const result:RadarRenderMath={version:1,
  snapshot:{...snapshot,axes:structuredClone(snapshot.axes),curves:snapshot.curves.map(curve=>({...curve,entries:curve.entries.map(encode)})),options:{...snapshot.options,ticks:encode(snapshot.options.ticks),max:snapshot.options.max===null?null:encode(snapshot.options.max),min:encode(snapshot.options.min)}},
  input:{axes:ast.axes.map(item),curves:ast.curves.map(curve=>({...item(curve),entries:curve.entries.map(entry=>({value:encode(entry.value),...(entry.axis?{axis:{$refText:entry.axis.$refText}}:{})}))})),options:ast.options.map(option=>({name:option.name,value:typeof option.value==='number'?encode(option.value):option.value}))},
  slots:structuredClone(slots),total:{...math.total},records:math.records.map(({recordIndex,role,dbValue,renderedValue,parts},index)=>{
   const authored=math.labels.records[index]!;return {recordIndex,role,dbValue,renderedValue,parts:structuredClone(parts),active:authored.active,semanticValue:authored.semanticValue,...(authored.itemIndex===undefined?{}:{itemIndex:authored.itemIndex})};
  })};
 reserveRadarTransportMath(result);return result;
}

/** Validate JSON transport independently of parser/CST objects. This attests
 * internal consistency and costs, not original-source authenticity.
 */
export function reserveRadarTransportMath(math:RadarRenderMath,initial:MathResourceTotal=EMPTY_MATH_RESOURCE_TOTAL):MathResourceTotal{
 if(math.version!==1)invalid('unknown version');
 let own=EMPTY_MATH_RESOURCE_TOTAL,total=initial;
 const roots=new Map<string,RadarTransportRecord>(),items=new Map<string,RadarTransportRecord>();
 const nextItem={axis:0,curve:0};
 for(const [index,record]of math.records.entries()){
  if(record.recordIndex!==index+1||!['title','accTitle','accDescr','axis.name','axis.label','curve.name','curve.label'].includes(record.role))invalid('authored identity differs');
  if(typeof record.active!=='boolean'||typeof record.semanticValue!=='string'||typeof record.dbValue!=='string')invalid('authored value differs');
  if(record.role.includes('.')){
   if(!Number.isInteger(record.itemIndex)||record.itemIndex!<0)invalid('item index differs');
   const [prefix,field]=record.role.split('.') as ['axis'|'curve','name'|'label'];
   if(field==='name'){if(record.itemIndex!==nextItem[prefix]++)invalid('item order differs');}
   else{const prior=math.records[index-1];if(prior?.role!==`${prefix}.name`||prior.itemIndex!==record.itemIndex)invalid('label order differs');}
   const key=`${record.role}:${record.itemIndex}`;if(items.has(key))invalid('duplicate item assignment');items.set(key,record);
   if(record.dbValue!==record.semanticValue)invalid('literal label differs');
  }else{
   if(record.itemIndex!==undefined)invalid('root has item index');
   const previous=roots.get(record.role);if(previous?.active)invalid('overwritten root is active');roots.set(record.role,record);
  }
  const display=edit(record.dbValue,radarDisplayTextReplacements(record.dbValue,record.role));
  if(display!==record.renderedValue)invalid('native/display value differs');
  const validation=edit(record.dbValue,radarMathTextReplacements(record.dbValue,record.role));
  const checked=validateMermaidMathLabel(validation,own),shown=validation===display?checked:validateMermaidMathLabel(display,own);
  if(!isDeepStrictEqual(checked.total,shown.total))invalid('display/validation cost differs');
  const parts=record.parts.map(part=>{if(part.kind==='text')return part;const {origins:_,synthetic:__,...semantic}=part;return semantic;});
  if(!isDeepStrictEqual(parts,shown.parts))invalid('formula parts or costs differ');
  own=checked.total;for(const part of shown.parts)if(part.kind==='math')total=reserveMathOccurrences(total,{svgBytes:part.mathmlBytes,elementCount:part.elementCount},1);
 }
 if(!isDeepStrictEqual(own,math.total))invalid('authored total differs');
 const slots:RadarOwnedSlot[]=[];
 const root=(role:'title'|'accTitle'|'accDescr')=>{
  const record=roots.get(role);if(!record)return '';
  if(!record.active)invalid('surviving root is inactive');
  if(!record.semanticValue){if(record.dbValue!=='')invalid('empty root differs');return '';}
  if(role==='title')slots.push({key:'title',recordIndex:record.recordIndex});return record.dbValue;
 };
 const metadata={title:root('title'),accTitle:root('accTitle'),accDescr:root('accDescr')};
 keys(math.input,['axes','curves','options']);
 for(const axis of math.input.axes)keys(axis,['name','label']);
 for(const curve of math.input.curves){
  keys(curve,['name','label','entries']);
  for(const entry of curve.entries){keys(entry,['value','axis']);if(entry.axis){keys(entry.axis,['$refText']);if(typeof entry.axis.$refText!=='string')invalid('axis reference differs');}}
  if(curve.entries.some(entry=>(entry.axis===undefined)!==(curve.entries[0]?.axis===undefined)))invalid('mixed positional and reference entries');
 }
 for(const option of math.input.options)keys(option,['name','value']);
 const input:RadarDbInput={axes:math.input.axes,curves:math.input.curves.map(curve=>({...curve,entries:curve.entries.map(entry=>({...entry,value:decode(entry.value)}))})),options:math.input.options.map(option=>{
  if(['ticks','max','min'].includes(option.name)){if(typeof option.value!=='string')invalid('numeric option differs');return {name:option.name,value:decode(option.value)};}
  return option;
 }),metadata};
 const snapshot=reconcileRadarDb(input,decodeRadarTransportSnapshot(math.snapshot));
 let covered=0;
 const selected=(prefix:'axis'|'curve',index:number,item:{name:string;label?:string},visible:boolean)=>{
  if(typeof item.name!=='string'||(item.label!==undefined&&typeof item.label!=='string'))invalid('item text differs');
  for(const field of ['name','label'] as const){
   const record=items.get(`${prefix}.${field}:${index}`),value=item[field];
   if(value===undefined){if(record)invalid('unexpected label assignment');continue;}
   const active=field==='label'||item.label===undefined;
   if(!record||record.semanticValue!==value||record.active!==active)invalid('item ownership differs');covered++;
   if(active&&visible)slots.push({key:`${prefix}:${index}`,recordIndex:record.recordIndex});
  }
 };
 input.axes.forEach((axis,index)=>selected('axis',index,axis,true));
 input.curves.forEach((curve,index)=>selected('curve',index,curve,snapshot.options.showLegend));
 if(covered!==items.size)invalid('orphan item assignment');
 if(!isDeepStrictEqual(slots,math.slots))invalid('visible ownership differs');
 return total;
}
