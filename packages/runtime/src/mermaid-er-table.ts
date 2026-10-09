import {withERField,type ERFieldRequest} from './mermaid-er-context.ts';
import {measureMermaidLabel} from './mermaid-label.ts';
import {erMathText} from '../../core/src/mermaid/er-text.ts';
import {validateMermaidMathLabel} from '../../core/src/mermaid/math.ts';

const SVG='http://www.w3.org/2000/svg';
/** Replace the whole native addText operation for math, before table sizing.
 * Plain fields still take the native path. Source ownership and exact slot
 * coverage belong to the stage's field planner, not DOM IDs or label text. */
export function erTableRows(parent:any,node:any,copy:ERFieldRequest['copy'],native:(...args:any[])=>Promise<any>){
 return {async add(field:string,shapeSvg:any,input:string,config:any,x=0,y=0,classes:string[]=[],style=''){
  const element=shapeSvg.node() as SVGElement;
  return withERField(parent.node(),{node,field,copy,path:'table',input},async plan=>{
   if(typeof input!=='string'||erMathText(input,'table')!==plan.canonical)throw new Error('ER table field normalization differs');
   const math=validateMermaidMathLabel(plan.canonical).parts.some(part=>part.kind==='math');
   if(!math){
    const before=new Set(element.children),bounds=await native(shapeSvg,input,config,x,y,classes,style);
    const added=[...element.children].filter(child=>!before.has(child));
    if(added.length!==1)throw new Error('ER native table field structure differs');
    added[0]!.setAttribute('data-vs-mermaid-label',plan.key);
    return bounds;
   }
   const group=element.ownerDocument.createElementNS(SVG,'g');
   group.setAttribute('class',['label',...classes].join(' '));
   group.setAttribute('style',style);group.setAttribute('transform',`translate(${x},${y})`);
   group.setAttribute('data-vs-mermaid-label',plan.key);element.append(group);
   const computed=element.ownerDocument.defaultView!.getComputedStyle(group);
   const measured=await measureMermaidLabel(element.ownerSVGElement!,plan.canonical,'erLabel',{
    fontFamily:computed.fontFamily,fontSize:computed.fontSize,fontWeight:computed.fontWeight,
    fontStyle:computed.fontStyle,letterSpacing:computed.letterSpacing,color:computed.color,
    labelStyle:style,measurementParent:group,interpretBreakTags:false,
   });
   measured.place(group,0,0);
   // Native erBox mutates header height to include its row padding.
   return {x:0,y:0,width:measured.width,height:measured.height};
  },()=>native(shapeSvg,input,config,x,y,classes,style));
 }};
}


/** Simple erBox headers use drawRect/labelHelper instead of the table path.
 * Keep native sanitation, but replace source-width and text measurement together.
 * drawRect still owns rectangle geometry, style, bounds and intersections. */
export async function erSimpleHeader(parent:any,node:any,copy:ERFieldRequest['copy'],config:any,options:any,deps:{
 normalize(input:string):string;
 native():Promise<any>;
 draw(labelRenderer:(parent:any,node:any,classes:string)=>Promise<any>):Promise<any>;
}):Promise<{shapeSvg:any;math:boolean}>{
 let input='';
 return withERField(parent.node(),()=>{
  if(typeof node.label!=='string')throw new Error('ER simple header is not text');
  input=deps.normalize(node.label);
  return {node,field:'header',copy,path:'simple-header',input};
 },async plan=>{
  if(erMathText(input,'simple-header')!==plan.canonical)throw new Error('ER simple header normalization differs');
  if(!validateMermaidMathLabel(plan.canonical).parts.some(part=>part.kind==='math')){
   const shapeSvg=await deps.native();
   const label=shapeSvg.node().querySelector(':scope > g.label');
   if(!label)throw new Error('ER native simple header structure differs');
   label.setAttribute('data-vs-mermaid-label',plan.key);
   return {shapeSvg,math:false};
  }
  let calls=0;
  const shapeSvg=await deps.draw(async(labelParent,labelNode,classes)=>{
   if(++calls!==1||labelNode!==node||labelParent.node()!==parent.node())throw new Error('ER simple header label invocation differs');
   const shape=labelParent.insert('g').attr('class',classes||'node default').attr('id',node.domId||node.id);
   const label=shape.insert('g').attr('class','label').attr('style',node.labelStyle||'');
   const element=label.node() as SVGElement,computed=element.ownerDocument.defaultView!.getComputedStyle(element);
   element.setAttribute('data-vs-mermaid-label',plan.key);
   const measured=await measureMermaidLabel(element.ownerSVGElement!,plan.canonical,'erLabel',{
    fontFamily:computed.fontFamily,fontSize:computed.fontSize,fontWeight:computed.fontWeight,
    fontStyle:computed.fontStyle,letterSpacing:computed.letterSpacing,color:computed.color,
    labelStyle:node.labelStyle||'',measurementParent:element,interpretBreakTags:false,
   });
   measured.place(element,-measured.width/2,-measured.height/2);
   node.width=Math.max(measured.width+options.labelPaddingX*2,node.width||0,config.er.minEntityWidth||0);
   return {shapeSvg:shape,bbox:{x:0,y:0,width:measured.width,height:measured.height},halfPadding:(node.padding??0)/2,label};
  });
  if(calls!==1)throw new Error('ER simple header measurement missing');
  return {shapeSvg,math:true};
 },async()=>({shapeSvg:await deps.native(),math:false}));
}
