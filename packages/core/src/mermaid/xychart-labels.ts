// Preserve pinned XY grammar callback order: axis changes affect later plots only.
import { createHash } from 'node:crypto';
import { MathPolicyError } from '../math/policy.ts';
import { mapMermaidFence } from './flowchart-source.ts';
import { MermaidSourceCoordinates, type LocatedSourceInterval } from './source-coordinates.ts';
import type { ProvenanceText } from './source-provenance.ts';
import { checkMermaidSource, normalizeMermaidSource } from './rules.ts';

export type XYLabelRole = 'title' | 'accTitle' | 'accDescr' | 'xTitle' | 'yTitle' | 'category' | 'seriesTitle' | 'pointLabel';
export type XYLabelRecord = Readonly<{
  recordIndex: number; role: XYLabelRole; semanticValue: string; textType: 'text' | 'markdown';
  mappedValue: ProvenanceText; intervals: readonly LocatedSourceInterval[]; synthetic: boolean;
  seriesIndex?: number; memberIndex?: number;
}>;
export type XYEffect =
  | Readonly<{ method: 'setOrientation'; orientation: string }>
  | Readonly<{ method: 'setDiagramTitle' | 'setAccTitle' | 'setAccDescription' | 'setXAxisTitle' | 'setYAxisTitle'; recordIndex: number }>
  | Readonly<{ method: 'setXAxisBand'; records: readonly number[] }>
  | Readonly<{ method: 'setXAxisRangeData' | 'setYAxisRangeData'; min: number; max: number }>
  | Readonly<{ method: 'setLineData' | 'setBarData'; seriesIndex: number; recordIndex: number; data: ReadonlyArray<Readonly<{ value: number; recordIndex: number }>> }>;
export type XYLabels = Readonly<{ records: readonly XYLabelRecord[]; effects: readonly XYEffect[]; parserSource: string }>;
type Loc = { range?: [number, number] };
type Parser = { yy: Record<string, unknown>; lexer: { options: Record<string, unknown> }; performAction(...args: unknown[]): unknown; parse(source: string): unknown };
type Module = { diagram: { parser: { parser: { Parser: new () => Parser; lexer: Parser['lexer']; productions_: unknown[] } } } };
type TextValue = { text: string; type: 'text' | 'markdown' };
type Datum = { value: number; label: string };
function invalid(message: string): never { throw new MathPolicyError('E_MATH_INVALID', `XY grammar collector: ${message}`); }
function trim(value: ProvenanceText): ProvenanceText {
  const start = value.length - value.text.trimStart().length;
  return value.slice(start, start + value.text.trim().length);
}

/** Every authored field survives, including overwritten axes and ignored bar labels. */
export async function extractXYLabels(original: string, rendered = normalizeMermaidSource(original)): Promise<XYLabels> {
  const issue = checkMermaidSource(rendered).find(item => item.code !== 'E_MATH');
  if (issue) invalid(issue.message);
  let input = mapMermaidFence(original, rendered);
  if (!input.text.endsWith('\n')) input = input.concat(input.synthetic('\n'));
  const coordinates = new MermaidSourceCoordinates(original);
  // @ts-expect-error Mermaid provides no types for the pinned internal chunk.
  const module = await import('mermaid/dist/chunks/mermaid.core/xychartDiagram-PMCCYNJV.mjs') as Module;
  const pinned = module.diagram?.parser?.parser;
  if (typeof pinned?.Parser !== 'function' || createHash('sha256').update(JSON.stringify(pinned.productions_)).digest('hex') !== '04ed528bfab19f82273224758e2206084101cea21786fde2d9d189485cab9a66') invalid('pinned reduction contract changed');
  const parser = new pinned.Parser();
  parser.lexer = Object.create(pinned.lexer) as Parser['lexer'];
  parser.lexer.options = { ...pinned.lexer.options, ranges: true };
  const records: XYLabelRecord[] = [], effects: XYEffect[] = [];
  const mapped = new WeakMap<object, ProvenanceText>(), datumLabels = new WeakMap<object, ProvenanceText>();
  // Primitive alphaNum reductions need location identity, never value identity.
  const alpha = new WeakMap<Loc, ProvenanceText>();
  const methods = ['setOrientation','setDiagramTitle','setAccTitle','setAccDescription','setXAxisTitle','setYAxisTitle','setXAxisBand','setXAxisRangeData','setYAxisRangeData','setLineData','setBarData'] as const;
  let callbacks: Array<{ method: typeof methods[number]; values: unknown[] }> = [], seriesIndex = 0;
  parser.yy = Object.fromEntries(methods.map(method => [method, (...values: unknown[]) => callbacks.push({method,values})]));
  const field = (location: Loc | undefined, token: unknown): ProvenanceText => {
    const range = location?.range;
    if (!range || typeof token !== 'string') invalid('missing token or range');
    const result = input.slice(...range);
    if (result.text !== token) invalid('token differs from source range');
    return result;
  };
  const owned = (value: TextValue): ProvenanceText => {
    const result = mapped.get(value);
    if (!result || result.text !== value.text) invalid('unowned native text');
    return result;
  };
  const record = (role: XYLabelRole, value: ProvenanceText, textType: 'text' | 'markdown' = 'text', identity: {seriesIndex?:number;memberIndex?:number} = {}, synthetic = false): number => {
    const located = coordinates.locateRange(value,0,value.length), recordIndex = records.length + 1;
    records.push(Object.freeze({recordIndex,role,semanticValue:value.text,textType,mappedValue:value,
      intervals:Object.freeze(located.intervals.map(interval=>Object.freeze(interval))),synthetic:synthetic || located.synthetic,...identity}));
    return recordIndex;
  };
  const action = parser.performAction;
  parser.performAction = function(this: {$?:unknown; _$:Loc}, ...args:unknown[]):unknown {
    const production = args[4] as number, values = args[5] as unknown[], locations = args[6] as Loc[];
    const last = (offset = 0) => values.at(-1-offset);
    const token = (offset = 0) => field(locations.at(-1-offset),last(offset));
    let text: ProvenanceText | undefined;
    if (production === 42) text = token();
    if (production === 43 || production === 39) {
      const offset = production === 43 ? 1 : 0;
      const before = alpha.get(locations.at(-1-offset)!);
      if (!before || before.text !== last(offset)) invalid('unowned alphaNum reduction');
      text = production === 43 ? before.concat(token()) : before;
    }
    if (production === 40 || production === 41 || production === 22) text = token();
    callbacks = [];
    const result = action.apply(this,args);
    if (production === 42 || production === 43) {
      if (!text || this.$ !== text.text) invalid('alphaNum reduction changed');
      alpha.set(this._$,text);
    } else if (production >= 39 && production <= 41) {
      const value = this.$ as TextValue;
      if (!text || value.text !== text.text || !['text','markdown'].includes(value.type)) invalid('text reduction changed');
      mapped.set(value,text);
    } else if (production === 22 || production === 23) {
      const value = this.$ as Datum, label = text ?? input.synthetic('');
      if (value.label !== label.text) invalid('datum label reduction changed');
      datumLabels.set(value,label);
    }
    for (const callback of callbacks) {
      const {method,values:args} = callback;
      if (method === 'setOrientation') { effects.push(Object.freeze({method,orientation:args[0] as string})); continue; }
      if (method === 'setXAxisRangeData' || method === 'setYAxisRangeData') {
        effects.push(Object.freeze({method,min:args[0] as number,max:args[1] as number})); continue;
      }
      if (method === 'setXAxisBand') {
        const indices = (args[0] as TextValue[]).map((value,memberIndex)=>record('category',owned(value),value.type,{memberIndex}));
        effects.push(Object.freeze({method,records:Object.freeze(indices)})); continue;
      }
      if (method === 'setLineData' || method === 'setBarData') {
        const value = args[0] as TextValue, implicit = production === 12 || production === 14;
        const recordIndex = record('seriesTitle',implicit ? input.synthetic('') : owned(value),value.type,{seriesIndex},implicit);
        const data = (args[1] as Datum[]).map((datum,memberIndex)=>{
          const label = datumLabels.get(datum);
          if (!label || label.text !== datum.label) invalid('unowned datum');
          return Object.freeze({value:datum.value,recordIndex:record('pointLabel',label,'text',{seriesIndex,memberIndex},label.length===0)});
        });
        effects.push(Object.freeze({method,seriesIndex,recordIndex,data:Object.freeze(data)})); seriesIndex++; continue;
      }
      let value: ProvenanceText, type:'text'|'markdown' = 'text', synthetic = false;
      const role = {setDiagramTitle:'title',setAccTitle:'accTitle',setAccDescription:'accDescr',setXAxisTitle:'xTitle',setYAxisTitle:'yTitle'}[method] as XYLabelRole;
      if (method === 'setDiagramTitle') {
        value = trim(owned(last() as TextValue));
        if (value.text !== args[0]) invalid('title reduction changed');
      } else if (method === 'setAccTitle' || method === 'setAccDescription') {
        value = trim(token());
        if (value.text !== args[0]) invalid('metadata reduction changed');
      } else {
        const semantic = args[0] as TextValue;
        synthetic = production === 26 || production === 34;
        value = synthetic ? input.synthetic('') : owned(semantic); type = semantic.type;
      }
      effects.push(Object.freeze({method,recordIndex:record(role,value,type,{},synthetic)}));
    }
    return result;
  };
  parser.parse(input.text);
  return Object.freeze({records:Object.freeze(records),effects:Object.freeze(effects),parserSource:input.text});
}
