// Prompts for the shape of a document (IMPROVEMENTS.md §12.4, §6.2): the
// reader profile, the budgets by `kind`, label length, prose that repeats a
// part body, headings that name a topic, and Mermaid figures. Each message
// gives the measured value and the budget, so the author sees the distance.
import { type Context, FIGURE_TAGS, mainPath, partBodies, prompt, proseTargets, readableOf } from './context.ts';
import { formatCount, proseOf, wordsOf } from './text.ts';

/** Main-path words and figures by `kind` (§12.3 item 5). `reference` has no budget. */
export const BUDGETS: Readonly<Record<string, { words: number; figures: number }>> = {
  teaching: { words: 1200, figures: 5 },
  architecture: { words: 900, figures: 4 },
  'root-cause': { words: 800, figures: 3 },
  plan: { words: 600, figures: 2 },
  decision: { words: 700, figures: 2 },
};
/** Main-path words before the first figure. */
export const LEAD_WORDS = 120;
/** Kinds whose reader profile needs `mustUnderstand`. */
export const READER_KINDS = ['teaching', 'architecture', 'root-cause'];
export const NODE_LABEL_WORDS = 4;
export const EDGE_LABEL_WORDS = 5;
/** A run of this many words in a part body and in a paragraph is a copy. */
export const SHINGLE = 8;
/** An h2 needs this many words to state an answer. */
export const HEADING_WORDS = 3;

const NODE_TAGS = new Set(['node', 'state', 'factor', 'task', 'actor', 'stage', 'event', 'group', 'concept']);
const EDGE_TAGS = new Set(['edge', 'transition', 'causal-link', 'dependency', 'conversion', 'relation']);

/** The native component for each Mermaid diagram type (§6.2 item 3). */
export function nativeFor(declaredType: string): string | undefined {
  switch (declaredType) {
    case 'flowchart':
    case 'graph':
      return '`architecture` (who calls whom) or `transform` (how one value changes)';
    case 'sequenceDiagram':
      return '`trace` (one run, with waits and partial order)';
    case 'stateDiagram':
    case 'stateDiagram-v2':
      return '`state` (which transitions the system allows)';
    case 'erDiagram':
    case 'classDiagram':
      return '`domain` (which things exist, what each means, and how they relate)';
    case 'gantt':
      return '`plan`, with the source of each `due` date in `evidence`';
    default:
      return undefined;
  }
}

function kindOf(ctx: Context): string {
  const kind = ctx.bundle.parsed.frontmatter['kind'];
  return typeof kind === 'string' ? kind : '';
}

function reader(ctx: Context): void {
  const kind = kindOf(ctx);
  if (!READER_KINDS.includes(kind)) return;
  const profile = ctx.bundle.parsed.frontmatter['reader'] as { mustUnderstand?: unknown } | undefined;
  const items = Array.isArray(profile?.mustUnderstand) ? profile.mustUnderstand.length : 0;
  if (items > 0) return;
  prompt(ctx, 'W_READER', undefined, `reader.mustUnderstand has 0 items; a ${kind} document needs 2 to 5; list in the frontmatter what the reader can do after the page, each item testable`);
}

function budgets(ctx: Context): void {
  const path = mainPath(ctx);
  const budget = BUDGETS[kindOf(ctx)];
  const words = path.reduce((n, u) => n + u.words, 0);
  const figures = path.filter((u) => u.figure);
  if (budget && words > budget.words) {
    prompt(ctx, 'W_LENGTH', undefined, `the main path has ${formatCount(words)} words; the budget for a ${kindOf(ctx)} document is ${formatCount(budget.words)}; move depth into a \`detail\` or a part body, or split the document; never drop a caveat that changes the conclusion`);
  }
  if (budget && figures.length > budget.figures) {
    prompt(ctx, 'W_FIGURE_COUNT', figures[budget.figures]!.id, `the main path has ${figures.length} figures; the budget for a ${kindOf(ctx)} document is ${budget.figures}; remove a figure that prose answers as well, or split the document`);
  }
  const first = path.findIndex((u) => u.figure);
  if (first > 0) {
    const before = path.slice(0, first).reduce((n, u) => n + u.words, 0);
    if (before > LEAD_WORDS) {
      prompt(ctx, 'W_LATE_FIGURE', path[first]!.id, `${formatCount(before)} main-path words come before the first figure, ${path[first]!.id}; the budget is ${LEAD_WORDS}; open the section with the figure, and explain the path through it after`);
    }
  }
}

function labels(ctx: Context): void {
  const { parsed, model } = ctx.bundle;
  for (const root of parsed.targets) {
    if (!root.tagName || !FIGURE_TAGS.has(root.tagName)) continue;
    const long: string[] = [];
    for (const t of parsed.targets) {
      if (model.targets.get(t.id)?.ownerComponentId !== root.id || !t.tagName) continue;
      const label = t.attributes['label'];
      if (typeof label !== 'string') continue;
      const limit = NODE_TAGS.has(t.tagName) ? NODE_LABEL_WORDS : EDGE_TAGS.has(t.tagName) ? EDGE_LABEL_WORDS : undefined;
      const n = wordsOf(label).length;
      if (limit !== undefined && n > limit) long.push(`${t.id} (${n} words, limit ${limit})`);
    }
    if (long.length === 0) continue;
    prompt(ctx, 'W_LABEL_LENGTH', root.id, `in ${root.id}, ${long.length} label${long.length === 1 ? ' is' : 's are'} over the limit: ${long.join(', ')}; a node label has at most ${NODE_LABEL_WORDS} words and an edge label at most ${EDGE_LABEL_WORDS}; move the rest into the part body`);
  }
}

const tokens = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

/**
 * The words of one target with inline code removed. A code-span placeholder
 * would make two different lists of code spans look like one copy
 * (skill-prompts-review-1, F5).
 */
function wordsWithoutCode(ctx: Context, id: string): string[] {
  const node = ctx.bundle.model.nodes.get(id);
  return node ? tokens(proseOf(node, ctx.isTarget)) : [];
}

/** An 8-word run that a paragraph copies from a part body (§12.2 J). */
function duplicates(ctx: Context): void {
  const shingles = new Map<string, string>(); // shingle -> part ID
  for (const { id } of partBodies(ctx)) {
    const words = wordsWithoutCode(ctx, id);
    for (let i = 0; i + SHINGLE <= words.length; i++) {
      const key = words.slice(i, i + SHINGLE).join(' ');
      if (!shingles.has(key)) shingles.set(key, id);
    }
  }
  if (shingles.size === 0) return;
  const figureIds = new Set(ctx.bundle.parsed.targets.filter((t) => t.tagName && FIGURE_TAGS.has(t.tagName)).map((t) => t.id));
  for (const { id } of proseTargets(ctx)) {
    const record = ctx.bundle.model.targets.get(id);
    if (!record || !['paragraph', 'list', 'table'].includes(record.kind) && !figureIds.has(id)) continue;
    const words = wordsWithoutCode(ctx, id);
    let best = { length: 0, start: 0, part: '' };
    for (let i = 0; i + SHINGLE <= words.length; i++) {
      const part = shingles.get(words.slice(i, i + SHINGLE).join(' '));
      if (!part) continue;
      let end = i + SHINGLE;
      while (end < words.length && shingles.get(words.slice(end - SHINGLE + 1, end + 1).join(' ')) === part) end++;
      if (end - i > best.length) best = { length: end - i, start: i, part };
      i = end - SHINGLE;
    }
    if (best.length === 0) continue;
    const run = words.slice(best.start, best.start + Math.min(best.length, 10)).join(' ');
    prompt(ctx, 'W_DUPLICATE', id, `${id} repeats ${best.length} words of the body of ${best.part} ("${run}${best.length > 10 ? ' …' : ''}"); the limit is ${SHINGLE - 1}; the part body carries the why of the part, so say it once`);
  }
}

function headings(ctx: Context): void {
  // A reference document is looked up by topic, so a topic heading is correct there (F20).
  if (kindOf(ctx) === 'reference') return;
  for (const t of ctx.bundle.parsed.targets) {
    const node = ctx.bundle.model.nodes.get(t.id);
    if (node?.type !== 'heading' || node.attributes['level'] !== 2) continue;
    const text = readableOf(ctx, t.id);
    const n = wordsOf(text).length;
    if (n >= HEADING_WORDS) continue;
    prompt(ctx, 'W_HEADING', t.id, `heading ${t.id} ("${text}") has ${n} word${n === 1 ? '' : 's'}; the minimum is ${HEADING_WORDS}; state the answer, for example "Where an ID comes from", not a topic`);
  }
}

function mermaid(ctx: Context): void {
  for (const figure of ctx.bundle.model.mermaid.values()) {
    const native = nativeFor(figure.declaredType);
    const type = figure.declaredType || 'an unknown type';
    prompt(ctx, 'W_MERMAID', figure.figureId, native
      ? `${figure.figureId} is a Mermaid ${type}; 1 Mermaid figure, and the budget is 0; use ${native}; a native component gives each part an ID, a body, and evidence`
      : `${figure.figureId} is a Mermaid ${type}; 1 Mermaid figure, and the budget is 0; no native component draws it; keep it only if the reader accepts a figure without inspectable parts, or use a table`);
  }
}

export function shapeRules(ctx: Context): void {
  reader(ctx);
  budgets(ctx);
  labels(ctx);
  duplicates(ctx);
  headings(ctx);
  mermaid(ctx);
}
