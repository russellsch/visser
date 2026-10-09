import {isDeepStrictEqual} from 'node:util';
import {EMPTY_MATH_RESOURCE_TOTAL,MathPolicyError,reserveMathOccurrences,type MathResourceTotal} from '../math/policy.ts';
import {validateMermaidMathLabel} from './math.ts';
import {sankeyDisplayTextReplacements,sankeyMathTextReplacements} from './sankey-text.ts';
import {reconcileSankeyDb,type SankeyDbSnapshot,type SankeyOwnedSlot} from './sankey-db.ts';
import type {SankeyMath,SankeyMathRecord} from './sankey-math.ts';

type EncodedSnapshot=Omit<SankeyDbSnapshot,'graph'>&{graph:Omit<SankeyDbSnapshot['graph'],'links'>&{links:Array<{source:string;target:string;value:string}>}};
export type SankeyTransportRecord=Pick<SankeyMathRecord,'recordIndex'|'role'|'dbValue'|'renderedValue'|'parts'>&{rowIndex:number};
export type SankeyRenderMath=Readonly<{version:1;snapshot:EncodedSnapshot;candidates:readonly SankeyOwnedSlot[];records:readonly SankeyTransportRecord[];rows:ReadonlyArray<{rowIndex:number;sourceRecord:number;targetRecord:number;value:string}>;total:MathResourceTotal}>;
function invalid(message:string):never {throw new MathPolicyError('E_MATH_INVALID',`Sankey transport: ${message}`);}
const encode=(value:number)=>Object.is(value,-0)?'-0':String(value);
function decode(value:string):number {
 if(typeof value!=='string')invalid('flow value is not a canonical number');
 const number=Number(value);if(!Number.isFinite(number)||number<0||encode(number)!==value)invalid('flow value is not finite nonnegative canonical data');return number;
}
export function decodeSankeyTransportSnapshot(snapshot:EncodedSnapshot):SankeyDbSnapshot {
 return {...snapshot,graph:{nodes:structuredClone(snapshot.graph.nodes),links:snapshot.graph.links.map(link=>({...link,value:decode(link.value)}))}};
}
function edit(text:string,changes:readonly {start:number;end:number;text:string}[]):string {
 let out='',at=0;for(const change of changes){out+=text.slice(at,change.start)+change.text;at=change.end;}return out+text.slice(at);
}
export function sankeyMathTransport(math:SankeyMath,snapshot:SankeyDbSnapshot,candidates:readonly SankeyOwnedSlot[]):SankeyRenderMath {
 const result:SankeyRenderMath={version:1,snapshot:{...snapshot,graph:{nodes:structuredClone(snapshot.graph.nodes),links:snapshot.graph.links.map(link=>({...link,value:encode(link.value)}))}},candidates:structuredClone(candidates),total:{...math.total},
  records:math.records.map(({recordIndex,role,dbValue,renderedValue,parts},index)=>({recordIndex,role,dbValue,renderedValue,parts,rowIndex:math.labels.records[index]!.rowIndex})),
  rows:math.labels.rows.map(({rowIndex,sourceRecord,targetRecord,value})=>({rowIndex,sourceRecord,targetRecord,value:encode(value)}))};
 reserveSankeyTransportMath(result);return result;
}

/** Revalidate every occurrence, then replay exact native graph/first ownership. */
export function reserveSankeyTransportMath(math:SankeyRenderMath,initial:MathResourceTotal=EMPTY_MATH_RESOURCE_TOTAL):MathResourceTotal {
 if(math.version!==1)invalid('unknown transport version');
 let own=EMPTY_MATH_RESOURCE_TOTAL,total=initial;
 for(const [index,record]of math.records.entries()){
  if(record.recordIndex!==index+1||!['source','target'].includes(record.role))invalid('authored identity differs');
  const display=edit(record.dbValue,sankeyDisplayTextReplacements(record.dbValue));if(display!==record.renderedValue)invalid('native/display value differs');
  const validation=edit(record.dbValue,sankeyMathTextReplacements(record.dbValue)),checked=validateMermaidMathLabel(validation,own),shown=display===validation?checked:validateMermaidMathLabel(display,own);
  if(!isDeepStrictEqual(checked.total,shown.total))invalid('display/validation costs differ');
  const parts=record.parts.map(part=>{if(part.kind==='text')return part;const {origins:_,synthetic:__,...semantic}=part;return semantic;});
  if(!isDeepStrictEqual(parts,shown.parts))invalid('formula parts or measured costs differ');
  own=checked.total;for(const part of shown.parts)if(part.kind==='math')total=reserveMathOccurrences(total,{svgBytes:part.mathmlBytes,elementCount:part.elementCount},1);
 }
 if(!isDeepStrictEqual(own,math.total))invalid('authored total differs');
 const snapshot=decodeSankeyTransportSnapshot(math.snapshot),rows=math.rows.map(row=>({...row,value:decode(row.value)}));
 const plan=reconcileSankeyDb({records:math.records,labels:{records:math.records,rows}},snapshot);
 if(!isDeepStrictEqual(plan.candidates,math.candidates))invalid('candidate ownership differs');
 return total;
}
