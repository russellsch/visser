import {MathPolicyError} from '../math/policy.ts';
import type {ProvenanceText} from './source-provenance.ts';
import {sanitizeKanbanField,traceKanbanSanitation,type KanbanSanitation} from './kanban-sanitize.ts';
import {sequenceMathTextReplacements} from './sequence-text.ts';
import {mapERGenericText} from './er-generic-provenance.ts';
import {erMathText,erSanitizerOwned,erRendererSanitizes,erDisplayPathValid,type ERDisplayPath} from './er-text.ts';
function invalid(message:string):never{throw new MathPolicyError('E_MATH_INVALID',`ER display normalization: ${message}`);}
const decode=(value:ProvenanceText)=>value.replaceRegex(/ﬂ°°/g,()=> '&#').replaceRegex(/ﬂ°/g,()=> '&').replaceRegex(/¶ß/g,()=> ';');

export function mapERMathInput(value:ProvenanceText,path:ERDisplayPath):ProvenanceText {
  if(!erDisplayPathValid(path))invalid('invalid display path');
  const breaks=decode(value).replaceRegex(/<\/?br\s*\/?>/gi,()=> '\n');
  let result=breaks;
  if(erSanitizerOwned(path)) {
    const chunks:ProvenanceText[]=[];let cursor=0;
    for(const edit of sequenceMathTextReplacements(breaks.text)) {
      const entity=breaks.slice(edit.start,edit.end);
      chunks.push(breaks.slice(cursor,edit.start),entity.replace(0,entity.length,edit.text));cursor=edit.end;
    }
    chunks.push(breaks.slice(cursor,breaks.length));result=breaks.slice(0,0).concatAll(chunks);
  }
  if(path==='table')result=mapERGenericText(result);
  if(result.text!==erMathText(value.text,path))invalid('pure and mapped text differ');
  return result;
}
export type ERDisplayNormalization=Readonly<{
  path:ERDisplayPath;htmlLabels:boolean;witness?:KanbanSanitation;
  nativeInput:ProvenanceText;mappedInput:ProvenanceText;
  /** Raw/pre-sanitizer/sanitized stage inputs. No premature entity recovery. */
  stages:readonly ProvenanceText[];
}>;

/** Group inputs must already be DB-sanitized and trimmed. group-node covers
 * labelHelper's ordinary-node route and temporary group measurement; actual
 * layout selects the route, not an authored empty/nonempty-group heuristic. */
export function traceERDisplayField(
  value:ProvenanceText,path:ERDisplayPath,htmlLabels:boolean,witness?:KanbanSanitation,
):ERDisplayNormalization {
  if(!erDisplayPathValid(path)||typeof htmlLabels!=='boolean')invalid('invalid path or mode');
  const stages=[value];let nativeInput=value,detached:KanbanSanitation|undefined;
  if(erRendererSanitizes(path)) {
    if(!witness||typeof witness!=='object'||Array.isArray(witness)||Object.keys(witness).length!==2
      ||!Object.hasOwn(witness,'htmlLabels')||!Object.hasOwn(witness,'passes')||witness.htmlLabels!==htmlLabels||!Array.isArray(witness.passes))invalid('renderer sanitation witness differs');
    detached=Object.freeze({htmlLabels,passes:Object.freeze([...witness.passes])});
    const decoded=decode(value);stages.push(decoded);
    nativeInput=traceKanbanSanitation(decoded,detached);stages.push(nativeInput);
  } else if(witness!==undefined)invalid('unexpected renderer sanitation');
  const mappedInput=mapERMathInput(nativeInput,path);
  return Object.freeze({path,htmlLabels,...(detached?{witness:detached}:{}),nativeInput,mappedInput,stages:Object.freeze(stages)});
}

/** Strict/default sanitation with the same prepared native link-hook
 * precondition as the ER DB normalizer. No native/global state is changed. */
export async function normalizeERDisplayField(
  value:ProvenanceText,path:ERDisplayPath,htmlLabels:boolean,
):Promise<ERDisplayNormalization> {
  if(!erDisplayPathValid(path)||typeof htmlLabels!=='boolean')invalid('invalid path or mode');
  const witness=erRendererSanitizes(path)?(await sanitizeKanbanField(decode(value),htmlLabels)).witness:undefined;
  return traceERDisplayField(value,path,htmlLabels,witness);
}
