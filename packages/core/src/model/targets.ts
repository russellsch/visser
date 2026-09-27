// Target records with the derived fields of §7.1, and relationships (§9.2).
import type { Diagnostic, ParsedSource, ParsedTarget, TargetId, TargetRecord } from '../types.ts';
import { bodySha256, sha256Hex } from './hash.ts';
import { resolveMermaidFigures, type MermaidFigure } from '../mermaid/index.ts';

// Structural view of the Markdoc AST nodes read here (see syntax/parse.ts).
export type MNode = {
  type: string;
  tag?: string;
  inline?: boolean;
  lines: number[];
  attributes: Record<string, unknown>;
  children: MNode[];
};

export type SemanticRelationship = {
  id: string;
  from: TargetId;
  to: TargetId;
  kind: string;
  label: string;
  basis?: string;
  evidenceIds: TargetId[];
};

export type TargetModel = {
  targets: Map<TargetId, TargetRecord>;
  nodes: Map<TargetId, MNode>; // AST node of each target (the block after a marker)
  relationships: SemanticRelationship[];
  diagnostics: Diagnostic[];
  mermaid: Map<TargetId, MermaidFigure>; // §9.12, keyed by figure ID
};

// Attributes whose values name document-local IDs (§7.1 `dependencies`). The
// spec list is extended with the other ID-valued attributes of §9 (evidence,
// group, parent, branch, exclusiveWith), so they are checked and reported too.
const REF_ATTRIBUTES = ['from', 'to', 'actor', 'after', 'entity', 'source', 'option', 'criterion', 'evidence', 'group', 'parent', 'branch', 'exclusiveWith'];
// Inline tags that reference IDs; their attribute is `ref` or `targets`.
const INLINE_REF_TAGS = new Set(['cite', 'term', 'detail-link', 'focus']);
// Tags whose targets have a canonical detail element (§7.1 `inspectable`).
const COMPONENT_ROOTS = new Set(['graph', 'trace', 'transform', 'compare', 'annotated', 'mermaid', 'extension']);

const LABEL_LIMIT = 80;

function idsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  return [];
}

function codePoints(text: string, limit: number): string {
  return Array.from(text).slice(0, limit).join('');
}

/** Inline text of a node, without descending into child targets. */
export function inlineText(node: MNode, isTarget: (n: MNode) => boolean): string {
  const parts: string[] = [];
  const visit = (n: MNode) => {
    if (n !== node && isTarget(n)) return;
    switch (n.type) {
      case 'text':
      case 'code':
        parts.push(String(n.attributes['content'] ?? ''));
        return;
      case 'softbreak':
        parts.push(' ');
        return;
      case 'hardbreak':
        parts.push('\n');
        return;
      case 'fence':
        parts.push(String(n.attributes['content'] ?? '').replace(/\n$/, ''));
        return;
      case 'tag':
        if (n.tag === 'cite') return; // a citation marker is not prose
        break;
    }
    const blockBreak = ['paragraph', 'heading', 'item', 'blockquote', 'fence', 'tr'].includes(n.type);
    const before = parts.length;
    for (const child of n.children) visit(child);
    if (blockBreak && parts.length > before) parts.push('\n\n');
  };
  visit(node);
  return parts
    .join('')
    .split(/\n{2,}/)
    .map((block) => block.replace(/[ \t]+/g, ' ').trim())
    .filter((block) => block !== '')
    .join('\n\n');
}

/** IDs referenced by a node's own attributes and inline tags, excluding child targets. */
function referencedIds(node: MNode, isTarget: (n: MNode) => boolean): string[] {
  const found: string[] = [];
  for (const name of REF_ATTRIBUTES) found.push(...idsIn(node.attributes[name]));
  const visit = (n: MNode) => {
    if (n !== node && isTarget(n)) return;
    if (n.type === 'tag' && n.tag && INLINE_REF_TAGS.has(n.tag)) {
      found.push(...idsIn(n.attributes['ref']), ...idsIn(n.attributes['targets']));
    }
    for (const child of n.children) visit(child);
  };
  for (const child of node.children) visit(child);
  return [...new Set(found)];
}

function findNodes(ast: MNode, parsed: ParsedSource): Map<TargetId, MNode> {
  const byTagId = new Map<string, MNode>();
  const byFirstLine = new Map<number, MNode>();
  const walk = (n: MNode, depth: number) => {
    if (n.type === 'tag' && typeof n.attributes['id'] === 'string') byTagId.set(n.attributes['id'], n);
    if (depth === 1 && n.lines[0] !== undefined && !byFirstLine.has(n.lines[0])) byFirstLine.set(n.lines[0], n);
    for (const child of n.children) walk(child, depth + 1);
  };
  walk(ast, 0);
  const nodes = new Map<TargetId, MNode>();
  for (const t of parsed.targets) {
    if (t.origin === 'tag') {
      const node = byTagId.get(t.id);
      if (node) nodes.set(t.id, node);
    } else {
      // A marker target's block is the first top-level node after the marker line.
      const firstBlockLine = [...byFirstLine.keys()].filter((l) => l >= t.startLine).sort((a, b) => a - b)[0];
      const node = firstBlockLine === undefined ? undefined : byFirstLine.get(firstBlockLine);
      if (node) nodes.set(t.id, node);
    }
  }
  return nodes;
}

function headingLevel(node: MNode | undefined): number | undefined {
  if (node?.type !== 'heading') return undefined;
  const level = node.attributes['level'];
  return typeof level === 'number' ? level : undefined;
}

export function buildTargetRecords(parsed: ParsedSource): TargetModel {
  const diagnostics: Diagnostic[] = [];
  const targets = new Map<TargetId, TargetRecord>();
  const relationships: SemanticRelationship[] = [];
  const ast = parsed.ast as MNode | null;
  if (!ast || parsed.diagnostics.some((d) => d.severity === 'error')) {
    return { targets, nodes: new Map(), relationships, diagnostics, mermaid: new Map() };
  }

  const nodes = findNodes(ast, parsed);
  const targetNodes = new Set(nodes.values());
  const isTarget = (n: MNode) => targetNodes.has(n);
  const byId = new Map<TargetId, ParsedTarget>(parsed.targets.map((t) => [t.id, t]));
  const fileSha256 = sha256Hex(parsed.rawBytes);

  // Pass 1: explicit labels (labels may inherit through `entity`, which may point later).
  const explicitLabel = (t: ParsedTarget): string | undefined => {
    const a = t.attributes;
    for (const key of ['label', 'title', 'term']) if (typeof a[key] === 'string') return a[key] as string;
    return undefined;
  };

  const rootOf = (t: ParsedTarget): ParsedTarget => {
    let current = t;
    while (current.parentId && byId.has(current.parentId)) current = byId.get(current.parentId)!;
    return current;
  };

  // Section context: the nearest preceding heading at the same or a higher level.
  const headingStack: Array<{ id: TargetId; level: number }> = [];
  const sectionOf = new Map<TargetId, TargetId>();
  for (const t of parsed.targets) {
    if (t.parentId) continue;
    const level = headingLevel(nodes.get(t.id));
    if (level !== undefined) {
      while (headingStack.length > 0 && headingStack[headingStack.length - 1]!.level >= level) headingStack.pop();
      const parent = headingStack[headingStack.length - 1];
      if (parent) sectionOf.set(t.id, parent.id);
      headingStack.push({ id: t.id, level });
    } else {
      const current = headingStack[headingStack.length - 1];
      if (current) sectionOf.set(t.id, current.id);
    }
  }

  for (const t of parsed.targets) {
    const node = nodes.get(t.id);
    if (!node) {
      diagnostics.push({ code: 'E_SPAN_UNPROVEN', severity: 'error', message: `no AST node for target ${t.id}`, path: parsed.path, startLine: t.startLine, targetId: t.id });
      continue;
    }
    const root = rootOf(t);
    const kind = t.origin === 'tag' ? (t.tagName ?? t.kind) : t.kind;
    const isEntity = t.origin === 'tag' && (t.parentId !== undefined || ['definition', 'source', 'detail'].includes(kind));
    const body = inlineText(node, isTarget);
    const entityRef = typeof t.attributes['entity'] === 'string' ? (t.attributes['entity'] as string) : undefined;
    let label = explicitLabel(t);
    if (label === undefined && entityRef) label = explicitLabel(byId.get(entityRef) ?? t);
    if (label === undefined) label = kind === 'heading' ? body : codePoints(body.replace(/\s+/g, ' '), LABEL_LIMIT);
    const plainText = isEntity ? (body ? `${label}\n${body}` : label) : body;
    const section = sectionOf.get(root.id);

    const record: TargetRecord = {
      id: t.id,
      kind,
      label,
      span: { path: parsed.path, startByte: t.startByte, endByte: t.endByte, startLine: t.startLine, endLine: t.endLine, fileSha256 },
      bodySha256: bodySha256(parsed.rawBytes.subarray(t.startByte, t.endByte)),
      dependencies: referencedIds(node, isTarget),
      plainText,
      inspectable: isEntity || (t.parentId !== undefined && !COMPONENT_ROOTS.has(kind)),
    };
    if (t.parentId) {
      record.parentId = t.parentId;
      record.ownerComponentId = root.id;
    }
    if (section && section !== t.id) record.sectionId = section;
    targets.set(t.id, record);
  }

  const mermaid = addMermaidTargets(parsed, nodes, targets, relationships, diagnostics);

  // Reference integrity and the entity rule (§6.6, §9.3).
  for (const record of targets.values()) {
    for (const dep of record.dependencies) {
      if (!targets.has(dep)) {
        diagnostics.push({ code: 'E_REF_BROKEN', severity: 'error', message: `${record.id} refers to unknown target ${dep}`, path: parsed.path, startLine: record.span.startLine, targetId: record.id });
      }
    }
    const entity = byId.get(record.id)?.attributes['entity'];
    if (typeof entity === 'string' && targets.get(entity)?.kind.startsWith('mermaid-')) {
      diagnostics.push({ code: 'E_REF_BROKEN', severity: 'error', message: `entity ${entity} is a Mermaid element; Mermaid elements cannot be canonical entities in v1`, path: parsed.path, startLine: record.span.startLine, targetId: record.id });
    } else if (typeof entity === 'string') {
      const referenced = byId.get(entity);
      if (referenced && (referenced.tagName !== 'node' || referenced.attributes['entity'] !== undefined)) {
        diagnostics.push({ code: 'E_REF_BROKEN', severity: 'error', message: `entity ${entity} must name a node without its own entity`, path: parsed.path, startLine: record.span.startLine, targetId: record.id });
      }
    }
  }

  // Relationships (§9.2 kind table).
  const evidenceOf = (record: TargetRecord): TargetId[] => {
    const node = nodes.get(record.id)!;
    const ids = new Set<string>(idsIn(node.attributes['evidence']));
    const visit = (n: MNode) => {
      if (n !== node && isTarget(n)) return;
      if (n.type === 'tag' && n.tag === 'cite') for (const id of idsIn(n.attributes['ref'])) ids.add(id);
      for (const child of n.children) visit(child);
    };
    visit(node);
    return [...ids].sort();
  };
  for (const t of parsed.targets) {
    const record = targets.get(t.id);
    if (!record) continue;
    const a = t.attributes;
    const from = typeof a['from'] === 'string' ? a['from'] : undefined;
    const to = typeof a['to'] === 'string' ? a['to'] : undefined;
    const basis = typeof a['basis'] === 'string' ? { basis: a['basis'] } : {};
    const fixedKind: Record<string, string> = { transition: 'transition', 'causal-link': 'causal', conversion: 'conversion' };
    if (t.tagName === 'edge' && from && to) {
      relationships.push({ id: t.id, from, to, kind: String(a['kind']), label: record.label, ...basis, evidenceIds: evidenceOf(record) });
    } else if (t.tagName && fixedKind[t.tagName] && from && to) {
      relationships.push({ id: t.id, from, to, kind: fixedKind[t.tagName]!, label: record.label, ...basis, evidenceIds: evidenceOf(record) });
    } else if (t.tagName === 'dependency' && from && to) {
      relationships.push({ id: t.id, from, to, kind: typeof a['kind'] === 'string' ? a['kind'] : 'finish-start', label: record.label, evidenceIds: evidenceOf(record) });
    } else if (t.tagName === 'event') {
      if (to) relationships.push({ id: t.id, from: String(a['actor']), to, kind: 'message', label: record.label, evidenceIds: evidenceOf(record) });
      for (const prereq of idsIn(a['after'])) {
        relationships.push({ id: `${t.id}~after~${prereq}`, from: prereq, to: t.id, kind: 'order', label: 'happens before', evidenceIds: [] });
      }
    }
  }

  return { targets, nodes, relationships, diagnostics, mermaid };
}

/** The single ```mermaid fence of a `mermaid` figure, if the body has exactly one. */
export function mermaidFence(node: MNode): MNode | undefined {
  const fences = node.children.filter((c) => c.type === 'fence');
  if (fences.length !== 1 || fences[0]!.attributes['language'] !== 'mermaid') return undefined;
  return fences[0];
}

/**
 * Mermaid figures (§9.12): parse, then add elements as targets that share the
 * figure's span and body digest, and add their relationships. Referenceable
 * relationships (explicit flowchart edge IDs) are targets too.
 */
function addMermaidTargets(
  parsed: ParsedSource,
  nodes: Map<TargetId, MNode>,
  targets: Map<TargetId, TargetRecord>,
  relationships: SemanticRelationship[],
  diagnostics: Diagnostic[],
): Map<TargetId, MermaidFigure> {
  const figures = parsed.targets.filter((t) => t.tagName === 'mermaid' && targets.has(t.id));
  const inputs = figures.flatMap((t) => {
    const fence = mermaidFence(nodes.get(t.id)!);
    return fence ? [{ figureId: t.id, source: String(fence.attributes['content'] ?? '') }] : [];
  });
  const out = new Map<TargetId, MermaidFigure>();
  if (inputs.length === 0) return out;
  const resolved = resolveMermaidFigures(inputs);
  for (const t of figures) {
    const result = resolved.get(t.id);
    if (!result) continue;
    out.set(t.id, result.figure);
    const figureRecord = targets.get(t.id)!;
    // Fence body lines start after the opening tag line and the fence line.
    const fence = mermaidFence(nodes.get(t.id)!)!;
    const fenceLine = (fence.lines[0] ?? 0) + 1; // 1-based line of the ``` line
    for (const issue of result.issues) {
      const d: Diagnostic = { code: issue.code, severity: 'error', message: `mermaid ${t.id}: ${issue.message}`, path: parsed.path, targetId: t.id };
      d.startLine = issue.line !== undefined ? fenceLine + issue.line : t.startLine;
      diagnostics.push(d);
    }
    const shared = { span: { ...figureRecord.span }, bodySha256: figureRecord.bodySha256, parentId: t.id, ownerComponentId: t.id, inspectable: true };
    const section = figureRecord.sectionId;
    const add = (record: TargetRecord) => {
      if (targets.has(record.id)) {
        diagnostics.push({ code: 'E_ID_DUPLICATE', severity: 'error', message: `mermaid ${t.id}: target ID ${record.id} is already used in this document; use a distinctive Mermaid name`, path: parsed.path, startLine: t.startLine, targetId: record.id });
        return;
      }
      targets.set(record.id, record);
    };
    for (const e of result.figure.elements) {
      const record: TargetRecord = { id: e.id, kind: e.kind, label: e.label, ...shared, span: { ...shared.span }, dependencies: e.members ? [...e.members] : [], plainText: e.label };
      if (section) record.sectionId = section;
      add(record);
    }
    for (const r of result.figure.relationships) {
      relationships.push({ id: r.id, from: r.from, to: r.to, kind: r.kind, label: r.label, evidenceIds: [] });
      if (!r.referenceable) continue;
      const record: TargetRecord = { id: r.id, kind: r.kind, label: r.label || `${r.from} to ${r.to}`, ...shared, span: { ...shared.span }, dependencies: [r.from, r.to], plainText: r.label };
      if (section) record.sectionId = section;
      add(record);
    }
  }
  return out;
}
