import {isDeepStrictEqual} from 'node:util';
import {MathPolicyError} from '../math/policy.ts';
export type EREffect=Readonly<{method:string;args:readonly unknown[]}>;
export type ERDbOptions=Readonly<{look:string;initialDirection?:string}>;
export type ERDbSnapshot=Readonly<{version:1;entities:readonly [string,unknown][];classes:readonly [string,unknown][];relationships:readonly unknown[];subGraphs:readonly unknown[];subGraphLookup:readonly [string,unknown][];subCount:number;subgraphDepth:number;direction:string;title:string;accTitle:string;accDescr:string}>;
function bad(m:string):never{throw new MathPolicyError('E_MATH_INVALID',`ER native reconciliation: ${m}`);}
function validateEffect(effect:EREffect):void{
 if(!effect||typeof effect.method!=='string'||!Array.isArray(effect.args))bad('invalid effect');
 const a=effect.args,text=(v:unknown)=>typeof v==='string',texts=(v:unknown)=>Array.isArray(v)&&v.every(text);
 const exact=(n:number)=>{if(a.length!==n)bad('invalid effect argument count');};
 switch(effect.method){
  case 'clear':exact(0);return;
  case 'setDirection':case 'setDiagramTitle':case 'setAccTitle':case 'setAccDescription':exact(1);if(!text(a[0]))bad('non-text metadata');return;
  case 'addEntity':if(a.length<1||a.length>2||!a.every(text))bad('invalid entity');return;
  case 'addAttributes':exact(2);if(!text(a[0])||!Array.isArray(a[1]))bad('invalid attributes');
   for(const row of a[1] as any[]){if(!row||Array.isArray(row)||typeof row!=='object'||!text(row.type)||!text(row.name)||(row.keys!==undefined&&!texts(row.keys))||(row.comment!==undefined&&!text(row.comment)))bad('invalid attribute');}return;
  case 'addRelationship':{exact(4);const spec=a[3] as any;if(!a.slice(0,3).every(text)||!spec||Array.isArray(spec)||typeof spec!=='object'||!['cardA','cardB','relType'].every(k=>text(spec[k])))bad('invalid relationship');return;}
  case 'setClass':exact(2);if(!texts(a[0])||!texts(a[1]))bad('invalid classes');return;
  case 'addClass':case 'addCssStyles':exact(2);if(!texts(a[0])||(a[1]!==undefined&&!texts(a[1])))bad('invalid styles');return;
  case 'addSubGraph':{exact(3);const id=a[0] as any,title=a[2] as any;if(!id||!text(id.text)||!Array.isArray(a[1])||!title||!text(title.text))bad('invalid group');return;}
  default:bad('unknown DB effect');
 }
}
/** Captures stored native state before getData mutates entities. */
export function captureERDb(db:any):ERDbSnapshot{return structuredClone({version:1,entities:[...db.getEntities()],classes:[...db.getClasses()],relationships:db.getRelationships(),subGraphs:db.getSubGraphs(),subGraphLookup:[...db.subGraphLookup],subCount:db.subCount,subgraphDepth:db.subgraphDepth,direction:db.getDirection(),title:db.getDiagramTitle(),accTitle:db.getAccTitle(),accDescr:db.getAccDescription()});}
/** Pure replay. Effects must already contain native-normalized common fields and
 * addSubGraph args[2].text after native sanitation but before final trimming.
 * Common setter args[0] must already equal the native setter output. Other
 * arguments remain grammar semantic values. look is the effective configured
 * look (native fallback: default). This does not sanitize, parse, authenticate
 * source, attest configuration, or manage native lifecycle. */
export function replayERDb(input:readonly EREffect[],options:ERDbOptions):ERDbSnapshot{
 if(!options||typeof options.look!=='string'||(options.initialDirection!==undefined&&typeof options.initialDirection!=='string'))bad('invalid options');
 if(!Array.isArray(input))bad('effects must be an array');
 for(const effect of input)validateEffect(effect);
 const effects=structuredClone(input);let entities=new Map<string,any>(),classes=new Map<string,any>(),relationships:any[]=[],subGraphs:any[]=[],lookup=new Map<string,any>(),subCount=0,subgraphDepth=0,direction=options.initialDirection??'TB',title='',accTitle='',accDescr='';
 const addEntity=(name:string,alias='')=>{if(typeof name!=='string'||typeof alias!=='string')bad('invalid entity');let e=entities.get(name);if(!e){e={id:`entity-${name}-${entities.size}`,label:name,attributes:[],alias,shape:'erBox',look:options.look,cssClasses:'default',cssStyles:[],labelType:'markdown'};entities.set(name,e);}else if(!e.alias&&alias)e.alias=alias;return e;};
 const clear=()=>{entities=new Map();classes=new Map();relationships=[];subGraphs=[];lookup=new Map();subCount=0;subgraphDepth=0;title='';accTitle='';accDescr='';};
 for(const effect of effects){if(!effect||typeof effect.method!=='string'||!Array.isArray(effect.args))bad('invalid effect');const a=effect.args as any[];switch(effect.method){
  case'clear':if(a.length)bad('clear args');clear();break;case'setDirection':direction=a[0];break;case'setDiagramTitle':title=a[0];break;case'setAccTitle':accTitle=a[0];break;case'setAccDescription':accDescr=a[0];break;
  case'addEntity':addEntity(a[0],a.length>1?a[1]:'');break;case'addAttributes':{const e=addEntity(a[0]),attrs=a[1];if(!Array.isArray(attrs))bad('attributes');for(let i=attrs.length-1;i>=0;i--){const row=attrs[i];if(!row||typeof row!=='object')bad('attribute');if(!row.keys)row.keys=[];if(!row.comment)row.comment='';e.attributes.push(row);}break;}
  case'addRelationship':{const [left,role,right,spec]=a;if(!spec||typeof spec!=='object')bad('relationship');const entityA=lookup.has(left)?left:addEntity(left).id,entityB=lookup.has(right)?right:addEntity(right).id;relationships.push({entityA,roleA:role,entityB,relSpec:spec});break;}
  case'addClass':{const [ids,styles]=a;for(const id of ids){let c=classes.get(id);if(!c){c={id,styles:[],textStyles:[]};classes.set(id,c);}for(const s of styles??[]){if(/color/.test(s))c.textStyles.push(s.replace('fill','bgFill'));c.styles.push(s);}}break;}
  case'setClass':{const [ids,names]=a;if(!Array.isArray(ids)||!Array.isArray(names))bad('set class');for(const id of ids){const e=entities.get(id);if(e)for(const n of names)e.cssClasses+=' '+n;const g=lookup.get(id);if(g)for(const n of names)g.classes.push(n);}break;}
  case'addCssStyles':{const [ids,styles]=a;for(const id of ids){if(!styles)continue;const e=entities.get(id),g=lookup.get(id);if(e)e.cssStyles.push(...styles);if(g)g.cssStyles.push(...styles);}break;}
  case'addSubGraph':{const [raw,list,rawTitle]=a;if(!raw||typeof raw.text!=='string'||!Array.isArray(list)||!rawTitle||typeof rawTitle.text!=='string')bad('group');const id=raw.text.trim(),seen=new Set<string>();let dir:any;const flat=list.flat();const nodes=flat.filter((v:any)=>{if(v?.stmt){if(v.stmt==='dir')dir=v.value;return false;}if(typeof v!=='string'||!v.trim()||seen.has(v.trim()))return false;seen.add(v.trim());return true;});const g={id,nodes,title:rawTitle.text.trim(),classes:[],cssStyles:[],dir,labelType:['markdown','string','text'].includes(rawTitle.type)?rawTitle.type:'markdown'};g.nodes=g.nodes.filter((n:string)=>!subGraphs.some(x=>x.nodes.includes(n)));subCount++;subGraphs.push(g);lookup.set(id,g);break;}
  default:bad('unknown DB effect');}}
 return structuredClone({version:1,entities:[...entities],classes:[...classes],relationships,subGraphs,subGraphLookup:[...lookup],subCount,subgraphDepth,direction,title,accTitle,accDescr});
}
export function reconcileERDb(effects:readonly EREffect[],native:ERDbSnapshot,options:ERDbOptions):ERDbSnapshot{
 const replay=replayERDb(effects,options);if(!isDeepStrictEqual(replay,native))bad('stored ER state differs');
 const forward=new WeakMap<object,object>(),reverse=new WeakMap<object,object>();
 const pending:Array<[unknown,unknown]>=[[replay,native]];
 while(pending.length){const [left,right]=pending.pop()!;if(left===null||typeof left!=='object')continue;
  if(right===null||typeof right!=='object')bad('native object graph differs');
  if(forward.has(left)||reverse.has(right)){if(forward.get(left)!==right||reverse.get(right)!==left)bad('native object aliases differ');continue;}
  forward.set(left,right);reverse.set(right,left);
  for(const key of Object.keys(left))pending.push([(left as Record<string,unknown>)[key],(right as Record<string,unknown>)[key]]);
 }
 return structuredClone(native);
}
