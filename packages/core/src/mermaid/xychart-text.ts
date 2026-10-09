import { sequenceMathTextReplacements } from './sequence-text.ts';
import type { XYLabelRole } from './xychart-labels.ts';

/** Native xychart labels use SVG text, including literal break markup. */
export function xychartDisplayTextReplacements(text: string, _role: XYLabelRole): readonly {start:number;end:number;text:string}[] {
  return sequenceMathTextReplacements(text);
}

/** A break cannot join two authored halves of an equation. */
export function xychartMathTextReplacements(text: string, _role: XYLabelRole): readonly {start:number;end:number;text:string}[] {
  const breaks = [...text.matchAll(/<br\s*\/?>/gi)].map(match=>({start:match.index,end:match.index+match[0].length,text:'\n'}));
  return [...sequenceMathTextReplacements(text),...breaks].sort((a,b)=>a.start-b.start);
}
