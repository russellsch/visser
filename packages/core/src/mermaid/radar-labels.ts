import {parse,type Radar} from '@mermaid-js/parser';
import {MathPolicyError} from '../math/policy.ts';
import {mapFlowchartParserInput} from './flowchart-source.ts';
import {normalizeMermaidSource} from './rules.ts';
import {MermaidSourceCoordinates,type LocatedSourceInterval} from './source-coordinates.ts';
import type {ProvenanceText} from './source-provenance.ts';

export type RadarLabelRole='title'|'accTitle'|'accDescr'|'axis.name'|'axis.label'|'curve.name'|'curve.label';
export type RadarLabelRecord=Readonly<{recordIndex:number;role:RadarLabelRole;itemIndex?:number;active:boolean;semanticValue:string;mappedValue:ProvenanceText;intervals:readonly LocatedSourceInterval[];synthetic:boolean}>;
export type RadarLabels=Readonly<{records:readonly RadarLabelRecord[];ast:Radar;parserSource:string}>;
type Cst={text:string;offset:number;end:number;hidden:boolean;astNode:unknown;tokenType?:{name:string};grammarSource?:{$container?:{feature?:string}};content?:readonly Cst[]};
function invalid(message:string):never{throw new MathPolicyError('E_MATH_INVALID',`Radar grammar collector: ${message}`);}
function* leaves(node:Cst):Generator<Cst>{if(node.content)for(const child of node.content)yield* leaves(child);else yield node;}
const trim=(value:ProvenanceText)=>{const start=value.length-value.text.trimStart().length;return value.slice(start,start+value.text.trim().length);};

/** Pinned CommonValueConverter transforms, attested against parser values. */
function converted(token:ProvenanceText,type:string):ProvenanceText {
 if(type==='ID')return token.text.startsWith('^')?token.slice(1,token.length):token;
 if(type==='STRING'){
  const quote=token.text[0];if((quote!=='"'&&quote!=="'")||token.text.at(-1)!==quote)invalid('string token quote differs');
  const escape:Record<string,string>={b:'\b',f:'\f',n:'\n',r:'\r',t:'\t',v:'\v','0':'\0'};
  return token.slice(1,token.length-1).replaceRegex(/\\([\s\S])/g,match=>escape[match[1]!]??match[1]!);
 }
 const regex=type==='TITLE'?/title([\t ][^\n\r]*|)/d:type==='ACC_TITLE'?/accTitle[\t ]*:([^\n\r]*)/d:type==='ACC_DESCR'?/accDescr(?:[\t ]*:([^\n\r]*)|\s*{([^}]*)})/d:undefined;
 const match=regex?.exec(token.text);if(!match?.indices)invalid('unknown common terminal');
 const range=match.indices[1]??match.indices[2];if(!range)invalid('common terminal has no value');
 let value=token.slice(...range);
 if(match.indices[1])return trim(value).replaceRegex(/[\t ]{2,}/gm,()=> ' ');
 value=value.replaceRegex(/^\s*/gm,()=> '').replaceRegex(/\s+$/gm,()=> '').replaceRegex(/[\t ]{2,}/gm,()=> ' ').replaceRegex(/[\n\r]{2,}/gm,()=> '\n');
 return value;
}

/** Collect grammar assignments before root overwrite/legend visibility loss. */
export async function extractRadarLabels(original:string,rendered=normalizeMermaidSource(original)):Promise<RadarLabels>{
 // This is the shared generic Mermaid preprocessing output, before the
 // flowchart-specific brace/newline pass. Existing source restrictions apply.
 const input=mapFlowchartParserInput(original,rendered).mermaidInput;
 const ast=await parse('radar',input.text),root=ast.$cstNode as Cst|undefined;
 if(!root)invalid('parser supplied no CST');
 const coordinates=new MermaidSourceCoordinates(original);
 type Candidate={leaf:Cst;role:RadarLabelRole;itemIndex?:number;semanticValue?:string;active:boolean};
 const candidates:Candidate[]=[],roots=new Map<string,Candidate>();
 for(const leaf of leaves(root)){
  if(leaf.hidden||leaf.astNode!==ast)continue;
  const feature=leaf.grammarSource?.$container?.feature;
  if(feature!=='title'&&feature!=='accTitle'&&feature!=='accDescr')continue;
  const expected={title:'TITLE',accTitle:'ACC_TITLE',accDescr:'ACC_DESCR'}[feature];
  if(leaf.tokenType?.name!==expected)invalid('root terminal differs');
  const prior=roots.get(feature);if(prior)prior.active=false;
  const candidate:Candidate={leaf,role:feature,active:true};roots.set(feature,candidate);candidates.push(candidate);
 }
 for(const [items,prefix]of [[ast.axes,'axis'],[ast.curves,'curve']] as const){
  for(const [itemIndex,item]of items.entries()){
   if(!item.$cstNode)invalid('item has no CST');
   const own=[...leaves(item.$cstNode as Cst)].filter(leaf=>!leaf.hidden&&leaf.astNode===item);
   for(const feature of ['name','label'] as const){
    const found=own.filter(leaf=>leaf.grammarSource?.$container?.feature===feature);
    if(found.length!==(item[feature]===undefined?0:1))invalid('item assignment coverage differs');
    const leaf=found[0];if(!leaf)continue;
    if(leaf.tokenType?.name!==(feature==='name'?'ID':'STRING'))invalid('item terminal differs');
    candidates.push({leaf,role:`${prefix}.${feature}`,itemIndex,semanticValue:item[feature],active:feature==='label'||item.label===undefined});
   }
  }
 }
 candidates.sort((a,b)=>a.leaf.offset-b.leaf.offset);
 const records:RadarLabelRecord[]=[];
 for(const candidate of candidates){
  const {leaf,role,itemIndex,active}=candidate;
  if(input.text.slice(leaf.offset,leaf.end)!==leaf.text)invalid('CST spelling differs from source');
  const value=converted(input.slice(leaf.offset,leaf.end),leaf.tokenType!.name);
  let semantic=candidate.semanticValue;
  if(role==='title'||role==='accTitle'||role==='accDescr'){
   // Reparse an assignment because overwritten values are absent from the AST.
   const single=await parse('radar',`radar-beta\n${leaf.text}\n`);semantic=single[role]??'';
   if(active&&semantic!==(ast[role]??''))invalid('last root assignment differs');
  }
  if(value.text!==semantic)invalid('mapped conversion differs from pinned parser');
  const located=coordinates.locateRange(value,0,value.length);
  records.push(Object.freeze({recordIndex:records.length+1,role,itemIndex,active,semanticValue:value.text,mappedValue:value,intervals:Object.freeze(located.intervals),synthetic:located.synthetic}));
 }
 for(const role of ['title','accTitle','accDescr'] as const)if(ast[role]!==undefined&&!roots.has(role))invalid('missing root assignment');
 return Object.freeze({records:Object.freeze(records),ast,parserSource:input.text});
}
