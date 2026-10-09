import { sequenceMathTextReplacements } from './sequence-text.ts';
import type { QuadrantLabelRole } from './quadrant-labels.ts';

/** Native quadrant labels use SVG text, including literal break markup. */
export function quadrantDisplayTextReplacements(text: string, _role: QuadrantLabelRole): readonly {start:number;end:number;text:string}[] {
  return sequenceMathTextReplacements(text);
}

/** A break cannot join two authored halves of an equation. */
export function quadrantMathTextReplacements(text: string, _role: QuadrantLabelRole): readonly {start:number;end:number;text:string}[] {
  const breaks = [...text.matchAll(/<br\s*\/?>/gi)].map(match=>({start:match.index,end:match.index+match[0].length,text:'\n'}));
  return [...sequenceMathTextReplacements(text),...breaks].sort((a,b)=>a.start-b.start);
}
