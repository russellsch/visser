// Editorial review prompts (§15.6, §16.3, §16.4, §18.6a): W_JARGON,
// W_VISUAL_DENSITY, and W_EVIDENCE_GAP. They are prompts for a person or an
// agent to review, never verdicts: each is a warning, each message starts with
// "review:", and none changes an exit code. The rules are local, deterministic
// text and model checks; they call no model service.
//
// Code mapping for the §18.6a known-bad drafts:
// - vague wording and undefined acronyms: W_JARGON;
// - too many nodes, generic edge labels, an architecture map presented as an
//   order of events: W_VISUAL_DENSITY (the figure does not carry its meaning);
// - an `observed` relationship with no evidence, every causal link `observed`,
//   chronology presented as causation, a certain claim with no citation, and a
//   caveat hidden in a detail: W_EVIDENCE_GAP (the main path claims more than
//   it shows).
import type { LoadedBundle } from '../model/bundle.ts';
import type { MNode } from '../model/targets.ts';
import type { Diagnostic, ParsedTarget, TargetId } from '../types.ts';
import { hasCite, proseOf, sentences, visibleAttributes } from './text.ts';

/** §2.3: warn above 25 visible nodes in one figure. */
export const NODE_LIMIT = 25;
/** An acronym used in this many blocks without a definition is a prompt. */
export const ACRONYM_BLOCKS = 3;

// §16.4 vague intensifiers and marketing words. Each says nothing a reader can check.
const VAGUE = /\b(robust(?:ly|ness)?|seamless(?:ly)?|sophisticated|leverag(?:e|es|ed|ing)|orchestrat(?:e|es|ed|ing|ion)|synerg(?:y|ies|istic)|cutting-edge|state-of-the-art|best-in-class|world-class|next-generation|game-chang(?:er|ing)|blazing(?:ly)? fast|lightning-fast|battle-tested|enterprise-grade|industrial-strength)\b/gi;
// "scalable" and "performant" are vague only without a number in the same sentence.
const VAGUE_WITHOUT_NUMBER = /\b(scalable|highly scalable|performant|high-performance|efficient(?:ly)?)\b/gi;

// Acronyms an experienced engineer reads without a definition (§3.6 baseline).
const KNOWN_ACRONYMS = new Set([
  'API', 'APIS', 'CPU', 'GPU', 'RAM', 'SSD', 'HTTP', 'HTTPS', 'URL', 'URI', 'JSON', 'YAML', 'XML', 'HTML', 'CSS', 'SQL', 'TCP', 'UDP',
  'IP', 'DNS', 'TLS', 'SSL', 'SSH', 'OS', 'IO', 'UI', 'UX', 'CLI', 'SDK', 'ID', 'IDS', 'UTF', 'ASCII', 'CI', 'CD', 'PR', 'UUID', 'SHA',
  'GC', 'JVM', 'RPC', 'REST', 'CSV', 'PDF', 'PNG', 'SVG', 'JPEG', 'OK', 'FIFO', 'LIFO', 'CRUD', 'KB', 'MB', 'GB', 'TB', 'KIB', 'MIB',
  'GIB', 'NULL', 'EOF', 'MS', 'NS', 'US', 'UTC', 'ISO', 'RFC', 'AWS', 'GCP', 'USB', 'LAN', 'VPN', 'VM', 'VMS', 'JS', 'TS', 'NPM', 'GIT',
  'README', 'FAQ', 'TODO', 'NOTE', 'NOT', 'AND', 'OR', 'NO', 'ALL', 'MUST', 'SHOULD', 'MAY', 'IF', 'THE', 'A', 'I', 'II', 'III', 'IV',
  'AM', 'PM', 'ETA', 'DB', 'SLA', 'SLO', 'QA', 'CPUS', 'GPUS', 'AI', 'LLM', 'LLMS', 'CORS', 'CSP', 'SRI', 'DOM', 'SPA', 'CDN', 'MIME',
]);
const ACRONYM = /\b[A-Z][A-Z0-9]{1,5}\b/g;

// Labels that name no relationship (§9.2: an edge label says what the arrow means).
const GENERIC_LABELS = new Set(['data', 'flow', 'flows', 'uses', 'use', 'calls', 'call', 'sends', 'send', 'link', 'links',
  'connects', 'connection', 'related', 'relates', 'interacts', 'talks to', 'communicates', 'input', 'output', 'to', '->', '']);
const ORDER_CLAIM = /\b(order|sequence|steps?|chronolog\w*|timeline|what happens (?:first|next))\b/i;
const ORDINAL_LABEL = /^\s*(?:\d+\s*[.):]|step\s+\d+|first\b|then\b|next\b|finally\b)/i;
const TEMPORAL_LABEL = /^\s*(?:then|after(?:wards)?|followed by|preceded by|before|next|later|subsequently|coincid\w*|at the same time|happened after)\b/i;
const CERTAIN = /\b(always|guarantees|is guaranteed|are guaranteed|proves?|proven|certainly|definitely|in (?:all|every) cases?|never fails?|cannot fail)\b/i;
const NEGATED_CERTAIN = /\b(?:not|no|never|without|cannot)\b[^.]{0,20}\b(?:always|guarantee\w*|prove\w*|certain\w*)/i;
const CAVEAT_LABEL = /\b(caveat|limitation|exception|warning|except|unless|does not (?:hold|apply)|not guaranteed|breaks|fails)\b/i;
const CAVEAT_OPENING = /^\s*(?:however|but|except|unless|caveat|this does not hold|this is not true|note that this (?:does not|is not))\b/i;

const PROSE_KINDS = new Set(['paragraph', 'list', 'blockquote', 'table', 'heading']);
const NODE_KINDS = new Set(['node', 'state', 'factor', 'task', 'actor', 'stage']);
const COMPONENT_ROOTS = new Set(['graph', 'trace', 'transform', 'compare', 'annotated']);

type Context = {
  bundle: LoadedBundle;
  byId: Map<TargetId, ParsedTarget>;
  isTarget: (n: MNode) => boolean;
  out: Diagnostic[];
};

function prompt(ctx: Context, code: string, targetId: TargetId | undefined, message: string): void {
  const record = targetId ? ctx.bundle.model.targets.get(targetId) : undefined;
  ctx.out.push({
    code,
    severity: 'warning',
    message: `review: ${message}`,
    path: 'index.md',
    ...(record ? { startLine: record.span.startLine } : {}),
    ...(targetId ? { targetId } : {}),
  });
}

function textOf(ctx: Context, id: TargetId): string {
  const node = ctx.bundle.model.nodes.get(id);
  if (!node) return '';
  return [...visibleAttributes(node), proseOf(node, ctx.isTarget)].join('\n');
}

function jargon(ctx: Context): void {
  const { model, parsed } = ctx.bundle;
  const acronymBlocks = new Map<string, TargetId[]>();
  for (const t of parsed.targets) {
    const record = model.targets.get(t.id);
    if (!record || ['code', 'source', 'hr'].includes(record.kind) || record.kind.startsWith('mermaid')) continue;
    const text = textOf(ctx, t.id);
    const words = new Set<string>();
    for (const match of text.matchAll(VAGUE)) words.add(match[0].toLowerCase());
    for (const sentence of sentences(text)) {
      if (/\d/.test(sentence)) continue;
      for (const match of sentence.matchAll(VAGUE_WITHOUT_NUMBER)) words.add(match[0].toLowerCase());
    }
    if (words.size > 0) {
      prompt(ctx, 'W_JARGON', t.id, `vague wording (${[...words].sort().join(', ')}) in ${t.id}; say what the mechanism does, under which condition, or with a number`);
    }
    for (const match of text.matchAll(ACRONYM)) {
      const bare = match[0];
      if (KNOWN_ACRONYMS.has(bare)) continue;
      const blocks = acronymBlocks.get(bare) ?? [];
      if (!blocks.includes(t.id)) blocks.push(t.id);
      acronymBlocks.set(bare, blocks);
    }
  }
  if (acronymBlocks.size === 0) return;

  // An acronym counts as defined by a `definition`, a `term`, an expansion
  // "Full Name (ABC)" or "ABC (full name)", or the reader's `knows` list.
  const all = parsed.targets.map((t) => textOf(ctx, t.id)).join('\n');
  const defined = new Set<string>();
  for (const t of parsed.targets) {
    if (t.tagName === 'definition' && typeof t.attributes['term'] === 'string') {
      for (const m of (t.attributes['term'] as string).matchAll(ACRONYM)) defined.add(m[0]);
    }
  }
  const visitTerms = (n: MNode) => {
    if (n.type === 'tag' && n.tag === 'term') {
      for (const child of n.children) if (child.type === 'text') for (const m of String(child.attributes['content'] ?? '').matchAll(ACRONYM)) defined.add(m[0]);
    }
    for (const child of n.children) visitTerms(child);
  };
  if (parsed.ast) visitTerms(parsed.ast as MNode);
  const reader = parsed.frontmatter['reader'] as { knows?: unknown } | undefined;
  for (const known of Array.isArray(reader?.knows) ? reader.knows : []) {
    if (typeof known === 'string') for (const m of known.toUpperCase().matchAll(ACRONYM)) defined.add(m[0]);
  }
  for (const [acronym, blocks] of [...acronymBlocks].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (blocks.length < ACRONYM_BLOCKS || defined.has(acronym)) continue;
    const escaped = acronym.replace(/[^A-Z0-9]/g, '');
    if (new RegExp(`\\(\\s*${escaped}\\s*\\)|\\b${escaped}\\s*\\(`).test(all)) continue;
    prompt(ctx, 'W_JARGON', blocks[0], `${acronym} appears in ${blocks.length} blocks with no definition or expansion; define it where the reader first needs it`);
  }
}

function density(ctx: Context): void {
  const { model, parsed } = ctx.bundle;
  for (const root of parsed.targets) {
    if (!root.tagName || !COMPONENT_ROOTS.has(root.tagName)) continue;
    const members = parsed.targets.filter((t) => model.targets.get(t.id)?.ownerComponentId === root.id);
    const nodes = members.filter((t) => t.tagName && NODE_KINDS.has(t.tagName));
    if (nodes.length > NODE_LIMIT) {
      prompt(ctx, 'W_VISUAL_DENSITY', root.id, `${root.id} shows ${nodes.length} nodes (more than ${NODE_LIMIT}, §2.3); split it or give the reader a list`);
    }
    if (root.tagName !== 'graph') continue;
    const mode = root.attributes['mode'];
    if (mode !== 'architecture' && mode !== 'cause') continue;
    const edgeIds = new Set(members.filter((t) => t.tagName === 'edge' || t.tagName === 'causal-link').map((t) => t.id));
    const generic = model.relationships.filter((r) => edgeIds.has(r.id) && GENERIC_LABELS.has(r.label.trim().toLowerCase())).map((r) => r.id);
    if (generic.length > 0) {
      prompt(ctx, 'W_VISUAL_DENSITY', root.id, `in ${root.id}, ${generic.join(', ')} ${generic.length === 1 ? 'has a label' : 'have labels'} that do not say what the arrow means; name the call, wait, or effect`);
    }
    if (mode === 'architecture') {
      const claim = [root.attributes['title'], root.attributes['question']].filter((v): v is string => typeof v === 'string')
        .some((text) => ORDER_CLAIM.test(text) && !/\bnot\b[^.]{0,30}\b(order|sequence)/i.test(text));
      const ordinal = model.relationships.filter((r) => edgeIds.has(r.id) && ORDINAL_LABEL.test(r.label)).map((r) => r.id);
      if (claim || ordinal.length > 0) {
        prompt(ctx, 'W_VISUAL_DENSITY', root.id, `${root.id} is an architecture map but reads as an order of events${ordinal.length > 0 ? ` (${ordinal.join(', ')})` : ''}; an architecture map shows responsibilities, and a trace shows order`);
      }
    }
  }
  for (const figure of model.mermaid.values()) {
    const nodes = figure.elements.filter((e) => e.kind !== 'mermaid-group');
    if (nodes.length > NODE_LIMIT) {
      prompt(ctx, 'W_VISUAL_DENSITY', figure.figureId, `${figure.figureId} shows ${nodes.length} nodes (more than ${NODE_LIMIT}, §2.3); split it or give the reader a list`);
    }
    if (figure.diagramType !== 'flowchart') continue;
    const unlabelled = figure.relationships.filter((r) => GENERIC_LABELS.has(r.label.trim().toLowerCase()));
    if (unlabelled.length >= 3 && unlabelled.length * 2 >= figure.relationships.length) {
      prompt(ctx, 'W_VISUAL_DENSITY', figure.figureId, `${unlabelled.length} of ${figure.relationships.length} arrows in ${figure.figureId} have no meaningful label; say what each arrow means`);
    }
  }
}

function evidence(ctx: Context): void {
  const { model, parsed } = ctx.bundle;
  const byTag = (name: string) => parsed.targets.filter((t) => t.tagName === name);
  for (const r of model.relationships) {
    if (r.basis === 'observed' && r.evidenceIds.length === 0) {
      prompt(ctx, 'W_EVIDENCE_GAP', r.id, `${r.id} is marked observed but cites no evidence; cite the observation or mark it inferred or hypothesis`);
    }
  }
  for (const f of byTag('factor')) {
    const node = model.nodes.get(f.id);
    if (f.attributes['basis'] === 'observed' && node && !hasCite(node, ctx.isTarget)) {
      prompt(ctx, 'W_EVIDENCE_GAP', f.id, `${f.id} is marked observed but cites no evidence`);
    }
  }
  for (const graph of byTag('graph').filter((g) => g.attributes['mode'] === 'cause')) {
    const links = byTag('causal-link').filter((l) => model.targets.get(l.id)?.ownerComponentId === graph.id);
    if (links.length >= 3 && links.every((l) => l.attributes['basis'] === 'observed')) {
      prompt(ctx, 'W_EVIDENCE_GAP', graph.id, `every causal link in ${graph.id} is marked observed; keep the observation, inference, and hypothesis distinction from the source material`);
    }
    for (const link of links) {
      const label = typeof link.attributes['label'] === 'string' ? (link.attributes['label'] as string) : '';
      if (TEMPORAL_LABEL.test(label)) {
        prompt(ctx, 'W_EVIDENCE_GAP', link.id, `${link.id} ("${label}") describes an order in time, not a cause; state the mechanism or use a trace`);
      }
    }
  }

  // A certain claim with no citation, in a document that has sources.
  if (byTag('source').length > 0) {
    for (const t of parsed.targets) {
      const record = model.targets.get(t.id);
      const node = model.nodes.get(t.id);
      if (!record || !node || t.parentId || !PROSE_KINDS.has(record.kind) || record.kind === 'heading') continue;
      if (hasCite(node, ctx.isTarget)) continue;
      const claim = sentences(proseOf(node, ctx.isTarget)).find((s) => CERTAIN.test(s) && !NEGATED_CERTAIN.test(s));
      if (claim) prompt(ctx, 'W_EVIDENCE_GAP', t.id, `${t.id} states a certain claim ("${claim.match(CERTAIN)![0]}") with no citation; cite the source that supports it or qualify it`);
    }
  }

  // A caveat placed only in a detail.
  for (const d of byTag('detail')) {
    const node = model.nodes.get(d.id);
    if (!node) continue;
    const labels = visibleAttributes(node).join(' ');
    const first = sentences(proseOf(node, ctx.isTarget))[0] ?? '';
    if (CAVEAT_LABEL.test(labels) || CAVEAT_OPENING.test(first)) {
      const owner = d.parentId ?? model.targets.get(d.id)?.sectionId;
      prompt(ctx, 'W_EVIDENCE_GAP', d.id, `detail ${d.id} holds a caveat${owner ? ` for ${owner}` : ''}; if it limits or invalidates the conclusion, state it in the main sentence`);
    }
  }
}

/** Editorial review prompts for a loaded document with no errors. */
export function reviewDocument(bundle: LoadedBundle): Diagnostic[] {
  const targetNodes = new Set(bundle.model.nodes.values());
  const ctx: Context = {
    bundle,
    byId: new Map(bundle.parsed.targets.map((t) => [t.id, t])),
    isTarget: (n) => targetNodes.has(n),
    out: [],
  };
  jargon(ctx);
  density(ctx);
  evidence(ctx);
  const order = new Map(bundle.parsed.targets.map((t, i) => [t.id, i]));
  return ctx.out.sort((a, b) => (order.get(a.targetId ?? '') ?? -1) - (order.get(b.targetId ?? '') ?? -1) || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}
