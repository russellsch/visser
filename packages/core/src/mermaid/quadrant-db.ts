import { isDeepStrictEqual } from 'node:util';
import { MathPolicyError } from '../math/policy.ts';
import type { QuadrantMath } from './quadrant-math.ts';
import type { QuadrantLabelRole } from './quadrant-labels.ts';

export type QuadrantStyles = { radius?: number; color?: string; strokeColor?: string; strokeWidth?: string };
export type QuadrantDbSnapshot = {
  version: 1;
  data: { titleText:string; quadrant1Text:string;quadrant2Text:string;quadrant3Text:string;quadrant4Text:string;
    xAxisLeftText:string;xAxisRightText:string;yAxisBottomText:string;yAxisTopText:string;
    points:Array<QuadrantStyles & {x:string;y:string;text:string;className:string}> };
  classes:Array<[string,QuadrantStyles]>;
  title:string;accTitle:string;accDescr:string;
};
export type QuadrantOwnedSlot = Readonly<{key:string;role:QuadrantLabelRole;recordIndex:number;pointIndex?:number}>;
const fields = {quadrant1:'quadrant1Text',quadrant2:'quadrant2Text',quadrant3:'quadrant3Text',quadrant4:'quadrant4Text',
  xLeft:'xAxisLeftText',xRight:'xAxisRightText',yBottom:'yAxisBottomText',yTop:'yAxisTopText'} as const;
const invalid=(message:string):never=>{throw new MathPolicyError('E_MATH_INVALID',`quadrant native reconciliation: ${message}`);};

/** Capture before getQuadrantData, which mutates builder title/configuration. */
export function reconcileQuadrantDb(math:QuadrantMath,native:QuadrantDbSnapshot,parseStyles:(styles:string[])=>QuadrantStyles):{
  snapshot:QuadrantDbSnapshot; candidates:readonly QuadrantOwnedSlot[];
} {
  const byId=new Map<number,QuadrantMath['records'][number]>();
  const last=new Map<QuadrantLabelRole,QuadrantMath['records'][number]>();
  if(math.records.length!==math.labels.records.length) invalid('authored record coverage differs');
  for(const [index,record] of math.records.entries()) {
    const authored=math.labels.records[index]!;
    if(record.recordIndex!==index+1 || authored.recordIndex!==record.recordIndex || authored.role!==record.role || byId.has(record.recordIndex)) invalid('authored identity differs');
    byId.set(record.recordIndex,record); last.set(record.role,record);
  }
  const value=(role:QuadrantLabelRole)=>last.get(role)?.dbValue??'';
  const expected:QuadrantDbSnapshot={version:1,data:{titleText:'',quadrant1Text:'',quadrant2Text:'',quadrant3Text:'',quadrant4Text:'',xAxisLeftText:'',xAxisRightText:'',yAxisBottomText:'',yAxisTopText:'',points:[]},classes:[],title:value('title'),accTitle:value('accTitle'),accDescr:value('accDescr')};
  for(const [role,field] of Object.entries(fields)) expected.data[field as typeof fields[keyof typeof fields]]=value(role as QuadrantLabelRole);
  const classes=new Map<string,QuadrantStyles>();
  for(const definition of math.labels.classes) classes.set(definition.name,parseStyles([...definition.styles]));
  expected.classes=[...classes];
  const pointOwners=new Set<number>();
  const points=math.labels.points.map((point,index)=>{
    const record=byId.get(point.recordIndex),authored=math.labels.records[point.recordIndex-1];
    if(!record || record.role!=='point' || authored?.pointIndex!==index || pointOwners.has(point.recordIndex)) return invalid('point ownership differs');
    pointOwners.add(point.recordIndex);
    if (![point.x,point.y].every(coordinate => Number.isFinite(Number(coordinate)) && Number(coordinate)>=0 && Number(coordinate)<=1)) invalid('point coordinates cannot form a finite normalized layout');
    return {x:point.x,y:point.y,text:record.dbValue,className:point.className,...parseStyles([...point.styles])};
  });
  if(pointOwners.size!==math.records.filter(record=>record.role==='point').length) invalid('point coverage differs');
  expected.data.points=points.reverse();
  if(!isDeepStrictEqual(native,expected)) invalid('actual native fields, points, styles or metadata differ');
  const candidates:QuadrantOwnedSlot[]=[];
  // Visibility is subsequently attested against native built output/config.
  for(const role of ['title','quadrant1','quadrant2','quadrant3','quadrant4','xLeft','xRight','yBottom','yTop'] as const) {
    const record=last.get(role);
    if(record?.dbValue) candidates.push(Object.freeze({key:role,role,recordIndex:record.recordIndex}));
  }
  for(const [pointIndex,point] of [...math.labels.points].reverse().entries()) {
    candidates.push(Object.freeze({key:`point:${pointIndex}`,role:'point',recordIndex:point.recordIndex,pointIndex}));
  }
  return {snapshot:structuredClone(native),candidates:Object.freeze(candidates)};
}
