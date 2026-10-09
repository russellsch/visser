import {withERLayoutHooks} from './mermaid-er-context.ts';
import {createERStagePlan} from './mermaid-er-plan.ts';

const SVG='http://www.w3.org/2000/svg';
let serial=0;
/** Render and verify native ER output before replacing the visible viewport.
 * The renderer factory must provide native normalization and strict-mode drawing.
 * Source binding remains a separate required check before publishing the SVG. */
export async function withERRenderStage<T>(root:SVGSVGElement,normalize:(input:string)=>string,draw:(stage:SVGSVGElement)=>Promise<T>):Promise<T>{
 if(!root.isConnected||root.namespaceURI!==SVG||root.localName!=='svg')throw new Error('ER render stage: attached SVG required');
 const doc=root.ownerDocument,stage=doc.createElementNS(SVG,'svg');
 do{stage.id=`${root.id}-vs-er-${++serial}`;}while(doc.getElementById(stage.id));
 stage.setAttribute('data-vs-er-stage','');stage.style.visibility='hidden';stage.style.overflow='visible';
 stage.append(doc.createElementNS(SVG,'g'));
 const attributes=[...root.attributes].map(attr=>[attr.name,attr.value]as const),children=[...root.childNodes];
 let committed=false;
 root.append(stage);
 try{
  const plan=createERStagePlan(stage,normalize);
  const result=await withERLayoutHooks(stage,plan.hooks,()=>draw(stage));
  plan.finish();
  if(!root.isConnected||stage.parentNode!==root)throw new Error('ER render stage: viewport changed');
  // Transfer native viewBox, dimensions and styles, excluding private staging
  // state. Existing style/defs nodes retain their original identities.
  stage.style.removeProperty('visibility');stage.style.removeProperty('overflow');
  for(const attr of [...root.attributes])if(attr.name!=='id')root.removeAttribute(attr.name);
  for(const attr of [...stage.attributes])if(!['id','data-vs-er-stage'].includes(attr.name))root.setAttribute(attr.name,attr.value);
  const persistent=children.filter(child=>child.nodeType===1&&['style','defs'].includes((child as Element).localName));
  root.replaceChildren(...persistent,...stage.childNodes);committed=true;
  return result;
 }finally{
  stage.remove();
  if(!committed){
   root.replaceChildren(...children);
   for(const attr of [...root.attributes])root.removeAttribute(attr.name);
   for(const [name,value]of attributes)root.setAttribute(name,value);
  }
 }
}
