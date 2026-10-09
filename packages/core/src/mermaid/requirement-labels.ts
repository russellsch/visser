import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {MathPolicyError} from '../math/policy.ts';
import {mapFlowchartParserInput} from './flowchart-source.ts';
import {normalizeMermaidSource} from './rules.ts';
import {MermaidSourceCoordinates,type LocatedSourceInterval} from './source-coordinates.ts';
import type {ProvenanceText} from './source-provenance.ts';
import type {RequirementEffect} from './requirement-db.ts';
export type RequirementLabelRole='accTitle'|'accDescr'|'requirement.name'|'requirement.id'|'requirement.text'|'requirement.risk'|'requirement.verifyMethod'|'element.name'|'element.type'|'element.docRef';
export type RequirementLabelRecord=Readonly<{recordIndex:number;role:RequirementLabelRole;declarationIndex?:number;effectIndex:number;semanticValue:string;mappedValue:ProvenanceText;intervals:readonly LocatedSourceInterval[];synthetic:boolean}>;
export type RequirementAuthoredEffect=Readonly<{effect:RequirementEffect;recordIndex?:number}>;
export type RequirementLabels=Readonly<{records:readonly RequirementLabelRecord[];effects:readonly RequirementAuthoredEffect[];parserSource:string}>;
type Loc={range?:[number,number]};
type Parser={yy:Record<string,unknown>;lexer:{options:Record<string,unknown>};performAction(...args:unknown[]):unknown;parse(input:string):unknown};
type Pinned={Parser:new()=>Parser;lexer:Parser['lexer'];productions_:unknown[]};
function invalid(message:string):never{throw new MathPolicyError('E_MATH_INVALID',`Requirement grammar collector: ${message}`);}
function effectFromCallback(method:string,args:unknown[]):RequirementEffect{
 const strings=(count:number)=>args.length===count&&args.every(value=>typeof value==='string');
 switch(method){
  case 'setDirection':case 'setAccTitle':case 'setAccDescription':case 'addElement':
  case 'setNewReqId':case 'setNewReqText':case 'setNewReqRisk':case 'setNewReqVerifyMethod':
  case 'setNewElementType':case 'setNewElementDocRef':
   if(!strings(1))invalid('invalid scalar callback arguments');return {method,args:[args[0] as string]};
  case 'addRequirement':
   if(!strings(2))invalid('invalid requirement callback arguments');return {method,args:[args[0] as string,args[1] as string]};
  case 'addRelationship':
   if(!strings(3))invalid('invalid relationship callback arguments');return {method,args:[args[0] as string,args[1] as string,args[2] as string]};
  case 'setClass':case 'defineClass':case 'setCssStyle':{
   if(args.length!==2||!args.every(value=>Array.isArray(value)&&value.every(item=>typeof item==='string')))invalid('invalid style callback arguments');
   return {method,args:[Array.from(args[0] as string[]),Array.from(args[1] as string[])]};
  }
  default:return invalid('unknown callback');
 }
}

const trim=(value:ProvenanceText)=>{const start=value.length-value.text.trimStart().length;return value.slice(start,start+value.text.trim().length);};
const enums={
 RequirementType:{REQUIREMENT:'Requirement',FUNCTIONAL_REQUIREMENT:'Functional Requirement',INTERFACE_REQUIREMENT:'Interface Requirement',PERFORMANCE_REQUIREMENT:'Performance Requirement',PHYSICAL_REQUIREMENT:'Physical Requirement',DESIGN_CONSTRAINT:'Design Constraint'},
 RiskLevel:{LOW_RISK:'Low',MED_RISK:'Medium',HIGH_RISK:'High'},
 VerifyType:{VERIFY_ANALYSIS:'Analysis',VERIFY_DEMONSTRATION:'Demonstration',VERIFY_INSPECTION:'Inspection',VERIFY_TEST:'Test'},
 Relationships:{CONTAINS:'contains',COPIES:'copies',DERIVES:'derives',SATISFIES:'satisfies',VERIFIES:'verifies',REFINES:'refines',TRACES:'traces'},
};

/** Retain grammar-owned occurrences before duplicate/field overwrites. Spies
 * avoid native DB construction, which would clear shared common metadata.
 * Sanitation, effective ownership and math normalization are later stages.
 */
export async function extractRequirementLabels(original:string,rendered=normalizeMermaidSource(original)):Promise<RequirementLabels>{
 const input=mapFlowchartParserInput(original,rendered).mermaidInput,coordinates=new MermaidSourceCoordinates(original);
 // @ts-expect-error pinned native chunk has no declarations.
 const module=await import('mermaid/dist/chunks/mermaid.core/requirementDiagram-PLB6GJNP.mjs');
 const pinned=module.diagram?.parser?.parser as Pinned;
 if(typeof pinned?.Parser!=='function'||createHash('sha256').update(JSON.stringify(pinned.productions_)).digest('hex')!=='1e3e41c1f0497bdd1124d495f80f3cbebbcb393f2b85a6f44abb85bd1ac00f6e')invalid('pinned reductions changed');
 const parser=new pinned.Parser();parser.lexer=Object.create(pinned.lexer);parser.lexer.options={...pinned.lexer.options,ranges:true};
 const records:Array<RequirementLabelRecord> = [],effects:RequirementAuthoredEffect[]=[],valuesByRange=new Map<string,ProvenanceText>(),positions=new Map<number,number>();
 let requirementCount=0,elementCount=0,requirementName:number|undefined,elementName:number|undefined;
 const methods=['setDirection','setAccTitle','setAccDescription','addRequirement','setNewReqId','setNewReqText','setNewReqRisk','setNewReqVerifyMethod','addElement','setNewElementType','setNewElementDocRef','addRelationship','setClass','defineClass','setCssStyle'];
 let callbacks:Array<{method:string;args:unknown[]}>=[];
 parser.yy={...structuredClone(enums),...Object.fromEntries(methods.map(method=>[method,(...args:unknown[])=>callbacks.push({method,args})]))};
 const rangeKey=(loc:Loc|undefined)=>{if(!loc?.range)invalid('missing grammar range');return loc.range.join(':');};
 const slice=(loc:Loc|undefined)=>{if(!loc?.range)invalid('missing token range');return input.slice(...loc.range);};
 const add=(role:RequirementLabelRole,value:ProvenanceText,effectIndex:number,position:Loc|undefined,declarationIndex?:number)=>{
  const located=coordinates.locateRange(value,0,value.length),recordIndex=records.length+1;
  if(!position?.range)invalid('missing record position');positions.set(recordIndex,position.range[0]);
  records.push({recordIndex,role,effectIndex,semanticValue:value.text,mappedValue:value,intervals:Object.freeze(located.intervals),synthetic:located.synthetic,...(declarationIndex===undefined?{}:{declarationIndex})});return recordIndex;
 };
 const action=parser.performAction;
 parser.performAction=function(this:{$?:unknown},...args:unknown[]){
  const production=args[4]as number,stack=args[5]as unknown[],locations=args[6]as Loc[];
  const last=(offset=0)=>stack.at(-1-offset),loc=(offset=0)=>locations.at(-1-offset);
  let primitive:ProvenanceText|undefined;
  if(production>=79&&production<=90){primitive=slice(loc());if(production%2===1)primitive=trim(primitive);if(primitive.text!==last())invalid('primitive token differs from source');}
  callbacks=[];const result=action.apply(this,args);
  const expected:Record<number,readonly string[]>={4:['setAccTitle'],5:['setAccDescription'],6:['setAccDescription'],17:['setDirection'],18:['setDirection'],19:['setDirection'],20:['setDirection'],21:['addRequirement'],22:['addRequirement','setClass'],23:['setNewReqId'],24:['setNewReqText'],25:['setNewReqRisk'],26:['setNewReqVerifyMethod'],42:['addElement'],43:['addElement','setClass'],44:['setNewElementType'],45:['setNewElementDocRef'],48:['addRelationship'],49:['addRelationship'],57:['defineClass'],58:['setClass'],59:['setClass'],64:['setCssStyle']};
  if(JSON.stringify(callbacks.map(callback=>callback.method))!==JSON.stringify(expected[production]??[]))invalid('callback order or coverage changed');
  const expectedArgs:Record<number,unknown[][]>={
   4:[[String(last()).trim()]],5:[[String(last()).trim()]],6:[[String(last()).trim()]],
   17:[['TB']],18:[['BT']],19:[['RL']],20:[['LR']],
   21:[[last(3),last(4)]],22:[[last(5),last(6)],[[last(5)],last(3)]],
   23:[[last(2)]],24:[[last(2)]],25:[[last(2)]],26:[[last(2)]],
   42:[[last(3)]],43:[[last(5)],[[last(5)],last(3)]],44:[[last(2)]],45:[[last(2)]],
   48:[[last(2),last(),last(4)]],49:[[last(2),last(4),last()]],
   57:[[last(1),last()]],58:[[last(1),last()]],59:[[[last(2)],last()]],64:[[last(1),last()]],
  };
  if(!isDeepStrictEqual(callbacks.map(callback=>callback.args),expectedArgs[production]??[]))invalid('callback arguments differ from owning reduction');
  if(primitive){
   if(this.$!==primitive.text)invalid('primitive reduction changed');valuesByRange.set(rangeKey(loc()),primitive);
   if(production===79||production===80){if(requirementName!==undefined)invalid('nested requirement declaration');requirementName=add('requirement.name',primitive,-1,loc(),requirementCount++);}
   if(production===85||production===86){if(elementName!==undefined)invalid('nested element declaration');elementName=add('element.name',primitive,-1,loc(),elementCount++);}
  }
  for(const callback of callbacks){
   const effectIndex=effects.length,{method}=callback;let recordIndex:number|undefined;
   if(['setAccTitle','setAccDescription'].includes(method)){
    if(![4,5,6].includes(production))invalid('common field reduction changed');const value=trim(slice(loc()));if(value.text!==callback.args[0])invalid('common field differs');recordIndex=add(method==='setAccTitle'?'accTitle':'accDescr',value,effectIndex,loc());
   }else if(method==='addRequirement'||method==='addElement'){
    const index=method==='addRequirement'?requirementName:elementName;if(index===undefined)invalid('declaration has no name owner');
    const record=records[index-1]!;if(record.semanticValue!==callback.args[0])invalid('declaration name differs');records[index-1]={...record,effectIndex};recordIndex=index;
    if(method==='addRequirement')requirementName=undefined;else elementName=undefined;
   }else{
    const roles:Record<string,RequirementLabelRole>={setNewReqId:'requirement.id',setNewReqText:'requirement.text',setNewReqRisk:'requirement.risk',setNewReqVerifyMethod:'requirement.verifyMethod',setNewElementType:'element.type',setNewElementDocRef:'element.docRef'};
    const role=roles[method];
    if(role){
     const owner=role.startsWith('requirement.')?requirementName:elementName;if(owner===undefined)invalid('body field has no declaration');
     let value=valuesByRange.get(rangeKey(loc(2)));
     if(method==='setNewReqRisk'||method==='setNewReqVerifyMethod'){
      const raw=slice(loc(2)),semantic=callback.args[0];if(typeof semantic!=='string'||raw.text.toLowerCase()!==semantic.toLowerCase())invalid('enum field differs');value=raw.replace(0,raw.length,semantic);
     }
     if(!value||value.text!==callback.args[0])invalid('body value has no primitive owner');recordIndex=add(role,value,effectIndex,loc(2),records[owner-1]!.declarationIndex);
    }
   }
   const effect=effectFromCallback(method,callback.args);
   effects.push(Object.freeze({effect,...(recordIndex===undefined?{}:{recordIndex})}));
  }
  return result;
 };
 parser.parse(input.text);
 if(requirementName!==undefined||elementName!==undefined||records.some(record=>record.effectIndex<0))invalid('incomplete declaration ownership');
 // Body reductions are right-recursive: native setter order is the reverse
 // of authored field order. Keep effects untouched, but expose records in
 // source order (including empty fields) and remap their cross-references.
 records.sort((a,b)=>positions.get(a.recordIndex)!-positions.get(b.recordIndex)!||a.recordIndex-b.recordIndex);
 const indices=new Map(records.map((record,index)=>[record.recordIndex,index+1]));
 return Object.freeze({records:Object.freeze(records.map((record,index)=>Object.freeze({...record,recordIndex:index+1}))),
  effects:Object.freeze(effects.map(({effect,recordIndex})=>Object.freeze({effect,...(recordIndex===undefined?{}:{recordIndex:indices.get(recordIndex)!})}))),parserSource:input.text});
}
