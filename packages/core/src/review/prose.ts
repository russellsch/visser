// Prompts for Simplified Technical English (IMPROVEMENTS.md §11.3): sentence
// length, passive voice, contractions, vague quantities, and two labels for
// one entity. Each message gives the measured value and the budget. The tests
// are simple text rules, so they have false positives: they are questions for
// the author, never verdicts.
import { CODE_WORD, type Context, partBodies, prompt, proseTargets } from './context.ts';
import { sentences, visibleAttributes, withoutQuotes, wordsOf } from './text.ts';

/** A description has at most 25 words (ASD-STE 100); an instruction has at most 20. */
export const SENTENCE_LIMIT = 25;

// Past participles that do not end in -ed.
const IRREGULAR = ['built', 'bound', 'broken', 'brought', 'caught', 'chosen', 'done', 'drawn', 'driven', 'found', 'forgotten',
  'given', 'held', 'hidden', 'kept', 'known', 'left', 'lost', 'made', 'meant', 'paid', 'put', 'read', 'run', 'seen', 'sent', 'set',
  'shown', 'split', 'spent', 'taken', 'thrown', 'told', 'understood', 'written', 'shut', 'thought', 'sold', 'won', 'begun', 'frozen'];
// Participles that usually state a property, not an action with a hidden agent.
export const PASSIVE_ALLOWED = new Set(['based', 'stored', 'called', 'named', 'required', 'allowed', 'supported', 'closed',
  'finished', 'fixed', 'sorted', 'signed', 'locked', 'expected', 'interested', 'concerned', 'involved', 'limited', 'related',
  'enabled', 'disabled', 'bounded', 'shared', 'cached']);
const BE = '(?:is|are|was|were|be|been|being)';
const ADVERB = '(?:not|also|only|then|now|never|always|still|already|usually|often|first|later|all|each|thus|therefore)';
// Words that end in -ed but are not participles.
const NOT_PARTICIPLE = new Set(['red', 'bed', 'shed', 'need', 'feed', 'seed', 'speed', 'embed', 'exceed', 'proceed', 'succeed',
  'indeed', 'hundred', 'sacred', 'naked', 'wicked', 'rugged', 'bred']);
// The participle ends at a word boundary that is not a hyphen: "read-only"
// and "built-in" are adjectives (skill-prompts-review-1, F2).
const PASSIVE = new RegExp(`\\b${BE}\\s+(?:${ADVERB}\\s+)?([a-z]+ed|${IRREGULAR.join('|')})(?![\\w-])`, 'gi');

// `n't`, `'re`, `'ve`, `'ll`, `'d`, `'m`, and `'s` after a pronoun ("it's"); a possessive `'s` is not a contraction.
const CONTRACTION = /\b(?:[a-z]+n['’]t|[a-z]+['’](?:re|ve|ll|d|m)|(?:it|that|there|here|what|who|where|how|let|he|she)['’]s)\b/gi;

// "How many" asks for a number, and "as many X as Y" states an exact
// comparison, so neither is vague (skill-prompts-review-1, F3).
const VAGUE_QUANTITY = /(?<![-\w])(some|several|(?<!\b(?:how|as)\s+)many|a few|various|numerous|a number of|a lot of|lots of|a couple of)(?![-\w])/gi;

function preview(sentence: string): string {
  const words = sentence.split(/\s+/).map((w) => (w === CODE_WORD ? '`…`' : w));
  return words.length > 8 ? `${words.slice(0, 8).join(' ')} …` : sentence;
}

function sentenceLength(ctx: Context): void {
  for (const { id, text } of [...proseTargets(ctx), ...partBodies(ctx)]) {
    const long = sentences(text).map((s) => ({ s, n: wordsOf(s).length })).filter((x) => x.n > SENTENCE_LIMIT);
    if (long.length === 0) continue;
    const longest = long.reduce((a, b) => (b.n > a.n ? b : a));
    prompt(ctx, 'W_SENTENCE_LENGTH', id, `${id} has ${long.length} sentence${long.length === 1 ? '' : 's'} over ${SENTENCE_LIMIT} words (longest: ${longest.n} words, "${preview(longest.s)}"); the limit is ${SENTENCE_LIMIT} for a description and 20 for an instruction; give each idea its own sentence`);
  }
}

/** Each word of each `state` label, in lower case: "is retired" names a state, not a hidden agent (F19). */
function stateWords(ctx: Context): Set<string> {
  const out = new Set<string>();
  for (const t of ctx.bundle.parsed.targets) {
    const label = t.attributes['label'];
    if (t.tagName !== 'state' || typeof label !== 'string') continue;
    for (const w of label.toLowerCase().match(/[a-z]+/g) ?? []) out.add(w);
  }
  return out;
}

function passive(ctx: Context): void {
  const states = stateWords(ctx);
  for (const { id, text } of proseTargets(ctx)) {
    const found: string[] = [];
    for (const m of withoutQuotes(text).matchAll(PASSIVE)) {
      const participle = m[1]!.toLowerCase();
      // An un- participle ("unchanged", "undefined") is an adjective.
      if (PASSIVE_ALLOWED.has(participle) || NOT_PARTICIPLE.has(participle) || /^un.+ed$/.test(participle)) continue;
      if (states.has(participle)) continue;
      found.push(m[0].replace(/\s+/g, ' '));
    }
    if (found.length === 0) continue;
    const shown = [...new Set(found)].slice(0, 3).map((f) => `"${f}"`).join(', ');
    prompt(ctx, 'W_PASSIVE', id, `${id} has ${found.length} passive phrase${found.length === 1 ? '' : 's'} (${shown}); the budget is 0; name who acts: "The worker retries the charge", not "The charge is retried"`);
  }
}

function contractions(ctx: Context): void {
  const scopes = [...proseTargets(ctx), ...partBodies(ctx)];
  // Labels, titles, and questions are visible text too.
  for (const t of ctx.bundle.parsed.targets) {
    const node = ctx.bundle.model.nodes.get(t.id);
    if (!node) continue;
    const labels = visibleAttributes(node).join('\n');
    const existing = scopes.find((s) => s.id === t.id);
    if (existing) existing.text = `${labels}\n${existing.text}`;
    else if (labels) scopes.push({ id: t.id, text: labels });
  }
  for (const { id, text } of scopes) {
    const found = [...withoutQuotes(text).matchAll(CONTRACTION)].map((m) => m[0]);
    if (found.length === 0) continue;
    prompt(ctx, 'W_CONTRACTION', id, `${id} has ${found.length} contraction${found.length === 1 ? '' : 's'} (${[...new Set(found)].join(', ')}); the budget is 0; write the full words, for example "do not" and "it is"`);
  }
}

function vagueQuantities(ctx: Context): void {
  for (const { id, text } of proseTargets(ctx)) {
    const found = [...withoutQuotes(text).matchAll(VAGUE_QUANTITY)].map((m) => m[0].toLowerCase());
    if (found.length === 0) continue;
    prompt(ctx, 'W_VAGUE_QUANTITY', id, `${id} has ${found.length} vague quantit${found.length === 1 ? 'y' : 'ies'} (${[...new Set(found)].join(', ')}); the budget is 0; give the number, or say "one or more"`);
  }
}

/** Two different labels for one `entity` (one word for one meaning). */
function synonyms(ctx: Context): void {
  const { parsed } = ctx.bundle;
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  const labelOf = (id: string): string | undefined => {
    const a = ctx.byId.get(id)?.attributes;
    return typeof a?.['label'] === 'string' ? (a['label'] as string) : typeof a?.['term'] === 'string' ? (a['term'] as string) : undefined;
  };
  const byEntity = new Map<string, Array<{ id: string; label: string }>>();
  for (const t of parsed.targets) {
    const entity = t.attributes['entity'];
    const label = t.attributes['label'];
    if (typeof entity !== 'string' || typeof label !== 'string') continue;
    const list = byEntity.get(entity) ?? [];
    list.push({ id: t.id, label });
    byEntity.set(entity, list);
  }
  for (const [entity, parts] of byEntity) {
    const canonical = labelOf(entity);
    const labels = new Set([...(canonical ? [norm(canonical)] : []), ...parts.map((p) => norm(p.label))]);
    if (labels.size <= 1) continue;
    for (const part of parts) {
      if (canonical !== undefined ? norm(part.label) === norm(canonical) : norm(part.label) === norm(parts[0]!.label)) continue;
      prompt(ctx, 'W_SYNONYM', part.id, `${part.id} is labelled "${part.label}", but its entity ${entity} is "${canonical ?? parts[0]!.label}"; ${labels.size} labels for one entity, and the budget is 1; use one word for one meaning, or omit the label to inherit it`);
    }
  }
}

export function proseRules(ctx: Context): void {
  sentenceLength(ctx);
  passive(ctx);
  contractions(ctx);
  vagueQuantities(ctx);
  synonyms(ctx);
}
