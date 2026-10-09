// Browser-safe ownership carried through native graph preparation. Inputs are
// reconciled getData entries and their ordinal owners, not arbitrary source.
export const ER_LAYOUT_OWNER='__visserERLayoutOwner';
export type ERLayoutOwner=Readonly<{kind:'entity'|'group'|'relationship';index:number}>;
export type ERLayoutRegistryEntry=Readonly<{token:string;owner:ERLayoutOwner;nativeId:string}>;
type NativeItem={id:string;[key:string]:any};
export type ERNativeData={nodes:NativeItem[];edges:NativeItem[];[key:string]:any};
type Graph={nodes():string[];node(id:string):any;children(id:string):string[];edges():any[];edge(edge:any):any};
function invalid(message:string):never{throw new Error(`ER layout ownership: ${message}`);}

/** Tag by checked native array ordinal, never by equal label text. Preserve
 * native IDs so duplicate IDs, self-loops and cluster rewrites retain native
 * topology. The caller remains responsible for native-data reconciliation. */
export function tagERLayoutOwners<T extends ERNativeData>(data:T,nodeOwners:readonly ERLayoutOwner[],edgeOwners:readonly ERLayoutOwner[]){
 if(!data||!Array.isArray(data.nodes)||!Array.isArray(data.edges)||data.nodes.length!==nodeOwners.length||data.edges.length!==edgeOwners.length)invalid('owner cardinality differs');
 const registry:ERLayoutRegistryEntry[]=[],seen=new Set<string>();
 const tag=(item:NativeItem,owner:ERLayoutOwner,slot:number,edge:boolean)=>{
  if(!item||typeof item.id!=='string'||ER_LAYOUT_OWNER in item)invalid('native identity is invalid or already tagged');
  if(!owner||!Number.isSafeInteger(owner.index)||owner.index<0||!(edge?owner.kind==='relationship':owner.kind==='entity'||owner.kind==='group'))invalid('invalid owner');
  const key=`${owner.kind}:${owner.index}`;
  if(seen.has(key))invalid('repeated ordinal owner');seen.add(key);
  const token=`${edge?'edge':'node'}:${slot}`;
  registry.push(Object.freeze({token,owner:Object.freeze({...owner}),nativeId:item.id}));
  return {...item,[ER_LAYOUT_OWNER]:token};
 };
 const nodes=data.nodes.map((item,index)=>tag(item,nodeOwners[index]!,index,false));
 const edges=data.edges.map((item,index)=>tag(item,edgeOwners[index]!,index,true));
 return Object.freeze({data:{...data,nodes,edges},registry:Object.freeze(registry)});
}

export type ERLayoutNodeObservation=Readonly<{
 graphPath:readonly string[];id:string;route:'node'|'cluster'|'extracted-cluster';
 owner?:ERLayoutOwner;token?:string;label?:string;alias?:string;shape?:string;look?:string;isGroup?:boolean;missing:boolean;
}>;
export type ERLayoutEdgeObservation=Readonly<{
 graphPath:readonly string[];v:string;w:string;name?:string;id?:string;
 owner?:ERLayoutOwner;token?:string;label?:string;selfLoopOrder?:number;
}>;
/** Observe topology before measurement. Extracted wrappers recover identity
 * from clusterData; native JSON/spread/structured clones retain the token.
 * Unowned native synthetic/phantom entries remain explicit. These observations
 * are NOT a render-copy plan or proof that native drawing will succeed. */
export function observeERLayoutOwners(graph:Graph,registry:readonly ERLayoutRegistryEntry[]){
 const entries=new Map<string,ERLayoutRegistryEntry>();
 for(const entry of registry){if(entries.has(entry.token))invalid('duplicate registry token');entries.set(entry.token,entry);}
 const lookup=(item:any,edge:boolean)=>{
  const token=item?.[ER_LAYOUT_OWNER];if(token===undefined)return {};
  const entry=entries.get(token);
  if(!entry||(edge?entry.owner.kind!=='relationship':entry.owner.kind==='relationship'))invalid('unknown or wrong-kind native owner');
  // Synthetic self-loop edges deliberately change their native IDs. Nodes
  // retain theirs, including extracted clusterData and generated-ID collisions.
  if(!edge&&item.id!==entry.nativeId)invalid('tagged node identity changed');
  return {owner:entry.owner,token:entry.token};
 };
 const nodes:ERLayoutNodeObservation[]=[],edges:ERLayoutEdgeObservation[]=[],seen=new Set<Graph>();
 const visit=(current:Graph,path:readonly string[])=>{
  if(!current||typeof current.nodes!=='function'||typeof current.node!=='function'||typeof current.children!=='function'||typeof current.edges!=='function'||typeof current.edge!=='function'||seen.has(current))invalid('invalid or repeated graph');
  seen.add(current);
  for(const id of current.nodes()){
   const native=current.node(id),extracted=native?.clusterNode===true,item=extracted?native.clusterData:native;
   if(extracted&&(!item||!native.graph))invalid('extracted cluster has no native data');
   const route=extracted?'extracted-cluster':current.children(id).length?'cluster':'node';
   const strings=Object.fromEntries(['label','alias','shape','look'].filter(key=>typeof item?.[key]==='string').map(key=>[key,item[key]]));
   nodes.push(Object.freeze({graphPath:Object.freeze([...path]),id,route,...lookup(item,false),...strings,...(typeof item?.isGroup==='boolean'?{isGroup:item.isGroup}:{}),missing:item==null}));
   if(extracted)visit(native.graph,[...path,id]);
  }
  for(const edge of current.edges()){
   const item=current.edge(edge);
   edges.push(Object.freeze({graphPath:Object.freeze([...path]),v:edge.v,w:edge.w,...(typeof edge.name==='string'?{name:edge.name}:{}),...lookup(item,true),
    ...(typeof item?.id==='string'?{id:item.id}:{}),...(typeof item?.label==='string'?{label:item.label}:{}),
    ...(Number.isSafeInteger(item?.selfLoop?.order)?{selfLoopOrder:item.selfLoop.order}:{})}));
  }
 };
 visit(graph,[]);
 return Object.freeze({nodes:Object.freeze(nodes),edges:Object.freeze(edges)});
}
