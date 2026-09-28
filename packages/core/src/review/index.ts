// Editorial review prompts (§15.6, §16.3, §16.4, §18.6a): W_JARGON,
// W_VISUAL_DENSITY, and W_EVIDENCE_GAP here; the prose prompts of
// IMPROVEMENTS.md §11.3 in prose.ts; the shape prompts of §12.4 and W_MERMAID
// (§6.2) in shape.ts; the term prompts of §13.6 in terms.ts. They are prompts
// for a person or an agent to review, never verdicts: each is a warning, each
// message starts with "review:", and none changes an exit code. The rules are
// local, deterministic text and model checks; they call no model service.
//
// Code mapping for the §18.6a known-bad drafts:
// - vague wording and undefined acronyms or terms: W_JARGON;
// - too many nodes, generic edge labels, an architecture map presented as an
//   order of events: W_VISUAL_DENSITY (the figure does not carry its meaning);
// - a task `due` date with no `evidence`, and parts with no evidence in a
//   root-cause document (IMPROVEMENTS.md §4.4): W_EVIDENCE_GAP;
// - a relationship `quantity` with no `evidence` (IMPROVEMENTS.md §14.9):
//   W_EVIDENCE_GAP;
// - an `observed` relationship with no evidence, every causal link `observed`,
//   chronology presented as causation, a certain claim with no citation, and a
//   caveat hidden in a detail: W_EVIDENCE_GAP (the main path claims more than
//   it shows).
import type { LoadedBundle } from '../model/bundle.ts';
import { evidenceIdsOf, type MNode } from '../model/targets.ts';
import { PART_EVIDENCE_TAGS, QUANTITY_TAGS, visibleNodeCount } from '../model/validate.ts';
import type { Diagnostic, TargetId } from '../types.ts';
import { type Context, partBodies, prompt, proseTargets, textOf } from './context.ts';
import { componentRules } from './components.ts';
import { proseRules } from './prose.ts';
import { shapeRules } from './shape.ts';
import { termKey, termPattern, termRules } from './terms.ts';
import { hasCite, proseOf, sentences, visibleAttributes } from './text.ts';

/** §2.3: warn above 25 visible nodes in one figure. */
export const NODE_LIMIT = 25;
/**
 * A term used this many times without a definition is a prompt (IMPROVEMENTS.md
 * §11.3): an acronym, or an item of the reader's `new` list.
 */
export const TERM_USES = 2;
/** A W_EVIDENCE_GAP count names at most this many part IDs. */
export const EVIDENCE_GAP_NAMES = 5;

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
const NODE_KINDS = new Set(['node', 'state', 'factor', 'task', 'actor', 'stage', 'concept']);
const COMPONENT_ROOTS = new Set(['graph', 'trace', 'transform', 'compare', 'annotated', 'domain']);
/**
 * At this many undefined terms, W_JARGON suggests a `domain` figure that
 * defines the terms once, together (IMPROVEMENTS.md §5.6).
 */
export const DOMAIN_SUGGEST_TERMS = 3;

function jargon(ctx: Context): void {
  const { model, parsed } = ctx.bundle;
  const acronymBlocks = new Map<string, TargetId[]>();
  const acronymUses = new Map<string, number>();
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
      acronymUses.set(bare, (acronymUses.get(bare) ?? 0) + 1);
    }
  }
  let undefinedTerms = newTerms(ctx);
  const suggestDomain = () => {
    if (undefinedTerms < DOMAIN_SUGGEST_TERMS || parsed.targets.some((t) => t.tagName === 'domain')) return;
    prompt(ctx, 'W_JARGON', undefined, `${undefinedTerms} undefined terms; consider a \`domain\` figure: it defines each term once, and shows how the terms relate`);
  };
  if (acronymBlocks.size === 0) {
    suggestDomain();
    return;
  }

  // An acronym is cleared by the reader's `knows` list, or by a
  // `{% definition %}` block whose `term` or one of whose `aliases` matches
  // (dogfood-3 F14). The build links every use of a defined term
  // (IMPROVEMENTS.md §13.3), so a use that is not tagged by hand is no longer
  // a case. An inline expansion in parentheses, such as "MCP (Model Context
  // Protocol)", is not read as a definition, because it is not a target that
  // a citation or a second use can point back to.
  const defined = new Set<string>();
  for (const t of parsed.targets) {
    if (t.tagName !== 'definition') continue;
    const aliases = Array.isArray(t.attributes['aliases']) ? (t.attributes['aliases'] as unknown[]) : [];
    for (const phrase of [t.attributes['term'], ...aliases]) {
      if (typeof phrase === 'string') for (const m of phrase.matchAll(ACRONYM)) defined.add(m[0]);
    }
  }
  const known = new Set<string>();
  const reader = parsed.frontmatter['reader'] as { knows?: unknown } | undefined;
  for (const item of Array.isArray(reader?.knows) ? reader.knows : []) {
    if (typeof item === 'string') for (const m of item.toUpperCase().matchAll(ACRONYM)) known.add(m[0]);
  }
  for (const [acronym, blocks] of [...acronymBlocks].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (known.has(acronym) || defined.has(acronym)) continue;
    const uses = acronymUses.get(acronym) ?? 0;
    if (uses >= TERM_USES) {
      undefinedTerms++;
      prompt(ctx, 'W_JARGON', blocks[0], `${acronym} appears ${uses} times in ${blocks.length} block${blocks.length === 1 ? '' : 's'} with no definition block; the budget is ${TERM_USES - 1} use without a definition; add {% definition id=... term="${acronym}" %}, or list it in reader.knows`);
    }
  }
  suggestDomain();
}

/**
 * An item of `reader.new` is a term the reader does not know. Used
 * TERM_USES or more times with no definition of that term, it is a prompt.
 * Returns the number of prompts.
 */
function newTerms(ctx: Context): number {
  const { parsed } = ctx.bundle;
  const reader = parsed.frontmatter['reader'] as { new?: unknown } | undefined;
  const items = (Array.isArray(reader?.new) ? reader.new : []).filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  if (items.length === 0) return 0;
  let count = 0;
  const defined = new Set<string>();
  for (const t of parsed.targets) {
    if (t.tagName !== 'definition') continue;
    const aliases = Array.isArray(t.attributes['aliases']) ? (t.attributes['aliases'] as unknown[]) : [];
    for (const phrase of [t.attributes['term'], ...aliases]) if (typeof phrase === 'string') defined.add(termKey(phrase));
  }
  const scopes = [...proseTargets(ctx), ...partBodies(ctx)].filter((s) => ctx.bundle.model.targets.get(s.id)?.kind !== 'definition');
  for (const item of items) {
    if (defined.has(termKey(item))) continue;
    const pattern = new RegExp(termPattern(item).source, 'giu');
    let uses = 0;
    let first: TargetId | undefined;
    for (const { id, text } of scopes) {
      const n = [...text.matchAll(pattern)].length;
      if (n > 0 && first === undefined) first = id;
      uses += n;
    }
    if (uses < TERM_USES) continue;
    count++;
    prompt(ctx, 'W_JARGON', first, `"${item}" is in reader.new and appears ${uses} times with no definition block; the budget is ${TERM_USES - 1} use without a definition; add {% definition id=... term="${item}" %}`);
  }
  return count;
}

function density(ctx: Context): void {
  const { model, parsed } = ctx.bundle;
  for (const root of parsed.targets) {
    if (!root.tagName || !COMPONENT_ROOTS.has(root.tagName)) continue;
    const members = parsed.targets.filter((t) => model.targets.get(t.id)?.ownerComponentId === root.id);
    const nodes = members.filter((t) => t.tagName && NODE_KINDS.has(t.tagName));
    // A collapsed group counts as one node, because the map opens folded
    // (docs/IMPROVEMENTS.md §14.9, phase 6b review F19).
    const shown = root.tagName === 'graph' ? visibleNodeCount(nodes, members.filter((t) => t.tagName === 'group' && t.parentId === root.id)) : nodes.length;
    if (shown > NODE_LIMIT) {
      prompt(ctx, 'W_VISUAL_DENSITY', root.id, `${root.id} shows ${shown} nodes${shown !== nodes.length ? ' (a collapsed group counts as one)' : ''} (more than ${NODE_LIMIT}, §2.3); split it, fold a group, or give the reader a list`);
    }
    // A domain shows how 2 or more terms relate; one term is a definition
    // (docs/IMPROVEMENTS.md §5.2, phase 4 review D15).
    if (root.tagName === 'domain' && nodes.length < 2) {
      prompt(ctx, 'W_VISUAL_DENSITY', root.id, `${root.id} shows ${nodes.length} ${nodes.length === 1 ? 'concept' : 'concepts'}; a domain shows how 2 or more terms relate; for one term, use the definition alone`);
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
  // A comparison with more than a quarter of its cells missing shows "Not
  // provided" where a reader expects a fact (dogfood-2 Q6).
  for (const compare of byTag('compare')) {
    const owned = (tag: string) => byTag(tag).filter((t) => model.targets.get(t.id)?.ownerComponentId === compare.id);
    const total = owned('option').length * owned('criterion').length;
    const missing = total - owned('cell').length;
    if (total > 0 && missing * 4 > total) {
      prompt(ctx, 'W_EVIDENCE_GAP', compare.id, `${compare.id} leaves ${missing} of ${total} cells empty, and the page shows "Not provided" in each; fill them, or drop the option or criterion that has no facts`);
    }
  }
  // A factor's `evidence` (a source or a trace observation, §14.6) counts as a citation.
  for (const f of byTag('factor')) {
    const node = model.nodes.get(f.id);
    const own = f.attributes['evidence'];
    if (Array.isArray(own) && own.length > 0) continue;
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

  // A `due` date with no source on the task (docs/IMPROVEMENTS.md §4.4).
  for (const task of byTag('task')) {
    const due = task.attributes['due'];
    if (typeof due !== 'string') continue;
    const own = task.attributes['evidence'];
    if (Array.isArray(own) && own.length > 0) continue;
    prompt(ctx, 'W_EVIDENCE_GAP', task.id, `task ${task.id} has a \`due\` date (${due}) and no \`evidence\`; name the source of the date in \`evidence\`, or remove the date`);
  }

  // A relationship `quantity` with no source (docs/IMPROVEMENTS.md §14.9).
  for (const rel of parsed.targets.filter((t) => t.tagName && QUANTITY_TAGS.has(t.tagName))) {
    const quantity = rel.attributes['quantity'];
    if (typeof quantity !== 'string') continue;
    const own = rel.attributes['evidence'];
    if (Array.isArray(own) && own.length > 0) continue;
    prompt(ctx, 'W_EVIDENCE_GAP', rel.id, `${rel.tagName} ${rel.id} has a \`quantity\` (${quantity}) and no \`evidence\`; name the source of the number in \`evidence\`, or remove the quantity`);
  }

  // In a root-cause document, each part says what the code or the run did,
  // so count the parts with no `evidence` and no `cite` in the body. A part
  // whose sources are all link-only also counts: the reader cannot check it
  // on the page (ARCHITECTURE §8.1). One prompt for each figure
  // (docs/IMPROVEMENTS.md §4.4).
  if (parsed.frontmatter['kind'] === 'root-cause') {
    const linkOnly = new Set(byTag('source').filter((s) => s.attributes['availability'] === 'link-only').map((s) => s.id));
    for (const figure of parsed.targets) {
      if (!figure.tagName || !COMPONENT_ROOTS.has(figure.tagName)) continue;
      const parts = parsed.targets.filter((t) => t.tagName && PART_EVIDENCE_TAGS.has(t.tagName) && model.targets.get(t.id)?.ownerComponentId === figure.id);
      const bare = parts.filter((t) => {
        const node = model.nodes.get(t.id);
        return node !== undefined && evidenceIdsOf(node, ctx.isTarget).every((id) => linkOnly.has(id));
      });
      if (bare.length === 0) continue;
      const shown = bare.slice(0, EVIDENCE_GAP_NAMES).map((t) => t.id).join(', ');
      const more = bare.length > EVIDENCE_GAP_NAMES ? `, and ${bare.length - EVIDENCE_GAP_NAMES} more` : '';
      prompt(ctx, 'W_EVIDENCE_GAP', figure.id, `in ${figure.id}, ${bare.length} of ${parts.length} part${parts.length === 1 ? '' : 's'} ${bare.length === 1 ? 'has' : 'have'} no \`evidence\` and no \`cite\`, or only link-only sources (${shown}${more}); in a root-cause document, give each part that is code an \`evidence\` source, or cite the observation in its body`);
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
  proseRules(ctx);
  shapeRules(ctx);
  termRules(ctx);
  componentRules(ctx);
  const order = new Map(bundle.parsed.targets.map((t, i) => [t.id, i]));
  return ctx.out.sort((a, b) => (order.get(a.targetId ?? '') ?? -1) - (order.get(b.targetId ?? '') ?? -1) || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}
