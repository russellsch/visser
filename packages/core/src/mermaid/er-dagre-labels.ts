import {MathPolicyError} from '../math/policy.ts';
import type {ERLabels} from './er-labels.ts';
import type {ERNormalizedDbEffects} from './er-db-effects.ts';
import type {projectEROwners,ERFieldOwner} from './er-owners.ts';
import type {observeERLayoutOwners} from './er-layout-owners.ts';
import type {ERDisplayPath} from './er-text.ts';
import type {ProvenanceText} from './source-provenance.ts';
import {materializeERField} from './er-field.ts';
export type ERPreparedLabel=Readonly<{
 key:string;ownerKind:'entity'|'group'|'relationship';ownerIndex:number;
 field:string;path:ERDisplayPath;copy:'single'|'background'|'foreground';
 value:ProvenanceText;fieldOwner:ERFieldOwner;
}>;
function invalid(message:string):never{throw new MathPolicyError('E_MATH_INVALID',`ER prepared labels: ${message}`);}
/** Plan retained label copies from reconciled pinned Dagre observations. Native
 * label invocation coverage still must be checked during actual rendering.
 * Default Dagre's node/edge measurement elements survive into final painting;
 * alternate layout temporary measurement is outside this contract. */
export function planERDagreLabels(labels:ERLabels,normalized:ERNormalizedDbEffects,owners:ReturnType<typeof projectEROwners>,observed:ReturnType<typeof observeERLayoutOwners>){
 const db=new Map(normalized.fields.map(field=>[field.recordIndex,field.normalization]));
 const result:ERPreparedLabel[]=[],keys=new Set<string>();
 const add=(token:string,kind:ERPreparedLabel['ownerKind'],index:number,field:string,path:ERDisplayPath,fieldOwner:ERFieldOwner,rough=false,value=materializeERField(labels,fieldOwner))=>{
  for(const copy of rough?['background','foreground']as const:['single']as const){
   const key=`${token}:${field}:${copy}`;
   if(keys.has(key))invalid('duplicate retained copy identity');keys.add(key);
   result.push(Object.freeze({key,ownerKind:kind,ownerIndex:index,field,path,copy,value,fieldOwner}));
  }
 };
 for(const node of observed.nodes){
  if(!node.owner){if(node.label)invalid('unowned native label');continue;}
  if(!node.token)invalid('owned node has no token');
  const {kind,index}=node.owner;
  if(kind==='group'){
   const group=owners.groups[index];if(!group||group.groupIndex!==index)invalid('group owner differs');
   const field=db.get(group.titleRecord);if(!field||field.role!=='subgraph.title'||field.dbValue.text!==node.label)invalid('group label differs');
   add(node.token,kind,index,'title',node.route==='node'?'group-node':'group-cluster',{kind:'record',recordIndex:group.titleRecord},false,field.dbValue);
  }else if(kind==='entity'){
   const entity=owners.entities[index];if(!entity||entity.entityIndex!==index)invalid('entity owner differs');
   const name=labels.records[entity.nameRecord]!;
   if(name.semanticValue!==node.label)invalid('entity native name differs');
   if(node.route!=='node'){
    // Top-level common painting refuses non-group clusters. No element was
    // measured for this node, so native positionNode would fail. Recursive
    // Dagre painting has a different children-based cluster branch.
    if(node.route==='cluster'&&node.graphPath.length===0&&node.isGroup!==true)invalid('native top-level entity cluster cannot render');
    // Native cluster drawing never enters erBox's alias override or table.
    add(node.token,kind,index,'name','raw-cluster',{kind:'record',recordIndex:entity.nameRecord});continue;
   }
   if(node.shape!=='erBox')invalid('entity native shape differs');
   const alias=entity.aliasRecord===undefined?'':labels.records[entity.aliasRecord]!.semanticValue;
   if((node.alias??'')!==alias)invalid('entity native alias differs');
   const rough=node.look==='handDrawn';
   add(node.token,kind,index,'header',entity.headerPath==='simple'?'simple-header':'table',entity.header,rough);
   for(const row of entity.rows)for(const field of ['type','name','keys','comment']as const)add(node.token,kind,index,`row:${row.rowIndex}:${field}`,'table',row[field],rough);
  }else invalid('relationship owner on node');
 }
 for(const edge of observed.edges){
  if(!edge.owner){if(edge.label)invalid('unowned edge label');continue;}
  if(edge.owner.kind!=='relationship'||!edge.token)invalid('edge owner differs');
  // First/last self-loop segments deliberately have erased center labels.
  if(edge.selfLoopOrder!==undefined&&edge.selfLoopOrder!==1){if(edge.label)invalid('self-loop outer label differs');continue;}
  const relationship=owners.relationships[edge.owner.index];
  if(!relationship||relationship.relationshipIndex!==edge.owner.index||labels.records[relationship.roleRecord]!.semanticValue!==edge.label)invalid('relationship label differs');
  add(edge.token,'relationship',edge.owner.index,'role','edge',{kind:'record',recordIndex:relationship.roleRecord});
 }
 return Object.freeze(result);
}
