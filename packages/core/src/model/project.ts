// Semantic Markdown projection (§7.6). Generated from the model, not by
// stripping tags from source or scraping HTML. Every object is preceded by an
// `explain-text/1` ID line so tests can extract target IDs.
import type { ParsedSource, TargetId, TargetRecord } from '../types.ts';
import { buildTargetRecords, inlineText, type MNode, type SemanticRelationship } from './targets.ts';

const idLine = (id: TargetId) => `<!-- ex:target ${id} -->`;

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

function renderComponent(ctx: Context, record: TargetRecord, node: MNode): string[] {
  const out: string[] = [];
  const title = attr(node, 'title') ?? record.label;
  const mode = attr(node, 'mode');
  out.push(`**${record.kind}${mode ? ` (${mode})` : ''}: ${title}**`);
  const question = attr(node, 'question');
  if (question) out.push(`Question: ${question}`);
  if (record.kind === 'trace' && (attr(node, 'scale') ?? 'ordinal') === 'ordinal') out.push('Ordering, not duration.');
  const body = bodyOf(ctx, node);
  if (body) out.push(body);
  if (record.kind === 'annotated') out.push(`Source: ${attr(node, 'source') ?? '?'}`);

  for (const child of childTargets(ctx, record.id)) {
    const childNode = ctx.nodes.get(child.id)!;
    const childBody = bodyOf(ctx, childNode);
    const lines: string[] = [idLine(child.id)];
    switch (child.kind) {
      case 'edge':
      case 'transition':
      case 'causal-link':
      case 'conversion':
      case 'dependency': {
        const rel = ctx.relationships.find((r) => r.id === child.id);
        if (rel) lines.push(`${labelOf(ctx, rel.from)} --[${rel.kind}; ${rel.label}]--> ${labelOf(ctx, rel.to)}${rel.basis ? ` (basis: ${rel.basis})` : ''}`);
        break;
      }
      case 'event': {
        const actor = attr(childNode, 'actor');
        lines.push(`Event ${child.label} (${attr(childNode, 'kind') ?? 'event'}; actor: ${actor ? labelOf(ctx, actor) : '?'})`);
        const after = ctx.relationships.filter((r) => r.kind === 'order' && r.to === child.id).map((r) => r.from);
        lines.push(`after: ${after.length > 0 ? after.join(', ') : '(none)'}`);
        const branch = attr(childNode, 'branch');
        if (branch) lines.push(`branch: ${branch}`);
        break;
      }
      case 'annotation': {
        const range = childNode.attributes['lines'];
        lines.push(`Annotation ${child.label}${Array.isArray(range) ? ` (lines ${range.join('–')})` : ''}`);
        break;
      }
      default: {
        const role = attr(childNode, 'role');
        const entity = attr(childNode, 'entity');
        lines.push(`${child.kind[0]!.toUpperCase()}${child.kind.slice(1)} ${child.label}${role ? ` (${role})` : ''}${entity ? ` (entity: ${entity})` : ''}`);
      }
    }
    if (childBody) lines.push(childBody);
    const evidence = evidenceLine(ctx, child.id);
    if (evidence) lines.push(evidence);
    out.push(lines.join('\n'));
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
  };
  const title = typeof parsed.frontmatter['title'] === 'string' ? parsed.frontmatter['title'] : undefined;
  const docId = typeof parsed.frontmatter['docId'] === 'string' ? parsed.frontmatter['docId'] : undefined;
  const blocks: string[] = [`<!-- explain-text/1 docId=${docId ?? '?'} -->`];
  const topLevel = [...ctx.targets.values()].filter((t) => t.parentId === undefined);
  if (title && !(topLevel[0]?.kind === 'heading' && ctx.nodes.get(topLevel[0].id)?.attributes['level'] === 1)) {
    blocks.push(`# ${title}`);
  }
  for (const record of topLevel) {
    const node = ctx.nodes.get(record.id)!;
    const isComponent = childTargets(ctx, record.id).length > 0 || ['graph', 'trace', 'transform', 'compare', 'annotated'].includes(record.kind);
    const parts = isComponent
      ? renderComponent(ctx, record, node)
      : ['definition', 'source', 'detail'].includes(record.kind)
        ? renderEntity(ctx, record, node)
        : [renderBlock(node)];
    blocks.push([idLine(record.id), parts.join('\n\n')].join('\n'));
  }
  return blocks.join('\n\n') + '\n';
}
