// Class tokens are decoded again when Mermaid's serialized SVG is inserted.
// Retain original bytes for ordinary classes and definition lookup, inserting
// a namespace only at original offsets of effective reserved token starts.
import { DecodingMode } from 'entities/decode';
import { decodeHtmlReferences } from './html-provenance.ts';
import { ProvenanceText } from './source-provenance.ts';

function effective(value:string):ProvenanceText {
  // Serialization escapes literal ampersands before Mermaid restores its own
  // sentinels. Consequently raw &references are not recursively decoded.
  const escaped=ProvenanceText.identity(value).replaceRegex(/&/g,()=> '&amp;').replaceRegex(/"/g,()=> '&quot;');
  const restored=escaped.replaceRegex(/ﬂ°°/g,()=> '&#').replaceRegex(/ﬂ°/g,()=> '&').replaceRegex(/¶ß/g,()=> ';');
  return decodeHtmlReferences(restored,DecodingMode.Attribute);
}
const reserved=/(^|[\t\n\f\r ])(vs-[^\t\n\f\r ]+)/g;
export function stateAuthorClasses(value:string):string {
  const decoded=effective(value), offsets:number[]=[];
  for(const match of decoded.text.matchAll(reserved)) {
    const start=match.index+match[1]!.length;
    const origin=decoded.mapRange(start,start+1);
    if(origin.synthetic || origin.intervals.length!==1) throw new Error('State class prefix has ambiguous origin');
    offsets.push(origin.intervals[0]!.start);
  }
  if(!offsets.length) return value;
  const chunks:string[]=[];let at=0;
  for(const start of offsets) {chunks.push(value.slice(at,start),'mermaid-authored-');at=start;}
  chunks.push(value.slice(at));const result=chunks.join('');
  if([...effective(result).text.matchAll(reserved)].length) throw new Error('State class namespace isolation failed');
  return result;
}
