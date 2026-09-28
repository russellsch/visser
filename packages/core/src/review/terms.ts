// Prompts for defined terms (IMPROVEMENTS.md §13.6): a definition that the
// main path never uses, and a term that collides with another term or with the
// name of a tag or a mode that the document uses. Both read the `aliases` of a
// definition. A definition with `auto=false` is linked by hand only: it is
// used when a `term` tag names it, and it never collides.
//
// A use counts only where the build links it (§13.3): the match is the
// build's own `TermMatcher`, over the text that the build links. That is the
// prose, lists, tables, and blockquotes of the main path, and each top-level
// figure's question, interpretation, part bodies, and drawn labels. Headings,
// code, links, and the text inside a `term`, `cite`, `focus`, or
// `detail-link` tag are not linked, so they do not count. A plural is linked
// only through `aliases`, so a plural use alone gets a prompt that says so.
import { TermMatcher } from '../compiler/autolink.ts';
import type { MNode } from '../model/targets.ts';
import { type Context, FIGURE_TAGS, prompt } from './context.ts';

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A whole-word, case-insensitive match of a term, with an optional plural ending. */
export function termPattern(term: string): RegExp {
  const words = term.trim().split(/\s+/).map(escape).join('\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}_-])${words}(?:s|es)?(?![\\p{L}\\p{N}_-])`, 'iu');
}

/** A term without case, extra spaces, or a plural ending, for comparison. */
export function termKey(term: string): string {
  return term.trim().replace(/\s+/g, ' ').toLowerCase().replace(/(?:es|s)$/, '');
}

/** A definition, with its aliases, and `auto` false when the build must not link its term. */
type Definition = { id: string; term: string; aliases: string[]; auto: boolean };

function definitions(ctx: Context): Definition[] {
  // The label of a domain concept is an alias of the definition that it
  // owns, as in the build's auto-link (IMPROVEMENTS.md §5.4).
  const conceptLabels = new Map<string, string[]>();
  for (const t of ctx.bundle.parsed.targets) {
    const def = t.attributes['definition'];
    const label = t.attributes['label'];
    if (t.tagName === 'concept' && typeof def === 'string' && typeof label === 'string' && label.trim() !== '') {
      conceptLabels.set(def, [...(conceptLabels.get(def) ?? []), label.trim()]);
    }
  }
  return ctx.bundle.parsed.targets
    .filter((t) => t.tagName === 'definition' && typeof t.attributes['term'] === 'string')
    .map((t) => {
      const aliases = t.attributes['aliases'];
      const term = (t.attributes['term'] as string).trim();
      const authored = Array.isArray(aliases) ? aliases.filter((a): a is string => typeof a === 'string' && a.trim() !== '').map((a) => a.trim()) : [];
      const fromConcepts = (conceptLabels.get(t.id) ?? []).filter((l) => termKey(l) !== termKey(term) && !authored.some((a) => termKey(a) === termKey(l)));
      return {
        id: t.id,
        term,
        aliases: [...authored, ...fromConcepts],
        auto: t.attributes['auto'] !== false,
      };
    });
}

/** The term and the aliases of a definition. */
const phrasesOf = (def: Definition) => [def.term, ...def.aliases];

/** The IDs that `{% term ref %}` tags inside the main path point to. */
function termRefs(ctx: Context, ids: string[]): Set<string> {
  const refs = new Set<string>();
  const visit = (n: MNode, root: MNode) => {
    if (n !== root && ctx.isTarget(n)) return;
    if (n.type === 'tag' && n.tag === 'term' && typeof n.attributes['ref'] === 'string') refs.add(n.attributes['ref'] as string);
    for (const child of n.children) visit(child, root);
  };
  for (const id of ids) {
    const node = ctx.bundle.model.nodes.get(id);
    if (node) visit(node, node);
  }
  return refs;
}

// A character that no term can contain: it separates two text runs, so a
// match never joins the end of one run and the start of the next.
const RUN_BREAK = '\u0000';
const MAIN_BLOCKS = new Set(['paragraph', 'list', 'table', 'blockquote']);
// Figures whose parts have drawn labels with term links (svg.ts).
const DRAWN_FIGURES = new Set(['graph', 'transform', 'trace']);
// Inline tags whose text is already a link, so the build does not link inside it.
const LINK_TAGS = new Set(['term', 'cite', 'focus', 'detail-link']);

/** The text of `node` that the build links (§13.3), without its child targets. */
function linkableText(ctx: Context, node: MNode): string {
  const parts: string[] = [];
  const visit = (n: MNode) => {
    if (n !== node && ctx.isTarget(n)) return;
    switch (n.type) {
      case 'text': parts.push(String(n.attributes['content'] ?? '')); return;
      case 'softbreak': case 'hardbreak': parts.push(' '); return;
      case 'heading': case 'code': case 'fence': case 'link': case 'comment': parts.push(RUN_BREAK); return;
      case 'tag': if (n.tag && LINK_TAGS.has(n.tag)) { parts.push(RUN_BREAK); return; } break;
    }
    for (const child of n.children) visit(child);
    parts.push(RUN_BREAK);
  };
  visit(node);
  return parts.join('');
}

/** The main-path text that the build links, and the IDs of the targets it comes from. */
function linkableMainPath(ctx: Context): { text: string; ids: string[] } {
  const texts: string[] = [];
  const ids: string[] = [];
  const add = (id: string, text: string) => {
    ids.push(id);
    texts.push(text);
  };
  const figures = new Map<string, string>(); // top-level figure ID -> tag name
  for (const t of ctx.bundle.parsed.targets) {
    if (t.parentId) continue;
    const node = ctx.bundle.model.nodes.get(t.id);
    const record = ctx.bundle.model.targets.get(t.id);
    if (!node || !record) continue;
    if (t.tagName && FIGURE_TAGS.has(t.tagName)) {
      figures.set(t.id, t.tagName);
      const question = node.attributes['question'];
      add(t.id, `${typeof question === 'string' ? question : ''}${RUN_BREAK}${linkableText(ctx, node)}`);
    } else if (MAIN_BLOCKS.has(record.kind)) {
      add(t.id, linkableText(ctx, node));
    }
  }
  // The parts of each top-level figure: the body, and the label where the figure draws it.
  for (const t of ctx.bundle.parsed.targets) {
    const owner = ctx.bundle.model.targets.get(t.id)?.ownerComponentId;
    if (!owner || owner === t.id || !figures.has(owner) || t.tagName === 'detail') continue;
    const node = ctx.bundle.model.nodes.get(t.id);
    if (!node) continue;
    const label = node.attributes['label'];
    add(t.id, `${DRAWN_FIGURES.has(figures.get(owner)!) && typeof label === 'string' ? label : ''}${RUN_BREAK}${linkableText(ctx, node)}`);
  }
  return { text: texts.join(RUN_BREAK), ids };
}

function unused(ctx: Context, defs: Definition[]): void {
  const { text, ids } = linkableMainPath(ctx);
  const refs = termRefs(ctx, ids);
  const matcher = new TermMatcher(defs);
  const linked = new Set(matcher.split(text).flatMap((seg) => (typeof seg === 'string' ? [] : [seg.defId])));
  for (const def of defs) {
    if (refs.has(def.id)) continue;
    if (!def.auto) {
      // With auto=false the build links no use, so only a `term` tag reaches the definition.
      prompt(ctx, 'W_TERM_UNUSED', def.id, `definition ${def.id} ("${def.term}") has auto=false and 0 {% term %} tags on the main path; the minimum is 1; tag a use with {% term ref="${def.id}" %}, or remove the definition`);
      continue;
    }
    if (linked.has(def.id)) continue;
    // Another definition owns a phrase of this one: W_TERM_COLLISION reports it.
    if (phrasesOf(def).some((p) => (matcher.ownerOf(p) ?? def.id) !== def.id)) continue;
    // A plural, or a use that only the plural rule of W_JARGON sees: the build does not link it.
    const plural = phrasesOf(def).map((p) => termPattern(p).exec(text)?.[0]).find((m): m is string => m !== undefined);
    if (plural) {
      prompt(ctx, 'W_TERM_UNUSED', def.id, `definition ${def.id} ("${def.term}") has 0 linked uses on the main path; the minimum is 1; the text uses "${plural}", which the build does not link; add aliases=["${plural.toLowerCase()}"] to the definition`);
      continue;
    }
    prompt(ctx, 'W_TERM_UNUSED', def.id, `definition ${def.id} ("${def.term}") has 0 uses on the main path; the minimum is 1; remove the definition, or use its term instead of a synonym (a use in a heading or in code is not linked)`);
  }
}

function collisions(ctx: Context, defs: Definition[]): void {
  // A definition with auto=false is linked by hand only, so its term cannot
  // take the auto-link of another definition (IMPROVEMENTS.md §13.6).
  const linked = defs.filter((d) => d.auto);
  const byKey = new Map<string, Definition[]>();
  for (const def of linked) {
    for (const key of new Set(phrasesOf(def).map(termKey))) byKey.set(key, [...(byKey.get(key) ?? []), def]);
  }
  const reported = new Set<string>();
  for (const [key, group] of byKey) {
    if (group.length < 2) continue;
    for (const def of group.slice(1)) {
      if (reported.has(def.id)) continue;
      reported.add(def.id);
      const same = termKey(def.term) === key && termKey(group[0]!.term) === key;
      const what = same ? 'the same term as' : `the phrase "${key}" in common with`;
      prompt(ctx, 'W_TERM_COLLISION', def.id, `definition ${def.id} ("${def.term}") has ${what} ${group[0]!.id} ("${group[0]!.term}"); ${group.length} definitions share one term, and the budget is 1; merge them, rename one term, or set auto=false on one and tag its uses by hand`);
    }
  }
  // A term that is also the name of a tag or a mode that this document uses.
  // Each name maps to what it is, so the message says "tag" or "mode".
  const names = new Map<string, 'tag' | 'mode'>();
  for (const t of ctx.bundle.parsed.targets) {
    if (t.tagName && t.tagName !== 'definition' && t.tagName !== 'term' && !names.has(t.tagName)) names.set(t.tagName, 'tag');
    if (typeof t.attributes['mode'] === 'string' && !names.has(t.attributes['mode'] as string)) names.set(t.attributes['mode'] as string, 'mode');
  }
  for (const def of linked) {
    const keys = new Set(phrasesOf(def).map(termKey));
    const hit = [...names.keys()].find((n) => keys.has(termKey(n)));
    if (!hit) continue;
    prompt(ctx, 'W_TERM_COLLISION', def.id, `definition ${def.id} ("${def.term}") uses the word of a ${names.get(hit)} that this document uses (\`${hit}\`); 1 collision, and the budget is 0; rename the term, or set auto=false and tag its uses by hand, so that one word has one meaning`);
  }
}

export function termRules(ctx: Context): void {
  const defs = definitions(ctx);
  if (defs.length === 0) return;
  unused(ctx, defs);
  collisions(ctx, defs);
}
