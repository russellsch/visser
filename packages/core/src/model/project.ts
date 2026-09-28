// Semantic Markdown projection (§7.6). Generated from the model, not by
// stripping tags from source or scraping HTML. Every object is preceded by an
// `visser-text/1` ID line so tests can extract target IDs.
import type { ParsedSource, TargetId, TargetRecord } from '../types.ts';
import { buildTargetRecords, inlineText, type MNode, type SemanticRelationship } from './targets.ts';
import type { MermaidFigure } from '../mermaid/types.ts';
import { stripMermaidComments } from '../mermaid/rules.ts';
import { inCitationOrder, sourceOrder } from './citations.ts';
import { excerptLines, lineDiff, type DiffRow } from './diff.ts';

const idLine = (id: TargetId) => `<!-- vs:target ${id} -->`;

/**
 * The first sentence of a text: the definition's hover text and its glossary
 * line (docs/IMPROVEMENTS.md §5.3, §13.1): text up to the first `.`, `!`, or
 * `?` before a space. A `cite` that the text leaves out leaves a space before
 * the punctuation after it; that space goes (phase 4 review D6). The build
 * computes the sentence once and the reader runtime shows it.
 */
export function firstSentence(text: string): string {
  const clean = text.replace(/\s+/gu, ' ').replace(/\s+([.,;:!?])/gu, '$1').trim();
  const match = /^(.+?[.!?])(\s|$)/u.exec(clean);
  return match?.[1] ?? clean;
}

/**
 * A number as plain decimal text, with no exponent: 1e21 prints
 * "1000000000000000000000" and 1e-7 prints "0.0000001". The digits are the
 * shortest form that JavaScript gives, so the text is the same on every
 * machine and in every locale (phase 6a review S4).
 */
export function plainNumber(value: number): string {
  const text = String(value);
  const match = /^(-?)(\d+)(?:\.(\d+))?e([+-]\d+)$/.exec(text);
  if (!match) return text;
  const [, sign, whole, fraction = '', exp] = match;
  const digits = whole! + fraction;
  const point = whole!.length + Number(exp);
  if (point <= 0) return `${sign}0.${'0'.repeat(-point)}${digits}`.replace(/0+$/, '');
  if (point >= digits.length) return `${sign}${digits}${'0'.repeat(point - digits.length)}`;
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}

/**
 * A number and its unit, as the page shows it: "800 ms", but "45%" (docs/IMPROVEMENTS.md §14.4).
 * `display` is the authored text of the number, such as "0.50", when the
 * author gives one; else the number prints in plain decimal form.
 */
export function withUnit(value: unknown, unit: string | undefined, display?: string): string {
  const number = display ?? (typeof value === 'number' ? plainNumber(value) : String(value));
  if (!unit) return number;
  return unit === '%' ? `${number}%` : `${number} ${unit}`;
}

/**
 * A code fence that its content cannot close: three backticks, or one more
 * than the longest run of backticks in the content. A closing fence must be
 * at least as long as the opening one (CommonMark), so no content line can
 * close it, with any indent or diff sign (phase 6a review C5). The diff fence
 * and every other fence of the projection use it.
 */
export function fenceMarker(content: string): string {
  let longest = 0;
  for (const run of content.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  return '`'.repeat(Math.max(3, longest + 1));
}

/** The word of a note kind, as the eyebrow and the text projection show it (§14.2). */
export function noteWord(kind: string | undefined): string {
  const k = kind ?? 'limit';
  return `${k[0]!.toUpperCase()}${k.slice(1)}`;
}

/** The sentence that a walkthrough in a graph or a domain shows (§14.1, phase 6a review S1). */
export const READING_ORDER = 'Reading order, not execution order.';

/** True for a figure whose walkthrough shows READING_ORDER: a graph in any mode, or a domain. */
export function readingOrderFigure(kind: string | undefined): boolean {
  return kind === 'graph' || kind === 'domain';
}

/** The verb of each domain relation kind, for the text line "Order has Invoice line (1..*)" (§5.4). */
export const RELATION_VERBS: Readonly<Record<string, string>> = {
  'is-a': 'is a', has: 'has', uses: 'uses', produces: 'produces', identifies: 'identifies',
};

function attr(node: MNode, name: string): string | undefined {
  const value = node.attributes[name];
  return typeof value === 'string' ? value : undefined;
}

/** Markdown for ordinary blocks and inline content. */
function renderInline(node: MNode): string {
  const out: string[] = [];
  for (const child of node.children) {
    switch (child.type) {
      case 'text': out.push(String(child.attributes['content'] ?? '')); break;
      case 'code': out.push('`' + String(child.attributes['content'] ?? '') + '`'); break;
      case 'softbreak': out.push(' '); break;
      case 'hardbreak': out.push('\n'); break;
      case 'em': out.push(`*${renderInline(child)}*`); break;
      case 'strong': out.push(`**${renderInline(child)}**`); break;
      case 'link': out.push(`[${renderInline(child)}](${attr(child, 'href') ?? ''})`); break;
      case 'image': out.push(`![${attr(child, 'alt') ?? ''}](${attr(child, 'src') ?? ''})`); break;
      case 'tag':
        if (child.tag === 'cite') out.push(` [cite: ${attr(child, 'ref') ?? '?'}]`);
        else out.push(renderInline(child)); // term, focus, detail-link keep their visible text
        break;
      default: out.push(renderInline(child));
    }
  }
  return out.join('').replace(/ +\[cite:/g, ' [cite:');
}

function renderBlock(node: MNode): string {
  switch (node.type) {
    case 'heading': return `${'#'.repeat(Number(node.attributes['level'] ?? 1))} ${renderInline(node)}`;
    case 'paragraph': return renderInline(node);
    case 'inline': return renderInline(node);
    case 'fence': {
      const content = String(node.attributes['content'] ?? '');
      const marker = fenceMarker(content);
      return marker + (attr(node, 'language') ?? '') + '\n' + content + marker;
    }
    case 'hr': return '---';
    case 'blockquote': return node.children.map(renderBlock).join('\n\n').split('\n').map((l) => `> ${l}`.trimEnd()).join('\n');
    case 'list': {
      const ordered = node.attributes['ordered'] === true;
      return node.children.map((item, i) => {
        const text = item.children.map(renderBlock).join('\n');
        const bullet = ordered ? `${i + 1}.` : '-';
        return `${bullet} ${text.split('\n').join('\n  ')}`;
      }).join('\n');
    }
    case 'item': return node.children.map(renderBlock).join('\n');
    case 'table': {
      const rows: string[][] = [];
      const collect = (n: MNode) => {
        if (n.type === 'tr') rows.push(n.children.map((cell) => renderInline(cell).trim()));
        else n.children.forEach(collect);
      };
      collect(node);
      if (rows.length === 0) return '';
      const [head, ...body] = rows;
      return [`| ${head!.join(' | ')} |`, `|${head!.map(() => '---').join('|')}|`, ...body.map((r) => `| ${r.join(' | ')} |`)].join('\n');
    }
    default: return node.children.map(renderBlock).join('\n\n');
  }
}

type Context = {
  targets: Map<TargetId, TargetRecord>;
  nodes: Map<TargetId, MNode>;
  relationships: SemanticRelationship[];
  targetNodes: Set<MNode>;
  mermaid: Map<TargetId, MermaidFigure>;
  // The line diff of each annotated figure with a `before` source, when the
  // compiler already computed it for the page (phase 6a review C1).
  diffs: ReadonlyMap<TargetId, readonly DiffRow[]>;
};

function labelOf(ctx: Context, id: string): string {
  return ctx.targets.get(id)?.label ?? id;
}

/** Body prose of a component or entity, without its child targets. */
function bodyOf(ctx: Context, node: MNode): string {
  const parts = node.children
    .filter((c) => !ctx.targetNodes.has(c))
    .map(renderBlock)
    .map((s) => s.trim())
    .filter((s) => s !== '');
  return parts.join('\n\n');
}

/**
 * The evidence of a relationship, or the `evidence` of a factor (§14.6), as
 * "Evidence: TITLE (ID)", the same form as the evidence of a part (phase 6b
 * review F16).
 */
function evidenceLine(ctx: Context, id: string): string | undefined {
  const rel = ctx.relationships.find((r) => r.id === id);
  const node = ctx.nodes.get(id);
  const ids = rel?.evidenceIds ?? (node && node.tag === 'factor' ? idList(node.attributes['evidence']) : []);
  return ids.length > 0 ? `Evidence: ${ids.map((x) => `${labelOf(ctx, x)} (${x})`).join(', ')}` : undefined;
}

/** Parts that take an `evidence` attribute (docs/IMPROVEMENTS.md §4.4). */
const PART_EVIDENCE_KINDS = new Set(['node', 'event', 'state', 'stage', 'task', 'reading', 'entry']);

function idList(value: unknown): string[] {
  const all = typeof value === 'string' ? [value] : Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  return [...new Set(all)];
}

function childTargets(ctx: Context, parentId: string): TargetRecord[] {
  return [...ctx.targets.values()].filter((t) => t.parentId === parentId);
}

function relationshipLine(ctx: Context, id: string): string | undefined {
  const rel = ctx.relationships.find((r) => r.id === id);
  if (!rel) return undefined;
  // A `quantity` follows the label in parentheses (docs/IMPROVEMENTS.md §14.9).
  const quantity = ctx.nodes.get(id)?.attributes['quantity'];
  const label = typeof quantity === 'string' ? `${rel.label} (${quantity})` : rel.label;
  return `${labelOf(ctx, rel.from)} --[${rel.kind}; ${label}]--> ${labelOf(ctx, rel.to)}${rel.basis ? ` (basis: ${rel.basis})` : ''}`;
}

/** Optional attribute lines such as `guard: …`, in a fixed order; absent values are not invented. */
function attrLines(node: MNode, names: string[]): string[] {
  const out: string[] = [];
  for (const name of names) {
    const value = node.attributes[name];
    if (value === undefined) continue;
    out.push(`${name}: ${Array.isArray(value) ? value.join(' × ') : String(value)}`);
  }
  return out;
}

/** Lines for one child entity or relationship of a component (§7.6, §9.3–9.10). */
function childLines(ctx: Context, child: TargetRecord, node: MNode): string[] {
  const lines: string[] = [];
  const cap = (s: string) => `${s[0]!.toUpperCase()}${s.slice(1)}`;
  switch (child.kind) {
    case 'edge':
    case 'causal-link':
    case 'conversion':
    case 'dependency': {
      const line = relationshipLine(ctx, child.id);
      if (line) lines.push(line);
      if (child.kind === 'conversion') lines.push(...attrLines(node, ['loss', 'condition']));
      break;
    }
    case 'transition': {
      const line = relationshipLine(ctx, child.id);
      if (line) lines.push(line);
      lines.push(...attrLines(node, ['event', 'guard', 'action']));
      break;
    }
    case 'event': {
      // An event with no actor is in the one implicit lane of a time-scaled trace (§14.6).
      const actor = attr(node, 'actor');
      lines.push(`Event ${child.label} (${attr(node, 'kind') ?? 'event'}${actor ? `; actor: ${labelOf(ctx, actor)}` : ''})`);
      const after = ctx.relationships.filter((r) => r.kind === 'order' && r.to === child.id).map((r) => r.from);
      // Labels as on the page, each with its ID so a reader can find the target.
      lines.push(`after: ${after.length > 0 ? after.map((id) => `${labelOf(ctx, id)} (${id})`).join(', ') : '(none)'}`);
      const message = ctx.relationships.find((r) => r.kind === 'message' && r.id === child.id);
      if (message) lines.push(`${labelOf(ctx, message.from)} --[message; ${message.label}]--> ${labelOf(ctx, message.to)}`);
      lines.push(...attrLines(node, ['time', 'duration', 'branch']));
      break;
    }
    case 'branch': {
      lines.push(`Branch ${child.label}`);
      lines.push(...attrLines(node, ['condition']));
      const excl = node.attributes['exclusiveWith'];
      if (Array.isArray(excl) && excl.length > 0) lines.push(`exclusive with: ${excl.join(', ')}`);
      break;
    }
    case 'annotation': {
      const range = node.attributes['lines'];
      const region = node.attributes['region'];
      // With a `before` source, each annotation names its side (§14.7).
      const owner = child.parentId ? ctx.nodes.get(child.parentId) : undefined;
      const side = owner && attr(owner, 'before') ? `${attr(node, 'side') ?? 'after'}, ` : '';
      const where = Array.isArray(range) ? ` (${side}lines ${range.join('–')})` : side ? ` (${side.slice(0, -2)})` : '';
      lines.push(`Annotation ${child.label}${where}${Array.isArray(region) ? ` (region ${region.join(', ')})` : ''}`);
      break;
    }
    case 'steps': {
      // A walkthrough is a reading order; only a trace claims an execution
      // order (§14.1). The sentence shows in every graph mode and in a
      // domain (phase 6a review S1).
      const owner = child.parentId ? ctx.targets.get(child.parentId) : undefined;
      lines.push(owner && readingOrderFigure(owner.kind) ? `Steps. ${READING_ORDER}` : 'Steps');
      break;
    }
    case 'step': {
      const siblings = child.parentId ? childTargets(ctx, child.parentId).filter((k) => k.kind === 'step') : [];
      const targets = idList(node.attributes['targets']);
      lines.push(`${siblings.indexOf(child) + 1}. ${child.label}`);
      if (targets.length > 0) lines.push(`targets: ${targets.map((id) => `${labelOf(ctx, id)} (${id})`).join(', ')}`);
      break;
    }
    case 'state': {
      const flags = [node.attributes['initial'] === true ? 'initial' : '', node.attributes['terminal'] === true ? 'terminal' : ''].filter(Boolean);
      lines.push(`State ${child.label}${flags.length > 0 ? ` (${flags.join(', ')})` : ''}`);
      const outgoing = ctx.relationships.filter((r) => r.kind === 'transition' && r.from === child.id);
      lines.push(`outgoing: ${outgoing.length > 0 ? outgoing.map((r) => r.id).join(', ') : '(none)'}`);
      break;
    }
    case 'stage': {
      lines.push(`Stage ${child.label}`);
      lines.push(...attrLines(node, ['representation', 'shape', 'units', 'location', 'ownership']));
      const incoming = ctx.relationships.filter((r) => r.kind === 'conversion' && r.to === child.id);
      if (incoming.length > 1) lines.push(`inputs: ${incoming.map((r) => r.id).join(', ')} (merge)`);
      break;
    }
    case 'factor': {
      lines.push(`Factor ${child.label} (basis: ${attr(node, 'basis') ?? '?'})`);
      break;
    }
    case 'task': {
      lines.push(`Task ${child.label} (status: ${attr(node, 'status') ?? 'proposed'})`);
      lines.push(...attrLines(node, ['due', 'owner', 'output', 'acceptance', 'risk']));
      const prereqs = ctx.relationships.filter((r) => r.to === child.id && ['finish-start', 'input', 'decision'].includes(r.kind) && ctx.targets.get(r.id)?.kind === 'dependency');
      lines.push(`prerequisites: ${prereqs.length > 0 ? prereqs.map((r) => `${r.from} (${r.kind})`).join(', ') : '(none)'}`);
      break;
    }
    case 'part': {
      // Extension part (§14): its label and its source-visible attributes.
      const extra = Object.keys(node.attributes).filter((k) => k !== 'id' && k !== 'label').sort();
      lines.push(`Part ${child.label}`);
      lines.push(...attrLines(node, extra));
      break;
    }
    case 'group': {
      lines.push(`Group ${child.label}${attr(node, 'parent') ? ` (inside: ${attr(node, 'parent')})` : ''}`);
      break;
    }
    default: {
      const role = attr(node, 'role');
      const entity = attr(node, 'entity');
      const group = attr(node, 'group');
      lines.push(`${cap(child.kind)} ${child.label}${role ? ` (${role})` : ''}${entity ? ` (entity: ${entity})` : ''}${group ? ` (group: ${group})` : ''}`);
    }
  }
  return lines;
}

/** One child block: ID line, lines, body, evidence, then nested detail targets. */
function childBlock(ctx: Context, child: TargetRecord): string {
  const node = ctx.nodes.get(child.id)!;
  const parts = [idLine(child.id), ...childLines(ctx, child, node)];
  const body = bodyOf(ctx, node);
  if (body) parts.push(body);
  // A part with `evidence` names each source by its title and its ID, as the
  // `after:` lines do, so the Markdown carries the link from the part to the
  // source that shows it (docs/IMPROVEMENTS.md §4.4, ARCHITECTURE §7.6).
  // Cited sources stay in the body as [cite: ID].
  const own = PART_EVIDENCE_KINDS.has(child.kind) ? idList(node.attributes['evidence']) : [];
  if (own.length > 0) parts.push(...own.map((id) => `Evidence: ${labelOf(ctx, id)} (${id})`));
  else {
    const evidence = evidenceLine(ctx, child.id);
    if (evidence) parts.push(evidence);
  }
  const nested = childTargets(ctx, child.id).map((d) => childBlock(ctx, d));
  return [parts.join('\n'), ...nested].join('\n\n');
}

/**
 * Domain (docs/IMPROVEMENTS.md §5.4): the glossary first, one line per
 * concept ("Term: first sentence"), then each relation as "Order has Invoice
 * line (1..*)" with its label. The definitions stay in full at their own
 * place in the document.
 */
function domainBlocks(ctx: Context, record: TargetRecord): string[] {
  const kids = childTargets(ctx, record.id);
  const out: string[] = [];
  const nested = (id: string) => childTargets(ctx, id).map((d) => childBlock(ctx, d));
  for (const c of kids.filter((k) => k.kind === 'concept')) {
    const node = ctx.nodes.get(c.id)!;
    const defId = attr(node, 'definition');
    const defNode = defId ? ctx.nodes.get(defId) : undefined;
    const meaning = defNode ? firstSentence(inlineText(defNode, (n) => ctx.targetNodes.has(n))) : '';
    const lines = [idLine(c.id), `${c.label}: ${meaning}`];
    const attributes = Array.isArray(node.attributes['attributes']) ? (node.attributes['attributes'] as unknown[]).map(String) : [];
    const facts = [
      attr(node, 'category') ? `category: ${attr(node, 'category')}` : '',
      attributes.length > 0 ? `attributes: ${attributes.join(', ')}` : '',
      attr(node, 'entity') ? `entity: ${attr(node, 'entity')}` : '',
    ].filter(Boolean);
    if (facts.length > 0) lines.push(facts.join('; '));
    const body = bodyOf(ctx, node);
    if (body) lines.push(body);
    out.push([lines.join('\n'), ...nested(c.id)].join('\n\n'));
  }
  for (const r of kids.filter((k) => k.kind === 'relation')) {
    const node = ctx.nodes.get(r.id)!;
    const rel = ctx.relationships.find((x) => x.id === r.id);
    const cardinality = attr(node, 'cardinality');
    const verb = RELATION_VERBS[attr(node, 'kind') ?? ''] ?? attr(node, 'kind') ?? 'relates to';
    const lines = [idLine(r.id)];
    if (rel) lines.push(`${labelOf(ctx, rel.from)} ${verb} ${labelOf(ctx, rel.to)}${cardinality ? ` (${cardinality})` : ''}: ${r.label}`);
    const body = bodyOf(ctx, node);
    if (body) lines.push(body);
    out.push([lines.join('\n'), ...nested(r.id)].join('\n\n'));
  }
  for (const k of kids) if (k.kind !== 'concept' && k.kind !== 'relation') out.push(childBlock(ctx, k));
  return out;
}

/** Compare: options, then criteria rows listing every option; missing cells are "Not provided" (§9.8). */
function compareBlocks(ctx: Context, record: TargetRecord): string[] {
  const kids = childTargets(ctx, record.id);
  const options = kids.filter((k) => k.kind === 'option');
  const criteria = kids.filter((k) => k.kind === 'criterion');
  const cells = kids.filter((k) => k.kind === 'cell');
  const out: string[] = options.map((o) => childBlock(ctx, o));
  for (const c of criteria) {
    const cnode = ctx.nodes.get(c.id)!;
    const head = [idLine(c.id), `Criterion ${c.label}${attr(cnode, 'units') ? ` (units: ${attr(cnode, 'units')})` : ''}`];
    const cbody = bodyOf(ctx, cnode);
    if (cbody) head.push(cbody);
    const rows: string[] = [head.join('\n')];
    for (const o of options) {
      const cell = cells.find((k) => {
        const n = ctx.nodes.get(k.id)!;
        return attr(n, 'option') === o.id && attr(n, 'criterion') === c.id;
      });
      if (!cell) {
        rows.push(`- ${o.label}: Not provided`);
        continue;
      }
      const n = ctx.nodes.get(cell.id)!;
      const value = n.attributes['value'];
      const status = attr(n, 'valueStatus');
      const text = [value !== undefined ? String(value) : '', status ? `(${status})` : ''].filter(Boolean).join(' ');
      const body = bodyOf(ctx, n);
      const detail = [text, body.replace(/\s*\n+\s*/g, ' ')].filter((x) => x !== '').join(' — ');
      rows.push([idLine(cell.id), `- ${o.label}: ${detail || 'Not provided'}`].join('\n'));
    }
    out.push(rows.join('\n'));
  }
  // Cells whose option or criterion is missing still keep their ID line.
  const placed = new Set(cells.filter((k) => {
    const n = ctx.nodes.get(k.id)!;
    return options.some((o) => o.id === attr(n, 'option')) && criteria.some((c) => c.id === attr(n, 'criterion'));
  }).map((k) => k.id));
  for (const k of cells) if (!placed.has(k.id)) out.push(childBlock(ctx, k));
  for (const k of kids) if (!['option', 'criterion', 'cell'].includes(k.kind)) out.push(childBlock(ctx, k));
  return out;
}

/**
 * Measure (docs/IMPROVEMENTS.md §14.4): one table row per reading, in
 * authored order, with the value, its status, and its evidence. A reading's
 * ID line is in its first cell, because a table row has no line of its own.
 * A reading body follows the table.
 */
function measureBlocks(ctx: Context, record: TargetRecord, node: MNode): string[] {
  const unit = attr(node, 'unit');
  const kids = childTargets(ctx, record.id);
  const readings = kids.filter((k) => k.kind === 'reading');
  const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\s*\n+\s*/g, ' ');
  const rows = readings.map((r) => {
    const n = ctx.nodes.get(r.id)!;
    const evidence = idList(n.attributes['evidence']).map((id) => `${labelOf(ctx, id)} (${id})`).join(', ');
    return `| ${idLine(r.id)} ${cell(r.label)} | ${cell(withUnit(n.attributes['value'], unit, attr(n, 'display')))} | ${attr(n, 'valueStatus') ?? '?'} | ${cell(evidence) || 'none'} |`;
  });
  const out = [[`| Reading | Value | Status | Evidence |`, '|---|---|---|---|', ...rows].join('\n')];
  for (const r of readings) {
    const n = ctx.nodes.get(r.id)!;
    const body = bodyOf(ctx, n);
    if (body) out.push(`${r.label}: ${body}`);
    for (const d of childTargets(ctx, r.id)) out.push(childBlock(ctx, d));
  }
  for (const k of kids) if (k.kind !== 'reading') out.push(childBlock(ctx, k));
  return out;
}

/**
 * Tree (docs/IMPROVEMENTS.md §14.5): an indented list. Each entry starts
 * with its ID line, then the path, the label, and the role; its body and its
 * evidence follow, and its child entries are indented under it.
 */
function treeBlocks(ctx: Context, record: TargetRecord): string[] {
  const item = (entry: TargetRecord, depth: number): string[] => {
    const n = ctx.nodes.get(entry.id)!;
    const pad = '  '.repeat(depth);
    const role = attr(n, 'role');
    const lines = [`${pad}- ${idLine(entry.id)}`, `${pad}  \`${attr(n, 'path') ?? '?'}\`: ${entry.label}${role ? ` (role: ${role})` : ''}`];
    const body = bodyOf(ctx, n);
    if (body) lines.push(...body.split('\n').map((l) => (l ? `${pad}  ${l}` : '')));
    for (const id of idList(n.attributes['evidence'])) lines.push(`${pad}  Evidence: ${labelOf(ctx, id)} (${id})`);
    const kids = childTargets(ctx, entry.id);
    for (const k of kids) {
      if (k.kind === 'entry') lines.push(...item(k, depth + 1));
      else lines.push(...childBlock(ctx, k).split('\n').map((l) => (l ? `${pad}  ${l}` : '')));
    }
    return lines;
  };
  const kids = childTargets(ctx, record.id);
  const out = [kids.filter((k) => k.kind === 'entry').flatMap((k) => item(k, 0)).join('\n')];
  for (const k of kids) if (k.kind !== 'entry') out.push(childBlock(ctx, k));
  return out;
}

/**
 * The line diff of an annotated figure with a `before` source (§14.7), as a
 * unified diff fence: " " for a line on both sides, "-" for a removed line,
 * "+" for an added line.
 */
function diffFence(ctx: Context, figureId: string, beforeId: string, afterId: string): string | undefined {
  const text = (id: string) => ctx.nodes.get(id)?.children.find((c) => c.type === 'fence')?.attributes['content'];
  const before = text(beforeId);
  const after = text(afterId);
  if (typeof before !== 'string' || typeof after !== 'string') return undefined;
  const a = excerptLines(before);
  const b = excerptLines(after);
  const lines = (ctx.diffs.get(figureId) ?? lineDiff(a, b)).map((r) => (r.op === 'same' ? ` ${b[r.after]}` : r.op === 'removed' ? `-${a[r.before]}` : `+${b[r.after]}`));
  const marker = fenceMarker(lines.join('\n'));
  return [`${marker}diff`, ...lines, marker].join('\n');
}

function renderComponent(ctx: Context, record: TargetRecord, node: MNode): string[] {
  const out: string[] = [];
  const title = attr(node, 'title') ?? record.label;
  const mode = attr(node, 'mode');
  out.push(`**${record.kind}${mode ? ` (${mode})` : ''}: ${title}**`);
  const question = attr(node, 'question');
  if (question) out.push(`Question: ${question}`);
  if (record.kind === 'trace') {
    const scale = attr(node, 'scale') ?? 'ordinal';
    out.push(scale === 'ordinal' ? 'Ordering, not duration.' : `Time scale: ${attr(node, 'timeUnit') ?? '?'}.`);
  }
  if (mode === 'plan') out.push('Tasks are listed in source order; only the stated prerequisites order them.');
  if (record.kind === 'extension') {
    // The text form never depends on running the extension (§14.3).
    const extra = Object.keys(node.attributes).filter((k) => !['id', 'title', 'question', 'use'].includes(k)).sort();
    out.push([`Extension: ${attr(node, 'use') ?? '?'}`, ...attrLines(node, extra)].join('\n'));
  }
  const body = bodyOf(ctx, node);
  if (body) out.push(body);
  if (record.kind === 'annotated') {
    const before = attr(node, 'before');
    const after = attr(node, 'source');
    out.push(before ? `Before: ${before}\nAfter: ${after ?? '?'}` : `Source: ${after ?? '?'}`);
    const diff = before && after ? diffFence(ctx, record.id, before, after) : undefined;
    if (diff) out.push(diff);
  }
  if (record.kind === 'measure') out.push(`Unit: ${attr(node, 'unit') ?? '?'}. Each bar starts at zero.`);
  if (record.kind === 'measure') return [...out, ...measureBlocks(ctx, record, node)];
  if (record.kind === 'tree') return [...out, ...treeBlocks(ctx, record)];
  if (record.kind === 'compare') return [...out, ...compareBlocks(ctx, record)];
  if (record.kind === 'domain') return [...out, ...domainBlocks(ctx, record)];
  for (const child of childTargets(ctx, record.id)) out.push(childBlock(ctx, child));
  return out;
}

/** A Mermaid figure (§9.12): source text always; elements and relationships for parsed types. */
function renderMermaid(ctx: Context, record: TargetRecord, node: MNode, figure: MermaidFigure | undefined): string[] {
  const out: string[] = [`**mermaid (${figure?.declaredType || 'diagram'}): ${attr(node, 'title') ?? record.label}**`];
  const question = attr(node, 'question');
  if (question) out.push(`Question: ${question}`);
  // Interpretation, then the fenced Mermaid source without whole-line `%%` comments (§13.5).
  const shown = {
    ...node,
    children: node.children.map((c) => c.type === 'fence'
      ? { ...c, attributes: { ...c.attributes, content: stripMermaidComments(String(c.attributes['content'] ?? '')) } }
      : c),
  } as MNode;
  const body = bodyOf(ctx, shown);
  if (body) out.push(body);
  if (!figure || !figure.parsed) {
    out.push('Figure-level Mermaid diagram: its elements are not individually inspectable; the source above is the text form.');
    return out;
  }
  for (const e of figure.elements) {
    const marks = `${e.initial ? ' (initial)' : ''}${e.terminal ? ' (terminal)' : ''}`;
    const lines = [idLine(e.id), `${e.kind.replace('mermaid-', 'Mermaid ')} ${e.label}${marks}${e.name !== e.label ? ` (name: ${e.name})` : ''}`];
    if (e.members && e.members.length > 0) lines.push(`members: ${e.members.join(', ')}`);
    out.push(lines.join('\n'));
  }
  for (const r of figure.relationships) {
    const line = relationshipLine(ctx, r.id) ?? `${r.from} --[${r.kind}; ${r.label}]--> ${r.to}`;
    out.push(r.referenceable ? `${idLine(r.id)}\n${line}` : line);
  }
  return out;
}

function renderEntity(ctx: Context, record: TargetRecord, node: MNode): string[] {
  if (record.kind === 'definition') {
    return [`**Definition: ${record.label}**`, bodyOf(ctx, node)].filter((s) => s !== '');
  }
  if (record.kind === 'source') {
    const meta = ['kind', 'availability', 'language', 'url', 'repository', 'commit', 'file', 'start', 'end', 'excerptSha256', 'capturedAt']
      .filter((k) => node.attributes[k] !== undefined)
      .map((k) => `${k}: ${String(node.attributes[k])}`);
    return [`**Source: ${record.label}**`, meta.join('\n'), bodyOf(ctx, node)].filter((s) => s !== '');
  }
  return [`**${record.kind}: ${record.label}**`, bodyOf(ctx, node)].filter((s) => s !== '');
}

/**
 * The Markdown projection of a document. `diffs` holds the line diffs that
 * the compiler computed for the page, by figure ID, so a build computes each
 * diff once; without it the projection computes them.
 */
export function projectText(parsed: ParsedSource, targets?: Map<TargetId, TargetRecord>, diffs: ReadonlyMap<TargetId, readonly DiffRow[]> = new Map()): string {
  const model = buildTargetRecords(parsed);
  const ctx: Context = {
    targets: targets ?? model.targets,
    nodes: model.nodes,
    relationships: model.relationships,
    targetNodes: new Set(model.nodes.values()),
    mermaid: model.mermaid,
    diffs,
  };
  const title = typeof parsed.frontmatter['title'] === 'string' ? parsed.frontmatter['title'] : undefined;
  const docId = typeof parsed.frontmatter['docId'] === 'string' ? parsed.frontmatter['docId'] : undefined;
  const blocks: string[] = [`<!-- visser-text/1 docId=${docId ?? '?'} -->`];
  const topLevel = inCitationOrder([...ctx.targets.values()].filter((t) => t.parentId === undefined), sourceOrder(parsed.ast as MNode, ctx.targets));
  if (title && !(topLevel[0]?.kind === 'heading' && ctx.nodes.get(topLevel[0].id)?.attributes['level'] === 1)) {
    blocks.push(`# ${title}`);
  }
  for (const record of topLevel) {
    const node = ctx.nodes.get(record.id)!;
    if (record.kind === 'mermaid') {
      blocks.push([idLine(record.id), renderMermaid(ctx, record, node, ctx.mermaid.get(record.id)).join('\n\n')].join('\n'));
      continue;
    }
    // A note reads "Limit: …"; a self-check gives the question, then the answer (§14.2, §14.3).
    if (record.kind === 'note' || record.kind === 'self-check') {
      const body = bodyOf(ctx, node);
      const text = record.kind === 'note'
        ? `${noteWord(attr(node, 'kind'))}: ${body}`
        : `Self-check: ${attr(node, 'question') ?? record.label}\n\nAnswer: ${body}`;
      blocks.push([idLine(record.id), text].join('\n'));
      continue;
    }
    const isComponent = childTargets(ctx, record.id).length > 0 || ['graph', 'trace', 'transform', 'compare', 'annotated', 'domain', 'measure', 'tree', 'extension'].includes(record.kind);
    const parts = isComponent
      ? renderComponent(ctx, record, node)
      : ['definition', 'source', 'detail'].includes(record.kind)
        ? renderEntity(ctx, record, node)
        : [renderBlock(node)];
    blocks.push([idLine(record.id), parts.join('\n\n')].join('\n'));
  }
  return blocks.join('\n\n') + '\n';
}
