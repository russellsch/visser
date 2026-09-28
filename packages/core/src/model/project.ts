// Semantic Markdown projection (§7.6). Generated from the model, not by
// stripping tags from source or scraping HTML. Every object is preceded by an
// `visser-text/1` ID line so tests can extract target IDs.
import type { ParsedSource, TargetId, TargetRecord } from '../types.ts';
import { buildTargetRecords, inlineText, type MNode, type SemanticRelationship } from './targets.ts';
import type { MermaidFigure } from '../mermaid/types.ts';
import { stripMermaidComments } from '../mermaid/rules.ts';
import { inCitationOrder, sourceOrder } from './citations.ts';

const idLine = (id: TargetId) => `<!-- vs:target ${id} -->`;

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
    case 'fence': return '```' + (attr(node, 'language') ?? '') + '\n' + String(node.attributes['content'] ?? '') + '```';
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

function evidenceLine(ctx: Context, id: string): string | undefined {
  const rel = ctx.relationships.find((r) => r.id === id);
  const ids = rel?.evidenceIds ?? [];
  return ids.length > 0 ? `Evidence: ${ids.join(', ')}` : undefined;
}

function childTargets(ctx: Context, parentId: string): TargetRecord[] {
  return [...ctx.targets.values()].filter((t) => t.parentId === parentId);
}

function relationshipLine(ctx: Context, id: string): string | undefined {
  const rel = ctx.relationships.find((r) => r.id === id);
  if (!rel) return undefined;
  return `${labelOf(ctx, rel.from)} --[${rel.kind}; ${rel.label}]--> ${labelOf(ctx, rel.to)}${rel.basis ? ` (basis: ${rel.basis})` : ''}`;
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
      const actor = attr(node, 'actor');
      lines.push(`Event ${child.label} (${attr(node, 'kind') ?? 'event'}; actor: ${actor ? labelOf(ctx, actor) : '?'})`);
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
      lines.push(`Annotation ${child.label}${Array.isArray(range) ? ` (lines ${range.join('–')})` : ''}${Array.isArray(region) ? ` (region ${region.join(', ')})` : ''}`);
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
      lines.push(...attrLines(node, ['owner', 'output', 'acceptance', 'risk']));
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
  const evidence = evidenceLine(ctx, child.id);
  if (evidence) parts.push(evidence);
  const nested = childTargets(ctx, child.id).map((d) => childBlock(ctx, d));
  return [parts.join('\n'), ...nested].join('\n\n');
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
  if (record.kind === 'annotated') out.push(`Source: ${attr(node, 'source') ?? '?'}`);
  if (record.kind === 'compare') return [...out, ...compareBlocks(ctx, record)];
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

export function projectText(parsed: ParsedSource, targets?: Map<TargetId, TargetRecord>): string {
  const model = buildTargetRecords(parsed);
  const ctx: Context = {
    targets: targets ?? model.targets,
    nodes: model.nodes,
    relationships: model.relationships,
    targetNodes: new Set(model.nodes.values()),
    mermaid: model.mermaid,
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
    const isComponent = childTargets(ctx, record.id).length > 0 || ['graph', 'trace', 'transform', 'compare', 'annotated', 'extension'].includes(record.kind);
    const parts = isComponent
      ? renderComponent(ctx, record, node)
      : ['definition', 'source', 'detail'].includes(record.kind)
        ? renderEntity(ctx, record, node)
        : [renderBlock(node)];
    blocks.push([idLine(record.id), parts.join('\n\n')].join('\n'));
  }
  return blocks.join('\n\n') + '\n';
}
