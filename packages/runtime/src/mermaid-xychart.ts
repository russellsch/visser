import {measureMermaidLabel,type MeasuredMermaidLabel} from './mermaid-label.ts';
import {layoutXYMath,type XYAxisLabels,type XYSize,type XYBounds} from './mermaid-xychart-layout.ts';
import {xychartDisplayTextReplacements,xychartMathTextReplacements} from '../../core/src/mermaid/xychart-text.ts';
import type {XYLabelRole} from '../../core/src/mermaid/xychart-labels.ts';
import {validateMermaidMathLabel} from '../../core/src/mermaid/math.ts';
import {EMPTY_MATH_RESOURCE_TOTAL,MATH_LIMITS} from '../../core/src/math/policy.ts';

type Draw=(text:string,id:string,version:string,diagram:any)=>unknown;
type Dependencies={original:Draw;getConfig():any;components(config:any,data:any,theme:any):any;select(element:Element):any;configureSvgSize(svg:any,height:number,width:number,max:boolean):void};
type LabelSpec=XYSize & {text:string;fill:string;owned:boolean;measured:MeasuredMermaidLabel};
const SVG='http://www.w3.org/2000/svg';
const numeric=(value:unknown,positive=false):number=>{const n=Number(value);if(!Number.isFinite(n)||n<0||(positive&&n===0))throw new Error('Invalid XY configured dimension');return n;};
const coordinate=(value:unknown):number=>{if(typeof value!=='number'||!Number.isFinite(value))throw new Error('XY native geometry is nonfinite');return value;};
const edit=(text:string,changes:readonly {start:number;end:number;text:string}[])=>{let out='',at=0;for(const c of changes){out+=text.slice(at,c.start)+c.text;at=c.end;}return out+text.slice(at);};

export function createXYMathRenderer(deps:Dependencies):Draw {
 return async(text,id,version,diagram)=>{
  const db=diagram.db,data=structuredClone(db.getXYChartData()),conf=structuredClone(db.getChartConfig()),theme=structuredClone(db.getChartThemeConfig());
  data.title=db.getDiagramTitle();
  const visible:string[]=[];
  if(conf.showTitle&&data.title)visible.push(data.title);
  if(conf.xAxis.showTitle)visible.push(data.xAxis.title);
  if(conf.yAxis.showTitle)visible.push(data.yAxis.title);
  if(conf.xAxis.showLabel&&data.xAxis.type==='band')visible.push(...data.xAxis.categories);
  data.plots.forEach((plot:any)=>{
   if(conf.showLegend)visible.push(plot.title);
   if(plot.type==='line')visible.push(...(plot.pointLabels??[]).slice(0,plot.data.length));
  });
  if(!visible.some(value=>value.includes('$$')))return deps.original(text,id,version,diagram);
  if(!data.plots.length)throw new Error('XY math chart requires a plot');
  const svgNode=document.getElementById(id) as unknown as SVGSVGElement|null;
  if(!svgNode?.isConnected||svgNode.namespaceURI!==SVG)throw new Error('XY SVG unavailable');
  const config=deps.getConfig(),fontFamily=config.fontFamily;
  const width=numeric(conf.width,true),height=numeric(conf.height,true),horizontal=conf.chartOrientation==='horizontal';
  const components=deps.components(conf,data,theme),axes=[{name:'x',axis:components.xAxis,settings:conf.xAxis,value:data.xAxis,side:horizontal?'left':'bottom'},{name:'y',axis:components.yAxis,settings:conf.yAxis,value:data.yAxis,side:horizontal?'top':'left'}];
  const labels=new Map<string,LabelSpec>(),axesLayout:XYAxisLabels[]=[],pointLabels:Array<XYSize&{anchorX:number;anchorY:number}>=[],legendLabels:Array<XYSize&{markerSize:number}>=[];
  let total=EMPTY_MATH_RESOURCE_TOTAL;
  const measure=async(key:string,value:string,role:XYLabelRole,fontSize:number,fill:string,owned=true,rotation=0):Promise<LabelSpec>=>{
   if(labels.has(key)||typeof value!=='string')throw new Error('XY measured label identity differs');
   numeric(fontSize,true);
   const validation=edit(value,xychartMathTextReplacements(value,role)),display=edit(value,xychartDisplayTextReplacements(value,role));
   const checked=validateMermaidMathLabel(validation,total),shown=validateMermaidMathLabel(display,total);
   if(JSON.stringify(checked.total)!==JSON.stringify(shown.total))throw new Error('XY display math differs');total=shown.total;
   const probe=svgNode.ownerDocument.createElementNS(SVG,'svg');probe.style.fill=fill;svgNode.append(probe);
   try{
    const measured=await measureMermaidLabel(probe,display,'',{fontSize:`${fontSize}px`,fontFamily,interpretBreakTags:false});
    const result={key,text:value,fill,owned,rotation,width:measured.width,height:measured.height,measured};labels.set(key,result);return result;
   }finally{probe.remove();}
  };
  const title=conf.showTitle&&data.title?await measure('title',data.title,'title',conf.titleFontSize,theme.titleColor):undefined;
  for(const {name,axis,settings,value,side} of axes){
   axis.setAxisPosition(side);
   const ticks=axis.getTickValues(),measuredTicks:LabelSpec[]=[];
   const angle=side==='bottom'&&Number(settings.labelRotation)>=-90&&Number(settings.labelRotation)<=90?Number(settings.labelRotation):0;
   if(settings.showLabel)for(const [index,tick] of ticks.entries()){
    const authored=name==='x'&&value.type==='band';
    measuredTicks.push(await measure(authored?`category:${index}`:`tick:${name}:${index}`,String(tick),'category',settings.labelFontSize,theme[`${name}AxisLabelColor`],authored,angle));
   }
   const axisTitle=settings.showTitle&&value.title?await measure(`${name}Title`,value.title,name==='x'?'xTitle':'yTitle',settings.titleFontSize,theme[`${name}AxisTitleColor`],true,side==='left'?-90:0):undefined;
   // Fresh components avoid native sticky visibility flags. Text drawables are
   // replaced below; paths and scales retain native semantics.
   axis.showLabel=Boolean(settings.showLabel);axis.showTitle=Boolean(axisTitle);axis.showTick=Boolean(settings.showTick);axis.showAxisLine=Boolean(settings.showAxisLine);
   const extent=side==='left'?height:width;
   const maxLabel=Math.max(0,...measuredTicks.map(label=>side==='left'?label.height:label.width));
   axis.outerPadding=Math.min(maxLabel/2,extent*.2);
   axis.setRange([0,extent]);axis.setBoundingBoxXY({x:0,y:side==='bottom'?height:0});
   if(side==='left')axis.boundingRect.width=0;else axis.boundingRect.height=0;
   // Anchors are filled only after bar padding freezes both native scales.
   axesLayout.push({side:side as XYAxisLabels['side'],line:side==='bottom'?height:0,labels:measuredTicks.map((label,index)=>({...label,anchor:index})),title:axisTitle,gap:numeric(settings.labelPadding)+numeric(settings.tickLength)+numeric(settings.axisLineWidth),titleGap:numeric(settings.titlePadding)});
  }
  if(data.plots.some((plot:any)=>plot.type==='bar'))components.xAxis.recalculateOuterPaddingToDrawBar();
  axes.forEach(({axis},index)=>{
   const ticks=axis.getTickValues(),entry=axesLayout[index]!;
   axesLayout[index]={...entry,labels:entry.labels.map((label,i)=>({...label,anchor:coordinate(axis.getScaleValue(ticks[i]))}))};
   numeric(axis.getAxisOuterPadding());
  });
  const ink:XYBounds={left:0,top:0,right:width,bottom:height};
  const expand=(x:number,y:number,pad=0)=>{
   coordinate(x);coordinate(y);numeric(pad);
   (ink as {left:number}).left=Math.min(ink.left,x-pad);(ink as {right:number}).right=Math.max(ink.right,x+pad);
   (ink as {top:number}).top=Math.min(ink.top,y-pad);(ink as {bottom:number}).bottom=Math.max(ink.bottom,y+pad);
  };
  const insideLabels:Array<{key:string;x:number;y:number;width:number;height:number}>=[];
  const pointAnchors=new Map<string,{x:number;y:number;text:string}>();
  for(const [seriesIndex,plot]of data.plots.entries()){
   const stroke=numeric(plot.strokeWidth??0)/2;
   for(const [memberIndex,datum]of plot.data.entries()){
    const x=coordinate(components.xAxis.getScaleValue(datum[0])),y=coordinate(components.yAxis.getScaleValue(datum[1]));
    const anchor={x:horizontal?y:x,y:horizontal?x:y};expand(anchor.x,anchor.y,stroke);
    if(plot.type==='line'&&plot.pointLabels?.[memberIndex]){
     const key=`point:${seriesIndex}:${memberIndex}`,value=plot.pointLabels[memberIndex];
     const label=await measure(key,value,'pointLabel',12,plot.strokeFill);
     pointLabels.push({...label,anchorX:anchor.x,anchorY:anchor.y});pointAnchors.set(key,{...anchor,text:value});
    }
   }
   if(conf.showLegend&&plot.title){
    const label=await measure(`series:${seriesIndex}`,plot.title,'seriesTitle',conf.legendFontSize,theme.legendTextColor);
    legendLabels.push({...label,markerSize:numeric(conf.legendFontSize,true)*.75});
   }
  }
  components.plot.calculateSpace({width,height});components.plot.setBoundingBoxXY({x:0,y:0});components.plot.setAxes(components.xAxis,components.yAxis);
  const plotShapes=components.plot.getDrawableElements();
  const nativePointTexts=new Map<string,any[]>();
  for(const shape of plotShapes)if(shape.type==='text'){
   const name=shape.groupTexts[1];if(!/^line-plot-\d+$/.test(name)||nativePointTexts.has(name))throw new Error('XY native point-label shape differs');
   nativePointTexts.set(name,shape.data);
  }
  for(const [seriesIndex,plot]of data.plots.entries())if(plot.type==='line'){
   const expected=[...pointAnchors].filter(([key])=>key.startsWith(`point:${seriesIndex}:`)).map(([,p])=>p),actual=nativePointTexts.get(`line-plot-${seriesIndex}`)??[];
   if(expected.length!==actual.length||expected.some((p,i)=>p.text!==actual[i].text||actual[i].x!==p.x+(horizontal?10:0)||actual[i].y!==p.y-(horizontal?0:10)))throw new Error('XY native point ownership differs');
  }
  const shapes=[...plotShapes,...axes.flatMap(({axis})=>axis.getDrawableElements())].filter((shape:any)=>shape.type!=='text');
  // Inspect native rectangles and paths before final DOM mutation. Bar paths and
  // numeric labels retain the pinned native first-plot data-label semantics.
  const add=(parent:any,tag:string,values:Record<string,unknown>)=>{const node=parent.append(tag);for(const [key,value]of Object.entries(values))node.attr(key,value);return node;};
  const shapeParent=(parent:any,shape:any)=>{
   for(const name of shape.groupTexts)parent=add(parent,'g',{class:name});
   return parent.attr('data-vs-xy-shape',shape.groupTexts.join('/'));
  };
  const drawShape=(parent:any,type:string,value:any)=>type==='rect'
   ?add(parent,'rect',{x:value.x,y:value.y,width:value.width,height:value.height,fill:value.fill,stroke:value.strokeFill,'stroke-width':value.strokeWidth})
   :add(parent,'path',{d:value.path,fill:value.fill||'none',stroke:value.strokeFill,'stroke-width':value.strokeWidth});
  // Resolve the same inherited stroke style used by the final native hierarchy.
  // A miter can exceed half the stroke width. Reserve a conservative full-width
  // multiple of its limit (also covering square caps) around every vertex.
  const strokeProbe=add(deps.select(svgNode),'g',{class:'vs-xy-math','data-vs-xy-probe':''});
  strokeProbe.style('visibility','hidden');
  const strokePads=new Map<any,number>();
  try{
   const probeBody=add(strokeProbe,'g',{'data-vs-xy-body':''});
   for(const shape of shapes){
    const parent=shapeParent(probeBody,shape);
    for(const value of shape.data){
     const node=drawShape(parent,shape.type,value).node(),style=getComputedStyle(node);
     const stroke=numeric(Number.parseFloat(style.strokeWidth));
     const miter=style.strokeLinejoin==='miter'?Math.max(1,numeric(Number.parseFloat(style.strokeMiterlimit))):1;
     strokePads.set(value,style.stroke==='none'?0:stroke*Math.max(1,miter));
    }
   }
  }finally{strokeProbe.remove();}
  for(const shape of shapes){
   if(shape.type==='rect')for(const [memberIndex,rect]of shape.data.entries()){
    numeric(rect.width);numeric(rect.height);expand(rect.x,rect.y,strokePads.get(rect)!);expand(rect.x+rect.width,rect.y+rect.height,strokePads.get(rect)!);
    if(conf.showDataLabel&&rect.width>0&&rect.height>0){
     const seriesIndex=Number(String(shape.groupTexts[1]).replace('bar-plot-','')),value=data.plots[0].data[memberIndex]?.[1];
     if(typeof value!=='number'||!Number.isFinite(value))throw new Error('XY generated bar label is unavailable');
     const label=await measure(`bar-value:${seriesIndex}:${memberIndex}`,String(value),'pointLabel',12,theme.dataLabelColor,false);
     // Keep requested inside values when their measured ink fits. Tiny bars
     // use the outside lane rather than shrinking values into illegibility.
     const inset=2,inside={key:label.key,width:label.width,height:label.height,x:horizontal?rect.x+rect.width-inset-label.width:rect.x+(rect.width-label.width)/2,y:horizontal?rect.y+(rect.height-label.height)/2:rect.y+inset};
     const collides=insideLabels.some(other=>inside.x<other.x+other.width+inset&&inside.x+inside.width+inset>other.x&&inside.y<other.y+other.height+inset&&inside.y+inside.height+inset>other.y);
     if(!conf.showDataLabelOutsideBar&&!collides&&label.width+inset*2<=rect.width&&label.height+inset*2<=rect.height){
      insideLabels.push(inside);
     }else pointLabels.push({...label,anchorX:horizontal?rect.x+rect.width:rect.x+rect.width/2,anchorY:horizontal?rect.y+rect.height/2:rect.y});
    }
   }
   else if(shape.type==='path')for(const path of shape.data){
    if(typeof path.path!=='string'||/NaN|Infinity/.test(path.path))throw new Error('XY native path is nonfinite');
    const stroke=strokePads.get(path)!;
    const token=/[MLZ]|[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/g,tokens=path.path.match(token)??[];
    if(path.path.replace(token,'').replace(/[\s,]/g,''))throw new Error('XY native path commands changed');
    for(let index=0;index<tokens.length;){
     const command=tokens[index++];if(command==='Z')continue;
     if((command!=='M'&&command!=='L')||index+1>=tokens.length)throw new Error('XY native path coordinates changed');
     expand(coordinate(Number(tokens[index++])),coordinate(Number(tokens[index++])),stroke);
    }
   }else throw new Error('XY native drawable contract changed');
  }
  // Native axis line/tick strokes extend beyond the nominal plot rectangle.
  for(const {settings,side}of axes){
   const pad=(settings.showAxisLine?numeric(settings.axisLineWidth):0)+(settings.showTick?numeric(settings.tickLength)+numeric(settings.tickWidth)/2:0);
   if(side==='left'){expand(-pad,0);expand(-pad,height);}else if(side==='bottom'){expand(0,height+pad);expand(width,height+pad);}else{expand(0,-pad);expand(width,-pad);}
  }
  const gap=Math.max(numeric(conf.xAxis.labelPadding),numeric(conf.yAxis.labelPadding),numeric(conf.legendPadding)),margin=Math.max(gap,2);
  const maxDimension=MATH_LIMITS.maxDimensionEm*(Number.parseFloat(String(config.fontSize))||16);
  const geometry=layoutXYMath({ink,axes:axesLayout,title,points:pointLabels,legend:legendLabels,gap,margin,maxDimension});
  const attrs=[...svgNode.attributes].map(a=>[a.name,a.value] as const),svg=deps.select(svgNode),group=svg.append('g').attr('class','vs-xy-math');
  try{
   add(group,'rect',{class:'background',x:0,y:0,width:geometry.width,height:geometry.height,fill:theme.backgroundColor});
   const body=add(group,'g',{transform:`translate(${geometry.translateX} ${geometry.translateY})`,'data-vs-xy-body':''});
   for(const leader of geometry.leaders)add(body,'polyline',{points:leader.points.map(p=>p.join(',')).join(' '),fill:'none',stroke:labels.get(leader.key)!.fill,'stroke-width':1,'data-vs-xy-leader':leader.key});
   for(const shape of shapes){
    const shapeGroup=shapeParent(body,shape);
    for(const value of shape.data)drawShape(shapeGroup,shape.type,value);
   }
   for(const row of geometry.legend){
    const plot=data.plots[Number(row.key.split(':')[1])];
    if(plot.type==='bar')add(body,'rect',{x:row.markerX,y:row.markerY,width:row.markerSize,height:row.markerSize,fill:plot.fill,'data-vs-xy-legend':row.key});
    else add(body,'line',{x1:row.markerX,x2:row.markerX+row.markerSize,y1:row.markerY+row.markerSize/2,y2:row.markerY+row.markerSize/2,stroke:plot.strokeFill,'stroke-width':plot.strokeWidth,'data-vs-xy-legend':row.key});
   }
   for(const placed of insideLabels){
    const node=labels.get(placed.key)!.measured.place(body.node(),placed.x,placed.y);node.setAttribute('data-vs-xy-generated',placed.key);node.setAttribute('data-vs-xy-inside','');
   }
   for(const placed of geometry.labels){
    const label=labels.get(placed.key)!;let parent=body,x=placed.x,y=placed.y;
    if(placed.rotation){parent=add(body,'g',{transform:`translate(${x+placed.boxWidth/2} ${y+placed.boxHeight/2}) rotate(${placed.rotation}) translate(${-placed.width/2} ${-placed.height/2})`});x=0;y=0;}
    const node=label.measured.place(parent.node(),x,y);node.setAttribute(label.owned?'data-vs-mermaid-label':'data-vs-xy-generated',placed.key);
   }
   deps.configureSvgSize(svg,geometry.height,geometry.width,false);
   svg.attr('viewBox',`0 0 ${geometry.width} ${geometry.height}`).attr('preserveAspectRatio','xMinYMin meet');
  }catch(error){group.remove();for(const a of [...svgNode.attributes])svgNode.removeAttribute(a.name);for(const [name,value]of attrs)svgNode.setAttribute(name,value);throw error;}
 };
}
