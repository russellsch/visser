// Internal field variants and budget identities; not transport authentication.
import {EMPTY_MATH_RESOURCE_TOTAL,MathPolicyError,reserveMathOccurrences,type MathResourceCost,type MathResourceTotal} from '../math/policy.ts';
import {ProvenanceText,type RangeOrigin} from './source-provenance.ts';
import {mapKanbanMathInput,traceKanbanField,type KanbanFieldRole,type KanbanFieldWitnesses} from './kanban-normalize.ts';
import {traceKanbanSanitation,type KanbanSanitation} from './kanban-sanitize.ts';
import {validateMermaidMathLabel,type MermaidMathExpression,type MermaidMathText} from './math.ts';

export type KanbanFieldMathVariant=Readonly<{input:ProvenanceText;parts:readonly (MermaidMathText|MermaidMathExpression)[]}>;
export type KanbanMathCharge=Readonly<{key:string;cost:MathResourceCost;origins:readonly RangeOrigin[]}>;
export type KanbanFieldMath=Readonly<{
 variants:readonly KanbanFieldMathVariant[];canonical:KanbanFieldMathVariant;
 chargeEntries:readonly KanbanMathCharge[];charges:readonly MathResourceCost[];cost:MathResourceTotal;
}>;
function finish(variants:readonly KanbanFieldMathVariant[],canonical:KanbanFieldMathVariant,entries:readonly KanbanMathCharge[]):KanbanFieldMath{
 let cost=EMPTY_MATH_RESOURCE_TOTAL;
 for(const entry of entries)cost=reserveMathOccurrences(cost,entry.cost,1);
 return Object.freeze({variants:Object.freeze([...variants]),canonical,chargeEntries:Object.freeze([...entries]),charges:Object.freeze(entries.map(entry=>entry.cost)),cost:Object.freeze(cost)});
}
function maximum(a:MathResourceCost|undefined,b:MathResourceCost):MathResourceCost{
 return Object.freeze({svgBytes:Math.max(a?.svgBytes??0,b.svgBytes),elementCount:Math.max(a?.elementCount??0,b.elementCount)});
}
function validateVariants(actual:readonly ProvenanceText[],local:readonly ProvenanceText[]):KanbanFieldMath{
 if(actual.length!==local.length||!actual.length)throw new MathPolicyError('E_MATH_INVALID','Kanban local/source variant count differs');
 const charges=new Map<string,KanbanMathCharge>();
 const variants=actual.map((input,variantIndex)=>{
  const budgetInput=local[variantIndex]!;
  if(input.text!==budgetInput.text)throw new MathPolicyError('E_MATH_INVALID','Kanban local/source text differs');
  const checked=validateMermaidMathLabel(input.text);
  for(const part of checked.parts)if(part.kind==='math'){
   const origin=budgetInput.mapRange(part.start,part.end);
   const key=origin.synthetic||!origin.intervals.length?`synthetic:${variantIndex}:${part.start}`:JSON.stringify(origin.intervals);
   const previous=charges.get(key),sourceOrigin=input.mapRange(part.start,part.end);
   charges.set(key,Object.freeze({key,cost:maximum(previous?.cost,{svgBytes:part.mathmlBytes,elementCount:part.elementCount}),
    origins:Object.freeze([...(previous?.origins??[]),Object.freeze(sourceOrigin)])}));
  }
  return Object.freeze({input,parts:Object.freeze(checked.parts.map(part=>Object.freeze({...part})))});
 });
 return finish(variants,variants.at(-1)!,[...charges.values()]);
}

/** Actual/local roots stay separate. Repeated aliases can share original
 * origins while each effective occurrence retains its own local position.
 * Optional addNode sanitation retains erased raw base-label expressions.
 */
export function validateKanbanMathField(value:ProvenanceText,role:KanbanFieldRole,htmlLabels:boolean,witnesses:KanbanFieldWitnesses,initialSanitation?:KanbanSanitation):KanbanFieldMath{
 if(initialSanitation&&initialSanitation.htmlLabels!==htmlLabels)throw new MathPolicyError('E_MATH_INVALID','Kanban initial sanitation mode differs');
 const root=ProvenanceText.identity(value.text);
 const actualBase=initialSanitation?traceKanbanSanitation(value,initialSanitation):value;
 const localBase=initialSanitation?traceKanbanSanitation(root,initialSanitation):root;
 const actual=traceKanbanField(actualBase,role,htmlLabels,witnesses),local=traceKanbanField(localBase,role,htmlLabels,witnesses);
 return validateVariants(initialSanitation?[mapKanbanMathInput(value),...actual.inputs]:actual.inputs,
  initialSanitation?[mapKanbanMathInput(root),...local.inputs]:local.inputs);
}

/** Hidden fields receive only their real authored/native sanitation stages. */
export function validateKanbanAuthoredField(value:ProvenanceText,sanitation?:KanbanSanitation):KanbanFieldMath{
 const root=ProvenanceText.identity(value.text),actual=[mapKanbanMathInput(value)],local=[mapKanbanMathInput(root)];
 if(sanitation){actual.push(mapKanbanMathInput(traceKanbanSanitation(value,sanitation)));local.push(mapKanbanMathInput(traceKanbanSanitation(root,sanitation)));}
 return validateVariants(actual,local);
}
function signature(origin:RangeOrigin):string|undefined{
 return origin.synthetic||!origin.intervals.length?undefined:JSON.stringify(origin.intervals);
}
/** Scalars belong to the same metadata field as `effective`. Exact original
 * origins may cover a scalar fallback charge, but NEVER merge effective
 * charges with each other. Repeated aliases retain every output occurrence.
 * Hidden aliases are visited by unique trace identity by the source adapter.
 */
export function mergeKanbanScalarChecks(effective:KanbanFieldMath,scalars:Iterable<KanbanFieldMath>):KanbanFieldMath{
 const entries=[...effective.chargeEntries],variants=[...effective.variants];
 let running=effective.cost,scalarIndex=0;
 const coverage=new Map<string,number>();
 for(const [index,entry] of entries.entries())for(const origin of entry.origins){const key=signature(origin);if(key!==undefined&&!coverage.has(key))coverage.set(key,index);}
 for(const scalar of scalars){
  if(scalar.variants.some(variant=>variant.input.source!==effective.canonical.input.source))throw new MathPolicyError('E_MATH_INVALID','Kanban scalar provenance belongs to a different source');
  for(const charge of scalar.chargeEntries){
   const matches=new Set(charge.origins.map(signature).filter((key):key is string=>key!==undefined).map(key=>coverage.get(key)).filter((index):index is number=>index!==undefined));
   if(matches.size===1){
    const index=[...matches][0]!,previous=entries[index]!,cost=maximum(previous.cost,charge.cost);
    running=reserveMathOccurrences({svgBytes:running.svgBytes+cost.svgBytes-previous.cost.svgBytes,elementCount:running.elementCount+cost.elementCount-previous.cost.elementCount,occurrences:running.occurrences},{svgBytes:0,elementCount:0},0);
    entries[index]=Object.freeze({...previous,cost});
   }else{
    // Stop before consuming/validating further scalar fields once the shared
    // field budget is exhausted, including behind object stringification.
    running=reserveMathOccurrences(running,charge.cost,1);
    entries.push(Object.freeze({...charge,key:`scalar:${scalarIndex}:${charge.key}`}));
   }
  }
  variants.push(...scalar.variants);scalarIndex++;
 }
 return finish(variants,effective.canonical,entries);
}

/** Hidden validation counts once. Additional rendered copies charge only
 * canonical equations; distinct fields always reserve independently.
 */
export function reserveKanbanFieldMath(total:MathResourceTotal,field:KanbanFieldMath,renderCopies:number):MathResourceTotal{
 if(!Number.isSafeInteger(renderCopies)||renderCopies<0)throw new MathPolicyError('E_MATH_RESOURCE','Kanban render copies must be a nonnegative safe integer');
 let next=reserveMathOccurrences(total,{svgBytes:0,elementCount:0},0);
 for(const charge of field.charges)next=reserveMathOccurrences(next,charge,1);
 if(renderCopies>1)for(const part of field.canonical.parts)if(part.kind==='math')next=reserveMathOccurrences(next,{svgBytes:part.mathmlBytes,elementCount:part.elementCount},renderCopies-1);
 return next;
}
