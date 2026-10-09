import {hasERLayoutHooks} from './mermaid-er-context.ts';
import {withERRenderStage} from './mermaid-er-stage.ts';

/** Native ER draw owns getData and is called exactly once. Planning therefore
 * observes its actual resolved graph instead of projecting the mutable DB twice. */
export function createERMathRenderer(deps:{original:(...args:any[])=>Promise<any>;normalize(input:string):string;getConfig():any}){
 return async(text:string,id:string,version:string,diagram:any)=>{
  const root=document.getElementById(id)as unknown as SVGSVGElement|null;
  if(!root?.isConnected||root.namespaceURI!=='http://www.w3.org/2000/svg')throw new Error('ER rendering: attached SVG required');
  // Explicit private stages (including native-contract fixtures) already own
  // the lifecycle. Never nest contexts or invoke getData as an activation scan.
  if(hasERLayoutHooks(root))return deps.original(text,id,version,diagram);
  if(deps.getConfig().securityLevel!=='strict')throw new Error('ER rendering: strict renderer required');
  return withERRenderStage(root,deps.normalize,stage=>deps.original(text,stage.id,version,diagram));
 };
}
