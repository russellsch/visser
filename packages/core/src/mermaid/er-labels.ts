import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {MathPolicyError} from '../math/policy.ts';
import {mapFlowchartParserInput} from './flowchart-source.ts';
import {normalizeMermaidSource} from './rules.ts';
import {MermaidSourceCoordinates,type LocatedSourceInterval} from './source-coordinates.ts';
import type {ProvenanceText} from './source-provenance.ts';
export type ERLabelRole='entity.name'|'entity.alias'|'attribute.type'|'attribute.name'|'attribute.key'|'attribute.comment'|'relationship.role'|'subgraph.id'|'subgraph.title'|'accTitle'|'accDescr';
export type ERLabelRecord=Readonly<{recordIndex:number;role:ERLabelRole;mappedValue:ProvenanceText;semanticValue:string;intervals:readonly LocatedSourceInterval[];synthetic:boolean}>;
export type EREffect=Readonly<{method:string;args:readonly unknown[];recordIndices:readonly number[]}>;
export type ERLabels=Readonly<{parserSource:string;records:readonly ERLabelRecord[];effects:readonly EREffect[]}>;
type Loc={range?:[number,number]};
type Parser={yy:Record<string,any>;lexer:{options:Record<string,unknown>};performAction(...args:any[]):unknown;parse(input:string):unknown};
type Pinned={Parser:new()=>Parser;lexer:Parser['lexer'];productions_:unknown[]};
const fail=(message:string):never=>{throw new MathPolicyError('E_MATH_INVALID',`ER grammar collector: ${message}`);};
const freeze=(value:any):any=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const trim=(v:ProvenanceText)=>{const start=v.length-v.text.trimStart().length;return v.slice(start,start+v.text.trim().length);};
/** Native semantic values remain untouched; ownership follows grammar ranges
 * and object identity, never matching text values to earlier occurrences. */
export async function extractERLabels(original:string,rendered=normalizeMermaidSource(original)):Promise<ERLabels>{
 const input=mapFlowchartParserInput(original,rendered).mermaidInput,coordinates=new MermaidSourceCoordinates(original);
 // @ts-expect-error pinned private artifact has no declaration.
 const mod=await import('mermaid/dist/chunks/mermaid.core/erDiagram-OPXOYQCR.mjs');
 const pinned=mod.diagram?.parser?.parser as Pinned;
 if(typeof pinned?.Parser!=='function'||createHash('sha256').update(JSON.stringify(pinned.productions_)).digest('hex')!=='98bda85a9c43e9384fb0283efb697edc884088b0ac11f400afe54f9872693936')fail('pinned grammar changed');
 const parser=new pinned.Parser();parser.lexer=Object.create(pinned.lexer);parser.lexer.options={...pinned.lexer.options,ranges:true};
 const records:ERLabelRecord[]=[],effects:EREffect[]=[],mapped=new Map<string,ProvenanceText>();
 const starts=new WeakMap<ProvenanceText,number>(),positions:number[]=[];
 const attributes=new WeakMap<object,number[]>(),keys=new WeakMap<object,ProvenanceText[]>(),headers=new WeakMap<object,number[]>();
 const key=(loc:Loc|undefined)=>{if(!loc?.range)fail('missing grammar range');return loc!.range!.join(':');};
 const raw=(loc:Loc|undefined)=>{key(loc);const v=input.slice(...loc!.range!);starts.set(v,loc!.range![0]);return v;};
 const value=(loc:Loc|undefined,semantic:unknown)=>{const v=mapped.get(key(loc))??raw(loc);if(v.text!==semantic)fail('semantic value has no owning reduction');return v;};
 const add=(role:ERLabelRole,v:ProvenanceText)=>{const located=coordinates.locateRange(v,0,v.length),index=records.length;const position=starts.get(v);if(position===undefined)fail('missing record position');positions.push(position!);records.push(Object.freeze({recordIndex:index,role,mappedValue:v,semanticValue:v.text,intervals:Object.freeze(located.intervals),synthetic:located.synthetic}));return index;};
 let calls:Array<{method:string;args:any[]}>=[];
 const methods=['addEntity','addAttributes','addRelationship','setClass','setAccTitle','setAccDescription','setDirection','addSubGraph','addClass','addCssStyles'];
 parser.yy={Cardinality:{ZERO_OR_ONE:'ZERO_OR_ONE',ZERO_OR_MORE:'ZERO_OR_MORE',ONE_OR_MORE:'ONE_OR_MORE',ONLY_ONE:'ONLY_ONE',MD_PARENT:'MD_PARENT'},Identification:{NON_IDENTIFYING:'NON_IDENTIFYING',IDENTIFYING:'IDENTIFYING'},...Object.fromEntries(methods.map(method=>[method,(...args:any[])=>{calls.push({method,args:structuredClone(args)});return method==='addSubGraph'?args[0].text.trim():undefined;}]))};
 const action=parser.performAction;
 parser.performAction=function(this:{$?:any;_$:Loc},...args:any[]){
  const p=args[4]as number,stack=args[5]as any[],locations=args[6]as Loc[],last=(n=0)=>stack.at(-1-n),loc=(n=0)=>locations.at(-1-n),v=(n=0)=>value(loc(n),last(n));
  const depth=args[3].subgraphDepth;
  const expected:Array<[string,any[]]>=[];const call=(method:string,...a:any[])=>expected.push([method,a]);
  const entityOffsets:Record<number,[number,number?]>={11:[3],12:[5],13:[2],14:[4],15:[0],16:[2],17:[6,4],18:[8,6],19:[5,3],20:[7,5],21:[3,1],22:[5,3]};
  const relationOffsets:Record<number,[number,number,number]>={7:[4,2,3],8:[8,4,5],9:[6,2,3],10:[6,4,5]};
  const e=entityOffsets[p],r=relationOffsets[p];
  if(r){call('addEntity',last(r[0]));call('addEntity',last(r[1]));call('addRelationship',last(r[0]),last(),last(r[1]),last(r[2]));}
  if(e){call('addEntity',last(e[0]),...(e[1]===undefined?[]:[last(e[1])]));if([11,12,17,18].includes(p))call('addAttributes',last(e[0]),last(1));}
  const classOffsets:Record<number,Array<[number,number]>>={8:[[8,6],[4,2]],9:[[6,4]],10:[[4,2]],12:[[5,3]],14:[[4,2]],16:[[2,0]],18:[[8,3]],20:[[7,2]],22:[[5,0]]};
  for(const [id,c]of classOffsets[p]??[])call('setClass',[last(id)],last(c));
  if(p===23||p===24)call('setAccTitle',String(last()).trim());
  if(p===25||p===26)call('setAccDescription',String(last()).trim());
  if(p===27&&!depth)call('setDirection',last().value);
  if(p===31)call('addSubGraph',{text:last(2).id},last(1),{text:last(2).text});
  if(p===40)call('addClass',last(2),last(1));if(p===45)call('setClass',last(1),last());if(p===46)call('addCssStyles',last(2),last(1));
  calls=[];const result=action.apply(this,args);
  if(!isDeepStrictEqual(calls.map(c=>[c.method,c.args]),expected))fail(`callback coverage differs at production ${p}`);
  let mappedResult:ProvenanceText|undefined;
  if([58,75,84,85].includes(p))mappedResult=raw(loc()).replaceRegex(/"/g,()=> '');
  if([59,60,61,62,69,71,74,86].includes(p))mappedResult=raw(loc());
  if(p===34)mappedResult=v();if(p===35)mappedResult=v(1).concat(input.synthetic(' '),v());
  if(p===70)mappedResult=v(1).concat(raw(loc()));
  if(p>=23&&p<=26)mappedResult=trim(raw(loc()));
  if(mappedResult){if(mappedResult.text!==this.$)fail(`mapped value differs at production ${p}`);starts.set(mappedResult,this._$.range![0]);mapped.set(key(this._$),mappedResult);}
  if(p===72)keys.set(this.$,[v()]);
  if(p===73){const previous=keys.get(last(2));if(!previous)fail('key list owner missing');keys.set(this.$,[...previous!,v()]);}
  if(p>=65&&p<=68){
   const typeOffset=p===65?1:p===68?3:2,nameOffset=typeOffset-1;
   const indices=[add('attribute.type',v(typeOffset)),add('attribute.name',v(nameOffset))];
   if(p===66||p===68){const list=keys.get(last(p===66?0:1));if(!list)fail('attribute key owners missing');for(const k of list!)indices.push(add('attribute.key',k));}
   if(p===67||p===68)indices.push(add('attribute.comment',v()));attributes.set(this.$,indices);
  }
  if(p===32||p===33){const id=v(p===32?1:4),title=p===32?id:v(2);headers.set(this.$,[add('subgraph.id',id),add('subgraph.title',title)]);}
  let declaration:number[]=[];const endpointOwners:number[]=[];
  for(const c of calls){
   let owners:number[]=[];
   if(c.method==='addEntity'){
    const offset=r?r[endpointOwners.length]:e?.[0];if(offset===undefined)fail('entity owner missing');
    owners=[add('entity.name',v(offset!))];if(e?.[1]!==undefined)owners.push(add('entity.alias',v(e[1])));
    declaration=owners;endpointOwners.push(owners[0]!);
   }else if(c.method==='addAttributes'){
    owners=[...declaration];for(const attribute of last(1)){const owned=attributes.get(attribute);if(!owned)fail('attribute object owner missing');owners.push(...owned!);}
   }else if(c.method==='addRelationship')owners=[...endpointOwners,add('relationship.role',v())];
   else if(c.method==='setAccTitle'||c.method==='setAccDescription')owners=[add(c.method==='setAccTitle'?'accTitle':'accDescr',mappedResult!)];
   else if(c.method==='addSubGraph'){const owned=headers.get(last(2));if(!owned)fail('group header owners missing');owners=[...owned!];}
   effects.push(freeze({method:c.method,args:c.args,recordIndices:owners}));
  }
  return result;
 };
 parser.parse(input.text);
 // Attribute reductions are right-recursive; expose authored order while
 // retaining exact callback-array order via remapped record references.
 const ordered=records.map((record,index)=>({record,index})).sort((a,b)=>positions[a.index]!-positions[b.index]!||a.index-b.index);
 const remap=new Map(ordered.map((entry,index)=>[entry.index,index]));
 return Object.freeze({parserSource:input.text,records:Object.freeze(ordered.map(({record},index)=>Object.freeze({...record,recordIndex:index}))),effects:Object.freeze(effects.map(effect=>Object.freeze({...effect,recordIndices:Object.freeze(effect.recordIndices.map(i=>remap.get(i)!))})))});
}
