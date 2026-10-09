/** Pre-addText generic syntax for ER math-bearing table fields. Equations use
 * Mermaid's single-line delimiter rule and are opaque to generic pairing.
 * Unlike the native overlapping-comma merge, accumulated spans are never
 * discarded. Plain fields must continue through the native renderer path.
 * No HTML decoding, escaping, sanitizer or TeX validation occurs here. */
export type ERGenericEdit = Readonly<{start:number;end:number;text:'<'|'>'}>;
type Segment = {start:number;tildes:number[]};

export function erGenericTextEdits(text:string):readonly ERGenericEdit[] {
  const equations=text.matchAll(/\$\$(.*?)\$\$/g);
  let equation=equations.next();
  const segments:Segment[]=[];
  let segment:Segment={start:0,tildes:[]};
  for(let i=0;i<text.length;i++) {
    if(!equation.done&&i===equation.value.index) {
      i+=equation.value[0].length-1;
      equation=equations.next();
    } else if(text[i]===',') {
      segments.push(segment);segment={start:i+1,tildes:[]};
    } else if(text[i]==='~') segment.tildes.push(i);
  }
  segments.push(segment);
  const groups:Segment[]=[];
  for(let i=0;i<segments.length;i++) {
    const current=segments[i]!;
    if(i>0&&segments[i-1]!.tildes.length===1&&current.tildes.length===1) {
      // Extend the complete accumulated group, not just the previous segment.
      // This retains prefixes the pinned native overlapping merge discards.
      groups.at(-1)!.tildes.push(current.tildes[0]!);
    } else groups.push({start:current.start,tildes:[...current.tildes]});
  }
  const edits:ERGenericEdit[]=[];
  for(const group of groups) {
    const skip=group.tildes.length%2===1&&text[group.start]==='~'?1:0;
    const count=group.tildes.length-skip,pairs=Math.floor(count/2);
    for(let i=0;i<count;i++) {
      if(i>=pairs&&i<count-pairs)continue;
      const start=group.tildes[i+skip]!;
      edits.push(Object.freeze({start,end:start+1,text:i<pairs?'<':'>'}));
    }
  }
  return Object.freeze(edits);
}

export function erGenericText(text:string):string {
  const chunks:string[]=[];let cursor=0;
  for(const edit of erGenericTextEdits(text)) {
    chunks.push(text.slice(cursor,edit.start),edit.text);cursor=edit.end;
  }
  chunks.push(text.slice(cursor));return chunks.join('');
}
