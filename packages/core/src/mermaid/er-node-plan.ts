import {MathPolicyError} from '../math/policy.ts';
import {erPlanningData} from './er-node-db.ts';
import {tagERLayoutOwners,observeERLayoutOwners} from './er-layout-owners.ts';
import {prepareERPlannedMath} from './er-planned-math.ts';
import {planERLabelSlots} from './er-slot-plan.ts';
import type {reconcileERNodeState} from './er-node-state.ts';

type Checked=Awaited<ReturnType<typeof reconcileERNodeState>>;
function invalid(message:string):never {throw new MathPolicyError('E_MATH_INVALID',`ER native layout plan: ${message}`);}

/** Prepare the exact native topology that ER will use for layout, then bind
 * its selected label copies to the reconciled source receipt. This returns
 * only planned math; native graph objects and config never leave the worker. */
export async function prepareERNodePlan(checked:Checked,original:string){
 if(!checked||typeof original!=='string')invalid('checked receipt or original source is invalid');
 const {completed,owners,labels,normalized}=checked,data=erPlanningData(completed);
 // These imports must happen after the worker installs its pinned source hook.
 // Their literal specifiers let esbuild include the identical contracted files.
 const [{visserERResolveLayoutAlgorithm},{visserERPrepareLayoutForDagre},{visserERResetDagreClusterState}]=await Promise.all([
  // @ts-expect-error hash-pinned native registry contract has no declarations.
  import('mermaid/dist/chunks/mermaid.core/chunk-GNY47TPC.mjs'),
  // @ts-expect-error hash-pinned native Dagre contract has no declarations.
  import('mermaid/dist/chunks/mermaid.core/dagre-6A5THRUB.mjs'),
  // @ts-expect-error hash-pinned native shared-state contract has no declarations.
  import('mermaid/dist/chunks/mermaid.core/chunk-3FUC2YCW.mjs'),
 ]);
 const layout=visserERResolveLayoutAlgorithm(completed.layout);
 if(layout!=='elk'&&layout!=='dagre')invalid(`unsupported resolved layout ${String(layout)}`);
 const nodeOwners=[...owners.displayGroupOrder.map(index=>({kind:'group' as const,index})),...owners.displayEntityOrder.map(index=>({kind:'entity' as const,index}))];
 const edgeOwners=owners.relationships.map(({relationshipIndex:index})=>({kind:'relationship' as const,index}));
 const tagged=tagERLayoutOwners(data,nodeOwners,edgeOwners);
 const copies=layout==='elk'
  ?planERLabelSlots(labels,normalized,owners,tagged,{kind:'elk'})
  :prepareDagreSlots(labels,normalized,owners,tagged,visserERPrepareLayoutForDagre,visserERResetDagreClusterState);
 return prepareERPlannedMath(original,labels,normalized,copies,layout,completed.htmlLabels);
}

function prepareDagreSlots(
 labels:Checked['labels'],normalized:Checked['normalized'],owners:Checked['owners'],tagged:ReturnType<typeof tagERLayoutOwners>,
 prepareLayoutForDagre:(data:typeof tagged.data)=>{graph:Parameters<typeof observeERLayoutOwners>[0]},resetClusterState:()=>void,
){
 // Mermaid's Dagre cluster module is process-global. Keep preparation and
 // observation synchronous and bracket both sides, including exceptions.
 resetClusterState();
 try {
  const prepared=prepareLayoutForDagre(tagged.data);
  const observed=observeERLayoutOwners(prepared.graph,tagged.registry);
  return planERLabelSlots(labels,normalized,owners,tagged,{kind:'dagre',observed});
 } finally {resetClusterState();}
}
