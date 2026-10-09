import {MathPolicyError} from '../math/policy.ts';
import type {ERLabels,ERLabelRole} from './er-labels.ts';
import type {ERNormalizedDbEffects} from './er-db-effects.ts';
import type {ERDbSnapshot} from './er-db.ts';
export type ERFieldOwner=Readonly<{kind:'record';recordIndex:number}|{kind:'joinedKeys';recordIndices:readonly number[]}|{kind:'empty'}>;
export type ERRowOwner=Readonly<{rowIndex:number;effectIndex:number;argumentRowIndex:number;type:ERFieldOwner;name:ERFieldOwner;keys:ERFieldOwner;comment:ERFieldOwner}>;
export type EREntityOwner=Readonly<{entityIndex:number;entityKey:string;nativeId:string;nameRecord:number;aliasRecord?:number;header:ERFieldOwner;headerPath:'simple'|'table';rows:readonly ERRowOwner[];suppressedByGroup:boolean}>;
export type ERRelationshipOwner=Readonly<{relationshipIndex:number;effectIndex:number;endpointRecords:readonly [number,number];roleRecord:number;entityA:string;entityB:string}>;
export type ERGroupOwner=Readonly<{groupIndex:number;effectIndex:number;idRecord:number;titleRecord:number}>;
const empty:ERFieldOwner=Object.freeze({kind:'empty'});
const owner=(recordIndex:number):ERFieldOwner=>Object.freeze({kind:'record',recordIndex});
function invalid(message:string):never{throw new MathPolicyError('E_MATH_INVALID',`ER ownership: ${message}`);}

/** Project ownership from complete, already-reconciled collector/effects/state.
 * This does not authenticate arbitrary supplied source or predict layout draw
 * copies. Every authored record remains available, including hidden fields. */
export function projectEROwners(labels:ERLabels,normalized:ERNormalizedDbEffects,snapshot:ERDbSnapshot) {
  const records=labels.records;
  const record=(index:number,role:ERLabelRole,value:unknown)=>{
    const r=records[index];
    if(!Number.isSafeInteger(index)||!r||r.recordIndex!==index||r.role!==role||r.semanticValue!==value)invalid(`record does not own ${role}`);
    return index;
  };
  if(normalized.effects.length!==labels.effects.length)invalid('effect count differs');
  type Entity={key:string;nameRecord:number;aliasRecord?:number;alias:string;rows:ERRowOwner[]};
  const entities=new Map<string,Entity>(),relationships:ERRelationshipOwner[]=[],groups:ERGroupOwner[]=[];
  const fields=new Map(normalized.fields.map(field=>[field.recordIndex,field.normalization]));
  const name=(r:number)=>records[r]!.semanticValue;
  for(let effectIndex=0;effectIndex<labels.effects.length;effectIndex++) {
    const effect=labels.effects[effectIndex]!,a=effect.args as any[],refs=effect.recordIndices;
    if(effect.method!==normalized.effects[effectIndex]!.method)invalid('effect order differs');
    if(effect.method==='addEntity') {
      if(refs.length!==a.length||(a.length!==1&&a.length!==2))invalid('entity owners differ');
      const nameRecord=record(refs[0]!,'entity.name',a[0]);
      const aliasRecord=a.length===2?record(refs[1]!,'entity.alias',a[1]):undefined;
      let entity=entities.get(a[0]);
      if(!entity){entity={key:a[0],nameRecord,alias:'',rows:[]};entities.set(a[0],entity);}
      if(!entity.alias&&a[1]){entity.alias=a[1];entity.aliasRecord=aliasRecord;}
    } else if(effect.method==='addAttributes') {
      const entity=entities.get(a[0]),declaration=labels.effects[effectIndex-1];
      if(!entity||!declaration||declaration.method!=='addEntity'||declaration.args[0]!==a[0]||!Array.isArray(a[1]))invalid('attribute declaration differs');
      const prefix=declaration.recordIndices;
      if(prefix.some((r,i)=>refs[i]!==r))invalid('attribute declaration owners differ');
      let cursor=prefix.length;
      const decoded:Omit<ERRowOwner,'rowIndex'>[]=[];
      for(let argumentRowIndex=0;argumentRowIndex<a[1].length;argumentRowIndex++) {
        const row=a[1][argumentRowIndex];
        const type=owner(record(refs[cursor++]!,'attribute.type',row.type));
        const attributeName=owner(record(refs[cursor++]!,'attribute.name',row.name));
        const keys:number[]=[];
        for(const key of row.keys??[])keys.push(record(refs[cursor++]!,'attribute.key',key));
        const comment=Object.hasOwn(row,'comment')?owner(record(refs[cursor++]!,'attribute.comment',row.comment)):empty;
        decoded.push({effectIndex,argumentRowIndex,type,name:attributeName,keys:keys.length?Object.freeze({kind:'joinedKeys',recordIndices:Object.freeze(keys)}):empty,comment});
      }
      if(cursor!==refs.length)invalid('unused attribute owners');
      for(const row of decoded.reverse())entity!.rows.push(Object.freeze({...row,rowIndex:entity!.rows.length}));
    } else if(effect.method==='addRelationship') {
      if(refs.length!==3)invalid('relationship owners differ');
      const endpointRecords=[record(refs[0]!,'entity.name',a[0]),record(refs[1]!,'entity.name',a[2])] as const;
      for(let endpoint=0;endpoint<2;endpoint++) {
        const prior=labels.effects[effectIndex-2+endpoint];
        if(prior?.method!=='addEntity'||prior.recordIndices[0]!==endpointRecords[endpoint])invalid('relationship endpoint occurrence differs');
      }
      const roleRecord=record(refs[2]!,'relationship.role',a[1]),relationshipIndex=relationships.length;
      const native=snapshot.relationships[relationshipIndex] as any;
      if(!native||native.roleA!==a[1])invalid('relationship state differs');
      relationships.push(Object.freeze({relationshipIndex,effectIndex,endpointRecords:Object.freeze(endpointRecords),roleRecord,entityA:native.entityA,entityB:native.entityB}));
    } else if(effect.method==='addSubGraph') {
      if(refs.length!==2)invalid('group owners differ');
      const idRecord=record(refs[0]!,'subgraph.id',a[0].text),titleRecord=record(refs[1]!,'subgraph.title',a[2].text),groupIndex=groups.length;
      const native=snapshot.subGraphs[groupIndex] as any,field=fields.get(titleRecord);
      if(!native||native.id!==name(idRecord).trim()||!field||field.dbValue.text!==native.title)invalid('group state differs');
      groups.push(Object.freeze({groupIndex,effectIndex,idRecord,titleRecord}));
    }
  }
  if(entities.size!==snapshot.entities.length||relationships.length!==snapshot.relationships.length||groups.length!==snapshot.subGraphs.length)invalid('state counts differ');
  const groupIds=new Set(snapshot.subGraphs.map(group=>(group as any).id));
  const value=(field:ERFieldOwner)=>field.kind==='empty'?'':field.kind==='record'?name(field.recordIndex):field.recordIndices.map(name).join(',');
  const projected:EREntityOwner[]=[];
  for(const [entityKey,entity]of entities) {
    const entityIndex=projected.length,[key,nativeValue]=snapshot.entities[entityIndex]!,native=nativeValue as any;
    if(key!==entityKey||native.id!==`entity-${entityKey}-${entityIndex}`||native.label!==name(entity.nameRecord)||native.alias!==entity.alias||native.attributes.length!==entity.rows.length)invalid('entity state differs');
    for(const row of entity.rows) {
      const actual=native.attributes[row.rowIndex];
      if(actual.type!==value(row.type)||actual.name!==value(row.name)||actual.keys.join(',')!==value(row.keys)||actual.comment!==value(row.comment))invalid('attribute state differs');
    }
    const header=owner(entity.aliasRecord??entity.nameRecord);
    projected.push(Object.freeze({entityIndex,entityKey,nativeId:native.id,nameRecord:entity.nameRecord,...(entity.aliasRecord===undefined?{}:{aliasRecord:entity.aliasRecord}),header,headerPath:entity.rows.length===0&&value(header)?'simple':'table',rows:Object.freeze(entity.rows),suppressedByGroup:groupIds.has(entityKey)}));
  }
  return Object.freeze({records,entities:Object.freeze(projected),relationships:Object.freeze(relationships),groups:Object.freeze(groups),displayGroupOrder:Object.freeze(groups.map(group=>group.groupIndex).reverse()),displayEntityOrder:Object.freeze(projected.filter(entity=>!entity.suppressedByGroup).map(entity=>entity.entityIndex))});
}
