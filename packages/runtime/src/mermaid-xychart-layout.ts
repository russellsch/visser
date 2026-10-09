export type XYSize=Readonly<{key:string;width:number;height:number;rotation?:number}>;
export type XYBounds=Readonly<{left:number;top:number;right:number;bottom:number}>;
export type XYAxisLabels=Readonly<{
 side:'left'|'top'|'bottom';line:number;labels:ReadonlyArray<XYSize & {anchor:number}>;
 title?:XYSize;gap:number;titleGap:number;
}>;
export type XYPlacedLabel=Readonly<XYSize & {x:number;y:number;boxWidth:number;boxHeight:number}>;
export type XYLeader=Readonly<{key:string;points:readonly (readonly [number,number])[]}>;
export type XYLegendRow=Readonly<{key:string;markerX:number;markerY:number;markerSize:number}>;
export type XYMathLayoutInput=Readonly<{
 ink:XYBounds;axes:readonly XYAxisLabels[];title?:XYSize;
 points:ReadonlyArray<XYSize & {anchorX:number;anchorY:number}>;
 legend:ReadonlyArray<XYSize & {markerSize:number}>;
 gap:number;margin:number;maxDimension:number;
}>;
const finite=(n:number)=>{if(!Number.isFinite(n))throw new Error('XY layout requires finite geometry');return n;};
const nonnegative=(n:number)=>{finite(n);if(n<0)throw new Error('XY layout requires nonnegative dimensions');return n;};

/** Axis labels use actual rotated ink boxes, not unrotated width heuristics. */
export function xyRotatedSize(label:XYSize):{width:number;height:number} {
 nonnegative(label.width);nonnegative(label.height);
 const radians=finite(label.rotation??0)*Math.PI/180,c=Math.abs(Math.cos(radians)),s=Math.abs(Math.sin(radians));
 return {width:label.width*c+label.height*s,height:label.width*s+label.height*c};
}

/** Stable one-dimensional placement. Labels move; their native anchors do not. */
function pack(items:readonly {anchor:number;size:number}[],start:number,end:number,gap:number):{positions:number[];end:number} {
 const order=items.map((item,index)=>({...item,index})).sort((a,b)=>a.anchor-b.anchor||a.index-b.index);
 const required=order.reduce((n,item)=>n+nonnegative(item.size),0)+Math.max(0,items.length-1)*gap;
 end=Math.max(end,start+required);
 const positions:number[]=[];let cursor=start;
 for(const item of order){const position=Math.max(cursor,finite(item.anchor)-item.size/2);positions[item.index]=position;cursor=position+item.size+gap;}
 cursor=end;
 for(const item of [...order].reverse()){
  const position=Math.min(positions[item.index]!,cursor-item.size);positions[item.index]=position;cursor=position-gap;
 }
 return {positions,end};
}

/** Reserve nonintersecting label bands outside all native plot ink. Leaders may
 * cross one another or native shapes; label ink never occupies a plot/axis band. */
export function layoutXYMath(input:XYMathLayoutInput):{
 width:number;height:number;translateX:number;translateY:number;
 labels:readonly XYPlacedLabel[];leaders:readonly XYLeader[];legend:readonly XYLegendRow[];
} {
 const {ink}=input,gap=nonnegative(input.gap),margin=nonnegative(input.margin),limit=nonnegative(input.maxDimension);
 for(const n of Object.values(ink))finite(n);
 if(ink.right<ink.left||ink.bottom<ink.top||limit===0)throw new Error('Invalid XY ink bounds');
 const labels:XYPlacedLabel[]=[],leaders:XYLeader[]=[],legend:XYLegendRow[]=[];
 const seen=new Set<string>();
 let bodyLeft=ink.left,bodyRight=ink.right,bodyTop=ink.top,bodyBottom=ink.bottom;
 const place=(label:XYSize,x:number,y:number)=>{
  if(seen.has(label.key))throw new Error('Duplicate XY label identity');seen.add(label.key);
  const size=xyRotatedSize(label);finite(x);finite(y);
  labels.push({...label,x,y,boxWidth:size.width,boxHeight:size.height});
  bodyLeft=Math.min(bodyLeft,x);bodyTop=Math.min(bodyTop,y);
  bodyRight=Math.max(bodyRight,x+size.width);bodyBottom=Math.max(bodyBottom,y+size.height);
 };
 const sides=new Set<string>();
 for(const axis of input.axes){
  if(sides.has(axis.side))throw new Error('Duplicate XY axis side');sides.add(axis.side);
  const spacing=gap+nonnegative(axis.gap),titleSpacing=gap+nonnegative(axis.titleGap);finite(axis.line);
  const sizes=axis.labels.map(xyRotatedSize);
  const titleSize=axis.title?xyRotatedSize(axis.title):undefined;
  if(axis.side==='left'){
   const maxWidth=Math.max(0,...sizes.map(size=>size.width));
   const packed=pack(axis.labels.map((label,index)=>({anchor:label.anchor,size:sizes[index]!.height})),ink.top,Math.max(ink.bottom,ink.top+(titleSize?.height??0)),gap);
   const right=ink.left-spacing;
   axis.labels.forEach((label,index)=>{
    const size=sizes[index]!,y=packed.positions[index]!,near=ink.left-spacing/2;
    place(label,right-size.width,y);
    leaders.push({key:label.key,points:[[axis.line,label.anchor],[near,label.anchor],[near,y+size.height/2],[right,y+size.height/2]]});
   });
   if(axis.title&&titleSize)place(axis.title,right-maxWidth-titleSpacing-titleSize.width,ink.top+(packed.end-ink.top-titleSize.height)/2);
  }else{
   const maxHeight=Math.max(0,...sizes.map(size=>size.height));
   const packed=pack(axis.labels.map((label,index)=>({anchor:label.anchor,size:sizes[index]!.width})),ink.left,Math.max(ink.right,ink.left+(titleSize?.width??0)),gap);
   const edge=axis.side==='bottom'?ink.bottom+spacing:ink.top-spacing;
   axis.labels.forEach((label,index)=>{
    const size=sizes[index]!,x=packed.positions[index]!,y=axis.side==='bottom'?edge:edge-size.height;
    const near=axis.side==='bottom'?ink.bottom+spacing/2:ink.top-spacing/2;
    place(label,x,y);
    leaders.push({key:label.key,points:[[label.anchor,axis.line],[label.anchor,near],[x+size.width/2,near],[x+size.width/2,axis.side==='bottom'?y:y+size.height]]});
   });
   if(axis.title&&titleSize)place(axis.title,ink.left+(packed.end-ink.left-titleSize.width)/2,axis.side==='bottom'?edge+maxHeight+titleSpacing:edge-maxHeight-titleSpacing-titleSize.height);
  }
 }
 if(input.points.length){
  const sizes=input.points.map(xyRotatedSize),x=bodyRight+gap*2;
  const packed=pack(input.points.map((point,index)=>({anchor:finite(point.anchorY),size:sizes[index]!.height})),ink.top,ink.bottom,gap);
  input.points.forEach((point,index)=>{
   const size=sizes[index]!,y=packed.positions[index]!,near=x-gap;
   place(point,x,y);
   leaders.push({key:point.key,points:[[finite(point.anchorX),point.anchorY],[near,point.anchorY],[near,y+size.height/2],[x,y+size.height/2]]});
  });
 }
 if(input.legend.length){
  const sizes=input.legend.map(xyRotatedSize),x=bodyRight+gap*2;
  const rowHeights=input.legend.map((row,index)=>Math.max(nonnegative(row.markerSize),sizes[index]!.height));
  const totalHeight=rowHeights.reduce((a,b)=>a+b,0)+Math.max(0,rowHeights.length-1)*gap;
  let y=ink.top+Math.max(0,(ink.bottom-ink.top-totalHeight)/2);
  input.legend.forEach((row,index)=>{
   const height=rowHeights[index]!,size=sizes[index]!;
   legend.push({key:row.key,markerX:x,markerY:y+(height-row.markerSize)/2,markerSize:row.markerSize});
   place(row,x+row.markerSize+gap,y+(height-size.height)/2);
   bodyLeft=Math.min(bodyLeft,x);bodyTop=Math.min(bodyTop,y);bodyBottom=Math.max(bodyBottom,y+height);
   y+=height+gap;
  });
 }
 if(input.title){
  const size=xyRotatedSize(input.title);
  place(input.title,(bodyLeft+bodyRight-size.width)/2,bodyTop-gap*2-size.height);
 }
 const width=bodyRight-bodyLeft+margin*2,height=bodyBottom-bodyTop+margin*2;
 if(!Number.isFinite(width)||!Number.isFinite(height)||width>limit||height>limit)throw new Error('XY measured layout exceeds dimension limit');
 return {width,height,translateX:margin-bodyLeft,translateY:margin-bodyTop,labels,leaders,legend};
}
