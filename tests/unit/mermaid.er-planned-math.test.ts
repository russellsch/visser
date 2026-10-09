import {expect,it} from 'vitest';
import {extractERLabels} from '../../packages/core/src/mermaid/er-labels.ts';
import {normalizeERDbEffects} from '../../packages/core/src/mermaid/er-db-effects.ts';
import {prepareERPlannedMath} from '../../packages/core/src/mermaid/er-planned-math.ts';
import {MATH_LIMITS,EMPTY_MATH_RESOURCE_TOTAL} from '../../packages/core/src/math/policy.ts';
async function hidden(source:string,initial=EMPTY_MATH_RESOURCE_TOTAL){
 const labels=await extractERLabels(source),normalized=await normalizeERDbEffects(labels,true);
 return prepareERPlannedMath(source,labels,normalized,[],'elk',true,initial);
}
it('validates hidden authored equations even when the plan renders no fields',async()=>{
 await expect(hidden('erDiagram\naccTitle: $$\\href{x}{y}$$\naccTitle: safe\nA\n')).rejects.toThrow(/unsupported TeX/);
 const valid=await hidden('erDiagram\nA["$$x$$"]\n');
 expect(valid.copies).toEqual([]);expect(valid.authored.records.every(record=>record.math.displays.length===0)).toBe(true);
 expect(valid.budget).toMatchObject({total:{occurrences:1},temporaryOccurrences:0,retainedOccurrences:0});
});
it('includes inherited document work even when selected copies are empty',async()=>{
 const source='erDiagram\nA["$$x$$"]\n';
 expect((await hidden(source,{...EMPTY_MATH_RESOURCE_TOTAL,occurrences:MATH_LIMITS.documentOccurrences-1})).budget.total.occurrences).toBe(MATH_LIMITS.documentOccurrences);
 await expect(hidden(source,{...EMPTY_MATH_RESOURCE_TOTAL,occurrences:MATH_LIMITS.documentOccurrences})).rejects.toThrow(/document budget/);
});
it('locates an ignored invalid alias while the plan selects the first alias',async()=>{
 const source='erDiagram\nA["$$ok$$"]\nA["$$unfinished"]\n';
 const labels=await extractERLabels(source),normalized=await normalizeERDbEffects(labels,true);
 const aliases=labels.records.filter(record=>record.role==='entity.alias'),first=aliases[0]!,ignored=aliases[1]!;
 const copies=[{key:'header',ownerKind:'entity' as const,ownerIndex:0,field:'header',path:'simple-header' as const,copy:'single' as const,value:first.mappedValue,fieldOwner:{kind:'record' as const,recordIndex:first.recordIndex}}];
 await expect(prepareERPlannedMath(source,labels,normalized,copies,'elk',true)).rejects.toMatchObject({name:'LocatedERMathError',recordIndex:ignored.recordIndex,role:'entity.alias',startByte:ignored.intervals[0]!.startByte});
});
