import {expect,it} from 'vitest';
import {extractERLabels} from '../../packages/core/src/mermaid/er-labels.ts';
import {normalizeERDbEffects} from '../../packages/core/src/mermaid/er-db-effects.ts';
import {normalizeERDisplayField} from '../../packages/core/src/mermaid/er-display-normalize.ts';
import {validateERAuthoredMath} from '../../packages/core/src/mermaid/er-authored-math.ts';
import {reserveERPlannedMath} from '../../packages/core/src/mermaid/er-copy-budget.ts';
import {EMPTY_MATH_RESOURCE_TOTAL,MATH_LIMITS} from '../../packages/core/src/math/policy.ts';

async function fixture(){
 const source=String.raw`erDiagram
A {
 string field "$$\begin{matrix}a&amp;b\end{matrix}$$"
}
`;
 const labels=await extractERLabels(source),normalized=await normalizeERDbEffects(labels,true);
 const alias=labels.records.find(record=>record.role==='attribute.comment')!;
 const displays=await Promise.all((['edge','simple-header'] as const).map(path=>normalizeERDisplayField(alias.mappedValue,path,true)));
 const math=validateERAuthoredMath(source,labels,normalized,EMPTY_MATH_RESOURCE_TOTAL,new Map([[alias.recordIndex,displays]]));
 const copies=displays.map((display,index)=>({key:String(index),path:display.path,fieldOwner:{kind:'record' as const,recordIndex:alias.recordIndex},lifetime:index===0?'measurement' as const:'retained' as const}));
 const costs=math.records[alias.recordIndex]!.math.displays.map(display=>display.variant.occurrences[0]!.cost);
 return {math,copies,costs};
}
it('credits unequal validated variants independently of copy order',async()=>{
 const {math,copies,costs}=await fixture();
 expect(costs[0]).not.toEqual(costs[1]);
 const expected={svgBytes:math.total.svgBytes+Math.min(costs[0]!.svgBytes,costs[1]!.svgBytes),elementCount:math.total.elementCount+Math.min(costs[0]!.elementCount,costs[1]!.elementCount),occurrences:math.total.occurrences+1};
 const forward=reserveERPlannedMath(math,copies),reverse=reserveERPlannedMath(math,[...copies].reverse());
 expect(forward).toEqual({total:expected,retainedOccurrences:1,temporaryOccurrences:1});expect(reverse).toEqual(forward);
});
it('enforces exact aggregate byte and element boundaries with unequal copies',async()=>{
 const {math,copies,costs}=await fixture();
 for(const [field,limit]of [['svgBytes',MATH_LIMITS.documentSvgBytes],['elementCount',MATH_LIMITS.documentElements]] as const){
  const extra=Math.min(costs[0]![field],costs[1]![field]);expect(extra).toBeGreaterThan(0);
  for(const order of [copies,[...copies].reverse()]){
   const at={...math,total:{...math.total,[field]:limit-extra}};
   expect(reserveERPlannedMath(at,order).total[field]).toBe(limit);
   expect(()=>reserveERPlannedMath({...at,total:{...at.total,[field]:limit-extra+1}},order)).toThrow(/document budget/);
  }
 }
});
it('credits bytes and elements independently when their largest copies differ',async()=>{
 const {math,copies}=await fixture();
 // Synthetic engine costs isolate the two independent policy dimensions; the
 // source owners/occurrence keys remain those of validated display variants.
 const costs=[{svgBytes:100,elementCount:4},{svgBytes:40,elementCount:10}];
 const records=math.records.map(record=>({...record,math:{...record.math,displays:record.math.displays.map((display,index)=>({...display,variant:{...display.variant,occurrences:display.variant.occurrences.map(occurrence=>({...occurrence,cost:costs[index]!}))}}))}}));
 const crossed={...math,records,total:{svgBytes:100,elementCount:10,occurrences:1}};
 for(const order of [copies,[...copies].reverse()])expect(reserveERPlannedMath(crossed,order)).toEqual({total:{svgBytes:140,elementCount:14,occurrences:2},retainedOccurrences:1,temporaryOccurrences:1});
 const repeated={...copies[0]!,key:'third'};
 for(const order of [[...copies,repeated],[repeated,...copies],[copies[1]!,repeated,copies[0]!]])expect(reserveERPlannedMath(crossed,order)).toEqual({total:{svgBytes:240,elementCount:18,occurrences:3},retainedOccurrences:1,temporaryOccurrences:2});
});
