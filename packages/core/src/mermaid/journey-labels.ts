// Raw field ownership from Mermaid 12's pinned journey grammar. This is an
// extraction foundation; it does not yet activate journey math rendering.
import { MathPolicyError } from '../math/policy.ts';
import { mapMermaidFence } from './flowchart-source.ts';
import { MermaidSourceCoordinates, type LocatedSourceInterval } from './source-coordinates.ts';
import type { ProvenanceText } from './source-provenance.ts';
import { checkMermaidSource, normalizeMermaidSource } from './rules.ts';

export type JourneyLabelRole = 'title' | 'accTitle' | 'accDescr' | 'section' | 'task' | 'actor';
export type JourneyLabelRecord = Readonly<{
  recordIndex: number;
  role: JourneyLabelRole;
  semanticValue: string;
  mappedValue: ProvenanceText;
  intervals: readonly LocatedSourceInterval[];
  synthetic: boolean;
  sectionRecordIndex?: number;
  taskIndex?: number;
  actorIndex?: number;
}>;
export type JourneyTask = Readonly<{
  taskIndex: number;
  labelRecordIndex: number;
  sectionRecordIndex?: number;
  actorRecordIndices: readonly number[];
  // Preserve the full native data token for later DB reconciliation. Only its
  // first colon-separated field is the score, and only the second is people.
  data: ProvenanceText;
  score: number;
}>;
export type JourneyLabels = Readonly<{
  records: readonly JourneyLabelRecord[];
  tasks: readonly JourneyTask[];
  parserSource: string;
}>;

type Loc = { range?: [number, number] };
type Parser = {
  yy: Record<string, unknown>;
  lexer: { options: Record<string, unknown> };
  performAction(...args: unknown[]): unknown;
  parse(source: string): unknown;
};
type Module = { diagram: { parser: { parser: {
  Parser: new () => Parser; lexer: Parser['lexer']; productions_: unknown[];
} } } };
function invalid(message: string): never {
  throw new MathPolicyError('E_MATH_INVALID', `journey grammar collector: ${message}`);
}
function trim(value: ProvenanceText): ProvenanceText {
  const start = value.length - value.text.trimStart().length;
  return value.slice(start, start + value.text.trim().length);
}

/** Retain every field occurrence, including overwritten metadata and actors. */
export async function extractJourneyLabels(original: string, rendered = normalizeMermaidSource(original)): Promise<JourneyLabels> {
  const issue = checkMermaidSource(rendered).find(item => item.code !== 'E_MATH');
  if (issue) invalid(issue.message);
  let input = mapMermaidFence(original, rendered);
  if (!input.text.endsWith('\n')) input = input.concat(input.synthetic('\n'));
  const coordinates = new MermaidSourceCoordinates(original);
  // @ts-expect-error Mermaid provides no types for the pinned internal chunk.
  const module = await import('mermaid/dist/chunks/mermaid.core/journeyDiagram-ZHPQQLJL.mjs') as Module;
  const pinned = module.diagram?.parser?.parser;
  const expected = [0, [3, 3], [5, 0], [5, 2], [7, 2], [7, 1], [7, 1], [7, 1], [9, 1], [9, 2], [9, 2], [9, 1], [9, 1], [9, 2]];
  if (typeof pinned?.Parser !== 'function' || JSON.stringify(pinned.productions_) !== JSON.stringify(expected)) {
    invalid('pinned reduction contract changed');
  }
  const parser = new pinned.Parser();
  parser.lexer = Object.create(pinned.lexer) as Parser['lexer'];
  parser.lexer.options = { ...pinned.lexer.options, ranges: true };
  const records: JourneyLabelRecord[] = [];
  const tasks: JourneyTask[] = [];
  let sectionRecordIndex: number | undefined;
  let effect: { method: string; values: string[] } | undefined;
  const readEffect = (): { method: string; values: string[] } | undefined => effect;
  parser.yy = Object.fromEntries(['setDiagramTitle', 'setAccTitle', 'setAccDescription', 'addSection', 'addTask']
    .map(method => [method, (...values: string[]) => { effect = { method, values }; }]));
  const field = (location: Loc | undefined, token: unknown): ProvenanceText => {
    const range = location?.range;
    if (!range || typeof token !== 'string') invalid('missing field token or range');
    const result = input.slice(...range);
    if (result.text !== token) invalid('field differs from lexer range');
    return result;
  };
  const add = (role: JourneyLabelRole, value: ProvenanceText, owner: {
    sectionRecordIndex?: number; taskIndex?: number; actorIndex?: number;
  } = {}): number => {
    const located = coordinates.locateRange(value, 0, value.length);
    const recordIndex = records.length + 1;
    records.push(Object.freeze({ recordIndex, role, semanticValue: value.text, mappedValue: value,
      intervals: Object.freeze(located.intervals.map(interval => Object.freeze(interval))), synthetic: located.synthetic, ...owner }));
    return recordIndex;
  };
  const action = parser.performAction;
  parser.performAction = function(this: { $?: unknown }, ...args: unknown[]): unknown {
    const production = args[4] as number;
    effect = undefined;
    const result = action.apply(this, args);
    if (production < 8 || production > 13) return result;
    const emitted = readEffect();
    const values = args[5] as unknown[], locations = args[6] as Loc[];
    const end = field(locations.at(-1), values.at(-1));
    if (production === 13) {
      const name = field(locations.at(-2), values.at(-2));
      if (emitted?.method !== 'addTask' || emitted.values[0] !== name.text || emitted.values[1] !== end.text || !end.text.startsWith(':')) invalid('task reduction changed');
      const taskIndex = tasks.length;
      const owner = { taskIndex, ...(sectionRecordIndex === undefined ? {} : { sectionRecordIndex }) };
      const labelRecordIndex = add('task', name, owner);
      const pieces = end.text.slice(1).split(':');
      const actorRecordIndices: number[] = [];
      if (pieces.length > 1) {
        let offset = 2 + pieces[0]!.length;
        for (const [actorIndex, person] of pieces[1]!.split(',').entries()) {
          actorRecordIndices.push(add('actor', trim(end.slice(offset, offset + person.length)), { ...owner, actorIndex }));
          offset += person.length + 1;
        }
      }
      tasks.push(Object.freeze({ ...owner, labelRecordIndex, actorRecordIndices: Object.freeze(actorRecordIndices), data: end, score: Number(pieces[0]) }));
    } else {
      const role = production === 8 ? 'title' : production === 9 ? 'accTitle' : production === 12 ? 'section' : 'accDescr';
      const method = role === 'title' ? 'setDiagramTitle' : role === 'accTitle' ? 'setAccTitle' : role === 'section' ? 'addSection' : 'setAccDescription';
      const mapped = production === 8 ? end.slice(6, end.length) : production === 12 ? end.slice(8, end.length) : trim(end);
      if (emitted?.method !== method || emitted.values.length !== 1 || emitted.values[0] !== mapped.text) invalid('metadata reduction changed');
      const recordIndex = add(role, mapped);
      if (role === 'section') sectionRecordIndex = recordIndex;
    }
    return result;
  };
  parser.parse(input.text);
  return Object.freeze({ records: Object.freeze(records), tasks: Object.freeze(tasks), parserSource: input.text });
}
