import {layoutSankeyMath,type SankeyLaneLabel} from './mermaid-sankey-layout.ts';
import type {RadarInk} from './mermaid-radar-ink.ts';
export type RadarMeasuredBox=Readonly<{key:string;width:number;height:number}>;

/** Axis lanes share the ordered outside-track packing used by Sankey. Radar
 * adds a separate legend column and a title above the complete content union.
 * Only translation is applied to the native polar plot.
 */
export function layoutRadarMath(input:{ink:RadarInk;axes:readonly SankeyLaneLabel[];legends:readonly RadarMeasuredBox[];title?:RadarMeasuredBox;gap:number;margin:number;maxDimension:number}){
 const {gap,margin,maxDimension}=input;
 const keys=new Set(input.axes.map(axis=>axis.key));
 for(const box of [...input.legends,...(input.title?[input.title]:[])]){
  if(!box.key||keys.has(box.key)||![box.width,box.height].every(Number.isFinite)||box.width<0||box.height<0)throw new Error('Invalid Radar measured box');keys.add(box.key);
 }
 const base=layoutSankeyMath({ink:input.ink,labels:input.axes,gap,margin,maxDimension});
 const legendWidth=input.legends.reduce((width,box)=>Math.max(width,box.width),0);
 const legendHeight=input.legends.reduce((height,box)=>height+box.height,0)+Math.max(0,input.legends.length-1)*gap;
 let width=base.width+(input.legends.length?gap+legendWidth:0);
 const contentWidth=width;
 width=Math.max(width,(input.title?.width??0)+2*margin);
 const dx=(width-contentWidth)/2,dy=input.title?input.title.height+gap:0;
 const height=Math.max(base.height,legendHeight+2*margin)+dy;
 if(![width,height,dx,dy].every(Number.isFinite)||width>maxDimension||height>maxDimension)throw new Error('Radar measured layout exceeds dimension limit');
 let cursor=margin+dy;
 const legends=input.legends.map(box=>{const result={...box,x:base.width-margin+gap+dx,y:cursor};cursor+=box.height+gap;return result;});
 return {width,height,translateX:base.translateX+dx,translateY:base.translateY+dy,
  axes:base.labels.map(label=>({...label,x:label.x+dx,y:label.y+dy,anchorX:label.anchorX+dx,anchorY:label.anchorY+dy,leader:label.leader.map(([x,y])=>[x+dx,y+dy]as const)})),
  legends,title:input.title?{...input.title,x:(width-input.title.width)/2,y:margin}:undefined};
}
