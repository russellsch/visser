import {MathPolicyError} from '../math/policy.ts';
import {reconcileRadarDb,type RadarDbSnapshot,type RadarDbInput} from './radar-db.ts';
import type {RadarMath,RadarMathRecord} from './radar-math.ts';
export type RadarOwnedSlot=Readonly<{key:string;recordIndex:number}>;
function invalid(message:string):never{throw new MathPolicyError('E_MATH_INVALID',`Radar math ownership: ${message}`);}

/** Reconcile sanitized root fields and literal labels against the native DB.
 * Every axis and visible legend has one copy; duplicate names never merge.
 */
export function reconcileRadarMathDb(math:RadarMath,native:RadarDbSnapshot):{snapshot:RadarDbSnapshot;slots:readonly RadarOwnedSlot[]}{
 const {labels}=math,ast=labels.ast;
 if(math.records.length!==labels.records.length)invalid('record coverage differs');
 const records=new Map<number,RadarMathRecord>();
 for(const [index,record]of math.records.entries()){
  const authored=labels.records[index]!;
  if(record.recordIndex!==index+1||authored.recordIndex!==record.recordIndex||authored.role!==record.role||records.has(record.recordIndex))invalid('record order or role differs');
  records.set(record.recordIndex,record);
 }
 const slots:RadarOwnedSlot[]=[];
 const root=(role:'title'|'accTitle'|'accDescr')=>{
  const authored=labels.records.findLast(record=>record.role===role);
  if(!authored){if(ast[role]!==undefined)invalid('root owner missing');return '';}
  if(!authored.active||authored.semanticValue!==(ast[role]??''))invalid('final root differs');
  // populateCommonDb skips empty surviving AST assignments after DB.clear().
  if(!authored.semanticValue)return '';
  if(role==='title')slots.push(Object.freeze({key:'title',recordIndex:authored.recordIndex}));
  return records.get(authored.recordIndex)!.dbValue;
 };
 const metadata={title:root('title'),accTitle:root('accTitle'),accDescr:root('accDescr')};
 const selected=(prefix:'axis'|'curve',index:number,item:{name:string;label?:string},visible:boolean)=>{
  const role=`${prefix}.${item.label===undefined?'name':'label'}`;
  const owners=labels.records.filter(record=>record.role===role&&record.itemIndex===index);
  if(owners.length!==1||!owners[0]!.active)invalid('display owner is not unique');
  const owner=owners[0]!,record=records.get(owner.recordIndex)!;
  if(owner.semanticValue!==(item.label??item.name)||record.dbValue!==owner.semanticValue)invalid('literal display value differs');
  if(visible)slots.push(Object.freeze({key:`${prefix}:${index}`,recordIndex:owner.recordIndex}));
 };
 const input:RadarDbInput={axes:ast.axes,curves:ast.curves,options:ast.options,metadata};
 const snapshot=reconcileRadarDb(input,native);
 ast.axes.forEach((axis,index)=>selected('axis',index,axis,true));
 ast.curves.forEach((curve,index)=>selected('curve',index,curve,snapshot.options.showLegend));
 return {snapshot,slots:Object.freeze(slots)};
}
