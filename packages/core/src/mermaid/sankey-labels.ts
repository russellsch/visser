import {createHash} from 'node:crypto';
import {MathPolicyError} from '../math/policy.ts';
import {mapMermaidFence} from './flowchart-source.ts';
import {MermaidSourceCoordinates,type LocatedSourceInterval} from './source-coordinates.ts';
import type {ProvenanceText} from './source-provenance.ts';
import {checkMermaidSource,normalizeMermaidSource} from './rules.ts';

export type SankeyLabelRecord=Readonly<{recordIndex:number;rowIndex:number;role:'source'|'target';semanticValue:string;mappedValue:ProvenanceText;intervals:readonly LocatedSourceInterval[];synthetic:boolean}>;
export type SankeyRow=Readonly<{rowIndex:number;sourceRecord:number;targetRecord:number;value:number;valueText:ProvenanceText}>;
export type SankeyLabels=Readonly<{records:readonly SankeyLabelRecord[];rows:readonly SankeyRow[];parserSource:string}>;
type Loc={range?:[number,number]};
type Parser={yy:Record<string,unknown>;lexer:{options:Record<string,unknown>};performAction(...args:unknown[]):unknown;parse(source:string):unknown};
type Module={diagram:{parser:{parser:{Parser:new()=>Parser;lexer:Parser['lexer'];productions_:unknown[]}}}};
function invalid(message:string):never {throw new MathPolicyError('E_MATH_INVALID',`Sankey grammar collector: ${message}`);}
const trim=(value:ProvenanceText)=>{const start=value.length-value.text.trimStart().length;return value.slice(start,start+value.text.trim().length);};

/** Native Mermaid cleanup followed by Sankey's exact CSV preprocessing. */
export function mapSankeyParserInput(original:string,rendered=normalizeMermaidSource(original)):ProvenanceText {
 const issue=checkMermaidSource(rendered).find(issue=>issue.code!=='E_MATH');if(issue)invalid(issue.message);
 let input=mapMermaidFence(original,rendered);
 input=input.replaceRegex(/^\s*%%(?!{)[^\n]+\n?/gm,()=> '');
 // Diagram.fromText runs encodeEntities for every family. Its style regexes
 // also match inside CSV strings; retain their deletion provenance exactly.
 for(const pattern of [/style.*:\S*#.*;/g,/classDef.*:\S*#.*;/g])input=input.replaceRegex(pattern,(_match,span)=>span.slice(0,span.length-1));
 input=input.replaceRegex(/#\w+;/g,match=>{
  const inner=match[0].slice(1,-1);return /^\+?\d+$/.test(inner)?`\uFB02\u00B0\u00B0${inner}\u00B6\u00DF`:`\uFB02\u00B0${inner}\u00B6\u00DF`;
 });
 input=input.replaceRegex(/^[^\S\n\r]+|[^\S\n\r]+$/g,()=> '');
 input=input.replaceRegex(/([\n\r])+/g,()=> '\n');
 return trim(input);
}

/** Record each CSV endpoint, including repeated names later merged by native DB. */
export async function extractSankeyLabels(original:string,rendered=normalizeMermaidSource(original)):Promise<SankeyLabels> {
 const input=mapSankeyParserInput(original,rendered),coordinates=new MermaidSourceCoordinates(original);
 // @ts-expect-error pinned internal Mermaid chunk has no declarations.
 const module=await import('mermaid/dist/chunks/mermaid.core/sankeyDiagram-IPEJSGJF.mjs') as Module;
 const pinned=module.diagram?.parser?.parser;
 if(typeof pinned?.Parser!=='function'||createHash('sha256').update(JSON.stringify(pinned.productions_)).digest('hex')!=='4460668260839a99bb03512298ccb84646c3d71708ba543d78b7bbccb4ac3e0f')invalid('pinned reduction contract changed');
 const parser=new pinned.Parser();parser.lexer=Object.create(pinned.lexer);parser.lexer.options={...pinned.lexer.options,ranges:true};
 const mapped=new WeakMap<Loc,ProvenanceText>(),records:SankeyLabelRecord[]=[],rows:SankeyRow[]=[];
 let callbacks:Array<{method:string;args:unknown[]}>=[];
 parser.yy={findOrCreateNode:(name:string)=>{const node={name};callbacks.push({method:'findOrCreateNode',args:[name,node]});return node;},addLink:(...args:unknown[])=>callbacks.push({method:'addLink',args})};
 const field=(location:Loc|undefined,semantic:unknown)=>{
  const value=location&&mapped.get(location);if(!value||value.text!==semantic)invalid('field lost grammar ownership');return value;
 };
 const token=(location:Loc|undefined,semantic:unknown)=>{
  if(!location?.range||typeof semantic!=='string')invalid('field token has no range');
  const value=input.slice(...location.range);if(value.text!==semantic)invalid('field token differs from source');return value;
 };
 const record=(role:SankeyLabelRecord['role'],value:ProvenanceText)=>{
  const transformed=trim(value).replaceRegex(/""/g,()=> '"'),location=coordinates.locateRange(transformed,0,transformed.length),recordIndex=records.length+1;
  records.push(Object.freeze({recordIndex,rowIndex:rows.length,role,semanticValue:transformed.text,mappedValue:transformed,intervals:Object.freeze(location.intervals),synthetic:location.synthetic}));return recordIndex;
 };
 const action=parser.performAction;
 parser.performAction=function(this:{$:unknown;_$:Loc},...args:unknown[]){
  const production=args[4] as number,values=args[5] as unknown[],locations=args[6] as Loc[];
  const last=(offset=0)=>values.at(-1-offset),loc=(offset=0)=>locations.at(-1-offset);
  let value:ProvenanceText|undefined;
  if(production===10)value=token(loc(1),last(1));
  if(production===11)value=token(loc(),last());
  if(production===8||production===9)value=field(loc(),last());
  const row=production===7?{source:field(loc(4),last(4)),target:field(loc(2),last(2)),value:field(loc(),last())}:undefined;
  callbacks=[];const result=action.apply(this,args);
  if(value){if(this.$!==value.text)invalid('field reduction changed');mapped.set(this._$,value);}
  if(row){
   const sourceRecord=record('source',row.source),targetRecord=record('target',row.target),number=Number.parseFloat(row.value.text.trim());
   const [source,target,link]=callbacks;
   if(callbacks.length!==3||source?.method!=='findOrCreateNode'||target?.method!=='findOrCreateNode'||link?.method!=='addLink'||source.args[0]!==records[sourceRecord-1]!.semanticValue||target.args[0]!==records[targetRecord-1]!.semanticValue||link.args[0]!==source.args[1]||link.args[1]!==target.args[1]||!Object.is(link.args[2],number))invalid('native CSV callback order or values changed');
   rows.push(Object.freeze({rowIndex:rows.length,sourceRecord,targetRecord,value:number,valueText:row.value}));
  }else if(callbacks.length)invalid('unexpected native callback');
  return result;
 };
 parser.parse(input.text);
 return Object.freeze({records:Object.freeze(records),rows:Object.freeze(rows),parserSource:input.text});
}
