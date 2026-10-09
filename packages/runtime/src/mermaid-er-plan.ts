import {ER_LAYOUT_OWNER,tagERLayoutOwners,observeERLayoutOwners} from '../../core/src/mermaid/er-layout-owners.ts';
import {enumerateERElkSlots,enumerateERDagreSlots,type ERRenderSlot} from '../../core/src/mermaid/er-slots.ts';
import {erMathText,erRendererSanitizes} from '../../core/src/mermaid/er-text.ts';
import {validateMermaidMathLabel} from '../../core/src/mermaid/math.ts';
import {EMPTY_MATH_RESOURCE_TOTAL} from '../../core/src/math/policy.ts';
import type {ERLayoutHooks} from './mermaid-er-context.ts';

function invalid(message:string):never{throw new Error(`ER render plan: ${message}`);}
/** Independent native slot accounting. Source provenance remains worker-owned;
 * final source binding must match these retained keys before publication. */
export function createERStagePlan(root:Element,normalize:(input:string)=>string){
 let tagged:ReturnType<typeof tagERLayoutOwners>|undefined;
 let slots:readonly ERRenderSlot[]|undefined;
 const expected=new Map<string,{slot:ERRenderSlot;input:string;canonical:string;math:number}>(),seen=new Set<string>();
 const measuredGroups=new Set<string>();
 const identity=(token:string,field:string,path:string,copy:string,lifetime:string)=>JSON.stringify([token,field,path,copy,lifetime]);
 const hooks:ERLayoutHooks={
  graph(data){
   if(tagged)invalid('repeated graph');
   tagged=tagERLayoutOwners(data,data.nodes.map((node,index)=>({kind:node.isGroup?'group':'entity',index})),data.edges.map((_,index)=>({kind:'relationship',index})));
   data.nodes=tagged.data.nodes;data.edges=tagged.data.edges;
  },
  async prepare(data,prepared){
   if(!tagged||slots)invalid('unexpected preparation');
   slots=data.layoutAlgorithm==='elk'?enumerateERElkSlots(tagged):enumerateERDagreSlots(tagged,observeERLayoutOwners((prepared as {graph:Parameters<typeof observeERLayoutOwners>[0]}).graph,tagged.registry));
   let total=EMPTY_MATH_RESOURCE_TOTAL;
   for(const slot of slots){
    const input=erRendererSanitizes(slot.path)?normalize(slot.input):slot.input,canonical=erMathText(input,slot.path);
    const checked=validateMermaidMathLabel(canonical,total);total=checked.total;
    const key=identity(slot.token,slot.field,slot.path,slot.copy,slot.lifetime);
    if(expected.has(key))invalid('duplicate field');
    expected.set(key,{slot,input,canonical,math:checked.parts.filter(part=>part.kind==='math').length});
   }
  },
  field(request){
   const key=identity(request.node?.[ER_LAYOUT_OWNER],request.field,request.path,request.copy,request.lifetime??'retained'),plan=expected.get(key);
   if(!plan||seen.has(key)||plan.input!==request.input)invalid('unplanned, repeated or changed field');
   seen.add(key);return {key:plan.slot.key,canonical:plan.canonical};
  },
  measuredGroup(node,topMargin){
   if(!tagged||!slots)invalid('group measurement before preparation');
   const key=identity(node?.[ER_LAYOUT_OWNER],'title','group-node','single','measurement'),plan=expected.get(key);
   if(!plan||!seen.has(key)||measuredGroups.has(key)||!tagged.data.nodes.includes(node))invalid('unplanned or repeated group measurement');
   measuredGroups.add(key);
   if(!plan.math||tagged.data.nodes.some(child=>child.parentId===node.id))return;
   const {width,height}=node.labelBBox??{},padding=node.padding??0;
   if(![width,height,padding,topMargin].every(value=>typeof value==='number'&&Number.isFinite(value)&&value>=0))invalid('invalid measured group dimensions');
   // Native ELK has no subgraph constraints for a group with no children.
   // Give that leaf its measured title size before ELK reserves node space.
   node.width=Math.max(node.width??0,width+padding);
   node.height=Math.max(node.height??0,height+topMargin);
  },
 };
 return {hooks,finish(){
  if(!root.isConnected||!slots||seen.size!==expected.size)invalid('incomplete stage');
  if(measuredGroups.size!==slots.filter(slot=>slot.lifetime==='measurement').length)invalid('incomplete group measurements');
  if(root.querySelector('[data-vs-er-measurement]'))invalid('temporary measurement survived');
  const retained=new Map([...expected.values()].filter(plan=>plan.slot.lifetime==='retained').map(plan=>[plan.slot.key,plan]));
  const labels=[...root.querySelectorAll('[data-vs-mermaid-label]')];
  if(labels.length!==retained.size)invalid('retained label count differs');
  let math=0;
  for(const label of labels){
   const key=label.getAttribute('data-vs-mermaid-label')!,plan=retained.get(key);
   if(!plan||label.querySelectorAll('math').length!==plan.math)invalid('retained label identity or formula count differs');
   retained.delete(key);math+=plan.math;
  }
  if(retained.size||root.querySelectorAll('math').length!==math)invalid('unowned formula');
  return slots;
 }};
}
