import {measureMermaidLabel} from './mermaid-label.ts';
import {kanbanMathText} from '../../core/src/mermaid/kanban-text.ts';
import {validateMermaidMathLabel} from '../../core/src/mermaid/math.ts';

const SVG='http://www.w3.org/2000/svg';
type Role='label'|'ticket'|'assigned';
type Row={role:Role;input:string;canonical:string;math:boolean};
type NativeHelpers={styles(node:any):any;classes?(node:any):string;htmlLabels():boolean;titleMargin?():number;plain(group:any,input:string,node:any):Promise<SVGGraphicsElement>;outline(group:any,node:any,width:number,height:number):any};
type Box={x:number;y:number;width:number;height:number};
type Label={group:any;width:number;height:number};
type Card={group:any;box:Box;width:number;height:number};
type Column={node:any;group:any;label:Label;cards:Card[];width:number;key:string};
let serial=0;
function invalid(message:string):never{throw new Error(`Kanban rendering: ${message}`);}
function size(value:number,name:string):number{if(!Number.isFinite(value)||value<0)invalid(`invalid ${name}`);return value;}
function box(group:any):Box{const b=group.node().getBBox();for(const key of ['x','y','width','height'])if(!Number.isFinite(b[key]))invalid('nonfinite label bounds');return {x:b.x,y:b.y,width:size(b.width,'width'),height:size(b.height,'height')};}
function place(label:Label,x:number,y:number){const b=box(label.group);label.group.attr('transform',`translate(${x-b.x},${y-b.y})`);}
function rows(node:any,normalize:(input:string)=>string):Row[]{
 const values:Array<[Role,unknown]>=node.isGroup?[['label',node.label??'']]:[['label',node.label??''],['ticket',node.ticket??''],['assigned',node.assigned??'']];
 return values.map(([role,input])=>{if(typeof input!=='string')invalid('native label is not text');const canonical=node.isGroup?kanbanMathText(input):kanbanMathText(normalize(input));return {role,input,canonical,math:validateMermaidMathLabel(canonical).parts.some(part=>part.kind==='math')};});
}

/** Draw only after measuring the DOM that will remain visible. Math never
 * enters native createText; plain roles retain its Markdown interpretation.
 */
async function label(parent:any,node:any,row:Row,key:string,helpers:NativeHelpers,seen:Set<string>):Promise<Label>{
 const field=`${key}:${row.role}`;if(seen.has(field))invalid('duplicate native field');seen.add(field);
 const group=parent.append('g').attr('class',node.isGroup?'cluster-label':'label').attr('style',node.labelStyle||null).attr('data-vs-mermaid-label',field);
 if(row.math){
  const measured=await measureMermaidLabel(group.node().ownerSVGElement,row.canonical,node.isGroup?'cluster-label':'kanban-label',{
   labelStyle:node.labelStyle||'',measurementParent:group.node(),interpretBreakTags:false,
  });
  measured.place(group.node(),0,0);
 }else if(row.input){
  const element=await helpers.plain(group,row.input,node);
  if(helpers.htmlLabels()&&element.tagName.toLowerCase()==='foreignobject'){
   const child=element.firstElementChild;if(!child)invalid('native HTML label is empty');
   const rect=child.getBoundingClientRect(),matrix=element.getScreenCTM();if(!matrix)invalid('native label matrix unavailable');
   const inverse=matrix.inverse();
   const corners=[[rect.left,rect.top],[rect.right,rect.top],[rect.left,rect.bottom],[rect.right,rect.bottom]].map(([x,y])=>new DOMPoint(x!,y!).matrixTransform(inverse));
   const width=Math.max(...corners.map(p=>p.x))-Math.min(...corners.map(p=>p.x)),height=Math.max(...corners.map(p=>p.y))-Math.min(...corners.map(p=>p.y));
   element.setAttribute('width',String(size(width,'HTML width')));element.setAttribute('height',String(size(height,'HTML height')));
  }
 }
 const bounds=box(group);return {group,width:bounds.width,height:bounds.height};
}

/** Math-active Kanban layout. It uses the pinned native text/style/outline
 * primitives, but determines card and column dimensions before positioning.
 * No shared native node registry or authored ID is used for repeated draws.
 */
export function createKanbanMathRenderer(deps:{original:(...args:any[])=>any;getConfig():any;selectSvgElement(id:string):any;setupGraphViewbox(...args:any[]):void;card:NativeHelpers;section:NativeHelpers;normalize(input:string):string}){
 return async(text:string,id:string,version:string,diagram:any)=>{
  const data=diagram.db.getData(),config=deps.getConfig();
  if(!Array.isArray(data.nodes))invalid('native display list unavailable');
  const display=data.nodes.map((node:any,index:number)=>({node,index,rows:rows(node,deps.normalize)}));
  if(!display.some((entry:any)=>entry.rows.some((row:Row)=>row.math)))return deps.original(text,id,version,diagram);
  if(config.securityLevel!=='strict')invalid('strict renderer required');
  if(config.kanban?.ticketBaseUrl)invalid('ticket links are not supported by the math renderer');
  const sections=display.filter((entry:any)=>entry.node.isGroup);
  const root=document.getElementById(id)as unknown as SVGSVGElement|null;if(!root?.isConnected||root.namespaceURI!==SVG)invalid('root unavailable');
  const doc=root.ownerDocument,stage=doc.createElementNS(SVG,'svg');let stageId:string;
  do{stageId=`${id}-vs-kanban-${++serial}`;}while(doc.getElementById(stageId));
  stage.id=stageId;stage.setAttribute('data-vs-kanban-stage','');stage.style.visibility='hidden';stage.style.overflow='visible';
  const attributes=[...root.attributes].map(attr=>[attr.name,attr.value]as const),children=[...root.childNodes];let committed=false;
  root.append(stage);
  try{
   const svg=deps.selectSvgElement(stageId),heads=svg.append('g').attr('class','sections'),items=svg.append('g').attr('class','items');
   const requested=Number(config.kanban?.sectionWidth||200);if(!Number.isFinite(requested)||requested<=0)invalid('column width must be positive');
   const seen=new Set<string>(),expected=new Set<string>(),columns:Column[]=[];
   const fresh=(entry:any,key:string)=>{
    const node=structuredClone(entry.node),opaque=`${stageId}-draw-${++serial}`;
    node.id=opaque;node.domId=opaque;node.look=node.look??config.look;node.width=requested;node.padding=10;node.rx=5;node.ry=5;
    for(const row of entry.rows)expected.add(`${key}:${row.role}`);
    return node;
   };
   // All headings are measured before the common heading band is selected.
   for(const [sectionIndex,entry]of sections.entries()){
    const key=`kanban-render:${sectionIndex}:${entry.index}:section`,node=fresh(entry,key);
    node.cssClasses=`${node.cssClasses??''} section-${sectionIndex+1}`;
    const style=deps.section.styles(node);node.labelStyle=style.labelStyles||node.labelStyle||'';
    const group=heads.append('g').attr('class',`cluster ${node.cssClasses}`).attr('id',node.domId).attr('data-look',node.look).attr('data-vs-kanban-column',key);
    const heading=await label(group,node,entry.rows[0],key,deps.section,seen);
    columns.push({node,group,label:heading,cards:[],width:Math.max(requested,heading.width+20),key});
   }
   for(const [sectionIndex,entry]of sections.entries()){
    const column=columns[sectionIndex]!;
    for(const item of display){
     if(item.node.parentId!==entry.node.id)continue;
     if(item.node.isGroup)invalid('groups within groups are unsupported');
     const key=`kanban-render:${sectionIndex}:${item.index}:item`,node=fresh(item,key);node.width=requested-15;
     const style=deps.card.styles(node);node.labelStyle=style.labelStyles||'';
     const group=items.append('g').attr('class',deps.card.classes?.(node)||'node default').attr('id',node.domId).attr('data-look',node.look).attr('data-vs-kanban-card',key);
     const measured:Partial<Record<Role,Label>>={};
     for(const row of item.rows as Row[])measured[row.role]=await label(group,node,row,key,deps.card,seen);
     const title=measured.label!,ticket=measured.ticket!,assigned=measured.assigned!;
     const gap=ticket.width&&assigned.width?10:0;
     const width=Math.max(node.width,title.width+20,ticket.width+assigned.width+gap+20);
     const height=Math.max(Number(node.height)||0,title.height+Math.max(ticket.height,assigned.height)+20);
     size(width,'card width');size(height,'card height');
     place(title,-width/2+10,-height/2+10);place(ticket,-width/2+10,-height/2+10+title.height);place(assigned,width/2-10-assigned.width,-height/2+10+title.height);
     node.width=width;node.height=height;
     deps.card.outline(group,node,width,height).attr('data-vs-kanban-outline',key);
     const bounds=box(group);column.cards.push({group,box:bounds,width:bounds.width,height:bounds.height});column.width=Math.max(column.width,bounds.width+15);
    }
   }
   const margin=Number(deps.section.titleMargin?.()??0);size(margin,'heading margin');
   const headingBand=Math.max(25,...columns.map(column=>column.label.height+20+margin));let left=0;
   for(const column of columns){
    const center=left+column.width/2;let top=headingBand+5;
    for(const card of column.cards){card.group.attr('transform',`translate(${center},${top-card.box.y})`);top+=card.height+5;}
    const height=Math.max(50,top+10);column.node.width=column.width;column.node.height=height;
    column.group.attr('transform',`translate(${center},${height/2})`);
    place(column.label,-column.label.width/2,-height/2+10+margin);
    deps.section.outline(column.group,column.node,column.width,height).attr('data-vs-kanban-outline',column.key);
    left+=column.width+10;
   }
   if(seen.size!==expected.size||[...expected].some(key=>!seen.has(key)))invalid('native field coverage differs');
   deps.setupGraphViewbox(undefined,svg,config.mindmap?.padding??10,config.mindmap?.useMaxWidth??true);
   for(const attr of [...root.attributes])if(attr.name!=='id')root.removeAttribute(attr.name);
   for(const attr of [...stage.attributes])if(!['id','data-vs-kanban-stage','style'].includes(attr.name))root.setAttribute(attr.name,attr.value);
   stage.style.removeProperty('visibility');stage.style.removeProperty('overflow');
   if(stage.getAttribute('style'))root.setAttribute('style',stage.getAttribute('style')!);
   root.replaceChildren(...children,...stage.childNodes);committed=true;
  }finally{
   stage.remove();if(!committed){root.replaceChildren(...children);for(const attr of [...root.attributes])root.removeAttribute(attr.name);for(const [name,value]of attributes)root.setAttribute(name,value);}
  }
 };
}
