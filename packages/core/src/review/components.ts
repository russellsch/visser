// Review prompts for the components of IMPROVEMENTS.md §14. Like the other
// prompts, each is a warning that starts with "review:" and never changes an
// exit code.
//
// - W_EVIDENCE_GAP: a measure `reading` with no `evidence` (§14.4), and a
//   trace `observation` with no `evidence` (§14.6).
// - W_NOTE_DENSITY: more notes than one for each 300 main-path words, the
//   admonition habit (§14.2). A document can always have one note. In a
//   `kind: decision` record the guide asks for one assumption note for each
//   assumption, so only the limit and warning notes count there (phase 6a
//   review C12).
// - W_SELF_CHECK: a `self-check` outside a `kind: teaching` document (§14.3).
// - W_WALKTHROUGH_VALUE: a walkthrough on a small figure, or a walkthrough
//   that merely visits one different part per step (§14.1).
import { type Context, mainPath, prompt } from './context.ts';

/** A note for each this many main-path words (IMPROVEMENTS.md §14.2). */
export const WORDS_PER_NOTE = 300;
/** Four or fewer drawn parts are clearer without a walkthrough control. */
export const WALKTHROUGH_MIN_PARTS = 5;

const WALKTHROUGH_NON_PARTS = new Set(['steps', 'step', 'detail']);

function ownEvidence(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function walkthroughRules(ctx: Context): void {
  const { parsed, model } = ctx.bundle;
  for (const walkthrough of parsed.targets.filter((t) => t.tagName === 'steps')) {
    const ownerId = walkthrough.parentId;
    if (!ownerId) continue;
    const steps = parsed.targets.filter((t) => t.parentId === walkthrough.id && t.tagName === 'step');
    const parts = parsed.targets.filter((t) => {
      if (!t.tagName || t.id === ownerId || WALKTHROUGH_NON_PARTS.has(t.tagName)) return false;
      return model.targets.get(t.id)?.ownerComponentId === ownerId;
    });

    if (parts.length < WALKTHROUGH_MIN_PARTS) {
      prompt(ctx, 'W_WALKTHROUGH_VALUE', walkthrough.id, `walkthrough ${walkthrough.id} guides a figure with ${parts.length} drawn parts; for four or fewer parts, explain the key observation in figure prose or a focus link`);
      continue;
    }

    const targets = steps.map((step) => ownEvidence(step.attributes['targets']));
    const singletons = targets.map((ids) => ids[0]);
    if (steps.length >= 2 && targets.every((ids) => ids.length === 1) && new Set(singletons).size === steps.length) {
      prompt(ctx, 'W_WALKTHROUGH_VALUE', walkthrough.id, `walkthrough ${walkthrough.id} is a part-by-part tour: ${steps.length} steps each name one different part; group related parts into conceptual phases that add an invariant, boundary, contrast, or consequence, or remove the walkthrough`);
    }
  }
}

export function componentRules(ctx: Context): void {
  const { parsed } = ctx.bundle;
  for (const t of parsed.targets) {
    if (t.tagName === 'reading' && ownEvidence(t.attributes['evidence']).length === 0) {
      prompt(ctx, 'W_EVIDENCE_GAP', t.id, `reading ${t.id} has no \`evidence\`; a number on the page names the source that shows it`);
    }
    if (t.tagName === 'event' && t.attributes['kind'] === 'observation' && ownEvidence(t.attributes['evidence']).length === 0) {
      prompt(ctx, 'W_EVIDENCE_GAP', t.id, `observation ${t.id} has no \`evidence\`; name the log line, the alert, or the metric that shows it`);
    }
  }

  const decision = parsed.frontmatter['kind'] === 'decision';
  const notes = parsed.targets.filter((t) => t.tagName === 'note' && !(decision && t.attributes['kind'] === 'assumption'));
  if (notes.length > 1) {
    const words = mainPath(ctx).reduce((sum, u) => sum + u.words, 0);
    const allowed = Math.max(1, Math.floor(words / WORDS_PER_NOTE));
    if (notes.length > allowed) {
      prompt(ctx, 'W_NOTE_DENSITY', notes[allowed]!.id, `${notes.length} notes for ${words} main-path words; the budget is one note for each ${WORDS_PER_NOTE} words (${allowed} here); keep the notes the reader must not miss, and put a caveat that changes the conclusion in the main sentence`);
    }
  }

  if (parsed.frontmatter['kind'] !== 'teaching') {
    for (const t of parsed.targets.filter((x) => x.tagName === 'self-check')) {
      prompt(ctx, 'W_SELF_CHECK', t.id, `self-check ${t.id} is in a \`kind: ${String(parsed.frontmatter['kind'] ?? '?')}\` document; a self-check is for \`kind: teaching\`; remove it, or state the answer in prose`);
    }
  }

  walkthroughRules(ctx);
}
