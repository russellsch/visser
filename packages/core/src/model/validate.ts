// Semantic validation of catalogue components and primitives (§6.6, §8.1,
// §8.6, §9.3–9.10). The syntax adapter has already checked tag names, IDs, and
// literal limits; this pass checks attributes, placement, references by kind,
// and the family rules. Existence of referenced IDs is checked in targets.ts
// (E_REF_BROKEN); this pass reports only kind and scope errors for IDs that exist.
import { identityProblem } from '../provenance/identity.ts';
import type { Diagnostic, ParsedSource, ParsedTarget, TargetId } from '../types.ts';
import { normalizeText, sha256Hex } from './hash.ts';
import type { MNode, TargetModel } from './targets.ts';
import { DIFF_MAX_LINES, excerptLines } from './diff.ts';

type AttrType = 'string' | 'boolean' | 'number' | 'integer' | 'id' | 'ids' | 'strings' | 'stringOrStrings' | 'stringOrNumber' | 'lines' | 'region' | 'date';

/** A calendar date in ISO 8601 form, YYYY-MM-DD (a task `due`, docs/IMPROVEMENTS.md §4.4). */
export const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/**
 * True for a real calendar date in ISO 8601 form: the pattern, then the day
 * against the length of the month, with the Gregorian leap-year rule. No
 * `Date` parsing, because its result depends on the engine.
 */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const last = month === 2 && leap ? 29 : MONTH_DAYS[month - 1]!;
  return day <= last;
}

export type TagSpec = {
  required: Record<string, AttrType>;
  optional: Record<string, AttrType>;
  enums?: Record<string, readonly string[]>;
  parents?: readonly string[]; // allowed parent tags; undefined = top level only
  topLevel?: boolean; // also allowed at the top level when `parents` is set
  graphModes?: readonly string[]; // allowed graph modes when the parent is `graph`
  // Extension tags (§14): other scalar attributes are allowed here and are
  // checked against the extension's own schema when the extension is resolved.
  open?: boolean;
};

const BASIS = ['observed', 'inferred', 'hypothesis', 'stipulated'] as const;
const VISUAL = { id: 'id', title: 'string', question: 'string' } as const;
// `evidence` on a part names the `source` targets that show this part in
// code; `cite` in the body supports one sentence (docs/IMPROVEMENTS.md §4.4).
const PART_EVIDENCE = { evidence: 'ids' } as const;
// `quantity` on a relationship is a cited number such as "1,200 req/s", and
// `evidence` names the sources for it (docs/IMPROVEMENTS.md §14.9).
const QUANTITY = { quantity: 'string', evidence: 'ids' } as const;
/** The three note kinds; there is no free kind (docs/IMPROVEMENTS.md §14.2, §14.11). */
export const NOTE_KINDS = ['limit', 'assumption', 'warning'] as const;
/** The figures that take a `steps` walkthrough (docs/IMPROVEMENTS.md §14.1). */
export const STEPS_PARENTS = ['graph', 'trace', 'transform', 'compare', 'annotated', 'domain'] as const;
/** Limits of the §14 components: steps and tree entries warn above these; a measure stops at 12 readings. */
export const STEPS_WARN = 8;
export const TREE_WARN_ENTRIES = 40;
export const MEASURE_MAX_READINGS = 12;
export const DIFF_WARN_LINES = 80;
/** A diff side above this many lines is `E_LIMIT`, so the build memory stays bounded (§14.7). */
export { DIFF_MAX_LINES };
const DETAIL_PARENTS = ['graph', 'group', 'node', 'edge', 'state', 'transition', 'factor', 'causal-link', 'task', 'dependency',
  'trace', 'actor', 'event', 'branch', 'transform', 'stage', 'conversion', 'compare', 'option', 'criterion', 'cell',
  'annotated', 'annotation', 'domain', 'concept', 'relation', 'definition', 'detail'] as const;

const SPECS: Record<string, TagSpec> = {
  graph: { required: { ...VISUAL, mode: 'string' }, optional: {}, enums: { mode: ['architecture', 'state', 'cause', 'plan'] } },
  // `collapsed=true`: with JavaScript, the group starts folded into one box (docs/IMPROVEMENTS.md §14.9).
  group: { required: { id: 'id', label: 'string' }, optional: { parent: 'id', collapsed: 'boolean' }, parents: ['graph'], graphModes: ['architecture'] },
  node: {
    required: { id: 'id', role: 'string' }, optional: { label: 'string', group: 'id', entity: 'id', ...PART_EVIDENCE },
    enums: { role: ['process', 'storage', 'external', 'interface', 'decision', 'concept'] }, parents: ['graph'], graphModes: ['architecture'],
  },
  edge: {
    required: { id: 'id', from: 'id', to: 'id', kind: 'string', label: 'string' }, optional: { basis: 'string', ...QUANTITY },
    enums: { kind: ['call', 'blocking-call', 'data', 'control', 'owns', 'depends-on', 'contains', 'feedback'], basis: BASIS },
    parents: ['graph'], graphModes: ['architecture'],
  },
  state: { required: { id: 'id', label: 'string' }, optional: { initial: 'boolean', terminal: 'boolean', ...PART_EVIDENCE }, parents: ['graph'], graphModes: ['state'] },
  transition: {
    required: { id: 'id', from: 'id', to: 'id', event: 'string', label: 'string' }, optional: { guard: 'string', action: 'string', basis: 'string' },
    enums: { basis: BASIS }, parents: ['graph'], graphModes: ['state'],
  },
  // `evidence` on a factor names a source or a trace observation that
  // supports it, as on a causal link (docs/IMPROVEMENTS.md §14.6).
  factor: { required: { id: 'id', label: 'string', basis: 'string' }, optional: { evidence: 'ids' }, enums: { basis: BASIS }, parents: ['graph'], graphModes: ['cause'] },
  'causal-link': {
    required: { id: 'id', from: 'id', to: 'id', label: 'string', basis: 'string' }, optional: { evidence: 'ids' },
    enums: { basis: BASIS }, parents: ['graph'], graphModes: ['cause'],
  },
  task: {
    required: { id: 'id', label: 'string' },
    optional: { owner: 'string', status: 'string', output: 'string', acceptance: 'string', risk: 'string', due: 'date', ...PART_EVIDENCE },
    enums: { status: ['proposed', 'ready', 'blocked', 'complete', 'unknown'] }, parents: ['graph'], graphModes: ['plan'],
  },
  dependency: {
    required: { id: 'id', from: 'id', to: 'id', label: 'string' }, optional: { kind: 'string', ...QUANTITY },
    enums: { kind: ['finish-start', 'input', 'decision'] }, parents: ['graph'], graphModes: ['plan'],
  },
  trace: { required: { ...VISUAL }, optional: { timeUnit: 'string', scale: 'string' }, enums: { scale: ['ordinal', 'time'] } },
  actor: { required: { id: 'id' }, optional: { label: 'string', entity: 'id' }, parents: ['trace'] },
  // `actor` is optional only in a time-scaled trace with no actors: that
  // trace has one implicit lane. An `observation` is a log line, an alert,
  // or a metric reading, with its `evidence` (docs/IMPROVEMENTS.md §14.6).
  event: {
    required: { id: 'id', label: 'string', kind: 'string' },
    optional: { actor: 'id', to: 'id', after: 'ids', time: 'number', duration: 'number', branch: 'id', ...PART_EVIDENCE },
    enums: { kind: ['call', 'return', 'send', 'receive', 'compute', 'wait', 'state-change', 'failure', 'observation'] }, parents: ['trace'],
  },
  branch: { required: { id: 'id', label: 'string', condition: 'string' }, optional: { exclusiveWith: 'ids' }, parents: ['trace'] },
  transform: { required: { ...VISUAL }, optional: {} },
  stage: {
    required: { id: 'id', label: 'string', representation: 'string' },
    optional: { shape: 'stringOrStrings', units: 'string', location: 'string', ownership: 'string', ...PART_EVIDENCE }, parents: ['transform'],
  },
  conversion: { required: { id: 'id', from: 'id', to: 'id', label: 'string' }, optional: { loss: 'string', condition: 'string', ...QUANTITY }, parents: ['transform'] },
  compare: { required: { ...VISUAL }, optional: {} },
  option: { required: { id: 'id', label: 'string' }, optional: {}, parents: ['compare'] },
  criterion: { required: { id: 'id', label: 'string' }, optional: { units: 'string' }, parents: ['compare'] },
  cell: {
    required: { id: 'id', option: 'id', criterion: 'id' }, optional: { value: 'stringOrNumber', valueStatus: 'string', ...PART_EVIDENCE },
    enums: { valueStatus: ['measured', 'estimated', 'illustrative'] }, parents: ['compare'],
  },
  // `before` names a second captured source; the page shows a line diff
  // (docs/IMPROVEMENTS.md §14.7).
  annotated: { required: { ...VISUAL, source: 'id' }, optional: { before: 'id' } },
  // Domain model (docs/IMPROVEMENTS.md §5.3): concepts that each own one
  // definition, and typed relations between them.
  domain: { required: { ...VISUAL }, optional: {} },
  concept: {
    required: { id: 'id', label: 'string', definition: 'id' }, optional: { category: 'string', attributes: 'strings', entity: 'id' },
    enums: { category: ['thing', 'actor', 'event', 'value', 'rule'] }, parents: ['domain'],
  },
  relation: {
    required: { id: 'id', from: 'id', to: 'id', kind: 'string', label: 'string' }, optional: { cardinality: 'string' },
    enums: { kind: ['is-a', 'has', 'uses', 'produces', 'identifies'] }, parents: ['domain'],
  },
  // Components of docs/IMPROVEMENTS.md §14. A note and a self-check are
  // blocks with a body; a measure, a tree, and a steps walkthrough have parts.
  note: { required: { id: 'id', kind: 'string' }, optional: {}, enums: { kind: NOTE_KINDS } },
  'self-check': { required: { id: 'id', question: 'string' }, optional: {} },
  measure: { required: { ...VISUAL, unit: 'string' }, optional: {} },
  // `display` is the text of the value as the page prints it, such as
  // "0.50", when the number alone loses a digit (phase 6a review S4).
  reading: {
    required: { id: 'id', label: 'string', value: 'number', valueStatus: 'string' }, optional: { display: 'string', ...PART_EVIDENCE },
    enums: { valueStatus: ['measured', 'estimated', 'illustrative'] }, parents: ['measure'],
  },
  tree: { required: { ...VISUAL }, optional: {} },
  entry: {
    required: { id: 'id', path: 'string', label: 'string' }, optional: { role: 'string', ...PART_EVIDENCE },
    enums: { role: ['process', 'storage', 'external', 'interface', 'decision', 'concept'] }, parents: ['tree', 'entry'],
  },
  steps: { required: { id: 'id' }, optional: {}, parents: STEPS_PARENTS },
  step: { required: { id: 'id', label: 'string', targets: 'ids' }, optional: {}, parents: ['steps'] },
  mermaid: { required: { ...VISUAL }, optional: {} },
  extension: { required: { ...VISUAL, use: 'string' }, optional: {}, open: true },
  part: { required: { id: 'id', label: 'string' }, optional: {}, parents: ['extension'], open: true },
  annotation: {
    required: { id: 'id', label: 'string' }, optional: { lines: 'lines', region: 'region', side: 'string' },
    enums: { side: ['before', 'after'] }, parents: ['annotated'],
  },
  // `aliases` adds plurals and short forms to the term auto-link; `auto=false`
  // turns the auto-link off for this definition (docs/IMPROVEMENTS.md §13.3).
  definition: { required: { id: 'id', term: 'string' }, optional: { aliases: 'strings', auto: 'boolean' } },
  detail: { required: { id: 'id', label: 'string' }, optional: { summary: 'string' }, parents: DETAIL_PARENTS, topLevel: true },
  source: {
    required: { id: 'id', kind: 'string', title: 'string' },
    optional: {
      language: 'string', asset: 'string', excerptSha256: 'string', repository: 'string', commit: 'string', baseCommit: 'string',
      file: 'string', start: 'integer', end: 'integer', symbol: 'string', url: 'string', capturedAt: 'string',
      originFileSha256: 'string', availability: 'string',
    },
    enums: { kind: ['git', 'working-tree', 'web', 'file', 'supplied', 'example'], availability: ['captured', 'link-only'] },
  },
};

/** The attribute rules for each tag; `catalogue show --part schema` and the guide tests read them. */
export const TAG_SPECS: Readonly<Record<string, Readonly<TagSpec>>> = SPECS;

const INLINE_SPECS: Record<string, { required: Record<string, AttrType>; optional: Record<string, AttrType>; refKind?: string }> = {
  term: { required: { ref: 'id' }, optional: {}, refKind: 'definition' },
  cite: { required: { ref: 'id' }, optional: { note: 'string' }, refKind: 'source' },
  'detail-link': { required: { ref: 'id' }, optional: {}, refKind: 'detail' },
  focus: { required: { targets: 'ids' }, optional: {} },
};

// Additional origin metadata required per source kind (§8.1).
const SOURCE_KIND_REQUIRES: Record<string, readonly string[]> = {
  git: ['repository', 'commit', 'file', 'start', 'end'],
  'working-tree': ['file', 'capturedAt'],
  web: ['url', 'capturedAt'],
  file: ['file', 'capturedAt'],
  supplied: ['capturedAt'],
  example: [],
};

const ENTITY_CHILDREN: Record<string, readonly string[]> = {
  architecture: ['node'], state: ['state'], cause: ['factor'], plan: ['task'],
};
/**
 * The part tags that take an `evidence` attribute (docs/IMPROVEMENTS.md §4.4),
 * with a measure `reading` and a tree `entry` (§14.4, §14.5).
 */
export const PART_EVIDENCE_TAGS: ReadonlySet<string> = new Set(['node', 'event', 'state', 'stage', 'task', 'cell', 'reading', 'entry']);
/** The relationship tags that take a `quantity` and its `evidence` (docs/IMPROVEMENTS.md §14.9). */
export const QUANTITY_TAGS: ReadonlySet<string> = new Set(['edge', 'conversion', 'dependency']);
const GRAPH_WARN_NODES = 25;
/** The tags in a figure that have no drawn or listed instance, so a step cannot mark them (§14.1). */
const UNMARKED_TAGS: ReadonlySet<string> = new Set(['detail']);
const GRAPH_MAX_NODES = 200;
const GRAPH_MAX_EDGES = 400;
const RASTER = /\.(png|jpe?g|webp)$/i;

function typeOk(value: unknown, type: AttrType): boolean {
  switch (type) {
    case 'string':
    case 'id':
      return typeof value === 'string' && value !== '';
    case 'boolean':
      return typeof value === 'boolean';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'ids':
      return Array.isArray(value) && value.every((v) => typeof v === 'string' && v !== '');
    case 'strings':
      return Array.isArray(value) && value.every((v) => typeof v === 'string' && v.trim() !== '');
    case 'stringOrStrings':
      return typeof value === 'string' || (Array.isArray(value) && value.every((v) => typeof v === 'string'));
    case 'stringOrNumber':
      return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
    case 'lines':
      return Array.isArray(value) && value.length === 2 && value.every((v) => typeof v === 'number' && Number.isInteger(v) && v >= 1);
    case 'region':
      return Array.isArray(value) && value.length === 4 && value.every((v) => typeof v === 'number' && v >= 0 && v <= 1);
    case 'date':
      return typeof value === 'string' && isIsoDate(value);
  }
}

/** The expected form of an attribute type, for a diagnostic. */
function typeText(type: AttrType): string {
  switch (type) {
    case 'date': return 'an ISO 8601 date such as 2026-10-03';
    case 'ids': return 'a list of IDs, such as ["src_a"]';
    default: return type;
  }
}

function ids(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  return [];
}

/**
 * The nodes that a map shows when it opens: each node outside every
 * collapsed group, and one box for each outermost collapsed group
 * (docs/IMPROVEMENTS.md §14.9, phase 6b review F19). Without JavaScript and
 * in print the map shows every node; the count is for the first view.
 */
export function visibleNodeCount(nodes: readonly ParsedTarget[], groups: readonly ParsedTarget[]): number {
  const parent = new Map(groups.map((g) => [g.id, typeof g.attributes['parent'] === 'string' ? (g.attributes['parent'] as string) : undefined]));
  const collapsed = new Set(groups.filter((g) => g.attributes['collapsed'] === true).map((g) => g.id));
  // The outermost collapsed group around a group, or undefined.
  const fold = (group: string | undefined): string | undefined => {
    let found: string | undefined;
    for (let g = group, i = 0; g !== undefined && i < 1000; g = parent.get(g), i++) if (collapsed.has(g)) found = g;
    return found;
  };
  const boxes = new Set<string>();
  let count = 0;
  for (const n of nodes) {
    const f = fold(typeof n.attributes['group'] === 'string' ? (n.attributes['group'] as string) : undefined);
    if (f === undefined) count++;
    else boxes.add(f);
  }
  return count + boxes.size;
}

/** True when the directed graph given by `edges` (from -> to) has a cycle. */
function findCycle(nodes: Iterable<string>, edges: Array<[string, string]>): string[] | undefined {
  const out = new Map<string, string[]>();
  for (const [from, to] of edges) out.set(from, [...(out.get(from) ?? []), to]);
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];
  const visit = (n: string): string[] | undefined => {
    if (state.get(n) === 'done') return undefined;
    if (state.get(n) === 'visiting') return [...stack.slice(stack.indexOf(n)), n];
    state.set(n, 'visiting');
    stack.push(n);
    for (const next of out.get(n) ?? []) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(n, 'done');
    return undefined;
  };
  for (const n of nodes) {
    const cycle = visit(n);
    if (cycle) return cycle;
  }
  return undefined;
}

export function validateDocument(parsed: ParsedSource, model: TargetModel, assets: ReadonlyMap<string, Uint8Array> = new Map()): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (model.targets.size === 0 || parsed.diagnostics.some((d) => d.severity === 'error')) return diagnostics;
  const byId = new Map<TargetId, ParsedTarget>(parsed.targets.map((t) => [t.id, t]));
  const tagOf = (id: string | undefined) => (id === undefined ? undefined : byId.get(id)?.tagName);
  // The top-level target (the figure) that holds a target.
  const rootOf = (t: ParsedTarget): string => {
    let current = t;
    while (current.parentId && byId.has(current.parentId)) current = byId.get(current.parentId)!;
    return current.id;
  };

  const report = (code: string, message: string, t: ParsedTarget | undefined, severity: 'error' | 'warning' = 'error', line?: number) => {
    const d: Diagnostic = { code, severity, message, path: parsed.path };
    const start = line ?? t?.startLine;
    if (start !== undefined) d.startLine = start;
    if (t) d.targetId = t.id;
    diagnostics.push(d);
  };

  // A referenced ID must name a target of the expected tag, inside `scope` when given.
  const expectRef = (t: ParsedTarget, attr: string, wanted: readonly string[], scope?: string) => {
    for (const id of ids(t.attributes[attr])) {
      const ref = byId.get(id);
      if (!ref) continue; // reported as E_REF_BROKEN by targets.ts
      if (!ref.tagName || !wanted.includes(ref.tagName)) {
        report('E_REF_BROKEN', `${t.tagName} ${t.id}: \`${attr}\` must name a ${wanted.join(' or ')}, but ${id} is a ${ref.tagName ?? ref.kind}`, t);
      } else if (scope !== undefined && ref.parentId !== scope) {
        report('E_REF_BROKEN', `${t.tagName} ${t.id}: \`${attr}\` names ${id}, which is not in the same figure (${scope})`, t);
      }
    }
  };

  // Pass 1: attributes, types, enums, and placement of every tag target.
  for (const t of parsed.targets) {
    if (t.origin !== 'tag' || !t.tagName) continue;
    const spec = SPECS[t.tagName];
    if (!spec) continue;
    const a = t.attributes;
    for (const [name, type] of Object.entries(spec.required)) {
      if (name === 'id') continue;
      if (a[name] === undefined) report('E_SYNTAX', `${t.tagName} ${t.id} is missing required attribute \`${name}\``, t);
      else if (!typeOk(a[name], type)) report('E_SYNTAX', `${t.tagName} ${t.id}: \`${name}\` must be ${typeText(type)}`, t);
    }
    for (const [name, value] of Object.entries(a)) {
      if (name === 'id' || name in spec.required) continue;
      const type = spec.optional[name];
      if (type === undefined && spec.open) {
        if (!['string', 'number', 'boolean'].includes(typeof value)) report('E_SYNTAX', `${t.tagName} ${t.id}: extension attribute \`${name}\` must be a string, number, or boolean`, t);
        continue;
      }
      if (type === undefined) report('E_SYNTAX', `${t.tagName} ${t.id}: unknown attribute \`${name}\``, t);
      else if (!typeOk(value, type)) report('E_SYNTAX', `${t.tagName} ${t.id}: \`${name}\` must be ${typeText(type)}`, t);
    }
    for (const [name, allowed] of Object.entries(spec.enums ?? {})) {
      const value = a[name];
      if (typeof value === 'string' && !allowed.includes(value)) {
        report('E_SYNTAX', `${t.tagName} ${t.id}: \`${name}\` must be one of ${allowed.join(', ')}, not "${value}"`, t);
      }
    }
    // Labels are required unless inherited through `entity` (§9.3, §9.4).
    if ((t.tagName === 'node' || t.tagName === 'actor') && a['label'] === undefined && a['entity'] === undefined) {
      report('E_SYNTAX', `${t.tagName} ${t.id} needs \`label\` or \`entity\``, t);
    }
    const parentTag = tagOf(t.parentId);
    if (spec.parents === undefined) {
      if (t.parentId !== undefined) report('E_SYNTAX', `${t.tagName} ${t.id} must be at the top level, not inside ${parentTag} ${t.parentId}`, t);
    } else if (parentTag === undefined ? !spec.topLevel : !spec.parents.includes(parentTag)) {
      const where = spec.parents === STEPS_PARENTS ? `a figure (${STEPS_PARENTS.join(', ')})` : spec.parents.length > 3 ? 'a component or entity' : spec.parents.join(' or ');
      report('E_SYNTAX', `${t.tagName} ${t.id} must be inside ${where}`, t);
    } else if (parentTag === 'graph' && spec.graphModes) {
      const mode = byId.get(t.parentId!)?.attributes['mode'];
      if (typeof mode === 'string' && !spec.graphModes.includes(mode)) {
        report('E_SYNTAX', `${t.tagName} ${t.id} is not allowed in graph mode "${mode}" (allowed in ${spec.graphModes.join(', ')})`, t);
      }
    }
  }

  // Extension components (§14): at least one part; at most the graph node cap.
  for (const t of parsed.targets) {
    if (t.tagName !== 'extension') continue;
    const parts = parsed.targets.filter((p) => p.parentId === t.id && p.tagName === 'part').length;
    if (parts === 0) report('E_SYNTAX', `extension ${t.id} needs at least one part`, t);
    if (parts > GRAPH_MAX_NODES) report('E_LIMIT', `extension ${t.id} has ${parts} parts; the limit is ${GRAPH_MAX_NODES}`, t);
    if (typeof t.attributes['use'] === 'string' && !/^[a-z][a-z0-9-]{0,63}$/.test(t.attributes['use'] as string)) {
      report('E_SYNTAX', `extension ${t.id}: \`use\` must be an extension name such as timeline-lanes`, t);
    }
  }

  // Mermaid figures (§9.12): an optional interpretation, then exactly one ```mermaid fence.
  for (const t of parsed.targets) {
    if (t.tagName !== 'mermaid') continue;
    const node = model.nodes.get(t.id);
    if (!node) continue;
    const fences = node.children.filter((c) => c.type === 'fence');
    if (fences.length !== 1) {
      report('E_SYNTAX', `mermaid ${t.id} must contain exactly one \`\`\`mermaid fence, not ${fences.length}`, t);
    } else if (fences[0]!.attributes['language'] !== 'mermaid') {
      report('E_SYNTAX', `mermaid ${t.id}: the fence language must be \`mermaid\``, t);
    }
    for (const child of node.children) {
      if (child.type !== 'fence' && child.type !== 'paragraph') {
        report('E_SYNTAX', `mermaid ${t.id} may contain only interpretation paragraphs and the fence, not ${child.type === 'tag' ? `a ${child.tag} tag` : `a ${child.type}`}`, t);
      }
    }
  }

  // Inline tags are not targets; walk the AST for them.
  const walk = (n: MNode) => {
    if (n.type === 'tag' && n.tag && INLINE_SPECS[n.tag]) {
      const spec = INLINE_SPECS[n.tag]!;
      const line = n.lines[0] !== undefined ? n.lines[0] + 1 : undefined;
      for (const [name, type] of Object.entries(spec.required)) {
        if (!typeOk(n.attributes[name], type)) report('E_SYNTAX', `inline ${n.tag} needs \`${name}\` (${type})`, undefined, 'error', line);
      }
      for (const name of Object.keys(n.attributes)) {
        if (!(name in spec.required) && !(name in spec.optional)) report('E_SYNTAX', `inline ${n.tag}: unknown attribute \`${name}\``, undefined, 'error', line);
      }
      const ref = typeof n.attributes['ref'] === 'string' ? byId.get(n.attributes['ref']) : undefined;
      if (spec.refKind && ref && ref.tagName !== spec.refKind) {
        report('E_REF_BROKEN', `inline ${n.tag} must refer to a ${spec.refKind}, but ${ref.id} is a ${ref.tagName ?? ref.kind}`, undefined, 'error', line);
      }
    }
    for (const child of n.children ?? []) walk(child);
  };
  if (parsed.ast) walk(parsed.ast as MNode);

  // `evidence` on a part names sources (docs/IMPROVEMENTS.md §4.4). A
  // missing ID is E_REF_BROKEN from targets.ts; a wrong kind is reported here.
  for (const t of parsed.targets) {
    if (t.tagName && PART_EVIDENCE_TAGS.has(t.tagName)) expectRef(t, 'evidence', ['source']);
    // The sources of a relationship `quantity` (docs/IMPROVEMENTS.md §14.9).
    if (t.tagName && QUANTITY_TAGS.has(t.tagName)) expectRef(t, 'evidence', ['source']);
  }

  // Pass 2: family rules.
  const children = (id: string, tag?: string) => parsed.targets.filter((c) => c.parentId === id && (tag === undefined || c.tagName === tag));
  for (const figure of parsed.targets) {
    const tag = figure.tagName;
    if (tag === 'graph') {
      const mode = String(figure.attributes['mode']);
      const entityTag = ENTITY_CHILDREN[mode]?.[0];
      const entities = entityTag ? children(figure.id, entityTag) : [];
      const links = children(figure.id).filter((c) => ['edge', 'transition', 'causal-link', 'dependency'].includes(c.tagName ?? ''));
      // A collapsed group counts as one node: the map opens folded (phase 6b review F19).
      const shown = visibleNodeCount(entities, children(figure.id, 'group'));
      if (entities.length > GRAPH_MAX_NODES || links.length > GRAPH_MAX_EDGES) {
        report('E_LAYOUT_LIMIT', `graph ${figure.id} has ${entities.length} nodes and ${links.length} edges; the cap is ${GRAPH_MAX_NODES}/${GRAPH_MAX_EDGES}`, figure);
      } else if (shown > GRAPH_WARN_NODES) {
        report('W_VISUAL_DENSITY', `graph ${figure.id} shows ${shown} nodes${shown !== entities.length ? ` (a collapsed group counts as one)` : ''}; consider splitting it (warning above ${GRAPH_WARN_NODES})`, figure, 'warning');
      }
      if (mode === 'architecture') {
        for (const n of children(figure.id, 'node')) expectRef(n, 'group', ['group'], figure.id);
        const groups = children(figure.id, 'group');
        for (const g of groups) expectRef(g, 'parent', ['group'], figure.id);
        const cycle = findCycle(groups.map((g) => g.id), groups.flatMap((g) => ids(g.attributes['parent']).map((p): [string, string] => [g.id, p])));
        if (cycle) report('E_SEMANTIC', `graph ${figure.id}: group nesting is cyclic (${cycle.join(' -> ')})`, figure);
        for (const e of children(figure.id, 'edge')) {
          expectRef(e, 'from', ['node'], figure.id);
          expectRef(e, 'to', ['node'], figure.id);
        }
      } else if (mode === 'state') {
        const states = children(figure.id, 'state');
        const initial = states.filter((s) => s.attributes['initial'] === true);
        if (initial.length > 1) report('E_SEMANTIC', `graph ${figure.id} has ${initial.length} initial states (${initial.map((s) => s.id).join(', ')}); use separate figures for independent machines`, figure);
        const transitions = children(figure.id, 'transition');
        for (const tr of transitions) {
          expectRef(tr, 'from', ['state'], figure.id);
          expectRef(tr, 'to', ['state'], figure.id);
          const from = byId.get(String(tr.attributes['from']));
          if (from?.attributes['terminal'] === true) report('E_SEMANTIC', `transition ${tr.id} leaves terminal state ${from.id}`, tr);
        }
      } else if (mode === 'cause') {
        // A factor names a source or an observation, as a causal link does (§14.6).
        for (const f of children(figure.id, 'factor')) {
          expectRef(f, 'evidence', ['source', 'event']);
          for (const id of ids(f.attributes['evidence'])) {
            const ref = byId.get(id);
            if (ref?.tagName === 'event' && ref.attributes['kind'] !== 'observation') {
              report('E_REF_BROKEN', `factor ${f.id}: \`evidence\` names event ${id}, which is not an observation; name a source or an event with kind="observation"`, f);
            }
          }
        }
        for (const link of children(figure.id, 'causal-link')) {
          expectRef(link, 'from', ['factor'], figure.id);
          expectRef(link, 'to', ['factor'], figure.id);
          // A causal link names a source, or an observation event of a trace
          // (docs/IMPROVEMENTS.md §14.6): the log line that supports it.
          expectRef(link, 'evidence', ['source', 'event']);
          for (const id of ids(link.attributes['evidence'])) {
            const ref = byId.get(id);
            if (ref?.tagName === 'event' && ref.attributes['kind'] !== 'observation') {
              report('E_REF_BROKEN', `causal-link ${link.id}: \`evidence\` names event ${id}, which is not an observation; name a source or an event with kind="observation"`, link);
            }
          }
        }
      } else if (mode === 'plan') {
        const deps = children(figure.id, 'dependency');
        for (const d of deps) {
          expectRef(d, 'from', ['task'], figure.id);
          expectRef(d, 'to', ['task'], figure.id);
        }
        const cycle = findCycle(children(figure.id, 'task').map((t) => t.id), deps.map((d): [string, string] => [String(d.attributes['from']), String(d.attributes['to'])]));
        if (cycle) report('E_SEMANTIC', `graph ${figure.id}: task dependencies are cyclic (${cycle.join(' -> ')})`, figure);
      }
    } else if (tag === 'trace') {
      const scale = figure.attributes['scale'] ?? 'ordinal';
      const events = children(figure.id, 'event');
      const branches = children(figure.id, 'branch');
      // One implicit lane: only a time-scaled trace with no actors lets an
      // event leave out `actor` (docs/IMPROVEMENTS.md §14.6).
      const implicitLane = scale === 'time' && children(figure.id, 'actor').length === 0;
      for (const e of events) {
        if (e.attributes['actor'] === undefined && !implicitLane) {
          report('E_SYNTAX', `event ${e.id} is missing required attribute \`actor\`; only a trace with scale="time" and no actors has one implicit lane`, e);
        }
        expectRef(e, 'actor', ['actor'], figure.id);
        expectRef(e, 'to', ['actor'], figure.id);
        expectRef(e, 'branch', ['branch'], figure.id);
        expectRef(e, 'after', ['event'], figure.id);
        if (scale === 'ordinal') {
          for (const name of ['time', 'duration']) {
            if (e.attributes[name] !== undefined) report('E_SEMANTIC', `event ${e.id}: an ordinal trace cannot state \`${name}\`; ordering is not duration`, e);
          }
          // An observation is a record of what was seen and when (§14.6).
          if (e.attributes['kind'] === 'observation') report('E_SEMANTIC', `event ${e.id}: an observation needs a time; put it in a trace with scale="time" and give it a \`time\``, e);
        } else if (typeof e.attributes['time'] !== 'number') {
          report('E_SEMANTIC', `event ${e.id}: a time-scaled trace needs a numeric \`time\``, e);
        } else {
          for (const id of ids(e.attributes['after'])) {
            const prerequisite = events.find((p) => p.id === id);
            const time = prerequisite?.attributes['time'];
            if (typeof time === 'number' && e.attributes['time'] < time) {
              report('E_SEMANTIC', `event ${e.id}: \`time\` precedes its \`after\` prerequisite ${id}`, e);
            }
          }
        }
      }
      if (scale === 'time' && typeof figure.attributes['timeUnit'] !== 'string') {
        report('E_SEMANTIC', `trace ${figure.id}: scale="time" needs a \`timeUnit\``, figure);
      }
      for (const b of branches) expectRef(b, 'exclusiveWith', ['branch'], figure.id);
      const cycle = findCycle(events.map((e) => e.id), events.flatMap((e) => ids(e.attributes['after']).map((p): [string, string] => [p, e.id])));
      if (cycle) report('E_SEMANTIC', `trace ${figure.id}: \`after\` prerequisites are cyclic (${cycle.join(' -> ')}); show loops as a finite iteration or a state figure`, figure);
      // `after` means all prerequisites occur, so they cannot come from branches that exclude each other.
      const exclusive = new Set<string>();
      for (const b of branches) for (const other of ids(b.attributes['exclusiveWith'])) {
        exclusive.add(`${b.id}|${other}`);
        exclusive.add(`${other}|${b.id}`);
      }
      const branchOf = (id: string) => byId.get(id)?.attributes['branch'];
      for (const e of events) {
        const prereqBranches = ids(e.attributes['after']).map(branchOf).filter((b): b is string => typeof b === 'string');
        for (let i = 0; i < prereqBranches.length; i++) {
          for (let j = i + 1; j < prereqBranches.length; j++) {
            if (exclusive.has(`${prereqBranches[i]}|${prereqBranches[j]}`)) {
              report('E_SEMANTIC', `event ${e.id}: \`after\` joins exclusive branches ${prereqBranches[i]} and ${prereqBranches[j]}; v1 cannot express that join`, e);
            }
          }
        }
      }
    } else if (tag === 'domain') {
      // Domain model (docs/IMPROVEMENTS.md §5.3): the graph caps, relation
      // endpoints in the same figure, and one owner for each definition.
      const concepts = children(figure.id, 'concept');
      const relations = children(figure.id, 'relation');
      if (concepts.length > GRAPH_MAX_NODES || relations.length > GRAPH_MAX_EDGES) {
        report('E_LAYOUT_LIMIT', `domain ${figure.id} has ${concepts.length} concepts and ${relations.length} relations; the cap is ${GRAPH_MAX_NODES}/${GRAPH_MAX_EDGES}`, figure);
      } else if (concepts.length > GRAPH_WARN_NODES) {
        report('W_VISUAL_DENSITY', `domain ${figure.id} shows ${concepts.length} concepts; consider splitting it (warning above ${GRAPH_WARN_NODES})`, figure, 'warning');
      }
      for (const r of relations) {
        expectRef(r, 'from', ['concept'], figure.id);
        expectRef(r, 'to', ['concept'], figure.id);
      }
    } else if (tag === 'concept') {
      expectRef(figure, 'definition', ['definition']);
      const def = figure.attributes['definition'];
      const owner = typeof def === 'string' ? parsed.targets.find((c) => c.tagName === 'concept' && c.attributes['definition'] === def) : undefined;
      if (owner && owner.id !== figure.id) {
        report('E_SEMANTIC', `concept ${figure.id} names definition ${String(def)}, which concept ${owner.id} already owns; one definition has one owner`, figure);
      }
    } else if (tag === 'transform') {
      for (const c of children(figure.id, 'conversion')) {
        expectRef(c, 'from', ['stage'], figure.id);
        expectRef(c, 'to', ['stage'], figure.id);
      }
    } else if (tag === 'compare') {
      const seen = new Map<string, string>();
      for (const cell of children(figure.id, 'cell')) {
        expectRef(cell, 'option', ['option'], figure.id);
        expectRef(cell, 'criterion', ['criterion'], figure.id);
        const key = `${String(cell.attributes['option'])}|${String(cell.attributes['criterion'])}`;
        const previous = seen.get(key);
        if (previous) report('E_SEMANTIC', `cells ${previous} and ${cell.id} both describe option ${String(cell.attributes['option'])} for criterion ${String(cell.attributes['criterion'])}`, cell);
        else seen.set(key, cell.id);
      }
    } else if (tag === 'annotated') {
      expectRef(figure, 'source', ['source']);
      // `before` names a second captured text source; the page shows a line
      // diff of the two (docs/IMPROVEMENTS.md §14.7).
      expectRef(figure, 'before', ['source']);
      const sides: Array<'after' | 'before'> = figure.attributes['before'] === undefined ? ['after'] : ['after', 'before'];
      const range = new Map<'after' | 'before', { id: string; excerpt: string | undefined; asset: string | undefined; start: number; end: number }>();
      let usable = true;
      for (const side of sides) {
        const source = byId.get(String(figure.attributes[side === 'after' ? 'source' : 'before']));
        if (source?.tagName !== 'source') {
          usable = false;
          continue;
        }
        if ((source.attributes['availability'] ?? 'captured') === 'link-only') {
          report('E_SEMANTIC', `annotated ${figure.id} uses link-only source ${source.id}; annotations need captured content`, figure);
          usable = false;
          continue;
        }
        const excerpt = fenceText(model, source.id);
        const asset = typeof source.attributes['asset'] === 'string' ? source.attributes['asset'] : undefined;
        const start = typeof source.attributes['start'] === 'number' ? source.attributes['start'] : 1;
        const rows = excerpt === undefined ? 0 : excerpt.replace(/\n$/, '').split('\n').length;
        const end = typeof source.attributes['end'] === 'number' ? source.attributes['end'] : start + rows - 1;
        if (sides.length === 2 && excerpt === undefined) {
          report('E_SEMANTIC', `annotated ${figure.id}: a before-and-after diff needs two captured text sources, but ${source.id} has no text excerpt`, figure);
          usable = false;
        } else if (sides.length === 2 && excerptLines(excerpt!).length > DIFF_MAX_LINES) {
          report('E_LIMIT', `annotated ${figure.id}: the ${side} side has ${excerptLines(excerpt!).length} lines; the limit for a before-and-after diff is ${DIFF_MAX_LINES}; capture the smallest ranges that show the change`, figure);
          usable = false;
        } else if (sides.length === 2 && rows > DIFF_WARN_LINES) {
          report('W_VISUAL_DENSITY', `annotated ${figure.id}: the ${side} side has ${rows} lines; capture the smallest ranges that show the change (warning above ${DIFF_WARN_LINES})`, figure, 'warning');
        }
        range.set(side, { id: source.id, excerpt, asset, start, end });
      }
      if (!usable) continue;
      for (const ann of children(figure.id, 'annotation')) {
        const lines = ann.attributes['lines'];
        const region = ann.attributes['region'];
        const side = ann.attributes['side'] === 'before' ? 'before' : 'after';
        const own = range.get(side);
        if (!own) {
          report('E_SEMANTIC', `annotation ${ann.id}: side="before" needs a \`before\` source on annotated ${figure.id}`, ann);
          continue;
        }
        if ((lines === undefined) === (region === undefined)) {
          report('E_SEMANTIC', `annotation ${ann.id} needs exactly one of \`lines\` or \`region\``, ann);
          continue;
        }
        if (lines !== undefined) {
          if (own.excerpt === undefined) report('E_SEMANTIC', `annotation ${ann.id}: \`lines\` needs a captured text source, but ${own.id} has none`, ann);
          else if (typeOk(lines, 'lines')) {
            const [a, b] = lines as [number, number];
            if (a > b || a < own.start || b > own.end) report('E_SEMANTIC', `annotation ${ann.id}: lines ${a}-${b} are outside ${side === 'before' ? 'before ' : ''}source lines ${own.start}-${own.end}`, ann);
          }
        }
        if (region !== undefined && (own.asset === undefined || !RASTER.test(own.asset))) {
          report('E_SEMANTIC', `annotation ${ann.id}: \`region\` needs a captured raster image asset`, ann);
        }
      }
    } else if (tag === 'measure') {
      // A measure (docs/IMPROVEMENTS.md §14.4): 1 to 12 readings in one unit,
      // each a bar from zero.
      const readings = children(figure.id, 'reading');
      if (readings.length === 0) report('E_SYNTAX', `measure ${figure.id} needs at least one reading`, figure);
      if (readings.length > MEASURE_MAX_READINGS) report('E_LIMIT', `measure ${figure.id} has ${readings.length} readings; the limit is ${MEASURE_MAX_READINGS}; a longer series is a table`, figure);
      for (const r of readings) {
        const value = r.attributes['value'];
        if (typeof value === 'number' && value < 0) report('E_SEMANTIC', `reading ${r.id}: a bar starts at zero, so \`value\` must be 0 or more, not ${value}`, r);
      }
    } else if (tag === 'tree') {
      // A code map (docs/IMPROVEMENTS.md §14.5): the entries the reader needs.
      const entries = parsed.targets.filter((t) => t.tagName === 'entry' && rootOf(t) === figure.id);
      if (children(figure.id, 'entry').length === 0) report('E_SYNTAX', `tree ${figure.id} needs at least one entry`, figure);
      if (entries.length > TREE_WARN_ENTRIES) {
        report('W_VISUAL_DENSITY', `tree ${figure.id} shows ${entries.length} entries; show the entries the reader needs, not every folder (warning above ${TREE_WARN_ENTRIES})`, figure, 'warning');
      }
    } else if (tag === 'steps') {
      // A walkthrough (docs/IMPROVEMENTS.md §14.1): the steps name parts of
      // the figure that holds them. One walkthrough for each figure.
      const owner = figure.parentId;
      const steps = children(figure.id, 'step');
      if (steps.length === 0) report('E_SYNTAX', `steps ${figure.id} needs at least one step`, figure);
      if (steps.length > STEPS_WARN) {
        report('W_VISUAL_DENSITY', `steps ${figure.id} has ${steps.length} steps; split the figure by question (warning above ${STEPS_WARN})`, figure, 'warning');
      }
      if (owner !== undefined) {
        const first = children(owner, 'steps')[0];
        if (first && first.id !== figure.id) report('E_SEMANTIC', `steps ${figure.id}: figure ${owner} already has the walkthrough ${first.id}; one figure has one \`steps\``, figure);
        for (const s of steps) {
          for (const id of ids(s.attributes['targets'])) {
            const ref = byId.get(id);
            if (!ref) continue; // E_REF_BROKEN from targets.ts
            if (ref.id === owner || ref.tagName === 'steps' || ref.tagName === 'step' || rootOf(ref) !== owner) {
              report('E_REF_BROKEN', `step ${s.id}: \`targets\` names ${id}, which is not a part of figure ${owner}`, s);
            } else if (ref.tagName !== undefined && UNMARKED_TAGS.has(ref.tagName)) {
              // A detail is not drawn, so a step about it marks nothing (phase 6a review C10).
              report('E_REF_BROKEN', `step ${s.id}: \`targets\` names ${ref.tagName} ${id}, which the figure does not draw; name a drawn part`, s);
            }
          }
        }
      }
    } else if (tag === 'note' || tag === 'self-check') {
      // A note is its body, and a self-check body is its answer (phase 6a review C9).
      const node = model.nodes.get(figure.id);
      if (node && !hasText(node)) {
        report('E_SYNTAX', tag === 'note'
          ? `note ${figure.id} has no body; write the limit, the assumption, or the warning in it`
          : `self-check ${figure.id} has no answer; write the answer, with its citation, in the body`, figure);
      }
    } else if (tag === 'source') {
      validateSource(figure, model, assets, report);
    }
  }
  validateRetirement(parsed, model, report);
  return diagnostics;
}

/**
 * §11.7: no ID is both live and retired; a replacement names a live target;
 * no replacement names a retired target, so chains and cycles cannot form.
 */
function validateRetirement(
  parsed: ParsedSource,
  model: TargetModel,
  report: (code: string, message: string, t: ParsedTarget | undefined, severity?: 'error' | 'warning', line?: number) => void,
): void {
  const raw = parsed.frontmatter['retiredTargets'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return; // shape errors come from the schema
  const retired = raw as Record<string, { replacement?: unknown }>;
  for (const [id, entry] of Object.entries(retired)) {
    if (model.targets.has(id)) report('E_SEMANTIC', `${id} is both live and retired (§11.7); remove the retirement entry or the target`, undefined, 'error', 1);
    const replacement = entry && typeof entry === 'object' ? entry.replacement : undefined;
    if (typeof replacement !== 'string') continue;
    if (Object.hasOwn(retired, replacement)) {
      report('E_SEMANTIC', `retired ${id} names ${replacement} as its replacement, but ${replacement} is also retired; replacement chains are not allowed (§11.7)`, undefined, 'error', 1);
    } else if (!model.targets.has(replacement)) {
      report('E_SEMANTIC', `retired ${id} names ${replacement} as its replacement, but ${replacement} is not a live target (§11.7)`, undefined, 'error', 1);
    }
  }
}

/** True when a node holds text: words, code, a fence, an image, or a citation. */
function hasText(node: MNode): boolean {
  if (node.type === 'text' || node.type === 'code') return String(node.attributes['content'] ?? '').trim() !== '';
  if (node.type === 'fence' || node.type === 'image' || (node.type === 'tag' && node.tag === 'cite')) return true;
  return node.children.some(hasText);
}

/** The fenced body of a source tag, or undefined when it has none. */
function fenceText(model: TargetModel, id: string): string | undefined {
  const node = model.nodes.get(id);
  const fence = node?.children.find((c) => c.type === 'fence');
  return fence ? String(fence.attributes['content'] ?? '') : undefined;
}

function validateSource(
  t: ParsedTarget,
  model: TargetModel,
  assets: ReadonlyMap<string, Uint8Array>,
  report: (code: string, message: string, t: ParsedTarget | undefined, severity?: 'error' | 'warning') => void,
): void {
  const a = t.attributes;
  if (typeof a['repository'] === 'string') {
    // One rule for captured and hand-written sources (provenance/identity.ts).
    const problem = identityProblem(a['repository']);
    if (problem) report('E_UNSAFE_CONTENT', `source ${t.id}: \`repository\` ${problem}; record the remote URL without credentials, query, or fragment, or a label (§8.2)`, t);
  }
  // §8.1: a recorded commit is a resolved full object ID, never a moving ref.
  for (const key of ['commit', 'baseCommit']) {
    const value = a[key];
    if (typeof value === 'string' && !/^([0-9a-f]{40}|[0-9a-f]{64})$/.test(value)) {
      report('E_SEMANTIC', `source ${t.id}: \`${key}\` must be a full commit ID (40 or 64 lowercase hex characters), not ${JSON.stringify(value)}`, t);
    }
  }
  const node = model.nodes.get(t.id);
  const fences = node?.children.filter((c) => c.type === 'fence') ?? [];
  const asset = typeof a['asset'] === 'string' ? a['asset'] : undefined;
  const availability = a['availability'] ?? 'captured';
  const kind = String(a['kind']);
  for (const required of SOURCE_KIND_REQUIRES[kind] ?? []) {
    if (a[required] === undefined) report('E_SYNTAX', `source ${t.id} of kind "${kind}" needs \`${required}\` (§8.1)`, t);
  }
  if (availability === 'link-only') {
    if (fences.length > 0 || asset !== undefined) report('E_SEMANTIC', `link-only source ${t.id} must not have a captured body or asset`, t);
    if (a['excerptSha256'] !== undefined) report('E_SEMANTIC', `link-only source ${t.id} must not have an excerptSha256`, t);
    if (typeof a['url'] !== 'string' || !/^https?:\/\//.test(a['url'])) report('E_SEMANTIC', `link-only source ${t.id} needs a safe http(s) \`url\``, t);
    return;
  }
  if ((fences.length === 1) === (asset !== undefined) || fences.length > 1) {
    report('E_SEMANTIC', `source ${t.id} needs exactly one captured body: one fenced block or an \`asset\`, not both`, t);
    return;
  }
  const expected = a['excerptSha256'];
  if (typeof expected !== 'string') {
    report('E_EVIDENCE_HASH', `captured source ${t.id} has no excerptSha256; capture it with \`visser capture\``, t);
    return;
  }
  let actual: string | undefined;
  if (fences.length === 1) {
    const text = String(fences[0]!.attributes['content'] ?? '');
    actual = sha256Hex(normalizeText(new TextEncoder().encode(text)));
    const start = a['start'];
    const end = a['end'];
    if (typeof start === 'number' && typeof end === 'number') {
      const rows = text.replace(/\n$/, '').split('\n').length;
      if (start < 1 || end < start || end - start + 1 !== rows) {
        report('E_SEMANTIC', `source ${t.id}: start ${start} and end ${end} do not match the ${rows}-line excerpt`, t);
      }
    }
  } else if (asset !== undefined) {
    const bytes = assets.get(asset);
    if (bytes !== undefined) actual = sha256Hex(bytes);
  }
  if (actual !== undefined && actual !== expected) {
    report('E_EVIDENCE_HASH', `source ${t.id}: captured content does not match excerptSha256`, t);
  }
}
