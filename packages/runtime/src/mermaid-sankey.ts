import {measureMermaidLabel,type MeasuredMermaidLabel} from './mermaid-label.ts';
import {layoutSankeyMath,type SankeyInk,type SankeyLaneLabel} from './mermaid-sankey-layout.ts';
import {sankeyCubicInk} from './mermaid-sankey-ink.ts';
import {sankeyDisplayTextReplacements,sankeyMathTextReplacements} from '../../core/src/mermaid/sankey-text.ts';
import {validateMermaidMathLabel} from '../../core/src/mermaid/math.ts';
import {EMPTY_MATH_RESOURCE_TOTAL,MATH_LIMITS} from '../../core/src/math/policy.ts';

type Draw=(text:string,id:string,version:string,diagram:any)=>unknown;
type Capture={graph:any;width:number;height:number;showValues:boolean;prefix:string;suffix:string;labelStyle:string;
 getLabelPosition(node:any):{x:number;anchor:string};getText(node:any):string;svg:SVGSVGElement;labelsGroup:SVGGElement};
const SVG='http://www.w3.org/2000/svg';
let nextStage=0;
const finite=(n:unknown):number=>{if(typeof n!=='number'||!Number.isFinite(n))throw new Error('Nonfinite Sankey geometry');return n;};
const positive=(n:unknown):number=>{const x=finite(n);if(x<=0)throw new Error('Invalid Sankey extent');return x;};
const nonnegative=(n:unknown):number=>{const x=finite(n);if(x<0)throw new Error('Negative Sankey geometry');return x;};
const edit=(text:string,changes:readonly {start:number;end:number;text:string}[])=>{let out='',at=0;for(const c of changes){out+=text.slice(at,c.start)+c.text;at=c.end;}return out+text.slice(at);};

export function createSankeyMathRenderer(deps:{original:Draw;getConfig():any}):Draw {
 return async(text,id,version,diagram)=>{
  const graph=structuredClone(diagram.db.getGraph());
  if(!graph.nodes.some((node:any)=>typeof node.id==='string'&&node.id.includes('$$')))return deps.original(text,id,version,diagram);
  const config=deps.getConfig();
  if(config.securityLevel==='sandbox')throw new Error('Sankey math requires the strict document renderer');
  const root=document.getElementById(id) as unknown as SVGSVGElement|null;
  if(!root?.isConnected||root.namespaceURI!==SVG)throw new Error('Sankey root unavailable');
  const doc=root.ownerDocument,win=doc.defaultView!;
  const element=<K extends keyof SVGElementTagNameMap>(name:K)=>doc.createElementNS(SVG,name);
  const stage=element('svg'),output=element('g');
  let stageId:string;do{stageId=`${id}-vs-sankey-${++nextStage}`;}while(doc.getElementById(stageId));
  stage.id=stageId;stage.setAttribute('data-vs-sankey-stage','');stage.style.visibility='hidden';stage.style.overflow='visible';
  output.setAttribute('class','vs-sankey-math');
  const saved=[...root.attributes].map(a=>[a.name,a.value] as const);
  let committed=false,captured:Capture|undefined,calls=0;
  const proxy=Object.create(diagram),db=Object.create(diagram.db);
  db.getGraph=()=>graph;proxy.db=db;
  proxy.visserCaptureSankey=(value:Capture)=>{
   if(++calls!==1||value.svg!==stage||value.graph!==graph||value.labelsGroup.parentNode!==stage)throw new Error('Sankey capture identity differs');
   captured=value;
  };
  root.append(stage);
  try{
   const result=deps.original(text,stageId,version,proxy);
   if(result&&typeof (result as any).then==='function')throw new Error('Sankey native draw must be synchronous');
   if(calls!==1||!captured)throw new Error('Sankey capture unavailable');
   const capture:Capture=captured;
   positive(capture.width);positive(capture.height);
   // Discard only the temporary viewport transform. Native child coordinates,
   // IDs, gradients, order and shape attributes are retained verbatim.
   stage.removeAttribute('viewBox');stage.setAttribute('width',String(capture.width));stage.setAttribute('height',String(capture.height));stage.style.maxWidth='none';stage.style.visibility='hidden';stage.style.overflow='visible';
   const nodes=stage.querySelector<SVGGElement>(':scope > .nodes'),links=stage.querySelector<SVGGElement>(':scope > .links');
   if(!nodes||!links||stage.children.length!==3||stage.children[0]!==nodes||stage.children[1]!==capture.labelsGroup||stage.children[2]!==links)throw new Error('Sankey native groups differ');
   if(nodes.children.length!==graph.nodes.length||links.children.length!==graph.links.length)throw new Error('Sankey native cardinality differs');
   const ink={left:0,top:0,right:capture.width,bottom:capture.height};
   const include=(b:SankeyInk)=>{ink.left=Math.min(ink.left,b.left);ink.top=Math.min(ink.top,b.top);ink.right=Math.max(ink.right,b.right);ink.bottom=Math.max(ink.bottom,b.bottom);};
   const stroke=(shape:SVGElement,joins=false)=>{
    const style=win.getComputedStyle(shape);if(style.stroke==='none')return 0;
    const width=nonnegative(Number.parseFloat(style.strokeWidth));
    if(style.vectorEffect!=='none')throw new Error('Unsupported Sankey stroke transform');
    return joins&&style.strokeLinejoin==='miter'?width*Math.max(1,nonnegative(Number.parseFloat(style.strokeMiterlimit))):width;
   };
   for(const [index,node]of graph.nodes.entries()){
    if(typeof node.id!=='string')throw new Error('Sankey node identity differs');
    finite(node.x0);finite(node.y0);finite(node.x1);finite(node.y1);nonnegative(node.value);
    nonnegative(node.x1-node.x0);nonnegative(node.y1-node.y0);
    const group=nodes.children[index] as SVGGElement,rect=group.querySelector('rect');
    if((group as any).__data__!==node||!rect||group.children.length!==1)throw new Error('Sankey native node differs');
    const pad=stroke(rect,true);include({left:node.x0-pad,top:node.y0-pad,right:node.x1+pad,bottom:node.y1+pad});
   }
   for(const [index,link]of graph.links.entries()){
    if(!graph.nodes.includes(link.source)||!graph.nodes.includes(link.target))throw new Error('Sankey link endpoints differ');
    nonnegative(link.value);nonnegative(link.width);finite(link.y0);finite(link.y1);
    const group=links.children[index] as SVGGElement,path=group.querySelector('path');
    if((group as any).__data__!==link||!path||group.querySelectorAll('path').length!==1)throw new Error('Sankey native link differs');
    include(sankeyCubicInk(path.getAttribute('d')??'',stroke(path)));
   }
   const originals=[...capture.labelsGroup.querySelectorAll<SVGTextElement>('text')];
   const copies=capture.labelStyle==='outlined'?2:1;
   if(originals.length!==graph.nodes.length*copies)throw new Error('Sankey label cardinality differs');
   originals.forEach((node,index)=>{const datum=graph.nodes[index%graph.nodes.length];if((node as any).__data__!==datum||node.textContent!==capture.getText(datum))throw new Error('Sankey native label differs');});
   const labels=new Map<string,{name:MeasuredMermaidLabel;value?:SVGTextElement;valueBox?:DOMRect;padding:number;fill:string;backdrop:string}>();
   const sizes:SankeyLaneLabel[]=[];
   let total=EMPTY_MATH_RESOURCE_TOTAL;
   for(const [index,node]of graph.nodes.entries()){
    const key=`node:${index}`,native=originals[(copies-1)*graph.nodes.length+index]!,style=win.getComputedStyle(native);
    const nameText=edit(node.id,sankeyDisplayTextReplacements(node.id));
    const checked=validateMermaidMathLabel(edit(node.id,sankeyMathTextReplacements(node.id)),total),shown=validateMermaidMathLabel(nameText,total);
    if(JSON.stringify(checked.total)!==JSON.stringify(shown.total))throw new Error('Sankey display math differs');total=shown.total;
    const probe=element('svg');probe.style.fill=style.fill;root.append(probe);
    try{
     const name=await measureMermaidLabel(probe,nameText,'',{fontFamily:style.fontFamily,fontSize:style.fontSize,fontWeight:style.fontWeight,interpretBreakTags:false});
     let value:SVGTextElement|undefined,valueBox:DOMRect|undefined;
     if(capture.showValues){
      value=element('text');value.setAttribute('data-vs-sankey-value','');value.textContent=`${capture.prefix}${Math.round(node.value*100)/100}${capture.suffix}`;
      value.style.fontFamily=style.fontFamily;value.style.fontSize=style.fontSize;value.style.fontWeight=style.fontWeight;value.style.fill=style.fill;
      probe.append(value);valueBox=value.getBBox();
      [valueBox.x,valueBox.y,valueBox.width,valueBox.height].forEach(finite);nonnegative(valueBox.width);nonnegative(valueBox.height);value.remove();
     }
     const background=win.getComputedStyle(originals[index]!);
     const padding=copies===2&&background.stroke!=='none'?nonnegative(Number.parseFloat(background.strokeWidth))/2:0;
     const pos=capture.getLabelPosition(node);if(!['start','end'].includes(pos.anchor))throw new Error('Sankey label direction differs');
     labels.set(key,{name,value,valueBox,padding,fill:style.fill,backdrop:background.stroke});
     sizes.push({key,width:Math.max(name.width,valueBox?.width??0)+2*padding,height:name.height+(valueBox?valueBox.height+2:0)+2*padding,
      side:pos.anchor==='end'?'left':'right',anchorX:pos.anchor==='end'?node.x0:node.x1,anchorY:(node.y0+node.y1)/2});
    }finally{probe.remove();}
   }
   const geometry=layoutSankeyMath({ink,labels:sizes,gap:8,margin:12,maxDimension:MATH_LIMITS.maxDimensionEm*(Number.parseFloat(String(config.fontSize))||16)});
   const nativeGroup=element('g');nativeGroup.setAttribute('transform',`translate(${geometry.translateX},${geometry.translateY})`);
   const labelGroup=element('g');labelGroup.setAttribute('class','node-labels');
   // Native paint order is nodes, labels, links. Keep that order, including
   // complete link groups containing userSpaceOnUse gradient definitions.
   nativeGroup.append(nodes);output.append(nativeGroup,labelGroup);
   const linkGroup=element('g');linkGroup.setAttribute('transform',nativeGroup.getAttribute('transform')!);linkGroup.append(links);output.append(linkGroup);
   for(const p of geometry.labels){
    const label=labels.get(p.key)!,leader=element('polyline');leader.setAttribute('data-vs-sankey-leader',p.key);
    leader.setAttribute('points',p.leader.map(pair=>pair.join(',')).join(' '));leader.setAttribute('fill','none');leader.setAttribute('stroke',label.fill);leader.setAttribute('stroke-width','1');labelGroup.append(leader);
    const owner=element('g');owner.setAttribute('data-vs-mermaid-label',p.key);labelGroup.append(owner);
    if(label.padding){const backdrop=element('rect');for(const [key,value]of Object.entries({x:p.x,y:p.y,width:p.width,height:p.height,rx:label.padding}))backdrop.setAttribute(key,String(value));backdrop.setAttribute('fill',label.backdrop);owner.append(backdrop);}
    label.name.place(owner,p.x+label.padding,p.y+label.padding);
    if(label.value&&label.valueBox){label.value.setAttribute('x',String(p.x+label.padding-label.valueBox.x));label.value.setAttribute('y',String(p.y+label.padding+label.name.height+2-label.valueBox.y));owner.append(label.value);}
   }
   root.append(output);root.setAttribute('viewBox',`0 0 ${geometry.width} ${geometry.height}`);root.setAttribute('width',String(geometry.width));root.setAttribute('height',String(geometry.height));root.style.maxWidth='none';
   committed=true;
  }finally{
   stage.remove();
   if(!committed){output.remove();for(const attr of [...root.attributes])root.removeAttribute(attr.name);for(const [name,value]of saved)root.setAttribute(name,value);}
  }
 };
}
