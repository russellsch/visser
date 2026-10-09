// Native comparison requires the contract's visserPrepareKanbanSanitizer
// before parsing. Mermaid otherwise installs its link hooks lazily on the
// first strict HTML-label pass, making a fresh SVG-only parse differ.
import {MathPolicyError} from '../math/policy.ts';
import {traceKanbanSanitation,sanitizeKanbanField,type KanbanSanitation} from './kanban-sanitize.ts';
import type {KanbanSanitizedField} from './kanban-source.ts';
import {ProvenanceText} from './source-provenance.ts';
import {sequenceMathTextReplacements} from './sequence-text.ts';
import {kanbanMathText} from './kanban-text.ts';

export type KanbanFieldRole='section'|'title'|'ticket'|'assigned';
export type KanbanFieldWitnesses=Readonly<{db?:KanbanSanitation;renderer?:KanbanSanitation}>;
export type KanbanNormalizedField=Readonly<{
  db?:KanbanSanitizedField;
  renderer?:KanbanSanitizedField;
  witnesses:KanbanFieldWitnesses;
  nativeInput:ProvenanceText;
  mappedInput:ProvenanceText;
  inputs:readonly ProvenanceText[];
}>;

function invalid(message:string):never {
  throw new MathPolicyError('E_MATH_INVALID',`kanban normalization: ${message}`);
}

function roleIsValid(role:unknown):role is KanbanFieldRole {
  return role==='section'||role==='title'||role==='ticket'||role==='assigned';
}

function decodePrivateEntities(value:ProvenanceText):ProvenanceText {
  return value.replaceRegex(/ﬂ°°/g,()=> '&#').replaceRegex(/ﬂ°/g,()=> '&').replaceRegex(/¶ß/g,()=> ';');
}

/**
 * Preserve source provenance while applying the same prelayout math-hook
 * preparation as kanbanMathText. This does not make native SVG Markdown
 * output part of the contract.
 */
export function mapKanbanMathInput(value:ProvenanceText):ProvenanceText {
  // Native createText also decodes these sentinels. In particular, the
  // section route has no earlier labelHelper decode/sanitize stage.
  const breaks=decodePrivateEntities(value).replaceRegex(/<\/?br\s*\/?>/gi,()=> '\n');
  const chunks:ProvenanceText[]=[];
  let cursor=0;
  for(const edit of sequenceMathTextReplacements(breaks.text)) {
    const formula=breaks.slice(edit.start,edit.end);
    chunks.push(breaks.slice(cursor,edit.start),formula.replace(0,formula.length,edit.text));
    cursor=edit.end;
  }
  const result=breaks.slice(0,0).concatAll([...chunks,breaks.slice(cursor,breaks.length)]);
  if(result.text!==kanbanMathText(value.text)) invalid('math text normalization differs');
  return result;
}

function own(object:object,key:'db'|'renderer'):boolean {
  return Object.hasOwn(object,key);
}

function witnessShape(role:KanbanFieldRole,witnesses:KanbanFieldWitnesses,htmlLabels:boolean):void {
  if(!witnesses||typeof witnesses!=='object'||Array.isArray(witnesses)) invalid('sanitation witnesses must be an object');
  if(Object.keys(witnesses).some(key=>key!=='db'&&key!=='renderer')) invalid('unknown sanitation stage');
  const hasDb=own(witnesses,'db'),hasRenderer=own(witnesses,'renderer');
  const required=role==='section'?{db:true,renderer:false}:role==='title'?{db:true,renderer:true}:{db:false,renderer:true};
  if(hasDb!==required.db||hasRenderer!==required.renderer) invalid(`sanitation stages differ for ${role}`);
  if(hasDb&&(!witnesses.db||witnesses.db.htmlLabels!==htmlLabels)) invalid(`DB sanitation mode differs for ${role}`);
  if(hasRenderer&&(!witnesses.renderer||witnesses.renderer.htmlLabels!==htmlLabels)) invalid(`renderer sanitation mode differs for ${role}`);
}

function field(witness:KanbanSanitation,value:ProvenanceText):KanbanSanitizedField {
  return Object.freeze({witness,value});
}

/**
 * Replay Kanban's label stages from sanitizer witnesses. Callers may replay
 * the same witnesses on another provenance root for independent positional
 * math accounting. The stage list intentionally retains equal text values.
 */
export function traceKanbanField(
  value:ProvenanceText,role:KanbanFieldRole,htmlLabels:boolean,witnesses:KanbanFieldWitnesses,
):KanbanNormalizedField {
  if(!roleIsValid(role)) invalid('unsupported field role');
  if(typeof htmlLabels!=='boolean') invalid('HTML-label mode must be boolean');
  witnessShape(role,witnesses,htmlLabels);

  const stages:ProvenanceText[]=[value];
  let db:KanbanSanitizedField|undefined;
  let renderer:KanbanSanitizedField|undefined;
  let nativeInput:ProvenanceText;
  if(role==='section'||role==='title') {
    db=field(witnesses.db!,traceKanbanSanitation(value,witnesses.db!));
    stages.push(db.value);
    if(role==='section') nativeInput=db.value;
    else {
      const decoded=decodePrivateEntities(db.value);
      stages.push(decoded);
      renderer=field(witnesses.renderer!,traceKanbanSanitation(decoded,witnesses.renderer!));
      stages.push(renderer.value);
      nativeInput=renderer.value;
    }
  } else {
    const decoded=decodePrivateEntities(value);
    stages.push(decoded);
    renderer=field(witnesses.renderer!,traceKanbanSanitation(decoded,witnesses.renderer!));
    stages.push(renderer.value);
    nativeInput=renderer.value;
  }
  const mappedInput=mapKanbanMathInput(nativeInput);
  return Object.freeze({
    ...(db===undefined?{}:{db}),...(renderer===undefined?{}:{renderer}),
    witnesses:Object.freeze({...witnesses}),nativeInput,mappedInput,
    inputs:Object.freeze(stages.map(mapKanbanMathInput)),
  });
}

/** Obtain private sanitizer witnesses, then replay the pure normalization.
 * Renderer helpers read fresh config: draw's htmlLabels=false affects only
 * its local config copy, so sanitation retains the supplied configured mode.
 */
export async function normalizeKanbanField(
  value:ProvenanceText,role:KanbanFieldRole,htmlLabels:boolean,
):Promise<KanbanNormalizedField> {
  if(!roleIsValid(role)) invalid('unsupported field role');
  if(typeof htmlLabels!=='boolean') invalid('HTML-label mode must be boolean');
  let witnesses:KanbanFieldWitnesses;
  if(role==='section') {
    const db=await sanitizeKanbanField(value,htmlLabels);
    witnesses=Object.freeze({db:db.witness});
  } else if(role==='title') {
    const db=await sanitizeKanbanField(value,htmlLabels);
    const rendererInput=decodePrivateEntities(db.value);
    const renderer=await sanitizeKanbanField(rendererInput,htmlLabels);
    witnesses=Object.freeze({db:db.witness,renderer:renderer.witness});
  } else {
    const rendererInput=decodePrivateEntities(value);
    const renderer=await sanitizeKanbanField(rendererInput,htmlLabels);
    witnesses=Object.freeze({renderer:renderer.witness});
  }
  return traceKanbanField(value,role,htmlLabels,witnesses);
}
