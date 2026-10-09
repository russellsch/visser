import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {MathPolicyError} from '../math/policy.ts';
import {mapFlowchartParserInput} from './flowchart-source.ts';
import {normalizeMermaidSource} from './rules.ts';
import type {ProvenanceText} from './source-provenance.ts';

export type KanbanAuthoredNode=Readonly<{
  nodeIndex:number;
  level:number;
  type:number;
  id:ProvenanceText;
  label:ProvenanceText;
  shapeData?:ProvenanceText;
}>;
export type KanbanDecoration=Readonly<{nodeIndex:number;kind:'icon'|'class';value:ProvenanceText}>;
export type KanbanLabels=Readonly<{
  parserSource:string;
  nodes:readonly KanbanAuthoredNode[];
  decorations:readonly KanbanDecoration[];
  effects:readonly ({kind:'node';nodeIndex:number}|{kind:'decoration';decorationIndex:number})[];
}>;

type Range=[number,number];
type Loc={range?:Range};
type Lexer={options:Record<string,unknown>;performAction(...args:unknown[]):unknown};
type Parser={
  yy:Record<string,unknown>;
  lexer:Lexer;
  performAction(...args:unknown[]):unknown;
  parse(input:string):unknown;
};
type Pinned={Parser:new()=>Parser;lexer:Lexer;productions_:unknown[]};
type Module={diagram?:{parser?:{parser?:Pinned}}};
type NodeFields=Readonly<{id:ProvenanceText;label:ProvenanceText;type:number}>;
type ShapePart=Readonly<{kind:'piece';value:ProvenanceText;length:number}>|Readonly<{kind:'join';left:ShapePart;right:ShapePart;length:number}>;

const PRODUCTION_HASH='7b9f6864dbdcf3887a4e9fec7cf970a8dc5da438e2fa34a35c572cfceda0d400';

function invalid(message:string):never {
  throw new MathPolicyError('E_MATH_INVALID',`Kanban grammar collector: ${message}`);
}

function rangeOf(loc:Loc|undefined,what:string):Range {
  const range=loc?.range;
  if (!range||range.length!==2||!Number.isSafeInteger(range[0])||!Number.isSafeInteger(range[1])||range[0]<0||range[1]<range[0]) invalid(`missing ${what} range`);
  return range;
}

function* shapePieces(root:ShapePart):Generator<ProvenanceText> {
  const pending=[root];
  while (pending.length) {
    const part=pending.pop()!;
    if (part.kind==='piece') yield part.value;
    else { pending.push(part.right,part.left); }
  }
}

/**
 * Capture the Kanban parser's grammar-owned callbacks without constructing its
 * shared DB. YAML data stays opaque: this collector only retains its lexer
 * spelling and the parser's newline-to-`<br/>` replacement.
 */
export async function extractKanbanLabels(original:string,rendered=normalizeMermaidSource(original)):Promise<KanbanLabels> {
  const input=mapFlowchartParserInput(original,rendered).mermaidInput;
  // @ts-expect-error Mermaid does not declare its pinned grammar chunks.
  const module=await import('mermaid/dist/chunks/mermaid.core/kanban-definition-PNTS6WVX.mjs') as Module;
  const pinned=module.diagram?.parser?.parser;
  if (typeof pinned?.Parser!=='function'||!pinned.lexer||
      createHash('sha256').update(JSON.stringify(pinned.productions_)).digest('hex')!==PRODUCTION_HASH) invalid('pinned reductions changed');

  const parser=new pinned.Parser();
  parser.lexer=Object.create(pinned.lexer) as Lexer;
  parser.lexer.options={...pinned.lexer.options,ranges:true};
  const nodes:KanbanAuthoredNode[]=[];
  const decorations:KanbanDecoration[]=[];
  const effects:Array<{kind:'node';nodeIndex:number}|{kind:'decoration';decorationIndex:number}>=[];
  const fieldsByObject=new WeakMap<object,NodeFields>();
  const shapesByLocation=new WeakMap<object,ShapePart>();

  const mapped=(loc:Loc|undefined,value:unknown,what:string):ProvenanceText=>{
    if (typeof value!=='string') invalid(`${what} is not text`);
    const range=rangeOf(loc,what);
    const source=input.slice(...range);
    if (source.text!==value) invalid(`${what} lexer spelling changed`);
    return source;
  };
  const shapeAt=(loc:Loc|undefined):ShapePart=> {
    if (!loc||typeof loc!=='object') invalid('shapeData has no reduction location');
    return shapesByLocation.get(loc as object)??invalid('shapeData has no lexer trace');
  };
  const callbacks:Array<{method:'addNode'|'decorateNode';args:unknown[]}> = [];
  const exactType=(start:unknown,end:unknown):number=>{
    if (typeof start!=='string'||typeof end!=='string') invalid('getType arguments changed');
    switch(start) {
      case '[': return 2;
      case '(': return end===')'?1:4;
      case '((': return 3;
      case ')': return 4;
      case '))': return 5;
      case '{{': return 6;
      default:return 0;
    }
  };
  parser.yy={
    getLogger:()=>({trace:()=>undefined,info:()=>undefined,debug:()=>undefined,warn:()=>undefined,error:()=>undefined}),
    getType:exactType,
    addNode:(...args:unknown[])=>callbacks.push({method:'addNode',args}),
    decorateNode:(...args:unknown[])=>callbacks.push({method:'decorateNode',args}),
  };

  const lexerAction=parser.lexer.performAction;
  parser.lexer.performAction=function(this:{yytext:string;yylloc:Loc},...args:unknown[]):unknown {
    const rule=args[2];
    const raw=this.yytext;
    const loc=this.yylloc;
    const result=lexerAction.apply(this,args);
    if (result===24) {
      const range=rangeOf(loc,'shapeData token');
      const source=input.slice(...range);
      let value:ProvenanceText;
      if (rule===0) value=source.slice(0,0);
      else if (rule===3) value=source.replaceRegex(/\n\s*/g,()=>'<br/>');
      else value=source;
      if ((rule===0?source.text!=='@{':source.text!==raw)||value.text!==this.yytext) invalid('shapeData lexer transform changed');
      shapesByLocation.set(loc as object,{kind:'piece',value,length:value.length});
    }
    return result;
  };

  const action=parser.performAction;
  parser.performAction=function(this:{$?:unknown;_$?:Loc},...args:unknown[]):unknown {
    const production=args[4] as number;
    const values=args[5] as unknown[];
    const locations=args[6] as Loc[];
    const last=(offset=0)=>values.at(-1-offset);
    const loc=(offset=0)=>locations.at(-1-offset);
    callbacks.length=0;
    const result=action.apply(this,args);
    const expectedMethods:Record<number,readonly ('addNode'|'decorateNode')[]>={
      15:['addNode'],16:['addNode'],17:['decorateNode'],18:['decorateNode'],20:['addNode'],21:['addNode'],22:['decorateNode'],23:['decorateNode'],
    };
    if (JSON.stringify(callbacks.map(callback=>callback.method))!==JSON.stringify(expectedMethods[production]??[])) invalid('callback ownership changed');
    const node=(offset=0):NodeFields=>{
      const value=last(offset);
      if (!value||typeof value!=='object') invalid('node callback has no node reduction');
      return fieldsByObject.get(value as object)??invalid('node callback fields changed');
    };
    let expectedArgs:unknown[][]=[];
    switch(production) {
      case 15: expectedArgs=[[String(last(2)).length,node(1).id.text,node(1).label.text,node(1).type,last()]];break;
      case 16: expectedArgs=[[String(last(1)).length,node().id.text,node().label.text,node().type]];break;
      case 17: expectedArgs=[[{icon:last()}]];break;
      case 18: expectedArgs=[[{class:last()}]];break;
      case 20: expectedArgs=[[0,node(1).id.text,node(1).label.text,node(1).type,last()]];break;
      case 21: expectedArgs=[[0,node().id.text,node().label.text,node().type]];break;
      case 22: expectedArgs=[[{icon:last()}]];break;
      case 23: expectedArgs=[[{class:last()}]];break;
    }
    if (!isDeepStrictEqual(callbacks.map(callback=>callback.args),expectedArgs)) invalid('callback arguments differ from owning reduction');

    if (production===27||production===28||production===29) {
      const object=this.$;
      if (!object||typeof object!=='object') invalid('node reduction did not yield an object');
      let fields:NodeFields;
      if (production===27) fields={id:mapped(loc(1),last(1),'node label'),label:mapped(loc(1),last(1),'node label'),type:exactType(last(2),last())};
      else if (production===28) fields={id:mapped(loc(),last(),'node id'),label:mapped(loc(),last(),'node id'),type:0};
      else fields={id:mapped(loc(3),last(3),'node id'),label:mapped(loc(1),last(1),'node label'),type:exactType(last(2),last())};
      const native=object as {id?:unknown;descr?:unknown;type?:unknown};
      if (native.id!==fields.id.text||native.descr!==fields.label.text||native.type!==fields.type) invalid('node reduction fields changed');
      fieldsByObject.set(object as object,fields);
    }
    if (production===30||production===31) {
      const shape=production===31
        ? shapeAt(loc())
        : (()=>{const left=shapeAt(loc(1)),right=shapeAt(loc());return {kind:'join' as const,left,right,length:left.length+right.length};})();
      if (typeof this.$!=='string'||this.$.length!==shape.length) invalid('shapeData reduction text changed');
      if (!this._$||typeof this._$!=='object') invalid('shapeData reduction has no result location');
      shapesByLocation.set(this._$ as object,shape);
    }
    for (const callback of callbacks) {
      if (callback.method==='addNode') {
        if (callback.args.length!==4&&callback.args.length!==5) invalid('invalid addNode arguments');
        const [level,id,label,type,shape]=callback.args;
        if (!Number.isSafeInteger(level)||typeof id!=='string'||typeof label!=='string'||!Number.isSafeInteger(type)) invalid('invalid addNode scalar arguments');
        const fields=production===15||production===20?node(1):node();
        if (fields.id.text!==id||fields.label.text!==label||fields.type!==type) invalid('node callback changed reduction fields');
        let shapeData:ProvenanceText|undefined;
        if (shape!==undefined) {
          if (typeof shape!=='string') invalid('invalid shapeData callback argument');
          const tree=shapeAt(loc());
          shapeData=input.slice(0,0).concatAll(shapePieces(tree));
          if (shapeData.text!==shape) invalid('shapeData callback differs from lexer trace');
        }
        const nodeIndex=nodes.length;
        nodes.push(Object.freeze({nodeIndex,level:level as number,type:type as number,id:fields.id,label:fields.label,...(shapeData===undefined?{}:{shapeData})}));
        effects.push(Object.freeze({kind:'node',nodeIndex}));
      } else {
        if (nodes.length===0) invalid('decoration before first node');
        if (callback.args.length!==1||!callback.args[0]||typeof callback.args[0]!=='object'||Array.isArray(callback.args[0])) invalid('invalid decorateNode arguments');
        const decoration=callback.args[0] as Record<string,unknown>;
        const keys=Object.keys(decoration);
        if (keys.length!==1||(keys[0]!=='icon'&&keys[0]!=='class')||typeof decoration[keys[0]!]!=='string') invalid('invalid decoration object');
        const kind=keys[0]! as 'icon'|'class';
        const value=mapped(loc(),decoration[kind],`${kind} decoration`);
        const decorationIndex=decorations.length;
        decorations.push(Object.freeze({nodeIndex:nodes.length-1,kind,value}));
        effects.push(Object.freeze({kind:'decoration',decorationIndex}));
      }
    }
    return result;
  };
  parser.parse(input.text);
  return Object.freeze({parserSource:input.text,nodes:Object.freeze(nodes),decorations:Object.freeze(decorations),effects:Object.freeze(effects)});
}
