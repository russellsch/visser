import {withERField,type ERFieldPlan} from './mermaid-er-context.ts';
import {measureMermaidLabel} from './mermaid-label.ts';
import {erMathText,type ERDisplayPath} from '../../core/src/mermaid/er-text.ts';
import {validateMermaidMathLabel} from '../../core/src/mermaid/math.ts';
export {erMeasuredGroup} from './mermaid-er-context.ts';

function isMath(plan:ERFieldPlan,input:string,path:ERDisplayPath):boolean{
 if(typeof input!=='string'||erMathText(input,path)!==plan.canonical)throw new Error('ER label normalization differs');
 return validateMermaidMathLabel(plan.canonical).parts.some(part=>part.kind==='math');
}
function bind(element:Element,plan:ERFieldPlan,lifetime:'measurement'|'retained'){
 if(lifetime==='retained')element.setAttribute('data-vs-mermaid-label',plan.key);
}
async function measure(group:any,plan:ERFieldPlan,style:string,className:string){
 const element=group.node()as SVGElement;
 group.attr('style',style);
 const computed=element.ownerDocument.defaultView!.getComputedStyle(element);
 return measureMermaidLabel(element.ownerSVGElement!,plan.canonical,className,{
  fontFamily:computed.fontFamily,fontSize:computed.fontSize,fontWeight:computed.fontWeight,
  fontStyle:computed.fontStyle,letterSpacing:computed.letterSpacing,color:computed.color,
  labelStyle:style,measurementParent:element,interpretBreakTags:false,
 });
}

/** Leaf Dagre groups and ELK's temporary group measurements share labelHelper.
 * The pinned caller explicitly marks temporary work; ordinary shared shapes do
 * not enter this field hook. Native callers own temporary element removal. */
export function createERGroupNodeLabel(original:(...args:any[])=>Promise<any>,normalize:(input:string)=>string,groupStyle:(node:any)=>string){
 return async(parent:any,node:any,classes?:string,lifetime:'measurement'|'retained'='retained')=>{
  if(!node.isGroup)return original(parent,node,classes);
  let input='';
  return withERField(parent.node(),()=>{
   if(typeof node.label!=='string')throw new Error('ER group label is not text');
   input=normalize(node.label);
   return {node,field:'title',path:'group-node',copy:'single',lifetime,input};
  },async plan=>{
   if(!isMath(plan,input,'group-node')){
    const result=await original(parent,node,classes);bind(result.label.node(),plan,lifetime);if(lifetime==='measurement')result.shapeSvg.attr('data-vs-er-measurement',plan.key);return result;
   }
   const shapeSvg=parent.insert('g').attr('class',classes||'node default').attr('id',node.domId||node.id);
   if(lifetime==='measurement')shapeSvg.attr('data-vs-er-measurement',plan.key);
   const label=shapeSvg.insert('g').attr('class','label');
   // Temporary common-layout measurement precedes native cluster style
   // compilation. Use that same compiled style without mutating the node;
   // retained leaf groups already arrive with their native labelStyle set.
   const measured=await measure(label,plan,lifetime==='measurement'?groupStyle(node):node.labelStyle||'','erGroupLabel');
   const width=Math.max(measured.width,node.label&&!node.width?node.minWidth??0:0);
   measured.place(label.node(),-width/2,-measured.height/2);bind(label.node(),plan,lifetime);
   return {shapeSvg,bbox:{x:0,y:0,width,height:measured.height},halfPadding:(node.padding??0)/2,label};
  },()=>original(parent,node,classes));
 };
}

/** Cluster rect owns the surrounding geometry and its final title transform. */
export async function erClusterLabel(label:any,node:any,style:string,native:()=>Promise<any>){
 const path=node.isGroup?'group-cluster':'raw-cluster';
 return withERField(label.node(),{node,field:node.isGroup?'title':'name',path,copy:'single',lifetime:'retained',input:node.label},async plan=>{
  if(!isMath(plan,node.label,path)){const bbox=await native();bind(label.node(),plan,'retained');return bbox;}
  const measured=await measure(label,plan,style||node.labelStyle||'','erClusterLabel');
  measured.place(label.node(),0,0);bind(label.node(),plan,'retained');
  return {x:0,y:0,width:measured.width,height:measured.height};
 },native);
}

/** Retain native edge registries, routing and terminal handling. Only the
 * central label's creation/measurement/centering is replaced for math. */
export async function erEdgeLabel(label:any,edge:any,style:string,native:()=>Promise<any>){
 return withERField(label.node(),{node:edge,field:'role',path:'edge',copy:'single',lifetime:'retained',input:edge.label??''},async plan=>{
  if(!isMath(plan,edge.label??'','edge')){const result=await native();bind(label.node(),plan,'retained');return result;}
  if(['startLabelLeft','startLabelRight','endLabelLeft','endLabelRight'].some(key=>edge[key]))throw new Error('ER math edge has unexpected terminal labels');
  const measured=await measure(label,plan,style||'','erEdgeLabel');
  label.insert('rect',':first-child').attr('x',0).attr('y',0).attr('width',measured.width).attr('height',measured.height);
  const labelElement=measured.place(label.node(),0,0);
  label.attr('transform',`translate(${-measured.width/2},${-measured.height/2})`);bind(label.node(),plan,'retained');
  return {labelElement,bbox:{x:0,y:0,width:measured.width,height:measured.height}};
 },native);
}
