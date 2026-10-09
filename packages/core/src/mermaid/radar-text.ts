import { sequenceMathTextReplacements } from './sequence-text.ts';
import type { RadarLabelRole } from './radar-labels.ts';

/** Native radar labels use SVG text, including literal break markup. */
export function radarDisplayTextReplacements(text: string, _role: RadarLabelRole): readonly {start:number;end:number;text:string}[] {
  return ['title','accTitle','accDescr'].includes(_role)?sequenceMathTextReplacements(text):[];
}

/** A break cannot join two authored halves of an equation. */
export function radarMathTextReplacements(text: string, _role: RadarLabelRole): readonly {start:number;end:number;text:string}[] {
  const breaks = [...text.matchAll(/<br\s*\/?>/gi)].map(match=>({start:match.index,end:match.index+match[0].length,text:'\n'}));
  return [...radarDisplayTextReplacements(text,_role),...breaks].sort((a,b)=>a.start-b.start);
}
