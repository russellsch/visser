import {parse,type Info} from '@mermaid-js/parser';
import {MathPolicyError} from '../math/policy.ts';
import {mapFlowchartParserInput} from './flowchart-source.ts';
import {normalizeMermaidSource} from './rules.ts';
import {MermaidSourceCoordinates,type LocatedSourceInterval} from './source-coordinates.ts';
import type {ProvenanceText} from './source-provenance.ts';

export type InfoLabelRole='title'|'accTitle'|'accDescr';
export type InfoLabelRecord=Readonly<{recordIndex:number;role:InfoLabelRole;active:boolean;semanticValue:string;mappedValue:ProvenanceText;intervals:readonly LocatedSourceInterval[];synthetic:boolean}>;
export type InfoLabels=Readonly<{records:readonly InfoLabelRecord[];ast:Info;parserSource:string}>;
type Cst={text:string;offset:number;end:number;hidden:boolean;astNode:unknown;tokenType?:{name:string};grammarSource?:{$container?:{feature?:string}};content?:readonly Cst[]};
function invalid(message:string):never{throw new MathPolicyError('E_MATH_INVALID',`Info grammar collector: ${message}`);}
function* leaves(node:Cst):Generator<Cst>{if(node.content)for(const child of node.content)yield* leaves(child);else yield node;}
const trim=(value:ProvenanceText)=>{const start=value.length-value.text.trimStart().length;return value.slice(start,start+value.text.trim().length);};

/** Pinned CommonValueConverter transforms, attested against parser values. */
function converted(token:ProvenanceText,type:string):ProvenanceText {
 const regex=type==='TITLE'?/title([\t ][^\n\r]*|)/d:type==='ACC_TITLE'?/accTitle[\t ]*:([^\n\r]*)/d:type==='ACC_DESCR'?/accDescr(?:[\t ]*:([^\n\r]*)|\s*{([^}]*)})/d:undefined;
 const match=regex?.exec(token.text);if(!match?.indices)invalid('unknown common terminal');
 const range=match.indices[1]??match.indices[2];if(!range)invalid('common terminal has no value');
 let value=token.slice(...range);
 if(match.indices[1])return trim(value).replaceRegex(/[\t ]{2,}/gm,()=> ' ');
 value=value.replaceRegex(/^\s*/gm,()=> '').replaceRegex(/\s+$/gm,()=> '').replaceRegex(/[\t ]{2,}/gm,()=> ' ').replaceRegex(/[\n\r]{2,}/gm,()=> '\n');
 return value;
}

/** Collect grammar assignments before root overwrite loss. */
export async function extractInfoLabels(original:string,rendered=normalizeMermaidSource(original)):Promise<InfoLabels>{
 // This is the shared generic Mermaid preprocessing output, before the
 // flowchart-specific brace/newline pass. Existing source restrictions apply.
 const input=mapFlowchartParserInput(original,rendered).mermaidInput;
 const ast=await parse('info',input.text),root=ast.$cstNode as Cst|undefined;
 if(!root)invalid('parser supplied no CST');
 const coordinates=new MermaidSourceCoordinates(original);
 type Candidate={leaf:Cst;role:InfoLabelRole;semanticValue?:string;active:boolean};
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
 candidates.sort((a,b)=>a.leaf.offset-b.leaf.offset);
 const records:InfoLabelRecord[]=[];
 for(const candidate of candidates){
  const {leaf,role,active}=candidate;
  if(input.text.slice(leaf.offset,leaf.end)!==leaf.text)invalid('CST spelling differs from source');
  const value=converted(input.slice(leaf.offset,leaf.end),leaf.tokenType!.name);
  let semantic=candidate.semanticValue;
  if(role==='title'||role==='accTitle'||role==='accDescr'){
   // Reparse an assignment because overwritten values are absent from the AST.
   const single=await parse('info',`info\n${leaf.text}\n`);semantic=single[role]??'';
   if(active&&semantic!==(ast[role]??''))invalid('last root assignment differs');
  }
  if(value.text!==semantic)invalid('mapped conversion differs from pinned parser');
  const located=coordinates.locateRange(value,0,value.length);
  records.push(Object.freeze({recordIndex:records.length+1,role,active,semanticValue:value.text,mappedValue:value,intervals:Object.freeze(located.intervals),synthetic:located.synthetic}));
 }
 for(const role of ['title','accTitle','accDescr'] as const)if(ast[role]!==undefined&&!roots.has(role))invalid('missing root assignment');
 return Object.freeze({records:Object.freeze(records),ast,parserSource:input.text});
}
