import {measureMermaidLabel} from './mermaid-label.ts';
import {requirementMathText} from '../../core/src/mermaid/requirement-text.ts';
import {validateMermaidMathLabel} from '../../core/src/mermaid/math.ts';
const SVG='http://www.w3.org/2000/svg';
type Row={role:string;input:string;canonical:string;math:boolean};
type Owner={key:string;rows:Row[];seen:Set<string>;active:boolean};
type Context={owners:Map<string,Owner>};
const contexts=new WeakMap<Element,Context>();
let serial=0;
function invalid(message:string):never{throw new Error(`Requirement rendering: ${message}`);}
const types=new Set(['Requirement','Functional Requirement','Interface Requirement','Performance Requirement','Physical Requirement','Design Constraint']);
const relations=new Set(['contains','copies','derives','satisfies','verifies','refines','traces']);
function rows(node:any,kind:string,normalize:(input:string)=>string):Row[]{
 if(kind==='requirement'&&!types.has(node.type))invalid('unknown generated stereotype');
 const fields:Array<[string,string]>=[['stereotype',kind==='requirement'?`&lt;&lt;${node.type}&gt;&gt;`:'&lt;&lt;Element&gt;&gt;'],['name',node.name],...(kind==='requirement'?[['id',node.requirementId?`ID: ${node.requirementId}`:''],['text',node.text?`Text: ${node.text}`:''],['risk',node.risk?`Risk: ${node.risk}`:''],['verifyMethod',node.verifyMethod?`Verification: ${node.verifyMethod}`:'']]:[['type',node.type?`Type: ${node.type}`:''],['docRef',node.docRef?`Doc Ref: ${node.docRef}`:'']])as Array<[string,string]>];
 return fields.map(([role,input])=>{if(typeof input!=='string')invalid('nontext native row');const canonical=requirementMathText(normalize(input)),math=validateMermaidMathLabel(canonical).parts.some(part=>part.kind==='math');if(role==='stereotype'&&math)invalid('generated math');return {role,input,canonical,math};});
}
const authorClass=(token:string)=>'mermaid-requirement-author-'+Array.from(token).map(char=>char.codePointAt(0)!.toString(16)).join('-');

/** Native getData mutates its receiver's nodes. Render detached maps, with
 * opaque graph identities and native requirement-before-element endpoints. */
export function createRequirementMathRenderer(deps:{original:(...args:any[])=>any;normalize(input:string):string;getConfig():any}){
 return async(text:string,id:string,version:string,diagram:any)=>{
  const requirements=structuredClone(diagram.db.getRequirements())as Map<string,any>,elements=structuredClone(diagram.db.getElements())as Map<string,any>;
  const owners=new Map<string,Owner>();let hasMath=false;
  for(const [kind,table]of [['requirement',requirements],['element',elements]]as const){let index=0;for(const node of table.values()){const planned=rows(node,kind,deps.normalize),active=planned.some(row=>row.math);hasMath ||= active;owners.set(`${kind}:${index++}`,{key:`${kind}:${index-1}`,rows:planned,seen:new Set(),active});}}
  if(!hasMath)return deps.original(text,id,version,diagram);
  if(deps.getConfig().securityLevel==='sandbox')invalid('strict renderer required');
  const root=document.getElementById(id)as unknown as SVGSVGElement|null;
  if(!root?.isConnected||root.namespaceURI!==SVG)invalid('root unavailable');
  const doc=root.ownerDocument,stage=doc.createElementNS(SVG,'svg');let stageId:string;do{stageId=`${id}-vs-requirement-${++serial}`;}while(doc.getElementById(stageId));
  stage.append(doc.createElementNS(SVG,'g'));
  stage.id=stageId;stage.setAttribute('data-vs-requirement-stage','');stage.style.visibility='hidden';stage.style.overflow='visible';
  const db=Object.create(diagram.db),proxy=Object.create(diagram),direction=diagram.db.getDirection(),title=diagram.db.getDiagramTitle(),accTitle=diagram.db.getAccTitle(),accDescr=diagram.db.getAccDescription();
  Object.assign(db,{requirements,elements,relations:structuredClone(diagram.db.getRelationships()),getDirection:()=>direction,getDiagramTitle:()=>title,getAccTitle:()=>accTitle,getAccDescription:()=>accDescr});proxy.db=db;
  const context:Context={owners:new Map()},ids=new Map<string,string>(),elementIds=new Map<string,string>();
  let calls=0;
  db.getData=()=>{
   if(++calls!==1)invalid('graph requested more than once');
   const data=diagram.db.getData.call(db);let at=0;
   for(const [kind,table]of [['requirement',requirements],['element',elements]]as const){let index=0;for(const [name,node]of table){if(data.nodes[at++]!==node)invalid('native node order differs');const key=`${kind}:${index}`,opaque=`${stageId}-${kind}-${index++}`;node.id=opaque;node.domId=opaque;node.cssClasses=node.classes.map(authorClass).join(' ');(kind==='requirement'?ids:elementIds).set(name,opaque);context.owners.set(opaque,owners.get(key)!);}}
   if(at!==data.nodes.length||data.edges.length!==db.relations.length)invalid('native graph cardinality differs');
   data.edges.forEach((edge:any,index:number)=>{const relation=db.relations[index];if(!relations.has(relation.type))invalid('unknown generated relationship');const start=ids.get(relation.src)??elementIds.get(relation.src),end=ids.get(relation.dst)??elementIds.get(relation.dst);if(!start||!end)invalid('unresolved relationship');edge.id=`${stageId}-edge-${index}`;edge.start=start;edge.end=end;});
   return data;
  };
  const attrs=[...root.attributes].map(attr=>[attr.name,attr.value]as const),children=[...root.childNodes];let committed=false;
  root.append(stage);contexts.set(stage,context);
  try{
   await deps.original(text,stageId,version,proxy);
   if(calls!==1)invalid('missing native graph');
   for(const owner of owners.values())if(owner.seen.size!==owner.rows.length)invalid('missing semantic row');
   // Stage IDs remain on internal graph/marker identities, but the temporary
   // viewport itself must not survive or affect the final outer viewport.
   for(const attr of [...root.attributes])if(attr.name!=='id')root.removeAttribute(attr.name);
   for(const attr of [...stage.attributes])if(!['id','data-vs-requirement-stage','style'].includes(attr.name))root.setAttribute(attr.name,attr.value);
   const style=stage.getAttribute('style')??'';stage.style.removeProperty('visibility');stage.style.removeProperty('overflow');
   if(stage.getAttribute('style'))root.setAttribute('style',stage.getAttribute('style')!);else if(style)root.removeAttribute('style');
   root.replaceChildren(...children,...stage.childNodes);committed=true;
  }finally{
   contexts.delete(stage);stage.remove();
   if(!committed){root.replaceChildren(...children);for(const attr of [...root.attributes])root.removeAttribute(attr.name);for(const [name,value]of attrs)root.setAttribute(name,value);}
  }
 };
}

/** Invoked at the pinned shape boundary with an explicit semantic role. */
export function requirementRows(parent:any,node:any,deps:{native:(...args:any[])=>Promise<number>;normalize(input:string):string}){
 let context:Context|undefined;for(let current:Element|null=parent.node();current;current=current.parentElement){context=contexts.get(current);if(context)break;}
 const owner=context?.owners.get(node.id);
 if(context&&!owner)invalid('unowned native shape');
 const active=owner?.active??false;
 return {active,body:owner?.rows.some(row=>!['stereotype','name'].includes(row.role)&&row.input!=='')??false,
  finish(){if(owner&&owner.seen.size!==owner.rows.length)invalid('row coverage differs');},
  async add(role:string,parentGroup:any,input:string,yOffset:number,style='',alignment='center'){
   const planned=owner?.rows.find(row=>row.role===role);
   if(owner){if(!planned||planned.input!==input||owner.seen.has(role))invalid('row input or identity differs');owner.seen.add(role);if(requirementMathText(deps.normalize(input))!==planned.canonical)invalid('row normalization changed');}
   if(!input)return deps.native(parentGroup,input,yOffset,style,alignment);
   let group:SVGGElement,height:number;
   if(active&&planned!.math){
    const parentElement=parentGroup.node()as SVGElement,svg=parentElement.ownerSVGElement!;
    group=parentElement.ownerDocument.createElementNS(SVG,'g');group.setAttribute('class','label');group.setAttribute('style',style);parentElement.append(group);
    const computed=parentElement.ownerDocument.defaultView!.getComputedStyle(group);
    const measured=await measureMermaidLabel(svg,planned!.canonical,'reqLabel',{fontFamily:computed.fontFamily,fontSize:computed.fontSize,fontWeight:computed.fontWeight,fontStyle:computed.fontStyle,letterSpacing:computed.letterSpacing,color:computed.color,labelStyle:style,measurementParent:group,interpretBreakTags:false});
    measured.place(group,0,0);group.setAttribute('transform',`translate(${-measured.width/2},${yOffset})`);height=measured.height;
   }else{
    const before=new Set(parentGroup.node().children);height=await deps.native(parentGroup,input,yOffset,style,alignment);
    const added=[...parentGroup.node().children].filter(child=>!before.has(child));if(added.length!==1)invalid('native row structure differs');group=added[0]as SVGGElement;
    if(active){const bounds=group.getBBox();group.setAttribute('transform',`translate(${-bounds.width/2-bounds.x},${yOffset-bounds.y})`);}
   }
   if(!Number.isFinite(height)||height<0)invalid('invalid row measurement');
   if(owner&&role!=='stereotype')group.setAttribute('data-vs-mermaid-label',`${owner.key}:${role}`);
   return height;
  }
 };
}
