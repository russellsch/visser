import { quadrantDisplayTextReplacements } from './quadrant-text.ts';
import { isDeepStrictEqual } from 'node:util';
import { EMPTY_MATH_RESOURCE_TOTAL,MathPolicyError,reserveMathOccurrences,type MathResourceTotal } from '../math/policy.ts';
import type { QuadrantMath,QuadrantMathRecord } from './quadrant-math.ts';
import type { QuadrantDbSnapshot,QuadrantOwnedSlot } from './quadrant-db.ts';
export type QuadrantRenderMath=Readonly<{
 snapshot:QuadrantDbSnapshot;slots:readonly QuadrantOwnedSlot[];
 records:ReadonlyArray<Pick<QuadrantMathRecord,'recordIndex'|'role'|'dbValue'|'renderedValue'|'parts'>>;
 total:MathResourceTotal;
}>;
export function quadrantMathTransport(math:QuadrantMath,snapshot:QuadrantDbSnapshot,slots:readonly QuadrantOwnedSlot[]):QuadrantRenderMath {
 const result={snapshot,slots,total:math.total,records:math.records.map(({recordIndex,role,dbValue,renderedValue,parts})=>({recordIndex,role,dbValue,renderedValue,parts}))};
 reserveQuadrantTransportMath(result);return result;
}
export function reserveQuadrantTransportMath(math:QuadrantRenderMath,initial:MathResourceTotal=EMPTY_MATH_RESOURCE_TOTAL):MathResourceTotal {
 const invalid=(message:string):never=>{throw new MathPolicyError('E_MATH_INVALID',`quadrant transport: ${message}`);};
 let own=EMPTY_MATH_RESOURCE_TOTAL,total=initial;
 const last=new Map<string,QuadrantRenderMath['records'][number]>();
 for(const [index,record] of math.records.entries()){
  if(!['title','accTitle','accDescr','quadrant1','quadrant2','quadrant3','quadrant4','xLeft','xRight','yBottom','yTop','point'].includes(record.role))invalid('unknown authored role');
  if(record.recordIndex!==index+1 || record.parts.map(p=>p.source).join('')!==record.renderedValue)invalid('authored identity or display differs');
  let displayed='',cursor=0;
  for(const edit of quadrantDisplayTextReplacements(record.dbValue,record.role)){displayed+=record.dbValue.slice(cursor,edit.start)+edit.text;cursor=edit.end;}
  displayed+=record.dbValue.slice(cursor);
  if(displayed!==record.renderedValue)invalid('native and displayed record differ');
  last.set(record.role,record);
  for(const part of record.parts)if(part.kind==='math'){
   const cost={svgBytes:part.mathmlBytes,elementCount:part.elementCount};
   own=reserveMathOccurrences(own,cost,1);total=reserveMathOccurrences(total,cost,1);
  }
 }
 if(!isDeepStrictEqual(own,math.total))invalid('resource total differs');
 const expected:QuadrantOwnedSlot[]=[];
 const fields={title:'title',quadrant1:'quadrant1Text',quadrant2:'quadrant2Text',quadrant3:'quadrant3Text',quadrant4:'quadrant4Text',xLeft:'xAxisLeftText',xRight:'xAxisRightText',yBottom:'yAxisBottomText',yTop:'yAxisTopText'} as const;
 if(math.snapshot.version!==1 || math.snapshot.data.titleText!=='')invalid('snapshot version or phase differs');
 if((last.get('accTitle')?.dbValue??'')!==math.snapshot.accTitle || (last.get('accDescr')?.dbValue??'')!==math.snapshot.accDescr)invalid('accessible metadata differs');
 for(const [role,field] of Object.entries(fields)){
  const record=last.get(role),value=field==='title'?math.snapshot.title:math.snapshot.data[field as Exclude<typeof fields[keyof typeof fields],'title'>];
  if((record?.dbValue??'')!==value)invalid('final field differs');
  if(record?.dbValue)expected.push({key:role,role:record.role,recordIndex:record.recordIndex});
 }
 const points=math.records.filter(r=>r.role==='point').reverse();
 if(points.length!==math.snapshot.data.points.length)invalid('point count differs');
 for(const [pointIndex,record]of points.entries()){
  const point=math.snapshot.data.points[pointIndex]!;
  if(record.dbValue!==point.text || ![point.x,point.y].every(v=>Number.isFinite(Number(v))&&Number(v)>=0&&Number(v)<=1))invalid('point differs');
  expected.push({key:`point:${pointIndex}`,role:'point',recordIndex:record.recordIndex,pointIndex});
 }
 if(!isDeepStrictEqual(expected,math.slots))invalid('visible slot ownership differs');
 return total;
}
