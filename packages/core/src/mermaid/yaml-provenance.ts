import { ProvenanceText, type RangeOrigin } from './source-provenance.ts';
// The generated module is pinned and checked by scripts/mermaid-yaml-build.mjs.
// @ts-expect-error generated JavaScript vendor module
import { load, JSON_SCHEMA } from './vendor/yaml-provenance.mjs';

export type YamlTrace = {
  kind: 'scalar' | 'mapping' | 'sequence' | 'alias' | 'empty';
  value?: unknown;
  decoded?: ProvenanceText;
  raw: RangeOrigin;
  start: number;
  end: number;
  entries?: { name: string; key: YamlTrace | null; value: YamlTrace | null }[];
  items?: (YamlTrace | null)[];
  definition?: YamlTrace;
};
type Frame = { node: YamlTrace; parts: ProvenanceText[]; breaks: number[]; scalar: boolean; child: YamlTrace | null; alias?: YamlTrace };
type Snapshot = { last: YamlTrace | null; parts: ProvenanceText[]; breaks: number[]; scalar: boolean; child: YamlTrace | null; alias?: YamlTrace; node: YamlTrace };
type ParserState = { position: number; kind: string | null; result: unknown };

/** Decode using Mermaid's exact JSON_SCHEMA parser, retaining successful structural relations. */
export function loadWithProvenance(input: ProvenanceText): { value: unknown; trace: YamlTrace | null } {
  // Mirror loadDocuments' BOM and implicit final newline normalization.
  let mapped = input;
  if (mapped.length && !/[\r\n]$/.test(mapped.text)) mapped = mapped.concat(mapped.synthetic('\n'));
  if (mapped.text.charCodeAt(0) === 0xfeff) mapped = mapped.slice(1, mapped.length);
  const frames: Frame[] = [];
  const collections = new WeakMap<object, YamlTrace>();
  let anchors = new Map<string, YamlTrace>();
  const transactions: Map<string, YamlTrace>[] = [];
  let document: YamlTrace | null = null;
  const empty = () => mapped.synthetic('');
  const raw = (start: number, end: number) => mapped.mapRange(Math.min(start, mapped.length), Math.min(end, mapped.length));
  const frame = () => frames[frames.length - 1]!;
  const collection = (value: object): YamlTrace => {
    let node = collections.get(value);
    if (!node) { node = { kind: Array.isArray(value) ? 'sequence' : 'mapping', raw: raw(frame().node.start, frame().node.start), start: frame().node.start, end: frame().node.start, entries: [], items: [] }; collections.set(value, node); }
    return node;
  };
  const hook = {
    last: null as YamlTrace | null,
    open(start: number): Frame {
      const next: Frame = { node: { kind: 'empty', raw: raw(start, start), start, end: start }, parts: [], breaks: [], scalar: false, child: null };
      frames.push(next); this.last = null; return next;
    },
    scalar(start: number) { const f = frame(); f.scalar = true; f.parts = []; f.breaks = []; f.node.start = start; },
    copy(start: number, end: number) { frame().parts.push(mapped.slice(start, Math.min(end, mapped.length))); frame().breaks = frame().breaks.filter(p => p >= end); },
    replace(start: number, end: number, text: string) { const part = mapped.slice(start, Math.min(end, mapped.length)); frame().parts.push(part.replace(0, part.length, text)); },
    breakAt(position: number) { if (frames.length) frame().breaks.push(position); },
    fold(text: string, folded = false) {
      if (!text) return;
      const f = frame();
      // Literal/chomp newlines retain one physical break each. A real fold may
      // consume extra physical breaks, assigned only to its first output unit.
      const selected = f.parts.length ? f.breaks : f.breaks.slice(-text.length);
      const physical = (p: number) => mapped.slice(p,
        Math.min(mapped.length, p + (mapped.text.slice(p, p + 2) === '\r\n' ? 2 : 1)));
      let cursor = 0;
      for (let index = 0; index < text.length; index++) {
        const count = index === 0 && (folded || text === ' ')
          ? Math.max(1, selected.length - text.length + 1) : 1;
        const parts: ProvenanceText[] = [];
        for (let i = 0; i < count && cursor < selected.length; i++) parts.push(physical(selected[cursor++]!));
        const breaks = empty().concatAll(parts);
        f.parts.push(breaks.length ? breaks.replace(0, breaks.length, text[index]!) : mapped.synthetic(text[index]!));
      }
      f.breaks = [];
    },
    collection,
    pair(value: object, name: string, key: YamlTrace | null, child: YamlTrace | null) { collection(value).entries!.push({ name, key, value: child }); },
    item(value: object, child: YamlTrace | null) { collection(value).items!.push(child); },
    anchor(name: string, value: unknown) { anchors.set(name, value && typeof value === 'object' ? collection(value) : frame().node); },
    alias(name: string, start: number, end: number) { frame().alias = { kind: 'alias', definition: anchors.get(name), raw: raw(start, end), start, end }; },
    begin() { transactions.push(new Map(anchors)); },
    commit() { transactions.pop(); },
    rollback() { anchors = transactions.pop()!; },
    snapshot(): Snapshot { const f = frame(); return { last: this.last, parts: [...f.parts], breaks: [...f.breaks], scalar: f.scalar, child: f.child, alias: f.alias, node: { ...f.node } }; },
    restore(s: Snapshot) { const f = frame(); this.last = s.last; f.parts = [...s.parts]; f.breaks = [...s.breaks]; f.scalar = s.scalar; f.child = s.child; f.alias = s.alias; Object.assign(f.node, s.node); },
    before(state: ParserState, f: Frame) {
      if (f.alias) f.node = f.alias;
      else if (state.result && typeof state.result === 'object') f.node = collection(state.result);
      else if (!f.scalar && f.child) f.node = f.child;
      else if (f.scalar) { f.node.kind = 'scalar'; f.node.decoded = empty().concatAll(f.parts); }
      if (f.node.kind !== 'alias') { f.node.end = Math.min(state.position, mapped.length); f.node.raw = raw(f.node.start, f.node.end); }
    },
    close(state: ParserState, f: Frame) { f.node.value = state.result; this.last = f.node; frames.pop(); if (frames.length) frame().child = f.node; },
    document() { document = this.last; anchors = new Map(); },
  };
  const value: unknown = load(input.text, { schema: JSON_SCHEMA, provenance: hook });
  return { value, trace: document };
}
