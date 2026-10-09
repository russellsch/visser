import {measureMermaidLabel,type MeasuredMermaidLabel} from './mermaid-label.ts';
import {layoutQuadrantMath} from './mermaid-quadrant-layout.ts';
import {quadrantDisplayTextReplacements,quadrantMathTextReplacements} from '../../core/src/mermaid/quadrant-text.ts';
import type {QuadrantLabelRole} from '../../core/src/mermaid/quadrant-labels.ts';
import {validateMermaidMathLabel} from '../../core/src/mermaid/math.ts';
import {EMPTY_MATH_RESOURCE_TOTAL,MATH_LIMITS} from '../../core/src/math/policy.ts';
type Draw=(text:string,id:string,version:string,diagram:any)=>unknown;
type Dependencies={original:Draw;getConfig():any;getSnapshot():any;select(element:Element):any;configureSvgSize(svg:any,height:number,width:number,max:boolean):void};
const SVG='http://www.w3.org/2000/svg';
const positive=(value:unknown,fallback:number)=>{const n=Number.parseFloat(String(value));return Number.isFinite(n)&&n>0?n:fallback;};
const edit=(text:string,changes:readonly {start:number;end:number;text:string}[])=>{let out='',at=0;for(const c of changes){out+=text.slice(at,c.start)+c.text;at=c.end;}return out+text.slice(at);};

export function createQuadrantMathRenderer(deps:Dependencies):Draw{
 return async(text,id,version,diagram)=>{
  const snapshot=deps.getSnapshot(),data=snapshot.data;
  const fields=['quadrant1Text','quadrant2Text','quadrant3Text','quadrant4Text','xAxisLeftText','xAxisRightText','yAxisBottomText','yAxisTopText'];
  if(![snapshot.title,...fields.map(k=>data[k]),...data.points.map((p:any)=>p.text)].some(v=>v.includes('$$')))return deps.original(text,id,version,diagram);
  const config=deps.getConfig(),conf=config.quadrantChart;
  const built=structuredClone(diagram.db.getQuadrantData());
  const svgNode=document.getElementById(id) as unknown as SVGSVGElement|null;
  if(!svgNode?.isConnected||svgNode.namespaceURI!==SVG)throw new Error('Quadrant SVG unavailable');
  const labels=new Map<string,MeasuredMermaidLabel>();
  let total=EMPTY_MATH_RESOURCE_TOTAL;
  const measure=async(key:string,value:any,role:QuadrantLabelRole)=>{
   if(!value)return;
   const validation=edit(value.text,quadrantMathTextReplacements(value.text,role)),display=edit(value.text,quadrantDisplayTextReplacements(value.text,role));
   const checked=validateMermaidMathLabel(validation,total),shown=validateMermaidMathLabel(display,total);
   if(JSON.stringify(checked.total)!==JSON.stringify(shown.total))throw new Error('Quadrant display math differs');
   total=shown.total;
   const probe=svgNode.ownerDocument.createElementNS(SVG,'svg');probe.style.fill=value.fill;svgNode.append(probe);
   try{labels.set(key,await measureMermaidLabel(probe,display,'',{fontSize:`${positive(value.fontSize,16)}px`,fontFamily:config.fontFamily,interpretBreakTags:false}));}finally{probe.remove();}
  };
  await measure('title',built.title,'title');
  for(let i=0;i<4;i++)if(built.quadrants[i].text.text)await measure(`quadrant${i+1}`,built.quadrants[i].text,`quadrant${i+1}` as QuadrantLabelRole);
  const axes=[['xLeft','xAxisLeftText'],['xRight','xAxisRightText'],['yBottom','yAxisBottomText'],['yTop','yAxisTopText']].filter(([key,field])=>data[field!]&&(key!.startsWith('x')?conf.showXAxis!==false:conf.showYAxis!==false));
  if(axes.length!==built.axisLabels.length)throw new Error('Quadrant axis visibility differs');
  for(const [i,[key,field]]of axes.entries()){
   if(built.axisLabels[i].text!==data[field!])throw new Error('Quadrant axis identity differs');
   await measure(key!,built.axisLabels[i],key as QuadrantLabelRole);
  }
  if(data.points.length!==built.points.length)throw new Error('Quadrant point identity differs');
  for(const [i,p]of built.points.entries()){
   if(p.text.text!==data.points[i].text)throw new Error('Quadrant point text differs');
   await measure(`point:${i}`,p.text,'point');
  }
  const maxDimension=MATH_LIMITS.maxDimensionEm*positive(config.fontSize,16);
  const points=data.points.map((p:any,index:number)=>{
   const marker=built.points[index],radius=Number(marker.radius),stroke=Number.parseFloat(marker.strokeWidth);
   if(!Number.isFinite(radius)||radius<0||!Number.isFinite(stroke)||stroke<0)throw new Error('Invalid quadrant marker dimensions');
   return {index,x:Number(p.x),y:Number(p.y),radius:radius+stroke/2};
  });
  const borderWidth=Math.max(...built.borderLines.map((b:any)=>Number(b.strokeWidth)));
  if(!Number.isFinite(borderWidth)||borderWidth<0)throw new Error('Invalid quadrant border');
  const geometry=layoutQuadrantMath({labels,points,xAxisPosition:conf.xAxisPosition,yAxisPosition:conf.yAxisPosition,minWidth:positive(conf.chartWidth,500),minHeight:positive(conf.chartHeight,500),gap:positive(conf.pointTextPadding,5)+borderWidth,margin:positive(conf.quadrantPadding,5)+borderWidth,maxDimension});
  const attrs=[...svgNode.attributes].map(a=>[a.name,a.value] as const),svg=deps.select(svgNode);
  const group=svg.append('g').attr('class','vs-quadrant-math');
  const add=(tag:string,values:Record<string,unknown>)=>{const node=group.append(tag);for(const [key,value]of Object.entries(values))node.attr(key,value);return node;};
  try{
   const p=geometry.plot;
   for(const [i,q]of built.quadrants.entries()){
    const right=i===0||i===3,bottom=i>=2;
    add('rect',{x:p.x+(right?p.width/2:0),y:p.y+(bottom?p.height/2:0),width:p.width/2,height:p.height/2,fill:q.fill,'data-vs-quadrant':i+1});
   }
   const outer=built.borderLines[0],inner=built.borderLines[4];
   add('rect',{x:p.x,y:p.y,width:p.width,height:p.height,fill:'none',stroke:outer.strokeFill,'stroke-width':outer.strokeWidth});
   add('line',{x1:p.x+p.width/2,x2:p.x+p.width/2,y1:p.y,y2:p.y+p.height,stroke:inner.strokeFill,'stroke-width':inner.strokeWidth});
   add('line',{x1:p.x,x2:p.x+p.width,y1:p.y+p.height/2,y2:p.y+p.height/2,stroke:inner.strokeFill,'stroke-width':inner.strokeWidth});
   for(const point of geometry.points)add('polyline',{points:point.leader.map(pair=>pair.join(',')).join(' '),fill:'none',stroke:built.points[point.index].fill,'stroke-width':1,'data-vs-quadrant-leader':point.index});
   for(const point of geometry.points){const style=built.points[point.index];add('circle',{cx:point.x,cy:point.y,r:style.radius,fill:style.fill,stroke:style.strokeColor,'stroke-width':style.strokeWidth,'data-vs-quadrant-point':point.index});}
   for(const placed of geometry.labels){
    const label=labels.get(placed.key)!;
    if(placed.key.startsWith('quadrant')){
     const index=Number(placed.key.slice(8))-1;
     add('rect',{x:placed.x,y:placed.y,width:placed.width,height:placed.height,fill:built.quadrants[index].fill});
    }
    let parent=group.node(),x=placed.x,y=placed.y;
    if(placed.rotation){parent=add('g',{transform:`translate(${placed.x} ${placed.y+placed.height}) rotate(-90)`}).node();x=0;y=0;}
    label.place(parent,x,y).setAttribute('data-vs-mermaid-label',placed.key);
   }
   // Preserve intrinsic size so the reader viewport can scroll at narrow widths.
   deps.configureSvgSize(svg,geometry.height,geometry.width,false);
   svg.attr('viewBox',`0 0 ${geometry.width} ${geometry.height}`).attr('preserveAspectRatio','xMinYMin meet');
  }catch(error){group.remove();for(const a of [...svgNode.attributes])svgNode.removeAttribute(a.name);for(const [name,value]of attrs)svgNode.setAttribute(name,value);throw error;}
 };
}
