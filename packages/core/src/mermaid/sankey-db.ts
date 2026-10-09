import {isDeepStrictEqual} from 'node:util';
import {MathPolicyError} from '../math/policy.ts';
import type {SankeyMathRecord} from './sankey-math.ts';
import type {SankeyLabelRecord,SankeyRow} from './sankey-labels.ts';

export type SankeyGraph={nodes:Array<{id:string}>;links:Array<{source:string;target:string;value:number}>};
export type SankeyDbSnapshot={version:1;graph:SankeyGraph;title:string;accTitle:string;accDescr:string};
export type SankeyNativeDb={getGraph():SankeyGraph;getDiagramTitle():string;getAccTitle():string;getAccDescription():string};
export type SankeyOwnedSlot=Readonly<{key:string;nodeIndex:number;recordIndex:number}>;
export type SankeyReconcileInput=Readonly<{
 records:ReadonlyArray<Pick<SankeyMathRecord,'recordIndex'|'role'|'dbValue'>>;
 labels:Readonly<{records:ReadonlyArray<Pick<SankeyLabelRecord,'recordIndex'|'role'|'rowIndex'>>;rows:ReadonlyArray<Pick<SankeyRow,'rowIndex'|'sourceRecord'|'targetRecord'|'value'>>}>;
}>;
function invalid(message:string):never {throw new MathPolicyError('E_MATH_INVALID',`Sankey native reconciliation: ${message}`);}

/** getGraph returns fresh arrays; clone again to make the capture contract explicit.
 * Never use db.nodesMap: native clear replaces its closure, not that export. */
export function captureSankeyDb(db:SankeyNativeDb):SankeyDbSnapshot {
 return structuredClone({version:1,graph:db.getGraph(),title:db.getDiagramTitle(),accTitle:db.getAccTitle(),accDescr:db.getAccDescription()});
}

/** Replay every endpoint in CSV order using already-attested native sanitation.
 * Identity is the DB value, before formula-only display normalization. */
export function reconcileSankeyDb(math:SankeyReconcileInput,native:SankeyDbSnapshot):{snapshot:SankeyDbSnapshot;candidates:readonly SankeyOwnedSlot[]} {
 if(math.records.length!==math.labels.records.length||math.records.length!==math.labels.rows.length*2)invalid('authored record coverage differs');
 const graph:SankeyGraph={nodes:[],links:[]},owners=new Map<string,number>(),candidates:SankeyOwnedSlot[]=[];
 let next=1;
 const use=(recordIndex:number,role:'source'|'target',rowIndex:number):string=>{
  const record=math.records[recordIndex-1],authored=math.labels.records[recordIndex-1];
  if(recordIndex!==next++||!record||!authored||record.recordIndex!==recordIndex||authored.recordIndex!==recordIndex||record.role!==role||authored.role!==role||authored.rowIndex!==rowIndex||typeof record.dbValue!=='string')invalid('endpoint ownership or order differs');
  const id=record.dbValue;
  if(!owners.has(id)){
   const nodeIndex=graph.nodes.length;owners.set(id,recordIndex);graph.nodes.push({id});candidates.push(Object.freeze({key:`node:${nodeIndex}`,nodeIndex,recordIndex}));
  }
  return id;
 };
 for(const [index,row]of math.labels.rows.entries()){
  if(row.rowIndex!==index||typeof row.value!=='number')invalid('CSV row identity or numeric value differs');
  const source=use(row.sourceRecord,'source',index),target=use(row.targetRecord,'target',index);
  graph.links.push({source,target,value:row.value});
 }
 // The admitted CSV grammar has no title/accessibility declarations; source
 // configuration is rejected before collection. Do not invent metadata slots.
 const expected:SankeyDbSnapshot={version:1,graph,title:'',accTitle:'',accDescr:''};
 if(!isDeepStrictEqual(native,expected))invalid('actual native graph or metadata differs');
 return {snapshot:structuredClone(native),candidates:Object.freeze(candidates)};
}
