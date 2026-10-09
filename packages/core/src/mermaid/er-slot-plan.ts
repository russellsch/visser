import {MathPolicyError} from '../math/policy.ts';
import {planERDagreLabels,type ERPreparedLabel} from './er-dagre-labels.ts';
import {planERElkLabels,type ERElkLabel} from './er-elk-labels.ts';
import type {ERNormalizedDbEffects} from './er-db-effects.ts';
import type {ERLabels} from './er-labels.ts';
import type {observeERLayoutOwners,tagERLayoutOwners} from './er-layout-owners.ts';
import type {projectEROwners} from './er-owners.ts';
import {enumerateERDagreSlots,enumerateERElkSlots,type ERRenderSlot} from './er-slots.ts';

type Tagged=ReturnType<typeof tagERLayoutOwners>;
type Observed=ReturnType<typeof observeERLayoutOwners>;
type SourceLabel=ERElkLabel|ERPreparedLabel;

export type ERSlotLayout=Readonly<{kind:'elk'}>|Readonly<{kind:'dagre';observed:Observed}>;
export type ERLabelSlotPlan=Readonly<SourceLabel&{
 token:string;scalar:ERRenderSlot['scalar'];lifetime:ERRenderSlot['lifetime'];
}>;

function invalid(message:string):never { throw new MathPolicyError('E_MATH_INVALID',`ER slot plan: ${message}`); }

/** Join independently validated source labels to native invocation slots. The
 * source plan supplies provenance; the slot plan only supplies native copy
 * topology, so neither can silently stand in for the other. */
export function planERLabelSlots(
 labels:ERLabels,normalized:ERNormalizedDbEffects,owners:ReturnType<typeof projectEROwners>,tagged:Tagged,layout:ERSlotLayout,
):readonly ERLabelSlotPlan[] {
 const source:readonly SourceLabel[]=layout.kind==='elk'
  ?planERElkLabels(labels,normalized,owners,tagged)
  :planERDagreLabels(labels,normalized,owners,layout.observed);
 const slots=layout.kind==='elk'?enumerateERElkSlots(tagged):enumerateERDagreSlots(tagged,layout.observed);
 if(source.length!==slots.length)invalid('source label and native slot counts differ');
 const registry=new Map(tagged.registry.map(entry=>[entry.token,entry]));
 if(registry.size!==tagged.registry.length)invalid('duplicate registry token');
 const sourceByKey=new Map<string,SourceLabel>();
 for(const label of source) {
  if(sourceByKey.has(label.key))invalid('duplicate source label key');
  sourceByKey.set(label.key,label);
 }
 const result:ERLabelSlotPlan[]=[];
 for(const slot of slots) {
  const label=sourceByKey.get(slot.key),entry=registry.get(slot.token);
  if(!label)invalid('native slot has no source label');
  if(!entry||entry.owner.kind!==label.ownerKind||entry.owner.index!==label.ownerIndex)invalid('source label registry owner differs');
  if(label.field!==slot.field||label.path!==slot.path||label.copy!==slot.copy||label.value.text!==slot.input)invalid('source label differs from native slot');
  if('token'in label&&label.token!==slot.token)invalid('source label token differs');
  if('lifetime'in label&&label.lifetime!==slot.lifetime)invalid('source label lifetime differs');
  result.push(Object.freeze({...label,token:slot.token,scalar:slot.scalar,lifetime:slot.lifetime}));
  sourceByKey.delete(slot.key);
 }
 if(sourceByKey.size)invalid('source label has no native slot');
 return Object.freeze(result);
}
