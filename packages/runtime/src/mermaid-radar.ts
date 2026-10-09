import {measureMermaidLabel,type MeasuredMermaidLabel} from './mermaid-label.ts';
import {layoutRadarMath} from './mermaid-radar-layout.ts';
import {radarCurveInk,radarPolygonInk,radarPointInk,type RadarInk} from './mermaid-radar-ink.ts';
import {radarDisplayTextReplacements,radarMathTextReplacements} from '../../core/src/mermaid/radar-text.ts';
import {validateMermaidMathLabel} from '../../core/src/mermaid/math.ts';
import {EMPTY_MATH_RESOURCE_TOTAL,MATH_LIMITS} from '../../core/src/math/policy.ts';
type Draw=(text:string,id:string,version:string,diagram:any)=>unknown;
type Capture={axes:any[];curves:any[];options:any;config:any;title:string;radius:number;minValue:number;maxValue:number;svg:SVGSVGElement;group:SVGGElement};
const SVG='http://www.w3.org/2000/svg';let nextStage=0;
const finite=(value:number)=>{if(!Number.isFinite(value))throw new Error('Nonfinite Radar geometry');return value;};
const nonnegative=(value:number)=>{finite(value);if(value<0)throw new Error('Negative Radar extent');return value;};
const positive=(value:number)=>{finite(value);if(value<=0)throw new Error('Invalid Radar extent');return value;};
const edit=(text:string,changes:readonly {start:number;end:number;text:string}[])=>{let out='',at=0;for(const change of changes){out+=text.slice(at,change.start)+change.text;at=change.end;}return out+text.slice(at);};

export function createRadarMathRenderer(deps:{original:Draw;getConfig():any}):Draw{
 return async(text,id,version,diagram)=>{
  const axes=structuredClone(diagram.db.getAxes()),curves=structuredClone(diagram.db.getCurves()),options=structuredClone(diagram.db.getOptions()),config=structuredClone(diagram.db.getConfig()),title=diagram.db.getDiagramTitle();
  if(![title,...axes.map((axis:any)=>axis.label),...(options.showLegend?curves.map((curve:any)=>curve.label):[])].some(value=>value.includes('$$')))return deps.original(text,id,version,diagram);
  const global=deps.getConfig();if(global.securityLevel==='sandbox')throw new Error('Radar math requires the strict document renderer');
  const root=document.getElementById(id)as unknown as SVGSVGElement|null;
  if(!root?.isConnected||root.namespaceURI!==SVG)throw new Error('Radar root unavailable');
  const doc=root.ownerDocument,win=doc.defaultView!,element=<K extends keyof SVGElementTagNameMap>(name:K)=>doc.createElementNS(SVG,name);
  const stage=element('svg'),output=element('g');let stageId:string;do{stageId=`${id}-vs-radar-${++nextStage}`;}while(doc.getElementById(stageId));
  stage.id=stageId;stage.setAttribute('data-vs-radar-stage','');stage.style.visibility='hidden';stage.style.overflow='visible';output.setAttribute('class','vs-radar-math');
  const saved=[...root.attributes].map(attr=>[attr.name,attr.value]as const);let committed=false,captured:Capture|undefined,calls=0;
  const proxy=Object.create(diagram),db=Object.create(diagram.db);Object.assign(db,{getAxes:()=>axes,getCurves:()=>curves,getOptions:()=>options,getConfig:()=>config,getDiagramTitle:()=>title});proxy.db=db;
  proxy.visserCaptureRadar=(value:Capture)=>{if(++calls!==1||value.svg!==stage||value.group.parentNode!==stage||value.axes!==axes||value.curves!==curves||value.options!==options||value.config!==config||value.title!==title)throw new Error('Radar capture identity differs');captured=value;};
  root.append(stage);
  try{
   const result=deps.original(text,stageId,version,proxy);if(result&&typeof(result as any).then==='function')throw new Error('Radar native draw must be synchronous');
   if(calls!==1||!captured)throw new Error('Radar capture unavailable');const capture:Capture=captured,group=capture.group;
   positive(config.width);positive(config.height);positive(capture.radius);
   // Native configureSvgSize can replace style. Restore hidden staging before
   // any measurement await, and remove its viewport from local coordinates.
   stage.removeAttribute('viewBox');stage.setAttribute('width',String(config.width));stage.setAttribute('height',String(config.height));stage.style.maxWidth='none';stage.style.visibility='hidden';stage.style.overflow='visible';
   const axisTexts=[...group.querySelectorAll<SVGTextElement>(':scope > .radarAxisLabel')],lines=[...group.querySelectorAll<SVGLineElement>(':scope > .radarAxisLine')],titles=[...group.querySelectorAll<SVGTextElement>(':scope > .radarTitle')],legendTexts=[...group.querySelectorAll<SVGTextElement>(':scope > g > .radarLegendText')];
   if(stage.children.length!==1||stage.firstElementChild!==group||axisTexts.length!==axes.length||lines.length!==axes.length||titles.length!==1||titles[0]!.textContent!==title||legendTexts.length!==(options.showLegend?curves.length:0))throw new Error('Radar native label cardinality differs');
   const attribute=(node:Element,name:string)=>{const raw=node.getAttribute(name);if(raw===null||raw.trim()==='')throw new Error('Missing Radar geometry attribute');return finite(Number(raw));};
   const stroke=(node:SVGElement)=>{const style=win.getComputedStyle(node);if(style.vectorEffect!=='none')throw new Error('Unsupported Radar stroke transform');if(style.stroke==='none')return 0;const width=nonnegative(Number.parseFloat(style.strokeWidth));return style.strokeLinejoin==='miter'?width*Math.max(1,nonnegative(Number.parseFloat(style.strokeMiterlimit))):width;};
   const ink={left:-capture.radius,top:-capture.radius,right:capture.radius,bottom:capture.radius};
   const include=(box:RadarInk)=>{ink.left=Math.min(ink.left,box.left);ink.top=Math.min(ink.top,box.top);ink.right=Math.max(ink.right,box.right);ink.bottom=Math.max(ink.bottom,box.bottom);};
   const skipped=new Set([...axisTexts,...titles,...legendTexts.map(node=>node.parentElement!)]);
   const nativeCurves=new Set<number>();
   for(const node of [...group.children]){
    if(skipped.has(node as SVGTextElement))continue;
    const curve=/^radarCurve-(\d+)$/.exec(node.getAttribute('class')??'');
    if(curve){const index=Number(curve[1]);if(index>=curves.length||nativeCurves.has(index)||curves[index].entries.length!==axes.length)throw new Error('Radar native curve identity differs');nativeCurves.add(index);}
    else if(!node.classList.contains('radarGraticule')&&!node.classList.contains('radarAxisLine'))throw new Error('Unexpected Radar native shape');
    const pad=stroke(node as SVGElement);
    switch(node.localName){
     case 'circle':{const r=nonnegative(attribute(node,'r'));include(radarPointInk([-r,-r,r,r],pad));break;}
     case 'line':include(radarPointInk(['x1','y1','x2','y2'].map(name=>attribute(node,name)),pad));break;
     case 'polygon':{const points=node.getAttribute('points');if(points===null)throw new Error('Missing Radar polygon');if(points.trim())include(radarPolygonInk(points,pad));else if(axes.length)throw new Error('Empty Radar polygon');break;}
     case 'path':include(radarCurveInk(node.getAttribute('d')??'',pad));break;
     default:throw new Error('Unexpected Radar native geometry');
    }
   }
   if(nativeCurves.size!==curves.filter((curve:any)=>curve.entries.length===axes.length).length)throw new Error('Radar native curve coverage differs');
   let total=EMPTY_MATH_RESOURCE_TOTAL;
   const measured=new Map<string,{label:MeasuredMermaidLabel;color:string;marker?:SVGRectElement;markerPadding?:number}>();
   const measure=async(key:string,value:string,native:SVGTextElement,role:'title'|'axis.label'|'curve.label')=>{
    if(native.textContent!==value)throw new Error('Radar native label differs');const style=win.getComputedStyle(native),display=edit(value,radarDisplayTextReplacements(value,role));
    const checked=validateMermaidMathLabel(edit(value,radarMathTextReplacements(value,role)),total),shown=validateMermaidMathLabel(display,total);if(JSON.stringify(checked.total)!==JSON.stringify(shown.total))throw new Error('Radar display math differs');total=shown.total;
    const probe=element('svg');probe.style.visibility='hidden';probe.style.fill=style.fill;root.append(probe);
    try{const label=await measureMermaidLabel(probe,display,'',{fontFamily:style.fontFamily,fontSize:style.fontSize,fontWeight:style.fontWeight,interpretBreakTags:false});measured.set(key,{label,color:style.fill});return {key,width:label.width,height:label.height};}finally{probe.remove();}
   };
   const axisSizes=[];
   for(const [index,axis]of axes.entries()){
    const box=await measure(`axis:${index}`,axis.label,axisTexts[index]!,'axis.label'),line=lines[index]!,anchorX=attribute(line,'x2'),anchorY=attribute(line,'y2');
    axisSizes.push({...box,side:anchorX<0?'left' as const:'right' as const,anchorX,anchorY});measured.get(box.key)!.color=win.getComputedStyle(line).stroke;
   }
   const legendSizes=[];
   for(const [index,native]of legendTexts.entries()){
    const parent=native.parentElement!,marker=parent.querySelector<SVGRectElement>(`.radarLegendBox-${index}`);
    if(!marker||parent.children.length!==2||attribute(marker,'width')!==12||attribute(marker,'height')!==12)throw new Error('Radar legend marker differs');
    const box=await measure(`curve:${index}`,curves[index].label,native,'curve.label'),padding=stroke(marker),data=measured.get(box.key)!;data.marker=marker;data.markerPadding=padding;
    legendSizes.push({...box,width:12+2*padding+8+box.width,height:Math.max(12+2*padding,box.height)});
   }
   const titleSize=title?await measure('title',title,titles[0]!,'title'):undefined;
   const layout=layoutRadarMath({ink,axes:axisSizes,legends:legendSizes,...(titleSize?{title:titleSize}:{}),gap:8,margin:12,maxDimension:MATH_LIMITS.maxDimensionEm*(Number.parseFloat(String(global.fontSize))||16)});
   for(const node of skipped)node.remove();group.setAttribute('transform',`translate(${layout.translateX},${layout.translateY})`);output.append(group);
   const place=(key:string,x:number,y:number)=>{const owner=element('g');owner.setAttribute('data-vs-mermaid-label',key);output.append(owner);measured.get(key)!.label.place(owner,x,y);return owner;};
   for(const box of layout.axes){const leader=element('polyline');leader.setAttribute('data-vs-radar-leader',box.key);leader.setAttribute('points',box.leader.map(pair=>pair.join(',')).join(' '));leader.setAttribute('fill','none');leader.setAttribute('stroke',measured.get(box.key)!.color);leader.setAttribute('stroke-width','1');output.append(leader);place(box.key,box.x,box.y);}
   for(const box of layout.legends){const data=measured.get(box.key)!,pad=data.markerPadding!,markerGroup=element('g');markerGroup.setAttribute('transform',`translate(${box.x+pad},${box.y+(box.height-12)/2})`);markerGroup.append(data.marker!);output.append(markerGroup);place(box.key,box.x+12+2*pad+8,box.y+(box.height-data.label.height)/2);}
   if(layout.title)place('title',layout.title.x,layout.title.y);
   root.append(output);root.setAttribute('viewBox',`0 0 ${layout.width} ${layout.height}`);root.setAttribute('width',String(layout.width));root.setAttribute('height',String(layout.height));root.style.maxWidth='none';committed=true;
  }finally{stage.remove();if(!committed){output.remove();for(const attr of [...root.attributes])root.removeAttribute(attr.name);for(const [name,value]of saved)root.setAttribute(name,value);}}
 };
}
