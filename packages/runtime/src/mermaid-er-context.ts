import type {ERDisplayPath} from '../../core/src/mermaid/er-text.ts';
// Private stage-scoped native ER boundaries. No authored DOM attribute can
// activate them. The caller supplies reconciled owners/plans; this module only
// enforces native invocation identity, order and failure cleanup.
export type ERRuntimeGraph={type:string;layoutAlgorithm:string;nodes:any[];edges:any[];[key:string]:any};
export type ERFieldRequest=Readonly<{node:any;field:string;copy:'single'|'background'|'foreground';path:ERDisplayPath;lifetime?:'measurement'|'retained';input:string}>;
export type ERFieldPlan=Readonly<{key:string;canonical:string}>;
export type ERLayoutHooks=Readonly<{
 field?(request:ERFieldRequest):ERFieldPlan;
 measuredGroup?(node:any,topMargin:number):void;
 graph(data:ERRuntimeGraph):void;
 prepare(data:ERRuntimeGraph,prepared:unknown):Promise<void>;
}>;
type Context={hooks:ERLayoutHooks;phase:'created'|'graph'|'preparing'|'prepared';data?:ERRuntimeGraph;layout?:string;poisoned:boolean;closed:boolean;pending:number};
const contexts=new WeakMap<Element,Context>();
export function hasERLayoutHooks(root:Element):boolean{return contexts.has(root);}
/** Native common measurement passes the original graph node here, even when
 * the title helper measured an unwrapped clone. This runs before ELK layout. */
export function erMeasuredGroup(element:Element,node:any,topMargin:number):void{
 let stage:Element|null=element,context:Context|undefined;
 for(;stage;stage=stage.parentElement){context=contexts.get(stage);if(context)break;}
 if(!context?.hooks.measuredGroup)return;
 if(context.closed||context.poisoned||context.phase!=='prepared'||!stage?.isConnected||context.data?.type!=='er'||context.data.layoutAlgorithm!==context.layout)invalid(context,'invalid group measurement boundary');
 try{
  const result=context.hooks.measuredGroup(node,topMargin)as unknown;
  if(result&&typeof(result as PromiseLike<unknown>).then==='function'){void Promise.resolve(result).catch(()=>{});invalid(context,'group measurement must be synchronous');}
 }catch(error){context.poisoned=true;throw error;}
}
function invalid(context:Context|undefined,message:string):never{
 if(context)context.poisoned=true;
 throw new Error(`ER layout hooks: ${message}`);
}
/** Own one attached staging SVG for the duration of native drawing. The caller
 * owns DOM commit/rollback. Cleanup happens even if native drawing or planning
 * fails; successful return requires both native boundaries exactly once. */
export async function withERLayoutHooks<T>(root:Element,hooks:ERLayoutHooks,draw:()=>Promise<T>):Promise<T>{
 const existing=contexts.get(root);
 if(existing)invalid(existing,'overlapping stage');
 if(root.namespaceURI!=='http://www.w3.org/2000/svg'||root.localName!=='svg'||!root.isConnected)invalid(undefined,'attached SVG stage required');
 const context:Context={hooks,phase:'created',poisoned:false,closed:false,pending:0};contexts.set(root,context);
 try{
  const result=await draw();
  const sameGraph=context.data?.type==='er'&&context.data.layoutAlgorithm===context.layout;
  if(!root.isConnected||!sameGraph||context.poisoned||context.pending!==0||context.phase!=='prepared')invalid(context,'incomplete or invalidated native boundaries');
  return result;
 }finally{context.closed=true;contexts.delete(root);}
}
/** Native ER draw calls this after registry resolution, before ER-specific
 * spacing adjustment. Graph IDs remain native; tagging belongs to hooks.graph. */
export function erNativeGraph(root:Element,data:ERRuntimeGraph):void{
 const context=contexts.get(root);if(!context)return;
 if(context.poisoned||context.closed||context.phase!=='created')invalid(context,'repeated or invalid graph boundary');
 if(data?.type!=='er'||!['elk','dagre'].includes(data.layoutAlgorithm)||!Array.isArray(data.nodes)||!Array.isArray(data.edges))invalid(context,'unexpected family, resolved layout or graph');
 context.data=data;context.layout=data.layoutAlgorithm;context.phase='graph';
 try{
  const result=context.hooks.graph(data) as unknown;
  if(result&&typeof(result as PromiseLike<unknown>).then==='function'){void Promise.resolve(result).catch(()=>{});invalid(context,'graph boundary must be synchronous');}
 }catch(error){context.poisoned=true;throw error;}
}
/** Shared native layout calls this after topology preparation and before its
 * first measurement. A failed or swallowed check poisons the whole stage. */
export async function erPreparedLayout(root:Element,data:ERRuntimeGraph,prepared:unknown):Promise<void>{
 const context=contexts.get(root);if(!context)return;
 if(context.poisoned||context.closed||context.phase!=='graph'||context.data!==data||data.type!=='er'||data.layoutAlgorithm!==context.layout)invalid(context,'unexpected preparation boundary');
 context.phase='preparing';
 try{
  await context.hooks.prepare(data,prepared);
  const sameGraph=context.data===data&&data.type==='er'&&data.layoutAlgorithm===context.layout;
  if(!sameGraph||context.poisoned||context.closed||contexts.get(root)!==context||context.phase!=='preparing')invalid(context,'preparation invalidated or stage closed');
  context.phase='prepared';
 }catch(error){context.poisoned=true;throw error;}
}

/** Dispatch an explicit native field slot. Missing hooks preserve native behavior.
 * A field failure poisons the stage even when native code catches its rejection. */
export async function withERField<T>(element:Element,request:ERFieldRequest|(()=>ERFieldRequest),render:(plan:ERFieldPlan)=>Promise<T>,native:()=>Promise<T>):Promise<T>{
 let root:Element|null=element,context:Context|undefined;
 for(;root;root=root.parentElement){context=contexts.get(root);if(context)break;}
 if(!context?.hooks.field)return native();
 const active=context,stage=root!;
 const valid=()=>contexts.get(stage)===active&&!active.closed&&!active.poisoned&&active.phase==='prepared'&&active.data?.type==='er'&&active.data.layoutAlgorithm===active.layout&&stage.isConnected&&stage.contains(element);
 if(!valid())invalid(active,'field outside prepared stage');
 active.pending++;
 try{
  const plan=active.hooks.field!(typeof request==='function'?request():request);
  if(!plan||typeof plan.key!=='string'||!plan.key||typeof plan.canonical!=='string')invalid(active,'invalid field plan');
  if(!valid())invalid(active,'field planning invalidated');
  const result=await render(plan);
  if(!valid())invalid(active,'field invalidated or stage closed');
  return result;
 }catch(error){active.poisoned=true;throw error;}
 finally{active.pending--;}
}
