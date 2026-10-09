import {MathPolicyError} from '../math/policy.ts';
import type {ERLabels,EREffect} from './er-labels.ts';
import {normalizeERDbField,type ERDbFieldRole,type ERDbNormalization} from './er-db-normalize.ts';

export type ERNormalizedDbEffects=Readonly<{
  effects:readonly EREffect[];
  fields:readonly Readonly<{recordIndex:number;normalization:ERDbNormalization}>[];
}>;
function invalid(message:string):never {
  throw new MathPolicyError('E_MATH_INVALID',`ER DB effect normalization: ${message}`);
}
const dbRole=(role:string):role is ERDbFieldRole=>role==='subgraph.title'||role==='accTitle'||role==='accDescr';

/** Connect grammar-owned records to DB-stage replay arguments. The caller must
 * supply the collector's complete labels; this is not source authentication or
 * proof of a completed native parse. Renderer-only fields remain untouched. */
export async function normalizeERDbEffects(labels:ERLabels,htmlLabels:boolean):Promise<ERNormalizedDbEffects> {
  if(typeof htmlLabels!=='boolean'||!labels||!Array.isArray(labels.records)||!Array.isArray(labels.effects))invalid('invalid input');
  const expected=new Set<number>();
  for(let i=0;i<labels.records.length;i++) {
    const record=labels.records[i]!;
    if(record.recordIndex!==i||typeof record.semanticValue!=='string'||record.mappedValue.text!==record.semanticValue)invalid('invalid record');
    if(dbRole(record.role))expected.add(i);
  }
  // Clone the complete graph once: attributes/specification aliases must not
  // disappear merely because DB-owned scalar fields require normalization.
  const effects=structuredClone(labels.effects) as unknown as Array<{method:string;args:any[];recordIndices:number[]}>;
  const fields:Array<{recordIndex:number;normalization:ERDbNormalization}>=[];
  const consumed=new Set<number>();
  for(const effect of effects) {
    if(!Array.isArray(effect.recordIndices)||effect.recordIndices.some(i=>!Number.isSafeInteger(i)||i<0||i>=labels.records.length))invalid('invalid owners');
    const role:ERDbFieldRole|undefined=effect.method==='addSubGraph'?'subgraph.title':effect.method==='setAccTitle'?'accTitle':effect.method==='setAccDescription'?'accDescr':undefined;
    const owned=effect.recordIndices.filter(i=>dbRole(labels.records[i]!.role));
    if(!role) {if(owned.length)invalid('DB field assigned to unrelated effect');continue;}
    if(owned.length!==1)invalid('DB effect requires exactly one field owner');
    const index=owned[0]!,record=labels.records[index]!;
    if(record.role!==role||consumed.has(index))invalid('wrong or repeated DB field owner');
    if(!Array.isArray(effect.args))invalid('invalid arguments');
    const raw=role==='subgraph.title'?effect.args[2]?.text:effect.args[0];
    if(raw!==record.semanticValue)invalid('field differs from owning grammar value');
    const normalization=await normalizeERDbField(record.mappedValue,role,htmlLabels);
    if(role==='subgraph.title')effect.args[2].text=normalization.sanitation.text;
    else effect.args[0]=normalization.dbValue.text;
    consumed.add(index);fields.push(Object.freeze({recordIndex:index,normalization}));
  }
  if(consumed.size!==expected.size||[...expected].some(i=>!consumed.has(i)))invalid('unconsumed DB field');
  fields.sort((a,b)=>a.recordIndex-b.recordIndex);
  // The returned graph is detached. Preserve its graph identity and prevent
  // accidental mutation before replay without changing collector input.
  const frozen=new WeakSet<object>();
  const freeze=(value:any):void=>{if(value&&typeof value==='object'&&!frozen.has(value)){frozen.add(value);for(const child of Object.values(value))freeze(child);Object.freeze(value);}};
  freeze(effects);
  return Object.freeze({effects,fields:Object.freeze(fields)});
}
