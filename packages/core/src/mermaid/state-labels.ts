// Pinned Mermaid 12 state grammar collector. It observes Jison reductions
// before StateDB extraction/sanitization, so later reconciliation can retain
// exact authored spans without treating equal displayed text as identity.
import { MathPolicyError } from '../math/policy.ts';
import { mapMermaidFence } from './flowchart-source.ts';
import { MermaidSourceCoordinates, type LocatedSourceInterval } from './source-coordinates.ts';
import type { ProvenanceText } from './source-provenance.ts';
import { checkMermaidSource, normalizeMermaidSource } from './rules.ts';

export type StateLabelRole = 'state.implicit' | 'state.description' | 'transition' | 'note' | 'accTitle' | 'accDescr';
export type StateLabelRecord = Readonly<{
  /** Unique identity of this raw field occurrence. */
  recordIndex: number;
  role: StateLabelRole;
  semanticValue: string;
  mappedValue: ProvenanceText;
  intervals: readonly LocatedSourceInterval[];
  synthetic: boolean;
  /** Stable identity of the parsed statement object; absent for root events. */
  statementIndex?: number;
  /** The exact parsed statement object retained in the parsed `root` graph. */
  statement?: StateStatement;
  /** Stable identity for root accessibility setter events. */
  eventIndex?: number;
  ownerId?: string;
}>;
export type StateStatement = { stmt?: string; id?: string; description?: unknown; note?: { text?: string }; [key: string]: unknown };
export type StateLabels = Readonly<{ records: readonly StateLabelRecord[]; root: readonly StateStatement[]; parserSource: string }>;

type Range = [number, number];
type Loc = { range?: Range };
type Parser = {
  yy: Record<string, unknown>;
  lexer: { options: Record<string, unknown>; performAction(...args: unknown[]): unknown };
  performAction(...args: unknown[]): unknown;
  parse(source: string): unknown;
};
type Pinned = { Parser: new () => Parser; lexer: Parser['lexer']; productions_: unknown[] };
type Module = { diagram: { parser: { parser: Pinned } } };

// These are parser action numbers, not grammar-production indexes. Pinning the
// productions as well prevents a Mermaid update from silently reusing them.
const PINNED_PRODUCTIONS: ReadonlyArray<readonly [number, number, number]> = [
  [13, 9, 2], [14, 9, 3], [15, 9, 4], [19, 9, 4], [20, 9, 3], [21, 9, 6],
  [26, 9, 4], [29, 9, 2], [30, 9, 2], [31, 9, 1], [44, 13, 1], [45, 13, 1],
  [46, 13, 3], [47, 13, 3],
];

function invalid(message: string): never {
  throw new MathPolicyError('E_MATH_INVALID', `state grammar collector: ${message}`);
}
function trim(value: ProvenanceText): ProvenanceText {
  const start = value.text.length - value.text.trimStart().length;
  return value.slice(start, start + value.text.trim().length);
}
function trimColon(value: ProvenanceText): ProvenanceText {
  const trimmed = trim(value);
  return trimmed.text.startsWith(':') ? trim(trimmed.slice(1, trimmed.length)) : trimmed;
}

/** Capture every raw grammar-owned state label without invoking StateDB. */
export async function extractStateLabels(original: string, rendered = normalizeMermaidSource(original)): Promise<StateLabels> {
  const issue = checkMermaidSource(rendered).find(item => item.code !== 'E_MATH');
  if (issue) invalid(issue.message);
  let input = mapMermaidFence(original, rendered);
  // Mermaid's loader hands the state lexer a complete line. Appending only a
  // synthetic final newline preserves EOF forms while never inventing a source
  // interval. Unlike flowchart, state itself skips whole-line %% comments.
  if (!input.text.endsWith('\n')) input = input.concat(input.synthetic('\n'));
  const coordinates = new MermaidSourceCoordinates(original);
  // @ts-expect-error Mermaid does not expose types for this pinned chunk.
  const module = await import('mermaid/dist/chunks/mermaid.core/stateDiagram-v2-GCMORJYK.mjs') as Module;
  const pinned = module.diagram?.parser?.parser;
  if (typeof pinned?.Parser !== 'function' || pinned.productions_?.length !== 50 ||
      PINNED_PRODUCTIONS.some(([at, symbol, length]) => JSON.stringify(pinned.productions_[at]) !== JSON.stringify([symbol, length]))) {
    invalid('pinned state reduction contract changed');
  }
  const parser = new pinned.Parser();
  parser.lexer = Object.create(pinned.lexer) as Parser['lexer'];
  parser.lexer.options = { ...pinned.lexer.options, ranges: true };
  const noteLexerModes = new Map<string, 67 | 68>();
  const lexerAction = parser.lexer.performAction;
  parser.lexer.performAction = function(this: { yylloc?: Loc }, ...args: unknown[]): unknown {
    const rule = args[2];
    const range = this.yylloc?.range;
    const result = lexerAction.apply(this, args);
    if ((rule === 67 || rule === 68) && result === 31) {
      if (!range) invalid('note lexer token has no range');
      noteLexerModes.set(`${range[0]}:${range[1]}`, rule);
    }
    return result;
  };
  const records: StateLabelRecord[] = [];
  const statementIds = new WeakMap<object, number>();
  let nextStatementIndex = 0;
  let nextRecordIndex = 0;
  let nextEventIndex = 0;
  let dividerCount = 0;
  let root: readonly StateStatement[] | undefined;
  const statementIndex = (statement: StateStatement): number => {
    const known = statementIds.get(statement);
    if (known !== undefined) return known;
    const index = ++nextStatementIndex;
    statementIds.set(statement, index);
    return index;
  };
  const add = (role: StateLabelRole, value: ProvenanceText, statement?: StateStatement, ownerId?: string): void => {
    const { intervals, synthetic } = coordinates.locateRange(value, 0, value.length);
    const isRootEvent = statement === undefined;
    records.push(Object.freeze({ role, semanticValue: value.text, mappedValue: value,
      intervals: Object.freeze(intervals.map(interval => Object.freeze({ ...interval }))), synthetic,
      recordIndex: ++nextRecordIndex, ...(isRootEvent ? { eventIndex: ++nextEventIndex } : { statementIndex: statementIndex(statement!), statement }), ownerId }));
  };
  const field = (location: Loc | undefined): ProvenanceText => {
    if (!location?.range) invalid('pinned parser did not emit a token range');
    return input.slice(...location.range);
  };
  const yy: Record<string, unknown> = {
    setRootDoc: (value: unknown) => { if (!Array.isArray(value)) invalid('parsed root document is not an array'); root = value as StateStatement[]; },
    getDividerId: () => `divider-id-${++dividerCount}`,
    setAccTitle: () => undefined,
    setAccDescription: () => undefined,
    setDirection: () => undefined,
    trimColon: (value: string) => value.startsWith(':') ? value.slice(1).trim() : value.trim(),
  };
  parser.yy = yy;
  const action = parser.performAction;
  parser.performAction = function(this: { $?: unknown; _$?: Loc }, ...args: unknown[]): unknown {
    const state = args[4] as number;
    const values = args[5] as unknown[];
    const locations = args[6] as Loc[];
    const result = action.apply(this, args);
    const item = this.$ as StateStatement | undefined;
    // idStatement creates all implicit labels, including relation endpoints.
    if ((state === 44 || state === 45 || state === 46 || state === 47) && item?.stmt === 'state' && typeof item.id === 'string') {
      const idLoc = state === 46 || state === 47 ? locations.at(-3) : locations.at(-1);
      const mapped = trim(field(idLoc));
      if (mapped.text !== item.id) invalid('implicit state ID differs from lexer token');
      add('state.implicit', mapped, item, item.id);
    }
    // `state A : description` mutates the pre-existing idStatement object.
    if (state === 13 && item?.stmt === 'state' && typeof item.id === 'string' && typeof item.description === 'string') {
      const mapped = trimColon(field(locations.at(-1)));
      if (mapped.text !== item.description) invalid('state description differs from native trimColon');
      add('state.description', mapped, item, item.id);
    }
    if (state === 15 && item?.stmt === 'relation' && typeof item.description === 'string') {
      const mapped = trimColon(field(locations.at(-1)));
      if (mapped.text !== item.description) invalid('transition label differs from native trimColon');
      add('transition', mapped, item);
    }
    // Composite declarations bypass idStatement, but their heading is still
    // the implicit display label of the group state.
    if (state === 19 && item?.stmt === 'state' && typeof item.id === 'string') {
      const mapped = trim(field(locations.at(-4)));
      if (mapped.text !== item.id) invalid('composite state ID differs from lexer token');
      add('state.implicit', mapped, item, item.id);
    }
    // Fork, join, and choice tokens include either <<...>> or [[...]] suffixes
    // (case-insensitive). The pinned lexer removes fixed lengths, not text.
    if ((state === 22 || state === 23 || state === 24) && item?.stmt === 'state' && typeof item.id === 'string') {
      const raw = field(locations.at(-1));
      const suffixLength = state === 24 ? 10 : 8;
      const mapped = trim(raw.slice(0, raw.length - suffixLength));
      if (mapped.text !== item.id) invalid('special state ID differs from native lexer suffix trim');
      add('state.implicit', mapped, item, item.id);
    }
    // Quoted aliases use a lexer token for the string and a second token for
    // the ID. Mermaid's native action splits an ID containing ':' into the
    // owner ID and a second description-array entry; preserve both fields.
    if ((state === 20 || state === 21) && item?.stmt === 'state' && typeof item.id === 'string') {
      const descriptionLoc = state === 20 ? locations.at(-3) : locations.at(-6);
      const idLoc = state === 20 ? locations.at(-1) : locations.at(-4);
      // Production 20 trims the quoted alias description; production 21
      // (quoted composite) stores the lexer value unchanged.
      const rawDescription = state === 20 ? trim(field(descriptionLoc)) : field(descriptionLoc);
      const descriptions = Array.isArray(item.description) ? item.description : [item.description];
      if (typeof descriptions[0] !== 'string' || rawDescription.text !== descriptions[0]) invalid('quoted alias description differs from parser');
      add('state.description', rawDescription, item, item.id);
      // Unlike bare declarations, aliases create their state directly in this
      // reduction. Retain the authored alias ID even if its quoted title trims
      // to empty and native extraction subsequently exposes the ID as a label.
      const rawAliasId = field(idLoc);
      const colon = state === 20 ? rawAliasId.text.indexOf(':') : -1;
      const aliasId = trim(rawAliasId.slice(0, colon === -1 ? rawAliasId.length : colon));
      // The lexer range owns the ID token while native extraction later trims
      // it for its visible label. Keep that exact token-derived trimmed value.
      if (aliasId.text !== item.id.trim()) invalid('quoted alias ID differs from parser trim');
      add('state.implicit', aliasId, item, item.id);
      if (state === 20) {
        const rawId = String(values.at(-1) ?? '');
        const colon = rawId.indexOf(':');
        if (colon !== -1) {
          if (typeof descriptions[1] !== 'string') invalid('aliased ID colon split lacks description');
          const idLoc = field(locations.at(-1));
          const mapped = idLoc.slice(colon + 1, colon + 1 + descriptions[1].length);
          if (mapped.text !== descriptions[1]) invalid('aliased ID colon description differs from parser');
          add('state.description', mapped, item, item.id);
        }
      }
    }
    if (state === 26 && item?.stmt === 'state' && typeof item.id === 'string' && typeof item.note?.text === 'string') {
      const id = trim(field(locations.at(-2)));
      if (id.text !== item.id) invalid('note state ID differs from native trim');
      add('state.implicit', id, item, item.id);
      const raw = field(locations.at(-1));
      const mode = noteLexerModes.get(`${locations.at(-1)?.range?.[0]}:${locations.at(-1)?.range?.[1]}`);
      // Preserve the actual selected rule: rule 67 can include a leading
      // newline before `:`, while rule 68 owns the multiline end-note form.
      const mapped = mode === 67 ? trim(raw.slice(2, raw.length))
        : mode === 68 ? trim(raw.slice(0, raw.length - 'end note'.length)) : invalid('note text has no pinned lexer mode');
      if (mapped.text !== item.note.text) invalid('note text differs from native trim');
      add('note', mapped, item, item.id);
    }
    if (state === 29 || state === 30 || state === 31) {
      const mapped = trim(field(locations.at(-1)));
      const role: StateLabelRole = state === 29 ? 'accTitle' : 'accDescr';
      // The action passes this exact trimmed value to the fake common DB.
      if (typeof values.at(-1) !== 'string' || mapped.text !== String(this.$ ?? '')) invalid(`${role} differs from native trim`);
      add(role, mapped);
    }
    return result;
  };
  const parsed = parser.parse(input.text);
  if (!Array.isArray(parsed) || root !== parsed) invalid('parser did not return its root document');
  return Object.freeze({ records: Object.freeze(records), root: Object.freeze([...root]), parserSource: input.text });
}
