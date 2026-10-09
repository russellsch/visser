import {erGenericTextEdits} from './er-generic-text.ts';
import type {ProvenanceText} from './source-provenance.ts';

/** Each generated bracket belongs to the single authored tilde it replaces.
 * Equation units remain exact copies; no placeholder or text matching is used. */
export function mapERGenericText(value:ProvenanceText):ProvenanceText {
  const chunks:ProvenanceText[]=[];let cursor=0;
  for(const edit of erGenericTextEdits(value.text)) {
    const unit=value.slice(edit.start,edit.end);
    chunks.push(value.slice(cursor,edit.start),unit.replace(0,1,edit.text));cursor=edit.end;
  }
  chunks.push(value.slice(cursor,value.length));
  return value.slice(0,0).concatAll(chunks);
}
