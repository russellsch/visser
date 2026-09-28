// Shared state and helpers for the editorial review prompts: the prompt
// constructor, and the three text scopes that the prompts read.
//
// - The main path (IMPROVEMENTS.md §12.3 item 5): top-level headings,
//   paragraphs, lists, tables, and blockquotes, and the interpretation text of
//   each top-level figure. Part bodies, details, definitions (the appendix), and
//   captured sources are not on the main path.
// - Prose (§11.3): paragraphs, lists, tables, and headings at any depth,
//   details, definitions, and figure interpretations. A blockquote is quoted
//   material, and code is an identifier; neither is prose.
// - Part bodies: the text inside a figure part (a node, an edge, a cell).
import type { LoadedBundle } from '../model/bundle.ts';
import type { MNode } from '../model/targets.ts';
import type { Diagnostic, ParsedTarget, TargetId } from '../types.ts';
import { proseOf, visibleAttributes, wordsOf } from './text.ts';

export type Context = {
  bundle: LoadedBundle;
  byId: Map<TargetId, ParsedTarget>;
  isTarget: (n: MNode) => boolean;
  out: Diagnostic[];
};

/** Tags that draw a figure on the page. */
export const FIGURE_TAGS = new Set(['graph', 'trace', 'transform', 'compare', 'annotated', 'domain', 'measure', 'tree', 'mermaid', 'extension']);
const MAIN_PROSE_KINDS = new Set(['heading', 'paragraph', 'list', 'table', 'blockquote']);
// A note and a self-check are prose too (IMPROVEMENTS.md §14.2, §14.3).
const PROSE_KINDS = new Set(['heading', 'paragraph', 'list', 'table', 'definition', 'detail', 'note', 'self-check']);

/** One inline code span counts as one word. */
export const CODE_WORD = 'CODE';

/** Add one review prompt. A prompt with no target names the document (frontmatter, line 1). */
export function prompt(ctx: Context, code: string, targetId: TargetId | undefined, message: string): void {
  const record = targetId ? ctx.bundle.model.targets.get(targetId) : undefined;
  ctx.out.push({
    code,
    severity: 'warning',
    message: `review: ${message}`,
    path: 'index.md',
    ...(record ? { startLine: record.span.startLine } : targetId ? {} : { startLine: 1 }),
    ...(targetId ? { targetId } : {}),
  });
}

/** Visible attributes and prose of one target. */
export function textOf(ctx: Context, id: TargetId): string {
  const node = ctx.bundle.model.nodes.get(id);
  if (!node) return '';
  return [...visibleAttributes(node), proseOf(node, ctx.isTarget)].join('\n');
}

/** The prose of one target, with each inline code span as one word. */
export function readableOf(ctx: Context, id: TargetId): string {
  const node = ctx.bundle.model.nodes.get(id);
  return node ? proseOf(node, ctx.isTarget, CODE_WORD) : '';
}

export type MainUnit = { id: TargetId; figure: boolean; text: string; words: number };

/** The main path in document order: top-level prose blocks and top-level figures (with their interpretation text). */
export function mainPath(ctx: Context): MainUnit[] {
  const out: MainUnit[] = [];
  for (const t of ctx.bundle.parsed.targets) {
    if (t.parentId) continue;
    const record = ctx.bundle.model.targets.get(t.id);
    if (!record) continue;
    const figure = t.tagName !== undefined && FIGURE_TAGS.has(t.tagName);
    if (!figure && !MAIN_PROSE_KINDS.has(record.kind)) continue;
    const text = readableOf(ctx, t.id);
    out.push({ id: t.id, figure, text, words: wordsOf(text).length });
  }
  return out;
}

/** Prose targets (any depth): the scope of the prose prompts. Blockquotes are quoted material. */
export function proseTargets(ctx: Context): Array<{ id: TargetId; text: string }> {
  const out: Array<{ id: TargetId; text: string }> = [];
  for (const t of ctx.bundle.parsed.targets) {
    const record = ctx.bundle.model.targets.get(t.id);
    if (!record) continue;
    const figure = t.tagName !== undefined && FIGURE_TAGS.has(t.tagName);
    if (!figure && !PROSE_KINDS.has(record.kind)) continue;
    out.push({ id: t.id, text: readableOf(ctx, t.id) });
  }
  return out;
}

/** Parts of a figure (a node, an edge, an event, a cell) with their body text. */
export function partBodies(ctx: Context): Array<{ id: TargetId; text: string }> {
  const out: Array<{ id: TargetId; text: string }> = [];
  for (const t of ctx.bundle.parsed.targets) {
    const record = ctx.bundle.model.targets.get(t.id);
    if (!record?.ownerComponentId || record.ownerComponentId === t.id || !t.tagName) continue;
    if (FIGURE_TAGS.has(t.tagName) || t.tagName === 'detail') continue;
    out.push({ id: t.id, text: readableOf(ctx, t.id) });
  }
  return out;
}
