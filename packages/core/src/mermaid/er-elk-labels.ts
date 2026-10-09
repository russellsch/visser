import {MathPolicyError} from '../math/policy.ts';
import type {ERLabels} from './er-labels.ts';
import type {ERNormalizedDbEffects} from './er-db-effects.ts';
import type {projectEROwners,ERFieldOwner} from './er-owners.ts';
import {ER_LAYOUT_OWNER,type tagERLayoutOwners} from './er-layout-owners.ts';
import {materializeERField} from './er-field.ts';
import type {ERDisplayPath} from './er-text.ts';
import type {ProvenanceText} from './source-provenance.ts';
export type ERElkLabel=Readonly<{
 key:string;token:string;ownerKind:'entity'|'group'|'relationship';ownerIndex:number;
 field:string;path:ERDisplayPath;lifetime:'measurement'|'retained';
 copy:'single'|'background'|'foreground';value:ProvenanceText;fieldOwner:ERFieldOwner;
}>;
function invalid(message:string):never{throw new MathPolicyError('E_MATH_INVALID',`ER ELK labels: ${message}`);}
/** ELK's native preparation changes breaks before edge measurement. No private
 * entity decoding or sanitizer serialization recovery belongs to this stage. */
export function mapERElkEdgeInput(value:ProvenanceText):ProvenanceText{return value.replaceRegex(/<\/?br\s*\/?>/gi,()=> '\n');}
/** Consumes reconciled native getData before ELK preparation/measurement. Tokens
 * are attached before its in-place paint sorting. Native graph ID collisions
 * do not deduplicate these original node/edge arrays or their label calls.
 * The plan is conditional on successful layout; it does not validate geometry. */
export function planERElkLabels(labels:ERLabels,normalized:ERNormalizedDbEffects,owners:ReturnType<typeof projectEROwners>,tagged:ReturnType<typeof tagERLayoutOwners>){
 const registry=new Map(tagged.registry.map(entry=>[entry.token,entry]));
 if(registry.size!==tagged.registry.length)invalid('duplicate registry token');
 const used=new Set<string>(),keys=new Set<string>(),result:ERElkLabel[]=[];
 const db=new Map(normalized.fields.map(field=>[field.recordIndex,field.normalization]));
 const owner=(item:any,edge:boolean)=>{
  const token=item?.[ER_LAYOUT_OWNER],entry=registry.get(token);
  if(!entry||used.has(token)||item.id!==entry.nativeId||(edge?entry.owner.kind!=='relationship':entry.owner.kind==='relationship'))invalid('native owner identity differs');
  used.add(token);return entry;
 };
 const add=(entry:ReturnType<typeof owner>,field:string,path:ERDisplayPath,fieldOwner:ERFieldOwner,lifetime:'measurement'|'retained',rough=false,value=materializeERField(labels,fieldOwner))=>{
  for(const copy of rough?['background','foreground']as const:['single']as const){
   const key=`${entry.token}:${field}:${lifetime}:${copy}`;if(keys.has(key))invalid('duplicate label key');keys.add(key);
   result.push(Object.freeze({key,token:entry.token,ownerKind:entry.owner.kind,ownerIndex:entry.owner.index,field,path,lifetime,copy,value,fieldOwner}));
  }
 };
 for(const node of tagged.data.nodes){
  const entry=owner(node,false),index=entry.owner.index;
  if(entry.owner.kind==='group'){
   const group=owners.groups[index],field=group&&db.get(group.titleRecord);
   if(!group||group.groupIndex!==index||!field||field.role!=='subgraph.title'||node.isGroup!==true||node.shape!=='rect'||node.label!==field.dbValue.text)invalid('group native fields differ');
   const fieldOwner={kind:'record' as const,recordIndex:group.titleRecord};
   if(node.label)add(entry,'title','group-node',fieldOwner,'measurement',false,field.dbValue);
   add(entry,'title','group-cluster',fieldOwner,'retained',false,field.dbValue);
  }else{
   const entity=owners.entities[index];
   if(!entity||entity.entityIndex!==index||entity.suppressedByGroup||node.isGroup!==false||node.shape!=='erBox'||node.label!==labels.records[entity.nameRecord]!.semanticValue)invalid('entity native fields differ');
   const alias=entity.aliasRecord===undefined?'':labels.records[entity.aliasRecord]!.semanticValue;
   if(node.alias!==alias||!Array.isArray(node.attributes)||node.attributes.length!==entity.rows.length)invalid('entity alias or rows differ');
   const rough=node.look==='handDrawn';
   add(entry,'header',entity.headerPath==='simple'?'simple-header':'table',entity.header,'retained',rough);
   for(const row of entity.rows){
    const native=node.attributes[row.rowIndex];
    for(const field of ['type','name','keys','comment']as const){
     const value=materializeERField(labels,row[field]),actual=field==='keys'?(Array.isArray(native?.keys)?native.keys.join(','):undefined):native?.[field];
     if(value.text!==actual)invalid('attribute native field differs');
     add(entry,`row:${row.rowIndex}:${field}`,'table',row[field],'retained',rough,value);
    }
   }
  }
 }
 for(const edge of tagged.data.edges){
  const entry=owner(edge,true),relationship=owners.relationships[entry.owner.index];
  if(!relationship||relationship.relationshipIndex!==entry.owner.index||edge.start!==relationship.entityA||edge.end!==relationship.entityB)invalid('relationship endpoints differ');
  const fieldOwner={kind:'record' as const,recordIndex:relationship.roleRecord},raw=materializeERField(labels,fieldOwner);
  if(edge.label!==raw.text||['startLabelLeft','startLabelRight','endLabelLeft','endLabelRight'].some(key=>edge[key]))invalid('relationship native label differs');
  const value=mapERElkEdgeInput(raw);
  if(value.text)add(entry,'role','edge',fieldOwner,'retained',false,value);
 }
 if(used.size!==registry.size)invalid('unconsumed native owner');
 return Object.freeze(result);
}
