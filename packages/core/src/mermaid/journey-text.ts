import { sequenceMathTextReplacements } from './sequence-text.ts';
import type { JourneyLabelRole } from './journey-labels.ts';

/** Edits after native DB sanitation; shared by validation and the future renderer. */
export function journeyMathTextReplacements(text: string, role: JourneyLabelRole): readonly { start: number; end: number; text: string }[] {
  if (role === 'title' || role === 'accTitle' || role === 'accDescr') return sequenceMathTextReplacements(text);
  // Journey's raw SVG text paths do not decode entities or doubled slashes.
  // A break is a validation barrier even where the actor legend displays a
  // space; converting it to a space first could join an invalid expression.
  return [...text.matchAll(/<br\s*\/?>/gi)].map(match => ({ start: match.index, end: match.index + match[0].length, text: '\n' }));
}

/** Default journey textPlacement=fo keeps task/section break tags literal. */
export function journeyDisplayTextReplacements(text: string, role: JourneyLabelRole): readonly { start: number; end: number; text: string }[] {
  if (role === 'task' || role === 'section') return [];
  return journeyMathTextReplacements(text, role).map(edit => role === 'actor' ? { ...edit, text: ' ' } : edit);
}
