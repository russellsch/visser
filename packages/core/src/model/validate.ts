// Semantic validation of catalogue components and primitives (§6.6, §8.1,
// §8.6, §9.3–9.10). The syntax adapter has already checked tag names, IDs, and
// literal limits; this pass checks attributes, placement, references by kind,
// and the family rules. Existence of referenced IDs is checked in targets.ts
// (E_REF_BROKEN); this pass reports only kind and scope errors for IDs that exist.
import type { Diagnostic, ParsedSource, ParsedTarget, TargetId } from '../types.ts';
import { normalizeText, sha256Hex } from './hash.ts';
import type { MNode, TargetModel } from './targets.ts';

type AttrType = 'string' | 'boolean' | 'number' | 'integer' | 'id' | 'ids' | 'stringOrStrings' | 'stringOrNumber' | 'lines' | 'region';

type TagSpec = {
  required: Record<string, AttrType>;
  optional: Record<string, AttrType>;
  enums?: Record<string, readonly string[]>;
  parents?: readonly string[]; // allowed parent tags; undefined = top level only
  topLevel?: boolean; // also allowed at the top level when `parents` is set
  graphModes?: readonly string[]; // allowed graph modes when the parent is `graph`
};

const BASIS = ['observed', 'inferred', 'hypothesis', 'stipulated'] as const;
const VISUAL = { id: 'id', title: 'string', question: 'string' } as const;
const DETAIL_PARENTS = ['graph', 'group', 'node', 'edge', 'state', 'transition', 'factor', 'causal-link', 'task', 'dependency',
  'trace', 'actor', 'event', 'branch', 'transform', 'stage', 'conversion', 'compare', 'option', 'criterion', 'cell',
  'annotated', 'annotation', 'definition', 'detail'] as const;

const SPECS: Record<string, TagSpec> = {
  graph: { required: { ...VISUAL, mode: 'string' }, optional: {}, enums: { mode: ['architecture', 'state', 'cause', 'plan'] } },
  group: { required: { id: 'id', label: 'string' }, optional: { parent: 'id' }, parents: ['graph'], graphModes: ['architecture'] },
  node: {
    required: { id: 'id', role: 'string' }, optional: { label: 'string', group: 'id', entity: 'id' },
    enums: { role: ['process', 'storage', 'external', 'interface', 'decision', 'concept'] }, parents: ['graph'], graphModes: ['architecture'],
  },
  edge: {
    required: { id: 'id', from: 'id', to: 'id', kind: 'string', label: 'string' }, optional: { basis: 'string' },
    enums: { kind: ['call', 'blocking-call', 'data', 'control', 'owns', 'depends-on', 'contains', 'feedback'], basis: BASIS },
    parents: ['graph'], graphModes: ['architecture'],
  },
  state: { required: { id: 'id', label: 'string' }, optional: { initial: 'boolean', terminal: 'boolean' }, parents: ['graph'], graphModes: ['state'] },
  transition: {
    required: { id: 'id', from: 'id', to: 'id', event: 'string', label: 'string' }, optional: { guard: 'string', action: 'string', basis: 'string' },
    enums: { basis: BASIS }, parents: ['graph'], graphModes: ['state'],
  },
  factor: { required: { id: 'id', label: 'string', basis: 'string' }, optional: {}, enums: { basis: BASIS }, parents: ['graph'], graphModes: ['cause'] },
  'causal-link': {
    required: { id: 'id', from: 'id', to: 'id', label: 'string', basis: 'string' }, optional: { evidence: 'ids' },
    enums: { basis: BASIS }, parents: ['graph'], graphModes: ['cause'],
  },
  task: {
    required: { id: 'id', label: 'string' },
    optional: { owner: 'string', status: 'string', output: 'string', acceptance: 'string', risk: 'string' },
    enums: { status: ['proposed', 'ready', 'blocked', 'complete', 'unknown'] }, parents: ['graph'], graphModes: ['plan'],
  },
  dependency: {
    required: { id: 'id', from: 'id', to: 'id', label: 'string' }, optional: { kind: 'string' },
    enums: { kind: ['finish-start', 'input', 'decision'] }, parents: ['graph'], graphModes: ['plan'],
  },
  trace: { required: { ...VISUAL }, optional: { timeUnit: 'string', scale: 'string' }, enums: { scale: ['ordinal', 'time'] } },
  actor: { required: { id: 'id' }, optional: { label: 'string', entity: 'id' }, parents: ['trace'] },
  event: {
    required: { id: 'id', actor: 'id', label: 'string', kind: 'string' },
    optional: { to: 'id', after: 'ids', time: 'number', duration: 'number', branch: 'id' },
    enums: { kind: ['call', 'return', 'send', 'receive', 'compute', 'wait', 'state-change', 'failure'] }, parents: ['trace'],
  },
  branch: { required: { id: 'id', label: 'string', condition: 'string' }, optional: { exclusiveWith: 'ids' }, parents: ['trace'] },
  transform: { required: { ...VISUAL }, optional: {} },
  stage: {
    required: { id: 'id', label: 'string', representation: 'string' },
    optional: { shape: 'stringOrStrings', units: 'string', location: 'string', ownership: 'string' }, parents: ['transform'],
  },
  conversion: { required: { id: 'id', from: 'id', to: 'id', label: 'string' }, optional: { loss: 'string', condition: 'string' }, parents: ['transform'] },
  compare: { required: { ...VISUAL }, optional: {} },
  option: { required: { id: 'id', label: 'string' }, optional: {}, parents: ['compare'] },
  criterion: { required: { id: 'id', label: 'string' }, optional: { units: 'string' }, parents: ['compare'] },
  cell: {
    required: { id: 'id', option: 'id', criterion: 'id' }, optional: { value: 'stringOrNumber', valueStatus: 'string' },
    enums: { valueStatus: ['measured', 'estimated', 'illustrative'] }, parents: ['compare'],
  },
  annotated: { required: { ...VISUAL, source: 'id' }, optional: {} },
  annotation: { required: { id: 'id', label: 'string' }, optional: { lines: 'lines', region: 'region' }, parents: ['annotated'] },
  definition: { required: { id: 'id', term: 'string' }, optional: {} },
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
const GRAPH_WARN_NODES = 25;
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
    case 'stringOrStrings':
      return typeof value === 'string' || (Array.isArray(value) && value.every((v) => typeof v === 'string'));
    case 'stringOrNumber':
      return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
    case 'lines':
      return Array.isArray(value) && value.length === 2 && value.every((v) => typeof v === 'number' && Number.isInteger(v) && v >= 1);
    case 'region':
      return Array.isArray(value) && value.length === 4 && value.every((v) => typeof v === 'number' && v >= 0 && v <= 1);
  }
}

function ids(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  return [];
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
      else if (!typeOk(a[name], type)) report('E_SYNTAX', `${t.tagName} ${t.id}: \`${name}\` must be ${type}`, t);
    }
    for (const [name, value] of Object.entries(a)) {
      if (name === 'id' || name in spec.required) continue;
      const type = spec.optional[name];
      if (type === undefined) report('E_SYNTAX', `${t.tagName} ${t.id}: unknown attribute \`${name}\``, t);
      else if (!typeOk(value, type)) report('E_SYNTAX', `${t.tagName} ${t.id}: \`${name}\` must be ${type}`, t);
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
      report('E_SYNTAX', `${t.tagName} ${t.id} must be inside ${spec.parents.length > 3 ? 'a component or entity' : spec.parents.join(' or ')}`, t);
    } else if (parentTag === 'graph' && spec.graphModes) {
      const mode = byId.get(t.parentId!)?.attributes['mode'];
      if (typeof mode === 'string' && !spec.graphModes.includes(mode)) {
        report('E_SYNTAX', `${t.tagName} ${t.id} is not allowed in graph mode "${mode}" (allowed in ${spec.graphModes.join(', ')})`, t);
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

  // Pass 2: family rules.
  const children = (id: string, tag?: string) => parsed.targets.filter((c) => c.parentId === id && (tag === undefined || c.tagName === tag));
  for (const figure of parsed.targets) {
    const tag = figure.tagName;
    if (tag === 'graph') {
      const mode = String(figure.attributes['mode']);
      const entityTag = ENTITY_CHILDREN[mode]?.[0];
      const entities = entityTag ? children(figure.id, entityTag) : [];
      const links = children(figure.id).filter((c) => ['edge', 'transition', 'causal-link', 'dependency'].includes(c.tagName ?? ''));
      if (entities.length > GRAPH_MAX_NODES || links.length > GRAPH_MAX_EDGES) {
        report('E_LAYOUT_LIMIT', `graph ${figure.id} has ${entities.length} nodes and ${links.length} edges; the cap is ${GRAPH_MAX_NODES}/${GRAPH_MAX_EDGES}`, figure);
      } else if (entities.length > GRAPH_WARN_NODES) {
        report('W_VISUAL_DENSITY', `graph ${figure.id} shows ${entities.length} nodes; consider splitting it (warning above ${GRAPH_WARN_NODES})`, figure, 'warning');
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
        for (const link of children(figure.id, 'causal-link')) {
          expectRef(link, 'from', ['factor'], figure.id);
          expectRef(link, 'to', ['factor'], figure.id);
          expectRef(link, 'evidence', ['source']);
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
      for (const e of events) {
        expectRef(e, 'actor', ['actor'], figure.id);
        expectRef(e, 'to', ['actor'], figure.id);
        expectRef(e, 'branch', ['branch'], figure.id);
        expectRef(e, 'after', ['event'], figure.id);
        if (scale === 'ordinal') {
          for (const name of ['time', 'duration']) {
            if (e.attributes[name] !== undefined) report('E_SEMANTIC', `event ${e.id}: an ordinal trace cannot state \`${name}\`; ordering is not duration`, e);
          }
        } else if (typeof e.attributes['time'] !== 'number') {
          report('E_SEMANTIC', `event ${e.id}: a time-scaled trace needs a numeric \`time\``, e);
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
      const source = byId.get(String(figure.attributes['source']));
      if (source?.tagName !== 'source') continue;
      const availability = source.attributes['availability'] ?? 'captured';
      const excerpt = fenceText(model, source.id);
      const asset = typeof source.attributes['asset'] === 'string' ? source.attributes['asset'] : undefined;
      if (availability === 'link-only') {
        report('E_SEMANTIC', `annotated ${figure.id} uses link-only source ${source.id}; annotations need captured content`, figure);
        continue;
      }
      const start = typeof source.attributes['start'] === 'number' ? source.attributes['start'] : 1;
      const rows = excerpt === undefined ? 0 : excerpt.replace(/\n$/, '').split('\n').length;
      const end = typeof source.attributes['end'] === 'number' ? source.attributes['end'] : start + rows - 1;
      for (const ann of children(figure.id, 'annotation')) {
        const lines = ann.attributes['lines'];
        const region = ann.attributes['region'];
        if ((lines === undefined) === (region === undefined)) {
          report('E_SEMANTIC', `annotation ${ann.id} needs exactly one of \`lines\` or \`region\``, ann);
          continue;
        }
        if (lines !== undefined) {
          if (excerpt === undefined) report('E_SEMANTIC', `annotation ${ann.id}: \`lines\` needs a captured text source, but ${source.id} has none`, ann);
          else if (typeOk(lines, 'lines')) {
            const [a, b] = lines as [number, number];
            if (a > b || a < start || b > end) report('E_SEMANTIC', `annotation ${ann.id}: lines ${a}-${b} are outside source lines ${start}-${end}`, ann);
          }
        }
        if (region !== undefined && (asset === undefined || !RASTER.test(asset))) {
          report('E_SEMANTIC', `annotation ${ann.id}: \`region\` needs a captured raster image asset`, ann);
        }
      }
    } else if (tag === 'source') {
      validateSource(figure, model, assets, report);
    }
  }
  return diagnostics;
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
    report('E_EVIDENCE_HASH', `captured source ${t.id} has no excerptSha256; capture it with \`explain capture\``, t);
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
