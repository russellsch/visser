// Native strict-mode sanitizeText witnesses for Kanban DB and SVG text paths.
// These helpers do not mutate Mermaid's shared DOMPurify dependency or config.
import { MathPolicyError } from '../math/policy.ts';
import type { ProvenanceText } from './source-provenance.ts';
import { traceMermaidHtmlPass } from './html-provenance.ts';
import { prepareSequenceSanitizer, sanitizeMermaidHtmlPass } from './sequence-sanitize.ts';

export type KanbanSanitation = Readonly<{ htmlLabels: boolean; passes: readonly string[] }>;

/** Validate witness shape and trace it; authenticity comes from the private
 * native-compatible purifier and later native-state reconciliation. */
export function traceKanbanSanitation(input: ProvenanceText, witness: KanbanSanitation): ProvenanceText {
  if (!witness || typeof witness !== 'object' || Array.isArray(witness)) {
    throw new MathPolicyError('E_MATH_INVALID', 'Kanban sanitation witness must be an object');
  }
  const count = input.length ? (witness.htmlLabels ? 2 : 1) : 0;
  if (typeof witness.htmlLabels !== 'boolean' || !Array.isArray(witness.passes) || witness.passes.length !== count) {
    throw new MathPolicyError('E_MATH_INVALID', 'Kanban sanitation pass contract differs');
  }
  let value = input;
  for (const output of witness.passes) {
    if (typeof output !== 'string' || (!value.text.includes('<') && output !== value.text)) {
      throw new MathPolicyError('E_MATH_INVALID', 'Kanban sanitation fast path differs');
    }
    value = traceMermaidHtmlPass(value, output);
  }
  return value;
}

/** Match strict/default sanitizeText: optional removeScript pass followed by
 * the native FORBID_TAGS style pass. Empty strings bypass both passes. */
export async function sanitizeKanbanField(input: ProvenanceText, htmlLabels = true): Promise<Readonly<{
  witness: KanbanSanitation; value: ProvenanceText;
}>> {
  if (typeof htmlLabels !== 'boolean') throw new MathPolicyError('E_MATH_INVALID', 'Kanban HTML-label mode must be boolean');
  const passes: string[] = [];
  let value = input.text;
  if (value) {
    await prepareSequenceSanitizer();
    if (htmlLabels) { value = sanitizeMermaidHtmlPass(value); passes.push(value); }
    value = sanitizeMermaidHtmlPass(value, { FORBID_TAGS: ['style'] }); passes.push(value);
  }
  const witness = Object.freeze({ htmlLabels, passes: Object.freeze(passes) });
  return Object.freeze({ witness, value: traceKanbanSanitation(input, witness) });
}
