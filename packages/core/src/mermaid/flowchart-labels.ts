// Pinned Mermaid 12.0.0 flowchart grammar collector. This captures reductions
// and fresh FlowDB effects; it does not parse YAML shapeData or validate math.
import { MathPolicyError } from '../math/policy.ts';
import { mapFlowchartParserInput } from './flowchart-source.ts';
import { normalizeMermaidSource } from './rules.ts';
import type { ProvenanceText, SourceInterval } from './source-provenance.ts';

export type FlowchartLabelRole = 'node.explicit' | 'node.bare' | 'node.style' | 'edge' | 'subgraph' | 'accTitle' | 'accDescr';
export type FlowchartSourceInterval = SourceInterval & Readonly<{ startByte: number; endByte: number }>;
export type FlowchartProvenance = Readonly<{
  parserStart: number; parserEnd: number; // UTF-16 in Mermaid's parser input
  intervals: readonly FlowchartSourceInterval[]; // UTF-16 and UTF-8 in original fenced body
  synthetic: boolean;
}>;
export type FlowchartLabelRecord = {
  role: FlowchartLabelRole;
  semanticValue: string; // after the pinned grammar/DB trim and quote handling
  mappedValue: ProvenanceText; // same text, with source origins for each effective UTF-16 unit
  labelType?: string;
  ownerId?: string; // node or subgraph ID
  edgeIndices?: readonly number[]; // one authored label can fan out to many edges
  edgeIds?: readonly string[];
  endpoints?: readonly Readonly<{ start: string; end: string }>[];
  assignsLabel: boolean; // an actual DB label assignment, not a later bare reference
  active: boolean; // last grammar-owned value for a node/root field; metadata is separate
  effectIndex: number; // monotonic fresh-DB mutation order, retained after source sorting
  provenance: FlowchartProvenance;
};
export type FlowchartShapeDataRecord = {
  ownerId: string;
  targetKind: 'node' | 'edge' | 'subgraph' | 'connector';
  rawValue: string; // parsed SHAPE_DATA text; YAML decoding is a separate adapter
  mappedRawValue: ProvenanceText;
  effectIndex: number;
  provenance: FlowchartProvenance;
};
export type FlowchartLabels = {
  records: FlowchartLabelRecord[];
  shapeData: FlowchartShapeDataRecord[];
  parserSource: string;
};

type Range = [number, number];
type LexLoc = { range?: Range };
type TextObject = { text: string; type?: string };
type Vertex = { text?: string; labelType?: string };
type Edge = { id?: string; start: string; end: string; text: string; labelType?: string };
type Subgraph = { id: string; title: string; labelType?: string };
type FlowDb = {
  sanitizeText: (text: string) => string;
  addVertex: (...args: unknown[]) => unknown;
  addLink: (start: string[], end: string[], data: { text?: TextObject }) => unknown;
  addSubGraph: (...args: unknown[]) => unknown;
  setAccTitle: (text: string) => unknown;
  setAccDescription: (text: string) => unknown;
  getVertices: () => Map<string, Vertex>;
  getEdges: () => Edge[];
  getSubGraphs: () => Subgraph[];
};
type Parser = {
  yy: Record<string, unknown>;
  lexer: { options: Record<string, unknown>; performAction: (...args: unknown[]) => unknown };
  performAction: (...args: unknown[]) => unknown;
  parse: (source: string) => unknown;
};
type Pinned = { Parser: new () => Parser; lexer: Parser['lexer']; productions_: unknown[]; symbols_: Record<string, number> };
type Module = { diagram: { parser: { parser: Pinned }; db: FlowDb } };
type Context = { production: number; values: unknown[]; locations: LexLoc[]; range: Range };
type ShapeParts =
  | Readonly<{ kind: 'piece'; piece: ProvenanceText; length: number }>
  | Readonly<{ kind: 'join'; left: ShapeParts; right: ShapeParts; length: number }>;

const TEXT_REDUCTIONS = new Set([79, 80, 81, 82, 86, 87, 88, 89, 101, 102, 103, 104]);
const PINNED_REDUCTIONS: ReadonlyArray<readonly [number, number, number]> = [
  [33, 7, 9], [34, 7, 6], [37, 7, 2], [38, 7, 2], [39, 7, 1],
  [45, 20, 4], [46, 20, 3], [47, 20, 4], [49, 20, 2], [52, 42, 6],
  [56, 45, 4], [72, 45, 1], [77, 41, 3], [78, 41, 4],
  [121, 22, 5],
  [79, 76, 1], [80, 76, 2], [81, 76, 1], [82, 76, 1],
  [86, 30, 1], [87, 30, 2], [88, 30, 1], [89, 30, 1],
  [101, 28, 1], [102, 28, 2], [103, 28, 1], [104, 28, 1],
];

function invalid(message: string): never {
  throw new MathPolicyError('E_MATH_INVALID', `flowchart grammar collector: ${message}`);
}

function byteBoundaries(source: string): Array<number | undefined> {
  const bytes: Array<number | undefined> = Array(source.length + 1);
  bytes[0] = 0;
  for (let i = 0; i < source.length;) {
    const point = source.codePointAt(i)!;
    if (point >= 0xd800 && point <= 0xdfff) invalid('invalid source surrogate');
    const units = point > 0xffff ? 2 : 1;
    bytes[i + units] = bytes[i]! + (point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4);
    i += units;
  }
  return bytes;
}

function located(mapped: ProvenanceText, bytes: readonly (number | undefined)[], range: Range): FlowchartProvenance {
  const [parserStart, parserEnd] = range;
  if (!Number.isSafeInteger(parserStart) || !Number.isSafeInteger(parserEnd) || parserStart < 0 ||
      parserEnd <= parserStart || parserEnd > mapped.length) invalid('invalid reduction range');
  const origin = mapped.mapRange(parserStart, parserEnd);
  if (origin.synthetic || origin.intervals.length === 0) invalid('label has synthetic or missing source origin');
  const intervals = origin.intervals.map(({ start, end }) => {
    const startByte = bytes[start], endByte = bytes[end];
    if (startByte === undefined || endByte === undefined) invalid('reduction splits a Unicode source point');
    return { start, end, startByte, endByte };
  });
  return { parserStart, parserEnd, intervals, synthetic: false };
}

/** Iterative traversal: a long shapeData reduction chain must not use the JS call stack. */
function* shapePieces(root: ShapeParts): Generator<ProvenanceText> {
  const pending = [root];
  while (pending.length) {
    const part = pending.pop()!;
    if (part.kind === 'piece') yield part.piece;
    else { pending.push(part.right); pending.push(part.left); }
  }
}

/**
 * Collect every grammar-owned flowchart display text occurrence. The input is
 * the exact original fenced body and the normalized/dedented body sent to
 * Mermaid. Metadata `@{...}` is returned only as opaque shapeData, so a caller
 * must keep the flowchart math guard until a YAML provenance adapter exists.
 */
export async function extractFlowchartLabels(
  originalSource: string,
  renderedSource: string = normalizeMermaidSource(originalSource),
): Promise<FlowchartLabels> {
  const { parserInput } = mapFlowchartParserInput(originalSource, renderedSource);
  const bytes = byteBoundaries(originalSource);
  // @ts-expect-error Mermaid ships no declaration for this pinned parser chunk.
  const module = await import('mermaid/dist/chunks/mermaid.core/flowDiagram-KWPJA3E3.mjs') as Module;
  const pinned = module.diagram?.parser?.parser;
  if (typeof pinned?.Parser !== 'function' || !pinned.lexer || pinned.productions_?.length !== 190 ||
      PINNED_REDUCTIONS.some(([index, symbol, length]) =>
        JSON.stringify(pinned.productions_[index]) !== JSON.stringify([symbol, length]))) {
    invalid('pinned flowchart reduction contract changed');
  }
  const parser = new pinned.Parser();
  parser.lexer = Object.create(pinned.lexer) as Parser['lexer'];
  parser.lexer.options = { ...pinned.lexer.options, ranges: true };
  const db = module.diagram.db;
  // In the isolated Node collector, DOMPurify has no browser window. The
  // grammar/DB still performs its own trimming, quote stripping and fanout;
  // the worker's real DB must later cross-check any sanitizer-specific value.
  db.sanitizeText = text => text;
  const records: FlowchartLabelRecord[] = [];
  const shapeData: FlowchartShapeDataRecord[] = [];
  const textRanges = new WeakMap<TextObject, Range>();
  const shapeValues = new WeakMap<LexLoc, ShapeParts>();
  let context: Context | undefined;
  let effectIndex = 0;
  const provenance = (range: Range) => located(parserInput, bytes, range);
  const textRange = (text: TextObject): Range => textRanges.get(text) ?? invalid('text object has no grammar reduction range');
  const grammarValue = (range: Range, value: string): ProvenanceText => {
    const mapped = parserInput.slice(...range);
    // A token reducer may decode escapes or concatenate token values. Keep
    // its full source provenance without fabricating per-character offsets.
    return mapped.text === value ? mapped : mapped.replace(0, mapped.length, value);
  };
  const trimmed = (value: ProvenanceText): ProvenanceText => {
    const start = value.text.length - value.text.trimStart().length;
    const end = value.text.trimEnd().length;
    return value.slice(start, Math.max(start, end));
  };
  const dbText = (value: ProvenanceText): ProvenanceText => {
    const clean = trimmed(value);
    return clean.text.startsWith('"') && clean.text.endsWith('"') && clean.length >= 2
      ? clean.slice(1, clean.length - 1) : clean;
  };
  const confirmed = (mappedValue: ProvenanceText, semanticValue: string): ProvenanceText => {
    if (mappedValue.text !== semanticValue) invalid('grammar value differs from fresh DB effect');
    return mappedValue;
  };
  const finalNode = new Map<string, number>();
  const finalRoot = new Map<string, number>();

  // The lexer returns SHAPE_DATA pieces; rule 10 changes only newline plus
  // following whitespace to <br/>. Track each actual token and concatenate
  // reductions 43/44, preserving copied formulas on either side exactly.
  const lexerAction = parser.lexer.performAction;
  parser.lexer.performAction = function(this: { yytext: string; yylloc: LexLoc }, ...args: unknown[]): unknown {
    const rule = args[2] as number;
    const raw = this.yytext;
    const range = this.yylloc?.range;
    const result = lexerAction.apply(this, args);
    if (result === 40) {
      if (!range) invalid('shapeData token has no lexer range');
      const sourceToken = parserInput.slice(...range);
      let mappedToken: ProvenanceText;
      if (rule === 7) mappedToken = sourceToken.slice(0, 0);
      else if (rule === 10) mappedToken = sourceToken.replaceRegex(/\n\s*/g, () => '<br/>');
      else mappedToken = sourceToken;
      if (sourceToken.text !== raw || mappedToken.text !== this.yytext) invalid('shapeData lexer transform changed');
      shapeValues.set(this.yylloc, { kind: 'piece', piece: mappedToken, length: mappedToken.length });
    }
    return result;
  };

  const addVertex = db.addVertex;
  db.addVertex = (...args: unknown[]) => {
    const [id, textObj, , , , , , metadata] = args as [string, TextObject | undefined, unknown, unknown, unknown, unknown, unknown, string | undefined];
    const previous = db.getVertices().get(id);
    const targetKind = metadata === undefined ? undefined : db.getSubGraphs().some(graph => graph.id === id)
      ? 'subgraph' : db.getEdges().some(edge => edge.id === id) ? 'edge' : 'node';
    const currentEffect = ++effectIndex;
    const result = addVertex(...args);
    const vertex = db.getVertices().get(id);
    if (textObj && typeof textObj.text === 'string') {
      if (db.getEdges().some(edge => edge.id === id)) {
        // FlowDB ignores an explicit node-shaped label on an existing edge ID.
        // Keep authored text for policy validation, without inventing a node.
        const range = textRange(textObj);
        const mappedValue = dbText(grammarValue(range, textObj.text));
        records.push({ role: 'node.explicit', ownerId: id, semanticValue: mappedValue.text, mappedValue,
          labelType: textObj.type, assignsLabel: false, active: false, effectIndex: currentEffect,
          provenance: provenance(range) });
      } else {
        if (!vertex || typeof vertex.text !== 'string') invalid('node label had no DB effect');
        const range = textRange(textObj);
        const mappedValue = confirmed(dbText(grammarValue(range, textObj.text)), vertex.text);
        const prior = finalNode.get(id);
        if (prior !== undefined) records[prior]!.active = false;
        finalNode.set(id, records.length);
        records.push({ role: 'node.explicit', ownerId: id, semanticValue: vertex.text, mappedValue,
          labelType: vertex.labelType, assignsLabel: true, active: true, effectIndex: currentEffect, provenance: provenance(range) });
      }
    } else if (context?.production === 72) {
      // A bare identifier can address an existing edge; FlowDB returns early
      // without creating a node. It is then not a displayed bare node label.
      if (vertex) {
        const mappedValue = confirmed(grammarValue(context.range, id), id);
        const active = previous === undefined;
        if (active) finalNode.set(id, records.length);
        records.push({ role: 'node.bare', ownerId: id, semanticValue: id, mappedValue,
          labelType: 'text', assignsLabel: active, active, effectIndex: currentEffect, provenance: provenance(context.range) });
      }
    } else if (context?.production === 121 && previous === undefined && !db.getEdges().some(edge => edge.id === id)) {
      if (!vertex || vertex.text !== id) invalid('style-created node had no ID label');
      const range = context.locations[context.values.length - 3]?.range;
      if (!range) invalid('style-created node has no grammar range');
      const mappedValue = confirmed(grammarValue(range, id), id);
      finalNode.set(id, records.length);
      records.push({ role: 'node.style', ownerId: id, semanticValue: id, mappedValue,
        labelType: 'text', assignsLabel: true, active: true, effectIndex: currentEffect, provenance: provenance(range) });
    }
    if (metadata !== undefined) {
      const index = context?.production === 52 ? context.values.length - 5 : context?.production === 45 || context?.production === 49
        ? context.values.length - 1 : -1;
      const range = index < 0 ? undefined : context?.locations[index]?.range;
      if (typeof metadata !== 'string' || !range) invalid('shapeData has no reduction-owned range');
      const shape = shapeValues.get(context!.locations[index]!);
      if (!shape) invalid('shapeData reduction origin changed');
      const mappedRawValue = parserInput.slice(0, 0).concatAll(shapePieces(shape));
      if (mappedRawValue.text !== metadata) invalid('shapeData reduction text changed');
      shapeData.push({ ownerId: id, targetKind: targetKind!, rawValue: metadata, mappedRawValue,
        effectIndex: currentEffect, provenance: provenance(range) });
      // `active` considers grammar labels only. YAML can assign the same
      // visible value, so the decoded adapter uses effectIndex for precedence.
    }
    return result;
  };

  const addLink = db.addLink;
  db.addLink = (start, end, data) => {
    const before = db.getEdges().length;
    const currentEffect = ++effectIndex;
    const result = addLink(start, end, data);
    if (data.text) {
      const added = db.getEdges().slice(before);
      if (added.length !== start.length * end.length || added.length === 0 ||
          added.some(edge => edge.text !== added[0]!.text)) invalid('edge label fanout differs from grammar call');
      const range = textRange(data.text);
      const mappedValue = confirmed(dbText(grammarValue(range, data.text.text)), added[0]!.text);
      records.push({ role: 'edge', semanticValue: added[0]!.text, mappedValue, labelType: added[0]!.labelType,
        edgeIndices: added.map((_, index) => before + index), edgeIds: added.map(edge => edge.id ?? ''),
        endpoints: added.map(edge => ({ start: edge.start, end: edge.end })),
        assignsLabel: true, active: true, effectIndex: currentEffect, provenance: provenance(range) });
    }
    return result;
  };

  const addSubGraph = db.addSubGraph;
  db.addSubGraph = (...args: unknown[]) => {
    const title = args[2] as TextObject | undefined;
    const before = db.getSubGraphs().length;
    const currentEffect = ++effectIndex;
    const result = addSubGraph(...args);
    if (title && typeof title.text === 'string') {
      const graph = db.getSubGraphs()[before];
      if (!graph) invalid('subgraph title had no DB effect');
      const range = textRange(title);
      const mappedValue = confirmed(trimmed(grammarValue(range, title.text)), graph.title);
      records.push({ role: 'subgraph', ownerId: graph.id, semanticValue: graph.title, mappedValue,
        labelType: graph.labelType, assignsLabel: true, active: true, effectIndex: currentEffect, provenance: provenance(range) });
    }
    return result;
  };

  // The shared accessibility DB functions require browser DOMPurify in Node.
  // The grammar itself applies trim before these calls; capture that value.
  db.setAccTitle = value => {
    const currentEffect = ++effectIndex;
    if (context?.production !== 37) invalid('unexpected accTitle call');
    const range = context.locations.at(-1)?.range;
    if (!range) invalid('accTitle has no grammar range');
    const token = context.values.at(-1);
    if (typeof token !== 'string') invalid('accTitle has no grammar token');
    const mappedValue = confirmed(trimmed(grammarValue(range, token)), value);
    const prior = finalRoot.get('accTitle');
    if (prior !== undefined) records[prior]!.active = false;
    finalRoot.set('accTitle', records.length);
    records.push({ role: 'accTitle', semanticValue: value, mappedValue, assignsLabel: true, active: true,
      effectIndex: currentEffect, provenance: provenance(range) });
  };
  db.setAccDescription = value => {
    const currentEffect = ++effectIndex;
    if (context?.production !== 38 && context?.production !== 39) invalid('unexpected accDescr call');
    const range = context.locations.at(-1)?.range;
    if (!range) invalid('accDescr has no grammar range');
    const token = context.values.at(-1);
    if (typeof token !== 'string') invalid('accDescr has no grammar token');
    const mappedValue = confirmed(trimmed(grammarValue(range, token)), value);
    const prior = finalRoot.get('accDescr');
    if (prior !== undefined) records[prior]!.active = false;
    finalRoot.set('accDescr', records.length);
    records.push({ role: 'accDescr', semanticValue: value, mappedValue, assignsLabel: true, active: true,
      effectIndex: currentEffect, provenance: provenance(range) });
  };
  parser.yy = db as unknown as Record<string, unknown>;
  const action = parser.performAction;
  parser.performAction = function(this: { $?: unknown; _$?: LexLoc }, ...args: unknown[]): unknown {
    const production = args[4] as number;
    const values = args[5] as unknown[];
    const locations = args[6] as LexLoc[];
    const range = this._$?.range;
    if (!range) invalid('pinned parser did not emit reduction ranges');
    const prior = context;
    context = { production, values, locations, range };
    try {
      const result = action.apply(this, args);
      if (TEXT_REDUCTIONS.has(production) && this.$ && typeof this.$ === 'object' &&
          typeof (this.$ as TextObject).text === 'string') {
        textRanges.set(this.$ as TextObject, range);
      }
      if (production === 43 || production === 44) {
        const at = values.length - (production === 43 ? 2 : 1);
        const first = shapeValues.get(locations[at]!);
        const second = production === 43 ? shapeValues.get(locations[at + 1]!) : undefined;
        if (!first || (production === 43 && !second) || typeof this.$ !== 'string') invalid('shapeData reduction has no token provenance');
        const combined: ShapeParts = second ? { kind: 'join', left: first, right: second, length: first.length + second.length } : first;
        // The pinned action already concatenates its strings. Check length at
        // each reduction without rebuilding mapped text; verify exact text
        // once when FlowDB consumes the completed shapeData value.
        if (combined.length !== this.$.length) invalid('shapeData reduction length differs from token composition');
        shapeValues.set(this._$!, combined);
      }
      return result;
    } finally { context = prior; }
  };
  parser.parse(parserInput.text);
  records.sort((left, right) => left.provenance.intervals[0]!.start - right.provenance.intervals[0]!.start);
  shapeData.sort((left, right) => left.provenance.intervals[0]!.start - right.provenance.intervals[0]!.start);
  return { records, shapeData, parserSource: parserInput.text };
}
