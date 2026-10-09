import {EMPTY_MATH_RESOURCE_TOTAL,MathPolicyError,type MathResourceTotal} from '../math/policy.ts';
import {extractSankeyLabels,type SankeyLabelRecord,type SankeyLabels} from './sankey-labels.ts';
import {normalizeMermaidSource} from './rules.ts';
import {prepareSequenceSanitizer,sanitizeSequenceField} from './sequence-sanitize.ts';
import {MermaidSourceCoordinates,type LocatedSourceInterval} from './source-coordinates.ts';
import type {ProvenanceText} from './source-provenance.ts';
import {validateMermaidMathLabel,type MermaidMathExpression,type MermaidMathText} from './math.ts';
import {sankeyDisplayTextReplacements,sankeyMathTextReplacements} from './sankey-text.ts';

export type SankeyMathExpression=MermaidMathExpression & {origins:readonly LocatedSourceInterval[];synthetic:boolean};
export type SankeyMathRecord=Readonly<{recordIndex:number;role:SankeyLabelRecord['role'];dbValue:string;renderedValue:string;mappedInput:ProvenanceText;parts:readonly (MermaidMathText|SankeyMathExpression)[]}>;
export type SankeyMath=Readonly<{labels:SankeyLabels;records:readonly SankeyMathRecord[];total:MathResourceTotal}>;
export class LocatedSankeyMathError extends MathPolicyError {
 readonly startLine:number|undefined;readonly startByte:number|undefined;readonly endByte:number|undefined;
 readonly intervals:readonly LocatedSourceInterval[];readonly rowIndex:number;readonly role:'source'|'target'|'value';
 constructor(error:MathPolicyError,intervals:readonly LocatedSourceInterval[],rowIndex:number,role:'source'|'target'|'value'){
  super(error.code,`sankey ${role} row ${rowIndex+1}: ${error.message}`);this.name='LocatedSankeyMathError';this.intervals=intervals;this.rowIndex=rowIndex;this.role=role;
  this.startLine=intervals[0]?.startLine;this.startByte=intervals[0]?.startByte;this.endByte=intervals.at(-1)?.endByte;
 }
}
function edit(value:ProvenanceText,edits:readonly {start:number;end:number;text:string}[]):ProvenanceText {
 const parts:ProvenanceText[]=[];let at=0;
 for(const change of edits){const span=value.slice(change.start,change.end);parts.push(value.slice(at,change.start),span.replace(0,span.length,change.text));at=change.end;}
 return value.slice(0,0).concatAll([...parts,value.slice(at,value.length)]);
}

/** Validate every endpoint occurrence before native sanitized-name deduplication. */
export async function extractSankeyMath(original:string,initial:MathResourceTotal=EMPTY_MATH_RESOURCE_TOTAL,rendered=normalizeMermaidSource(original)):Promise<SankeyMath> {
 const labels=await extractSankeyLabels(original,rendered),coordinates=new MermaidSourceCoordinates(original);
 if(labels.records.some(record=>record.semanticValue.includes('<')))await prepareSequenceSanitizer();
 const records:SankeyMathRecord[]=[];let total=initial;
 for(const record of labels.records)try{
  const db=sanitizeSequenceField(record.mappedValue),validation=edit(db,sankeyMathTextReplacements(db.text)),display=edit(db,sankeyDisplayTextReplacements(db.text));
  const checked=validateMermaidMathLabel(validation.text,total),shown=display.text===validation.text?checked:validateMermaidMathLabel(display.text,total);
  if(JSON.stringify(checked.total)!==JSON.stringify(shown.total))throw new MathPolicyError('E_MATH_INVALID','Sankey display and validation costs differ');
  const parts=shown.parts.map(part=>{
   if(part.kind==='text')return part;
   const location=coordinates.locateRange(display,part.start,part.end);return {...part,origins:Object.freeze(location.intervals),synthetic:location.synthetic};
  });
  records.push(Object.freeze({recordIndex:record.recordIndex,role:record.role,dbValue:db.text,renderedValue:display.text,mappedInput:display,parts:Object.freeze(parts)}));total=checked.total;
 }catch(error){if(error instanceof MathPolicyError)throw new LocatedSankeyMathError(error,record.intervals,record.rowIndex,record.role);throw error;}
 for(const row of labels.rows){
  const problem=row.valueText.text.includes('$$')?'equations are not supported in numeric flow values':total.occurrences>initial.occurrences&&(!Number.isFinite(row.value)||row.value<0)?'math diagrams require finite nonnegative flow values':undefined;
  if(problem){const location=coordinates.locateRange(row.valueText,0,row.valueText.length);throw new LocatedSankeyMathError(new MathPolicyError('E_MATH_INVALID',problem),location.intervals,row.rowIndex,'value');}
 }
 return Object.freeze({labels,records:Object.freeze(records),total});
}
