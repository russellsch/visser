import {sequenceMathTextReplacements} from './sequence-text.ts';

// Sankey IDs are rendered as literal SVG text. Restore serialization only
// inside formulas; ordinary markup spelling remains visible as native text.
export const sankeyDisplayTextReplacements=sequenceMathTextReplacements;
export function sankeyMathTextReplacements(text:string):readonly {start:number;end:number;text:string}[] {
 const breaks=[...text.matchAll(/<br\s*\/?>/gi)].map(match=>({start:match.index,end:match.index+match[0].length,text:'\n'}));
 return [...sequenceMathTextReplacements(text),...breaks].sort((a,b)=>a.start-b.start);
}
