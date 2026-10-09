// Pure measured geometry. The browser adapter supplies complete ink dimensions.
export type QuadrantSize=Readonly<{width:number;height:number}>;
export type QuadrantPlacement=Readonly<{key:string;x:number;y:number;width:number;height:number;rotation:0|-90}>;
export type QuadrantLayoutPoint=Readonly<{index:number;x:number;y:number;radius:number}>;
export type QuadrantGeometry=Readonly<{
 width:number;height:number;plot:{x:number;y:number;width:number;height:number};
 labels:readonly QuadrantPlacement[];
 points:ReadonlyArray<{index:number;x:number;y:number;radius:number;leader:readonly [number,number][]}>;
}>;

export function layoutQuadrantMath(input:{
 labels:ReadonlyMap<string,QuadrantSize>;points:readonly QuadrantLayoutPoint[];
 minWidth:number;minHeight:number;gap:number;margin:number;maxDimension:number;
 xAxisPosition?:'top'|'bottom';yAxisPosition?:'left'|'right';
}):QuadrantGeometry {
 const {labels,points,gap,margin,maxDimension}=input;
 const valid=(n:number)=>Number.isFinite(n)&&n>=0;
 if(![gap,margin,input.minWidth,input.minHeight,maxDimension].every(valid)||gap<=0||maxDimension<=0)throw new Error('Invalid quadrant layout configuration');
 for(const size of labels.values())if(!valid(size.width)||!valid(size.height))throw new Error('Invalid quadrant measured ink');
 const seen=new Set<number>();
 for(const p of points){if(!Number.isSafeInteger(p.index)||p.index<0||seen.has(p.index)||![p.x,p.y,p.radius].every(valid)||p.x>1||p.y>1||!labels.has(`point:${p.index}`))throw new Error('Invalid quadrant point');seen.add(p.index);}
 const size=(key:string)=>labels.get(key)??{width:0,height:0};
 const max=(values:number[])=>Math.max(0,...values);
 const radius=max(points.map(p=>p.radius)),clearance=radius+gap;
 const left=points.filter(p=>p.x<0.5),right=points.filter(p=>p.x>=0.5);
 const leftWidth=max(left.map(p=>size(`point:${p.index}`).width));
 const rightWidth=max(right.map(p=>size(`point:${p.index}`).width));
 const yBand=max(['yBottom','yTop'].map(k=>size(k).height));
 const titleHeight=size('title').height;
 const topHeight=max(['quadrant1','quadrant2'].map(k=>size(k).height));
 const bottomHeight=max(['quadrant3','quadrant4'].map(k=>size(k).height));
 const xHeight=max(['xLeft','xRight'].map(k=>size(k).height));
 const plotWidth=Math.max(input.minWidth,2*max(['quadrant1','quadrant2','quadrant3','quadrant4','xLeft','xRight'].map(k=>size(k).width))+2*gap);
 const plotHeight=Math.max(input.minHeight,2*max(['yBottom','yTop'].map(k=>size(k).width))+2*gap);
 const yRight=input.yAxisPosition==='right',xTop=input.xAxisPosition==='top'&&points.length===0;
 const topBase=margin+(titleHeight?titleHeight+gap:0);
 const plotX=margin+(!yRight&&yBand?yBand+gap:0)+(left.length?leftWidth+gap:0)+clearance;
 const plotY=topBase+(xTop&&xHeight?xHeight+gap:0)+(topHeight?topHeight+gap:0)+clearance;
 const placed:QuadrantPlacement[]=[];
 const place=(key:string,x:number,y:number,rotation:0|-90=0)=>{
  const s=labels.get(key);if(!s)return;
  placed.push({key,x,y,width:rotation?s.height:s.width,height:rotation?s.width:s.height,rotation});
 };
 const center=(key:string,cx:number,y:number)=>place(key,cx-size(key).width/2,y);
 const leftCenter=plotX+plotWidth/4,rightCenter=plotX+3*plotWidth/4;
 center('quadrant2',leftCenter,plotY-clearance-topHeight);
 center('quadrant1',rightCenter,plotY-clearance-topHeight);
 const bottomY=plotY+plotHeight+clearance;
 center('quadrant3',leftCenter,bottomY);center('quadrant4',rightCenter,bottomY);
 const axisY=xTop?topBase:bottomY+(bottomHeight?bottomHeight+gap:0);
 center('xLeft',leftCenter,axisY);center('xRight',rightCenter,axisY);
 for(const [key,fraction]of [['yTop',0.25],['yBottom',0.75]] as const)place(key,yRight?plotX+plotWidth+clearance+(right.length?gap+rightWidth:0)+gap:margin,plotY+fraction*plotHeight-size(key).width/2,-90);
 const anchors=points.map(p=>({index:p.index,x:plotX+p.x*plotWidth,y:plotY+(1-p.y)*plotHeight,radius:p.radius,leader:[] as [number,number][]}));
 const byIndex=new Map(anchors.map(p=>[p.index,p]));
 for(const [column,isLeft]of [[left,true],[right,false]] as const){
  let bottom=plotY;
  const ordered=[...column].sort((a,b)=>byIndex.get(a.index)!.y-byIndex.get(b.index)!.y||a.index-b.index);
  for(const p of ordered){
   const anchor=byIndex.get(p.index)!,key=`point:${p.index}`,s=size(key);
   const y=Math.max(plotY,anchor.y-s.height/2,bottom);
   const x=isLeft?plotX-clearance-gap-s.width:plotX+plotWidth+clearance+gap;
   place(key,x,y);bottom=y+s.height+gap;
   const lane=isLeft?plotX-clearance:plotX+plotWidth+clearance;
   const edge=isLeft?x+s.width:x;
   anchor.leader=[[anchor.x,anchor.y],[lane,anchor.y],[lane,y+s.height/2],[edge,y+s.height/2]];
  }
 }
 let width=Math.max(plotX+plotWidth+clearance+(right.length?gap+rightWidth:0)+(yRight&&yBand?gap+yBand:0)+margin,size('title').width+2*margin);
 center('title',width/2,margin);
 const height=Math.max(bottomY+bottomHeight+margin,axisY+xHeight+margin,plotY+plotHeight+clearance+margin,...placed.map(p=>p.y+p.height+margin));
 width=Math.max(width,...placed.map(p=>p.x+p.width+margin));
 if(!Number.isFinite(width)||!Number.isFinite(height)||width>maxDimension||height>maxDimension)throw new Error('Quadrant measured layout exceeds dimension limit');
 if(placed.some(p=>p.x<0||p.y<0))throw new Error('Quadrant label escaped layout bounds');
 return {width,height,plot:{x:plotX,y:plotY,width:plotWidth,height:plotHeight},labels:placed,points:anchors};
}
