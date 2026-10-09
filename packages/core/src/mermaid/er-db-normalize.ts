import {MathPolicyError} from '../math/policy.ts';
import {sanitizeKanbanField,traceKanbanSanitation,type KanbanSanitation} from './kanban-sanitize.ts';
import type {ProvenanceText} from './source-provenance.ts';

export type ERDbFieldRole='subgraph.title'|'accTitle'|'accDescr';
export type ERDbNormalization=Readonly<{
  role:ERDbFieldRole;
  /** Group replay consumes this pre-trim value; common setters consume dbValue. */
  sanitation:ProvenanceText;
  dbValue:ProvenanceText;
  witness:KanbanSanitation;
}>;
const invalid=(message:string):never=>{throw new MathPolicyError('E_MATH_INVALID',`ER DB normalization: ${message}`);};
const valid=(role:unknown):role is ERDbFieldRole=>role==='subgraph.title'||role==='accTitle'||role==='accDescr';
const trim=(value:ProvenanceText)=>{
  const start=value.length-value.text.trimStart().length;
  return value.slice(start,start+value.text.trim().length);
};

/** Pure witness replay, not proof of native sanitation or source ownership.
 * Input is the grammar's semantic value; renderer-only transforms are excluded. */
export function traceERDbNormalization(
  input:ProvenanceText,role:ERDbFieldRole,witness:KanbanSanitation,
):ERDbNormalization {
  if(!valid(role)||!witness||typeof witness!=='object'||Array.isArray(witness)
    ||Object.keys(witness).length!==2||!Object.hasOwn(witness,'htmlLabels')
    ||!Object.hasOwn(witness,'passes')||typeof witness.htmlLabels!=='boolean'
    ||!Array.isArray(witness.passes))invalid('invalid role or witness');
  const detached=Object.freeze({htmlLabels:witness.htmlLabels,passes:Object.freeze([...witness.passes])});
  const sanitation=traceKanbanSanitation(input,detached);
  let dbValue=sanitation;
  if(role==='subgraph.title')dbValue=trim(sanitation);
  else if(role==='accTitle')dbValue=sanitation.slice(sanitation.length-sanitation.text.trimStart().length,sanitation.length);
  else dbValue=sanitation.replaceRegex(/\n\s+/g,()=> '\n');
  return Object.freeze({role,sanitation,dbValue,witness:detached});
}

/** Strict/default-config private sanitation, including native link hooks.
 * Native parity requires preparing those hooks before a fresh SVG-only parse.
 * That initialization belongs to the future ER lifecycle contract; this helper
 * never mutates Mermaid config, native DBs, or the shared native purifier. */
export async function normalizeERDbField(
  input:ProvenanceText,role:ERDbFieldRole,htmlLabels:boolean,
):Promise<ERDbNormalization> {
  if(!valid(role)||typeof htmlLabels!=='boolean')invalid('invalid role or mode');
  const sanitized=await sanitizeKanbanField(input,htmlLabels);
  return traceERDbNormalization(input,role,sanitized.witness);
}
