import {isDeepStrictEqual} from 'node:util';
import {EMPTY_MATH_RESOURCE_TOTAL,MathPolicyError,reserveMathOccurrences,type MathResourceTotal} from '../math/policy.ts';
import type {InfoMath} from './info-math.ts';
import {validateMermaidMathLabel} from './math.ts';
export type InfoTransportRecord=Readonly<{recordIndex:number;role:'title'|'accTitle'|'accDescr';active:boolean;source:string}>;
export type InfoRenderMath=Readonly<{version:1;records:readonly InfoTransportRecord[];total:MathResourceTotal}>;
const roles=['title','accTitle','accDescr'] as const;const invalid=(m:string):never=>{throw new MathPolicyError('E_MATH_INVALID',`Info transport: ${m}`);};
const object=(v:unknown,keys:readonly string[])=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v as object).length!==keys.length||keys.some(k=>!Object.hasOwn(v as object,k)))invalid('object fields differ');};
export function infoMathTransport(math:InfoMath):InfoRenderMath{const records=math.labels.records.map(record=>({recordIndex:record.recordIndex,role:record.role,active:record.active,source:record.semanticValue})),total=records.reduce((sum,record)=>{for(const part of validateMermaidMathLabel(record.source).parts)if(part.kind==='math')sum=reserveMathOccurrences(sum,{svgBytes:part.mathmlBytes,elementCount:part.elementCount},1);return sum;},EMPTY_MATH_RESOURCE_TOTAL);const payload={version:1 as const,records,total};reserveInfoTransportMath(payload);return structuredClone(payload);}
export function reserveInfoTransportMath(payload:InfoRenderMath,initial:MathResourceTotal=EMPTY_MATH_RESOURCE_TOTAL):MathResourceTotal{
 object(payload,['version','records','total']);if(payload.version!==1||!Array.isArray(payload.records))invalid('version or records differs');let own:MathResourceTotal=EMPTY_MATH_RESOURCE_TOTAL,total=initial;reserveMathOccurrences(total,{svgBytes:0,elementCount:0},0);const last=new Map<string,number>();
 for(const [index,record]of payload.records.entries()){object(record,['recordIndex','role','active','source']);if(record.recordIndex!==index+1||!roles.includes(record.role)||typeof record.active!=='boolean'||typeof record.source!=='string')invalid('record shape differs');last.set(record.role,index);}
 for(const [index,record]of payload.records.entries()){if(record.active!==(last.get(record.role)===index))invalid('active overwrite state differs');const checked=validateMermaidMathLabel(record.source);for(const part of checked.parts)if(part.kind==='math'){const cost={svgBytes:part.mathmlBytes,elementCount:part.elementCount};own=reserveMathOccurrences(own,cost,1);total=reserveMathOccurrences(total,cost,1);}}
 if(!isDeepStrictEqual(payload.total,own))invalid('authored total differs');return total;
}
