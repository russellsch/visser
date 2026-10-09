// Pinned Mermaid 12 sequence grammar collector. It runs the actual Jison
// reductions against a fresh DB, retaining authored provenance before the DB
// applies its effects, including decoded YAML participant aliases.
import { MathPolicyError } from '../math/policy.ts';
import { parseSequenceBoxData } from './sequence-box.ts';
import { prepareSequenceSanitizer, sanitizeSequenceField, sanitizeSequenceText } from './sequence-sanitize.ts';
import { decodeSequenceMetadata, type SequenceMetadata } from './sequence-metadata.ts';
import { applySequenceProperties, parseSequenceProperties, SequencePropertiesError } from './sequence-properties.ts';
import { parseJsonWithStringProvenance } from './json-provenance.ts';
import { sequencePropertiesIdentity } from './sequence-db.ts';
import { mapMermaidFence } from './flowchart-source.ts';
import { checkMermaidSource, normalizeMermaidSource } from './rules.ts';
import { MermaidSourceCoordinates, type LocatedSourceInterval } from './source-coordinates.ts';
import type { ProvenanceText } from './source-provenance.ts';
import type { YamlTrace } from './yaml-provenance.ts';

export type SequenceLabelRole = 'title' | 'accTitle' | 'accDescr' | 'actor' | 'actor.metadata' | 'box' | 'message' | 'note' |
  'loop' | 'opt' | 'alt' | 'else' | 'par' | 'and' | 'critical' | 'option' | 'break' | 'actor.properties' | 'actor.details';
export type SequenceLabelRecord = {
  role: SequenceLabelRole;
  semanticValue: string;
  mappedValue: ProvenanceText;
  intervals: readonly LocatedSourceInterval[];
  synthetic: boolean;
  active: boolean;
  effectIndex: number;
  ownerId?: string;
  messageIndex?: number;
  messageIdentity?: Readonly<{ id: string; type: number; from?: string; to?: string; placement?: unknown;
    wrap: boolean; activate?: boolean; centralConnection?: number }>;
  boxIndex?: number;
  boxIdentity?: Readonly<{ wrap: boolean; fill: string }>;
  actorIdentity?: Readonly<{ type: unknown; wrap: unknown; boxIndex?: number; propertiesIdentity?: string }>;
  /** A truthy YAML alias of a non-string type, selected by the pinned DB. */
  typedUnsupported?: true;
  unsupportedAliasType?: string;
};
export type SequenceLabels = { records: SequenceLabelRecord[]; parserSource: string };

type Range = [number, number];
type Loc = { range?: Range };
type Text = { text: string; wrap?: boolean };
type Param = { type: string; actor?: string; description?: Text; config?: string; msg?: Text; text?: Text;
  boxData?: { text?: string; color: string; wrap?: boolean }; [key: string]: unknown };
type Actor = { name: string; description: unknown; type?: unknown; wrap?: unknown; box?: Box; properties?: unknown };
type Message = { id: string; message: unknown; type: number; from?: unknown; to?: unknown; placement?: unknown;
  wrap?: unknown; activate?: unknown; centralConnection?: unknown };
type Box = { name?: string; wrap?: unknown; fill?: unknown };
type Db = {
  apply(param: Param | Param[]): unknown; parseMessage(text: string): Text; parseBoxData(text: string): Param['boxData'];
  setDiagramTitle(text: string): void; setAccTitle(text: string): void; setAccDescription(text: string): void;
  getActors(): Map<string, Actor>; getMessages(): Message[]; getBoxes(): Box[];
  addProperties(actorId: string, text: Text): void;
};
type Parser = { yy: Record<string, unknown>; lexer: { options: Record<string, unknown> };
  performAction(...args: unknown[]): unknown; parse(source: string): unknown };
type Pinned = { Parser: new () => Parser; lexer: Parser['lexer']; productions_: unknown[] };
type Module = { diagram: { parser: { parser: Pinned }; db: Db } };
type Draft = { role: SequenceLabelRole; mappedValue: ProvenanceText; authoredValue?: ProvenanceText; ownerId?: string };
type MetadataDraft = { metadata: SequenceMetadata; mappedRawValue: ProvenanceText };

export class LocatedSequenceLabelError extends MathPolicyError {
  readonly intervals: readonly LocatedSourceInterval[];
  readonly synthetic: boolean;
  readonly startLine: number | undefined;
  readonly startByte: number | undefined;
  readonly endByte: number | undefined;
  constructor(message: string, record: SequenceLabelRecord, code = 'E_MATH_INVALID') {
    super(code, `sequence ${record.role}${record.ownerId ? ` ${record.ownerId}` : ''}: ${message}`);
    this.name = 'LocatedSequenceLabelError';
    this.intervals = Object.freeze(record.intervals.map(interval => Object.freeze({ ...interval })));
    this.synthetic = record.synthetic;
    this.startLine = this.intervals[0]?.startLine;
    this.startByte = this.intervals[0]?.startByte;
    this.endByte = this.intervals[0]?.endByte;
  }
}

const PINNED_REDUCTIONS: ReadonlyArray<readonly [number, number, number]> = [
  [17, 9, 4], [30, 9, 1], [31, 9, 1], [32, 9, 2], [33, 9, 2], [34, 9, 1],
  [35, 9, 4], [37, 9, 4], [38, 9, 4], [39, 9, 4], [40, 9, 4], [41, 9, 4], [42, 9, 4],
  [44, 46, 4], [46, 43, 4], [48, 41, 4],
  [49, 13, 5], [50, 13, 3], [51, 13, 5], [52, 13, 3],
  [54, 13, 5], [55, 13, 3], [56, 13, 5], [57, 13, 3],
  [58, 25, 4], [59, 25, 4], [62, 28, 3], [63, 29, 3],
  [70, 18, 5], [71, 18, 5], [72, 18, 5], [73, 18, 5], [74, 18, 6], [75, 18, 4],
  [76, 55, 2], [77, 74, 3], [78, 23, 1], [105, 58, 1],
];


function invalid(message: string): never {
  throw new MathPolicyError('E_MATH_INVALID', `sequence grammar collector: ${message}`);
}
function trim(value: ProvenanceText): ProvenanceText {
  const start = value.text.length - value.text.trimStart().length;
  const end = value.text.trimEnd().length;
  return value.slice(start, Math.max(start, end));
}
function mappedParserInput(original: string, rendered: string): ProvenanceText {
  const issue = checkMermaidSource(rendered).find(item => item.code !== 'E_MATH');
  if (issue) invalid(issue.message);
  let mapped = mapMermaidFence(original, rendered);
  // These are the pinned preprocessDiagram/encodeEntities steps. Restricted
  // source rejects directives, frontmatter, entity codes and unsafe tags.
  mapped = mapped.replaceRegex(/^\s*%%(?!\{)[^\n]+\n?/gm, () => '');
  mapped = mapped.slice(mapped.text.length - mapped.text.trimStart().length, mapped.length);
  for (const pattern of [/style.*:\S*#.*;/g, /classDef.*:\S*#.*;/g]) {
    mapped = mapped.replaceRegex(pattern, (_match, span) => span.slice(0, span.length - 1));
  }
  mapped = mapped.replaceRegex(/#\w+;/g, match => {
    const inner = match[0].slice(1, -1);
    return /^\+?\d+$/.test(inner) ? `\uFB02\u00B0\u00B0${inner}\u00B6\u00DF` : `\uFB02\u00B0${inner}\u00B6\u00DF`;
  });
  return mapped.concat(mapped.synthetic('\n'));
}

/** Pin parseMessage's trim and optional wrap-prefix removal without losing offsets. */
function messageValue(raw: ProvenanceText, expected: Text, colon = false): ProvenanceText {
  let mapped = trim(raw);
  if (colon) {
    if (!mapped.text.startsWith(':')) invalid('text token lost its colon');
    mapped = mapped.slice(1, mapped.length);
  }
  mapped = trim(mapped);
  if (/^:?(?:no)?wrap:/.test(mapped.text)) {
    const prefix = /^:?(?:no)?wrap:/.exec(mapped.text)![0].length;
    mapped = trim(mapped.slice(prefix, mapped.length));
  }
  if (mapped.text !== expected.text) invalid('parseMessage transform differs from pinned DB');
  return mapped;
}

function aliasStrings(trace: YamlTrace, seen = new Set<YamlTrace>()): ProvenanceText[] {
  if (seen.has(trace)) return [];
  seen.add(trace);
  if (trace.kind === 'alias') return trace.definition ? aliasStrings(trace.definition, seen) : [];
  if (trace.kind === 'scalar') return typeof trace.value === 'string' && trace.decoded ? [trace.decoded] : [];
  const values: ProvenanceText[] = [];
  for (const item of trace.items ?? []) if (item) values.push(...aliasStrings(item, seen));
  for (const entry of trace.entries ?? []) {
    if (entry.key) values.push(...aliasStrings(entry.key, seen));
    if (entry.value) values.push(...aliasStrings(entry.value, seen));
  }
  return values;
}

function aliasType(value: unknown): string {
  return Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
}

function sameUnsupportedKind(actual: unknown, expected: unknown): boolean {
  // A non-string alias is never a renderable label. Check the pinned DB's
  // assignment category without traversing (possibly cyclic) YAML graphs;
  // a final selected value is rejected after superseding declarations run.
  if (expected === null || typeof expected !== 'object') return Object.is(actual, expected);
  return actual !== null && typeof actual === 'object' && Array.isArray(actual) === Array.isArray(expected);
}

/** Collect grammar and YAML alias labels without activating the sequence export gate. */
export async function extractSequenceLabels(original: string, rendered = normalizeMermaidSource(original)): Promise<SequenceLabels> {
  const input = mappedParserInput(original, rendered);
  if (input.text.includes('<')) await prepareSequenceSanitizer();
  const coordinates = new MermaidSourceCoordinates(original);
  // @ts-expect-error Mermaid has no types for this pinned chunk.
  const module = await import('mermaid/dist/chunks/mermaid.core/sequenceDiagram-PO4LG4MO.mjs') as Module;
  const pinned = module.diagram?.parser?.parser;
  if (typeof pinned?.Parser !== 'function' || pinned.productions_?.length !== 106 ||
      PINNED_REDUCTIONS.some(([index, symbol, length]) =>
        JSON.stringify(pinned.productions_[index]) !== JSON.stringify([symbol, length]))) {
    invalid('pinned sequence reduction contract changed');
  }
  const parser = new pinned.Parser();
  parser.lexer = Object.create(pinned.lexer) as Parser['lexer'];
  parser.lexer.options = { ...pinned.lexer.options, ranges: true };
  const db = module.diagram.db;
  const records: SequenceLabelRecord[] = [];
  const drafts = new WeakMap<object, Draft>();
  const metadataDrafts = new WeakMap<object, MetadataDraft>();
  const configValues = new WeakMap<object, ProvenanceText>();
  const texts = new WeakMap<object, ProvenanceText>();
  const properties = new WeakMap<object, ReturnType<typeof parseSequenceProperties>>();
  const boxHasColour = new WeakMap<object, boolean>();
  const finalActor = new Map<string, number>();
  const finalRoot = new Map<string, number>();
  let effectIndex = 0;
  const field = (location: Loc | undefined): ProvenanceText => {
    if (!location?.range) invalid('text reduction has no Jison range');
    return input.slice(...location.range);
  };
  const add = (draft: Draft, active = true, extras: Partial<SequenceLabelRecord> = {}): number => {
    const { intervals, synthetic } = coordinates.locateRange(draft.authoredValue ?? draft.mappedValue, 0, (draft.authoredValue ?? draft.mappedValue).length);
    const index = records.length;
    records.push({ role: draft.role, semanticValue: draft.mappedValue.text, mappedValue: draft.mappedValue,
      intervals, synthetic, active, effectIndex: ++effectIndex, ownerId: draft.ownerId, ...extras });
    return index;
  };
  // Preserve the grammar-owned field location even when native HTML tree
  // repair makes its effective glyph-source mapping unrepresentable.
  for (const role of ['title', 'accTitle', 'accDescr'] as const) {
    const setter = role === 'title' ? 'setDiagramTitle' : role === 'accTitle' ? 'setAccTitle' : 'setAccDescription';
    db[setter] = (value: string) => {
      const pending = rootDraft;
      if (!pending || pending.role !== role || pending.mappedValue.text !== value) invalid(`${role} grammar value changed`);
      const prior = finalRoot.get(role);
      if (prior !== undefined) records[prior]!.active = false;
      finalRoot.set(role, records.length);
      // The common DB sanitizes first, then removes indentation after each
      // newline for accessibility descriptions.
      let mappedValue = sanitizeSequenceField(pending.mappedValue);
      if (role === 'accDescr') mappedValue = mappedValue.replaceRegex(/\n\s+/g, () => '\n');
      if (role === 'accTitle') mappedValue = mappedValue.replaceRegex(/^\s+/g, () => '');
      add({ role, mappedValue, authoredValue: pending.mappedValue });
    };
  }
  let rootDraft: Draft | undefined;
  // parseBoxData uses browser CSS.supports/Option. The source contract narrows
  // its color slot to a word or rgb()/rgba(); the browser DB remains the final
  // cross-check before this family can be activated.
  db.parseBoxData = (raw: string) => {
    const { data, usesColor } = parseSequenceBoxData(raw);
    if (data.text) data.text = sanitizeSequenceText(data.text);
    boxHasColour.set(data, usesColor);
    return data;
  };
  db.addProperties = (actorId, text) => {
    const parsed = properties.get(text);
    if (!parsed) invalid('participant properties lack validated grammar ownership');
    applySequenceProperties(db.getActors().get(actorId)!, parsed);
  };
  const apply = db.apply;
  db.apply = function(this: Db, param: Param | Param[]): unknown {
    if (Array.isArray(param)) return apply.call(this, param);
    const draft = drafts.get(param);
    const meta = metadataDrafts.get(param);
    const beforeMessages = this.getMessages().length;
    const beforeBoxes = this.getBoxes().length;
    const beforeActor = param.actor ? this.getActors().get(param.actor) : undefined;
    const beforeDescription = beforeActor?.description;
    const result = apply.call(this, param);
    if (!draft) return result;
    if (draft.role === 'actor') {
      const id = param.actor!;
      const after = this.getActors().get(id);
      if (!after) invalid('participant had no DB actor');
      const assigned = beforeActor !== after || beforeDescription !== after.description;
      const alias = meta?.metadata.alias;
      // Pinned addActor applies a truthy alias only when there is no explicit
      // description, or the explicit description is exactly the actor ID.
      const aliasSelected = Boolean(alias && (!param.description || param.description.text === after.name));
      if (assigned) {
        const prior = finalActor.get(id);
        if (prior !== undefined) records[prior]!.active = false;
      }
      const baseActive = assigned && !aliasSelected;
      const baseIndex = add(draft, baseActive);
      if (baseActive) {
        if (after.description !== draft.mappedValue.text) invalid('participant DB label differs from grammar');
        finalActor.set(id, baseIndex);
      }
      if (alias) {
        if (typeof alias.value === 'string') {
          if (!alias.mappedValue) invalid('string alias has no YAML scalar provenance');
          const aliasActive = assigned && aliasSelected;
          const aliasIndex = add({ role: 'actor.metadata', mappedValue: alias.mappedValue, ownerId: id }, aliasActive);
          if (aliasActive) {
            if (after.description !== alias.value) invalid('participant DB alias differs from YAML value');
            finalActor.set(id, aliasIndex);
          }
        } else {
          // Retain every string nested inside an unsupported typed value for
          // math validation, even when a later actor assignment supersedes it.
          for (const scalar of aliasStrings(alias.trace)) {
            add({ role: 'actor.metadata', mappedValue: scalar, ownerId: id }, false);
          }
          const empty = meta!.mappedRawValue.slice(0, 0);
          // This marker has no rendered string. Its location deliberately
          // covers the YAML alias field, rather than pretending the empty
          // semantic value has expression-level provenance.
          const rawOrigin = alias.trace.raw;
          const located = rawOrigin.intervals.length
            ? { intervals: rawOrigin.intervals.map(interval => coordinates.locate(interval)), synthetic: rawOrigin.synthetic }
            : coordinates.locateRange(meta!.mappedRawValue, 0, meta!.mappedRawValue.length);
          const typedActive = assigned && aliasSelected;
          const typedIndex = add({ role: 'actor.metadata', mappedValue: empty, ownerId: id }, typedActive,
            { typedUnsupported: true, unsupportedAliasType: aliasType(alias.value),
              intervals: located.intervals, synthetic: located.synthetic });
          if (typedActive) {
            if (!sameUnsupportedKind(after.description, alias.value)) invalid('participant DB typed alias differs from YAML value');
            finalActor.set(id, typedIndex);
          }
        }
      }
    } else if (draft.role === 'box') {
      const box = this.getBoxes()[beforeBoxes];
      if (!box || box.name !== draft.mappedValue.text) invalid('box DB title differs from grammar');
      if (typeof box.wrap !== 'boolean' || typeof box.fill !== 'string') invalid('box DB identity differs from pinned contract');
      add(draft, true, { boxIndex: beforeBoxes, boxIdentity: Object.freeze({ wrap: box.wrap, fill: box.fill }) });
    } else {
      const message = this.getMessages()[beforeMessages];
      if (!message || message.message !== draft.mappedValue.text) invalid(`${draft.role} DB message differs from grammar`);
      if (message.id !== String(beforeMessages) || typeof message.type !== 'number' || typeof message.wrap !== 'boolean' ||
          (message.from !== undefined && typeof message.from !== 'string') ||
          (message.to !== undefined && typeof message.to !== 'string') ||
          (message.activate !== undefined && typeof message.activate !== 'boolean') ||
          (message.centralConnection !== undefined && typeof message.centralConnection !== 'number')) {
        invalid('message DB identity differs from pinned contract');
      }
      add(draft, true, { messageIndex: beforeMessages,
        messageIdentity: Object.freeze({ id: message.id, type: message.type,
          from: message.from, to: message.to, placement: message.placement,
          wrap: message.wrap, activate: message.activate, centralConnection: message.centralConnection }) as SequenceLabelRecord['messageIdentity'] });
    }
    return result;
  };
  parser.yy = db as unknown as Record<string, unknown>;
  const action = parser.performAction;
  parser.performAction = function(this: { $?: unknown; _$?: Loc }, ...args: unknown[]): unknown {
    const production = args[4] as number;
    const values = args[5] as unknown[];
    const locations = args[6] as Loc[];
    const last = values.length - 1;
    if (!this._$?.range) invalid('pinned sequence parser did not emit ranges');
    const at = (offset: number) => field(locations[last + offset]);
    if (production === 30 || production === 31) {
      const token = at(0);
      rootDraft = { role: 'title', mappedValue: token.slice(production === 30 ? 6 : 7, token.length) };
    } else if (production >= 32 && production <= 34) {
      rootDraft = { role: production === 32 ? 'accTitle' : 'accDescr', mappedValue: trim(at(0)) };
    }
    const result = action.apply(this, args);
    rootDraft = undefined;
    if (production === 105 && this.$ && typeof this.$ === 'object') {
      texts.set(this.$, messageValue(at(0), this.$ as Text, true));
    }
    if (production === 78 && this.$ && typeof this.$ === 'object') {
      const param = this.$ as Param;
      const mappedValue = trim(at(0));
      if (mappedValue.text !== param.actor) invalid('actor lexer transform changed');
      drafts.set(param, { role: 'actor', mappedValue, ownerId: param.actor });
    }
    if ([49, 51, 54, 56].includes(production)) {
      const param = this.$ as Param;
      drafts.set(param, { role: 'actor', mappedValue: messageValue(at(-1), param.description!), ownerId: param.actor });
    }
    if (production === 77) {
      const mappedValue = trim(at(-1));
      if (mappedValue.text !== this.$) invalid('CONFIG_CONTENT trim differs from pinned grammar');
      configValues.set(this._$, mappedValue);
    }
    if (production === 76) {
      const param = this.$ as Param;
      const configLocation = locations[last];
      const mappedRawValue = configLocation ? configValues.get(configLocation) : undefined;
      if (!mappedRawValue || mappedRawValue.text !== param.config) invalid('CONFIG_CONTENT has no grammar-owned provenance');
      const metadata = decodeSequenceMetadata({ rawValue: param.config!, mappedRawValue });
      const actorValue = trim(at(-1));
      if (actorValue.text !== param.actor) invalid('configured actor lexer transform changed');
      drafts.set(param, { role: 'actor', mappedValue: actorValue, ownerId: param.actor });
      metadataDrafts.set(param, { metadata, mappedRawValue });
    }
    if (production === 62 || production === 63) {
      const param = (this.$ as Param[]).find(item => item.type === (production === 62 ? 'addProperties' : 'addDetails'));
      const mappedValue = param?.text && texts.get(param.text);
      if (!param?.text || !mappedValue) invalid('participant property field lacks grammar ownership');
      // These fields are machine data, never math-label records or copy slots.
      const location = coordinates.locateRange(mappedValue, 0, mappedValue.length);
      const diagnostic: SequenceLabelRecord = {role: production === 62 ? 'actor.properties' : 'actor.details',
        semanticValue:mappedValue.text, mappedValue, ...location, active:false, effectIndex:0, ownerId:param.actor};
      if (production === 63) throw new LocatedSequenceLabelError(
        'details is not allowed; it reads external DOM content and can introduce links', diagnostic, 'E_UNSAFE_CONTENT');
      try { properties.set(param.text, parseSequenceProperties(mappedValue.text)); }
      catch (error) {
        if (error instanceof SequencePropertiesError) {
          const sanitized = sanitizeSequenceField(mappedValue);
          const parsed = parseJsonWithStringProvenance(sanitized);
          const token = parsed.tokens.findLast(token => token.kind === 'key' && token.depth === 1 && token.mappedValue.text === error.key);
          if (token) {
            const origin = coordinates.locateRange(token.mappedValue, 0, token.mappedValue.length);
            if (!origin.synthetic && origin.intervals.length) Object.assign(diagnostic, origin);
          }
        }
        if (error instanceof MathPolicyError) throw new LocatedSequenceLabelError(error.message, diagnostic, error.code);
        throw error;
      }
    }
    if (production === 17) {
      const param = (this.$ as Param[])[0]!;
      const raw = at(-2);
      const title = param.boxData?.text;
      if (title) {
        const colour = /^((?:rgba?|hsla?)\s*\(.*\)|\w*)/.exec(raw.text)?.[0];
        if (colour === undefined) invalid('box colour has no grammar-owned prefix');
        let mappedValue = trim(boxHasColour.get(param.boxData!) ? raw.slice(colour.length, raw.length) : raw);
        const wrap = /^:?(?:no)?wrap:/.exec(mappedValue.text);
        if (wrap) mappedValue = trim(mappedValue.slice(wrap[0].length, mappedValue.length));
        const authoredValue = mappedValue;
        mappedValue = sanitizeSequenceField(mappedValue);
        if (mappedValue.text !== title) invalid('box title differs from parsed source field');
        drafts.set(param, { role: 'box', mappedValue, authoredValue });
      }
    }
    if ([58, 59, 70, 71, 72, 73, 74, 75].includes(production)) {
      const param = (this.$ as Param[]).find(item => item.type === (production <= 59 ? 'addNote' : 'addMessage'))!;
      const value = production <= 59 ? param.text : param.msg;
      const mappedValue = value && texts.get(value);
      if (!mappedValue) invalid('message/note has no grammar-owned text');
      drafts.set(param, { role: production <= 59 ? 'note' : 'message', mappedValue });
    }
    const group = new Map<number, SequenceLabelRole>([[35, 'loop'], [37, 'opt'], [38, 'alt'], [39, 'par'], [40, 'par'],
      [41, 'critical'], [42, 'break'], [44, 'option'], [46, 'and'], [48, 'else']]);
    const role = group.get(production);
    if (role) {
      const param = production >= 44 ? (this.$ as Param[]).at(-2) : (this.$ as Param[])[0];
      const message = (param as Param)[role === 'loop' ? 'loopText' : role === 'opt' ? 'optText' :
        role === 'alt' || role === 'else' ? 'altText' : role === 'par' || role === 'and' ? 'parText' :
          role === 'critical' ? 'criticalText' : role === 'option' ? 'optionText' : 'breakText'] as Text;
      if (!param || !message) invalid(`${role} has no group text`);
      const raw = at(production >= 44 ? -1 : -2);
      const mappedValue = messageValue(raw, message);
      drafts.set(param, { role, mappedValue });
    }
    return result;
  };
  parser.parse(input.text);
  for (const [id, index] of finalActor) {
    const actor = db.getActors().get(id);
    if (!actor) invalid(`final participant ${id} has no DB actor`);
    const boxIndex = actor.box ? db.getBoxes().indexOf(actor.box) : -1;
    if (actor.box && boxIndex < 0) invalid(`final participant ${id} has detached DB box`);
    records[index]!.actorIdentity = Object.freeze({ type: actor.type, wrap: actor.wrap,
      propertiesIdentity: sequencePropertiesIdentity(actor.properties),
      ...(boxIndex >= 0 ? { boxIndex } : {}) });
  }
  const finalUnsupported = [...finalActor.values()].map(index => records[index]!).find(record => record.typedUnsupported && record.active);
  if (finalUnsupported) throw new LocatedSequenceLabelError(
    `final participant has unsupported ${finalUnsupported.unsupportedAliasType} alias`, finalUnsupported);
  records.sort((a, b) => (a.intervals[0]?.sourceStart ?? Infinity) - (b.intervals[0]?.sourceStart ?? Infinity) || a.effectIndex - b.effectIndex);
  return { records, parserSource: input.text };
}
