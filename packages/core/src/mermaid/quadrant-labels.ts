// Source ownership from the pinned quadrant grammar, before DB sanitation.
import { createHash } from 'node:crypto';
import { MathPolicyError } from '../math/policy.ts';
import { mapMermaidFence } from './flowchart-source.ts';
import { MermaidSourceCoordinates, type LocatedSourceInterval } from './source-coordinates.ts';
import type { ProvenanceText } from './source-provenance.ts';
import { checkMermaidSource, normalizeMermaidSource } from './rules.ts';

export type QuadrantLabelRole = 'title' | 'accTitle' | 'accDescr' | 'xLeft' | 'xRight' | 'yBottom' | 'yTop' | 'quadrant1' | 'quadrant2' | 'quadrant3' | 'quadrant4' | 'point';
export type QuadrantLabelRecord = Readonly<{
  recordIndex: number; role: QuadrantLabelRole; semanticValue: string;
  textType: 'text' | 'markdown'; mappedValue: ProvenanceText;
  intervals: readonly LocatedSourceInterval[]; synthetic: boolean;
  pointIndex?: number;
}>;
export type QuadrantPoint = Readonly<{ recordIndex: number; className: string; x: string; y: string; styles: readonly string[] }>;
export type QuadrantLabels = Readonly<{
  records: readonly QuadrantLabelRecord[]; points: readonly QuadrantPoint[];
  classes: ReadonlyArray<Readonly<{ name: string; styles: readonly string[] }>>;
  parserSource: string;
}>;
type Loc = { range?: [number, number] };
type Parser = { yy: Record<string, unknown>; lexer: { options: Record<string, unknown> }; performAction(...args: unknown[]): unknown; parse(source: string): unknown };
type Module = { diagram: { parser: { parser: { Parser: new () => Parser; lexer: Parser['lexer']; productions_: unknown[] } } } };
type TextValue = { text: string; type: 'text' | 'markdown' };
function invalid(message: string): never { throw new MathPolicyError('E_MATH_INVALID', `quadrant grammar collector: ${message}`); }
function trim(value: ProvenanceText): ProvenanceText {
  const start = value.length - value.text.trimStart().length;
  return value.slice(start, start + value.text.trim().length);
}

/** Keep all authored text, including labels overwritten by later declarations. */
export async function extractQuadrantLabels(original: string, rendered = normalizeMermaidSource(original)): Promise<QuadrantLabels> {
  const issue = checkMermaidSource(rendered).find(item => item.code !== 'E_MATH');
  if (issue) invalid(issue.message);
  let input = mapMermaidFence(original, rendered);
  if (!input.text.endsWith('\n')) input = input.concat(input.synthetic('\n'));
  const coordinates = new MermaidSourceCoordinates(original);
  // @ts-expect-error Mermaid provides no types for the pinned internal chunk.
  const module = await import('mermaid/dist/chunks/mermaid.core/quadrantDiagram-O4NWA36T.mjs') as Module;
  const pinned = module.diagram?.parser?.parser;
  if (typeof pinned?.Parser !== 'function' || createHash('sha256').update(JSON.stringify(pinned.productions_)).digest('hex') !== '2887c5bda2497a25434845f873998e980622aa40dbff1cac14c110efe609d65c') invalid('pinned reduction contract changed');
  const parser = new pinned.Parser();
  parser.lexer = Object.create(pinned.lexer) as Parser['lexer'];
  parser.lexer.options = { ...pinned.lexer.options, ranges: true };
  const records: QuadrantLabelRecord[] = [], points: QuadrantPoint[] = [];
  const classes: Array<{name:string;styles:readonly string[]}> = [];
  const mapped = new WeakMap<object, ProvenanceText>();
  const roles: Record<string, QuadrantLabelRole> = {
    setDiagramTitle:'title',setAccTitle:'accTitle',setAccDescription:'accDescr',
    setXAxisLeftText:'xLeft',setXAxisRightText:'xRight',setYAxisBottomText:'yBottom',setYAxisTopText:'yTop',
    setQuadrant1Text:'quadrant1',setQuadrant2Text:'quadrant2',setQuadrant3Text:'quadrant3',setQuadrant4Text:'quadrant4',addPoint:'point',
  };
  let effects: Array<{method:string;values:unknown[]}> = [];
  parser.yy = Object.fromEntries([...Object.keys(roles),'addClass','addSection'].map(method => [method,(...values:unknown[])=>effects.push({method,values})]));
  const field = (location:Loc|undefined, token:unknown): ProvenanceText => {
    const range = location?.range;
    if (!range || typeof token !== 'string') invalid('missing token or range');
    const result = input.slice(...range);
    if (result.text !== token) invalid('token differs from source range');
    return result;
  };
  const action = parser.performAction;
  parser.performAction = function(this:{$?:unknown}, ...args:unknown[]):unknown {
    const production = args[4] as number, values = args[5] as unknown[], locations = args[6] as Loc[];
    const last = (offset=0) => values.at(-1-offset);
    const token = (offset=0) => field(locations.at(-1-offset),last(offset));
    let text: ProvenanceText | undefined;
    if ([64,66,67].includes(production)) text = token();
    if (production === 65) {
      const before = last(1) as TextValue;
      const existing = mapped.get(before);
      if (!existing || existing.text !== before.text) invalid('unowned text concatenation');
      text = existing.concat(token());
    }
    // The grammar appends an arrow when an axis has a trailing delimiter.
    if (production === 52 || production === 55) {
      const value = last(1) as TextValue, existing = mapped.get(value);
      if (!existing || existing.text !== value.text) invalid('unowned axis arrow');
      mapped.set(value,existing.concat(existing.synthetic(' ⟶ ')));
    }
    effects = [];
    const result = action.apply(this,args);
    if (text) {
      const value = this.$ as TextValue;
      if (!value || value.text !== text.text || !['text','markdown'].includes(value.type)) invalid('text reduction changed');
      mapped.set(value,text);
    }
    for (const effect of effects) {
      if (effect.method === 'addClass') {
        const [name,styles] = effect.values as [string,string[]];
        classes.push(Object.freeze({name,styles:Object.freeze([...styles])})); continue;
      }
      const role = roles[effect.method];
      if (!role) invalid('unexpected native text callback');
      let value: ProvenanceText, textType:'text'|'markdown' = 'text';
      if (production >= 42 && production <= 45) {
        value = trim(token());
        if (value.text !== effect.values[0]) invalid('metadata reduction changed');
      } else {
        const semantic = effect.values[0] as TextValue;
        const owned = mapped.get(semantic);
        if (!owned || owned.text !== semantic.text) invalid('native callback has unowned text');
        value = owned; textType = semantic.type;
      }
      const located = coordinates.locateRange(value,0,value.length), recordIndex = records.length+1;
      records.push(Object.freeze({recordIndex,role,semanticValue:value.text,textType,mappedValue:value,
        intervals:Object.freeze(located.intervals.map(interval=>Object.freeze(interval))),synthetic:located.synthetic,
        ...(role==='point'?{pointIndex:points.length}:{})}));
      if(role==='point') {
        const [,className,x,y,styles] = effect.values as [TextValue,string,string,string,string[]];
        points.push(Object.freeze({recordIndex,className,x,y,styles:Object.freeze([...styles])}));
      }
    }
    return result;
  };
  parser.parse(input.text);
  return Object.freeze({records:Object.freeze(records),points:Object.freeze(points),classes:Object.freeze(classes),parserSource:input.text});
}
