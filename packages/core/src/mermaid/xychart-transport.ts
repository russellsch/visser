import {visibleXYSlots,type XYVisibility} from './xychart-visibility.ts';
import { isDeepStrictEqual } from 'node:util';
import { EMPTY_MATH_RESOURCE_TOTAL,MathPolicyError,reserveMathOccurrences,type MathResourceTotal } from '../math/policy.ts';
import { validateMermaidMathLabel } from './math.ts';
import { xychartDisplayTextReplacements,xychartMathTextReplacements } from './xychart-text.ts';
import { reconcileXYDb,type XYDbSnapshot,type XYDbBaseline,type XYOwnedSlot } from './xychart-db.ts';
import type { XYMath,XYMathRecord } from './xychart-math.ts';
import type { XYEffect,XYLabelRecord } from './xychart-labels.ts';

// JSON numbers lose signed zero; undefined array members become null. Keep an
// exact canonical numeric spelling, including native sentinel values.
type NumericCode=string;
type NumericAxis={type:'linear';title:string;min:NumericCode;max:NumericCode};
type EncodedSnapshot=Omit<XYDbSnapshot,'data'>&{data:Omit<XYDbSnapshot['data'],'xAxis'|'yAxis'|'plots'>&{
 xAxis:NumericAxis|Extract<XYDbSnapshot['data']['xAxis'],{type:'band'}>;yAxis:NumericAxis;
 plots:Array<Omit<XYDbSnapshot['data']['plots'][number],'data'>&{data:Array<[string,NumericCode]>}>;
}};
type RangeEffect=Extract<XYEffect,{method:'setXAxisRangeData'|'setYAxisRangeData'}>;
type PlotEffect=Extract<XYEffect,{method:'setLineData'|'setBarData'}>;
type EncodedEffect=Exclude<XYEffect,RangeEffect|PlotEffect>
 |(Omit<RangeEffect,'min'|'max'>&{min:NumericCode;max:NumericCode})
 |(Omit<PlotEffect,'data'>&{data:ReadonlyArray<{value:NumericCode;recordIndex:number}>});
export type XYTransportRecord=Pick<XYMathRecord,'recordIndex'|'role'|'dbValue'|'renderedValue'|'parts'> & Pick<XYLabelRecord,'seriesIndex'|'memberIndex'>;
export type XYRenderMath=Readonly<{
 version:1;snapshot:EncodedSnapshot;baseline:XYDbBaseline;effects:readonly EncodedEffect[];
 candidates:readonly XYOwnedSlot[];visibility:XYVisibility;slots:readonly XYOwnedSlot[];records:readonly XYTransportRecord[];total:MathResourceTotal;
}>;
const invalid=(message:string):never=>{throw new MathPolicyError('E_MATH_INVALID',`XY transport: ${message}`);};
function encode(value:number|undefined):NumericCode {return value===undefined?'undefined':Object.is(value,-0)?'-0':String(value);}
function decode(value:NumericCode):number {
 if(typeof value!=='string'||value==='undefined')return invalid('numeric field is not a canonical number');
 const result=Number(value);
 if(encode(result)!==value)return invalid('numeric field is not canonical');
 return result;
}
function encodeSnapshot(snapshot:XYDbSnapshot):EncodedSnapshot {
 const {xAxis,yAxis,plots}=snapshot.data;
 return {...snapshot,data:{...snapshot.data,
  xAxis:xAxis.type==='linear'?{...xAxis,min:encode(xAxis.min),max:encode(xAxis.max)}:structuredClone(xAxis),
  yAxis:{...yAxis,min:encode(yAxis.min),max:encode(yAxis.max)},
  plots:plots.map(plot=>({...plot,data:plot.data.map(([x,y])=>[x,encode(y)])})),
 }};
}
export function decodeXYTransportSnapshot(snapshot:EncodedSnapshot):XYDbSnapshot {
 const {xAxis,yAxis,plots}=snapshot.data;
 return {...snapshot,data:{...snapshot.data,
  xAxis:xAxis.type==='linear'?{...xAxis,min:decode(xAxis.min),max:decode(xAxis.max)}:structuredClone(xAxis),
  yAxis:{...yAxis,min:decode(yAxis.min),max:decode(yAxis.max)},
  plots:plots.map(plot=>({...plot,data:plot.data.map(tuple=>{
   if(!Array.isArray(tuple)||tuple.length!==2||typeof tuple[0]!=='string')return invalid('plot datum must be an exact X/Y tuple');
   const [x,y]=tuple;return [x,y==='undefined'?undefined:decode(y)];
  })})),
 }};
}
function encodeEffect(effect:XYEffect):EncodedEffect {
 switch(effect.method){
  case 'setXAxisRangeData':case 'setYAxisRangeData':return {...effect,min:encode(effect.min),max:encode(effect.max)};
  case 'setLineData':case 'setBarData':return {...effect,data:effect.data.map(d=>({...d,value:encode(d.value)}))};
  default:return structuredClone(effect);
 }
}
function decodeEffect(effect:EncodedEffect):XYEffect {
 switch(effect.method){
  case 'setXAxisRangeData':case 'setYAxisRangeData':return {...effect,min:decode(effect.min),max:decode(effect.max)};
  case 'setLineData':case 'setBarData':return {...effect,data:effect.data.map(d=>({...d,value:decode(d.value)}))};
  default:return structuredClone(effect);
 }
}
function edited(text:string,edits:readonly {start:number;end:number;text:string}[]):string {
 let output='',cursor=0;
 for(const edit of edits){output+=text.slice(cursor,edit.start)+edit.text;cursor=edit.end;}
 return output+text.slice(cursor);
}
export function xyMathTransport(math:XYMath,snapshot:XYDbSnapshot,baseline:XYDbBaseline,candidates:readonly XYOwnedSlot[],visibility:XYVisibility):XYRenderMath {
 const result:XYRenderMath={version:1,visibility:{...visibility},slots:structuredClone(visibleXYSlots(candidates,visibility)),snapshot:encodeSnapshot(snapshot),baseline:{...baseline},candidates:structuredClone(candidates),effects:math.labels.effects.map(encodeEffect),total:{...math.total},
  records:math.records.map(({recordIndex,role,dbValue,renderedValue,parts},index)=>{
   const {seriesIndex,memberIndex}=math.labels.records[index]!;
   return {recordIndex,role,dbValue,renderedValue,parts, ...(seriesIndex===undefined?{}:{seriesIndex}),...(memberIndex===undefined?{}:{memberIndex})};
  })};
 reserveXYTransportMath(result);return result;
}

/** Revalidate formulas and replay ownership after lossless JSON transport. */
export function reserveXYTransportMath(math:XYRenderMath,initial:MathResourceTotal=EMPTY_MATH_RESOURCE_TOTAL):MathResourceTotal {
 if(math.version!==1)invalid('unknown transport version');
 let own=EMPTY_MATH_RESOURCE_TOTAL,total=initial;
 for(const [index,record] of math.records.entries()) {
  if(record.recordIndex!==index+1||!['title','accTitle','accDescr','xTitle','yTitle','category','seriesTitle','pointLabel'].includes(record.role))invalid('authored identity differs');
  const display=edited(record.dbValue,xychartDisplayTextReplacements(record.dbValue,record.role));
  if(display!==record.renderedValue)invalid('native/display value differs');
  const validation=edited(record.dbValue,xychartMathTextReplacements(record.dbValue,record.role));
  const checked=validateMermaidMathLabel(validation,own),shown=display===validation?checked:validateMermaidMathLabel(display,own);
  if(!isDeepStrictEqual(checked.total,shown.total))invalid('display/validation costs differ');
  const parts=record.parts.map(part=>{
   if(part.kind==='text')return part;
   const {origins:_,synthetic:__,...semantic}=part;return semantic;
  });
  if(!isDeepStrictEqual(parts,shown.parts))invalid('formula parts or measured costs differ');
  own=checked.total;
  for(const part of shown.parts)if(part.kind==='math')total=reserveMathOccurrences(total,{svgBytes:part.mathmlBytes,elementCount:part.elementCount},1);
 }
 if(!isDeepStrictEqual(own,math.total))invalid('authored total differs');
 const snapshot=decodeXYTransportSnapshot(math.snapshot),effects=math.effects.map(decodeEffect);
 const plan=reconcileXYDb({records:math.records,labels:{records:math.records,effects}},snapshot,math.baseline);
 if(!isDeepStrictEqual(plan.candidates,math.candidates))invalid('candidate ownership differs');
 if(!isDeepStrictEqual(visibleXYSlots(plan.candidates,math.visibility),math.slots))invalid('visible slot ownership differs');
 return total;
}
