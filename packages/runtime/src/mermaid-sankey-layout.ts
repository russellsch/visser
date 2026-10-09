/** Measured label lanes around native Sankey ink. Native geometry is translated only. */
export type SankeyInk = Readonly<{left:number;top:number;right:number;bottom:number}>;
export type SankeyLaneLabel = Readonly<{
 key:string;width:number;height:number;side:'left'|'right';anchorX:number;anchorY:number;
}>;
export type SankeyLanePlacement = SankeyLaneLabel & Readonly<{
 x:number;y:number;leader:readonly (readonly [number,number])[];
}>;
export type SankeyLabelLayout = Readonly<{
 width:number;height:number;translateX:number;translateY:number;
 labels:readonly SankeyLanePlacement[];
}>;

export function layoutSankeyMath(input:{
 ink:SankeyInk;labels:readonly SankeyLaneLabel[];gap:number;margin:number;maxDimension:number;
}):SankeyLabelLayout {
 const {ink,labels,gap,margin,maxDimension}=input;
 const finite=(value:number)=>Number.isFinite(value);
 if(![ink.left,ink.top,ink.right,ink.bottom,gap,margin,maxDimension].every(finite)||
    ink.right<ink.left||ink.bottom<ink.top||gap<=0||margin<0||maxDimension<=0) {
  throw new Error('Invalid Sankey layout configuration');
 }
 const seen=new Set<string>();
 for(const label of labels){
  if(!label.key||seen.has(label.key)||!['left','right'].includes(label.side)||
     ![label.width,label.height,label.anchorX,label.anchorY].every(finite)||
     label.width<0||label.height<0||label.anchorX<ink.left||label.anchorX>ink.right||
     label.anchorY<ink.top||label.anchorY>ink.bottom)throw new Error('Invalid Sankey measured label');
  seen.add(label.key);
 }
 const positions=new Map<string,SankeyLanePlacement>();
 for(const side of ['left','right'] as const){
  // Stable input order resolves coincident node centers. Packing may grow the
  // canvas vertically; it never moves native node/link coordinates.
  const ordered=labels.map((label,index)=>({label,index})).filter(item=>item.label.side===side)
   .sort((a,b)=>a.label.anchorY-b.label.anchorY||a.index-b.index);
  let bottom=-Infinity;
  for(const [laneIndex,{label}] of ordered.entries()){
   const laneWidth=gap*(ordered.length+1);
   const x=side==='left'?ink.left-laneWidth-label.width:ink.right+laneWidth;
   const y=Math.max(label.anchorY-label.height/2,bottom);
   const lane=side==='left'?ink.left-gap*(laneIndex+1):ink.right+gap*(laneIndex+1);
   const edge=side==='left'?x+label.width:x;
   positions.set(label.key,{...label,x,y,leader:[[label.anchorX,label.anchorY],
    [lane,label.anchorY],[lane,y+label.height/2],[edge,y+label.height/2]]});
   bottom=y+label.height+gap;
  }
 }
 let left=ink.left,top=ink.top,right=ink.right,bottom=ink.bottom;
 for(const p of positions.values()){
  left=Math.min(left,p.x);top=Math.min(top,p.y);
  right=Math.max(right,p.x+p.width);bottom=Math.max(bottom,p.y+p.height);
 }
 const width=right-left+2*margin,height=bottom-top+2*margin;
 const translateX=margin-left,translateY=margin-top;
 if(![width,height,translateX,translateY].every(finite)||width<=0||height<=0||
    width>maxDimension||height>maxDimension)throw new Error('Sankey measured layout exceeds dimension limit');
 return {width,height,translateX,translateY,labels:labels.map(label=>{
  const p=positions.get(label.key)!;
  return {...p,x:p.x+translateX,y:p.y+translateY,anchorX:p.anchorX+translateX,
   anchorY:p.anchorY+translateY,leader:p.leader.map(([x,y])=>[x+translateX,y+translateY] as const)};
 })};
}
