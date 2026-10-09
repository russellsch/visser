import {expect,it} from 'vitest';
import {ProvenanceText} from '../../packages/core/src/mermaid/source-provenance.ts';
import {normalizeKanbanField} from '../../packages/core/src/mermaid/kanban-normalize.ts';
import {validateKanbanMathField,reserveKanbanFieldMath} from '../../packages/core/src/mermaid/kanban-field-math.ts';
import {EMPTY_MATH_RESOURCE_TOTAL as empty,MATH_LIMITS} from '../../packages/core/src/math/policy.ts';

async function checked(value:ProvenanceText,role:'section'|'title'|'ticket'|'assigned'='title'){
 const normalized=await normalizeKanbanField(value,role,true);
 return validateKanbanMathField(value,role,true,normalized.witnesses);
}

it('charges repeated alias expansions independently despite equal original source ranges',async()=>{
 const root=ProvenanceText.identity('$$x$$'),value=root.concat(root.synthetic(','),root);
 const field=await checked(value);
 expect(field.canonical.parts.filter(part=>part.kind==='math')).toHaveLength(2);
 expect(field.cost.occurrences).toBe(2);
 const math=field.canonical.parts.filter(part=>part.kind==='math');
 expect(field.canonical.input.mapRange(math[0]!.start,math[0]!.end)).toEqual(field.canonical.input.mapRange(math[1]!.start,math[1]!.end));
 expect(reserveKanbanFieldMath(empty,field,3).occurrences).toBe(6);
});

it('charges hidden validation once and every repeated rendered copy',async()=>{
 const field=await checked(ProvenanceText.identity('$$x$$'));
 expect(field.cost.occurrences).toBe(1);
 expect(reserveKanbanFieldMath(empty,field,0)).toEqual(field.cost);
 expect(reserveKanbanFieldMath(empty,field,1)).toEqual(field.cost);
 expect(reserveKanbanFieldMath(empty,field,4)).toEqual({occurrences:4,svgBytes:field.cost.svgBytes*4,elementCount:field.cost.elementCount*4});
 expect(reserveKanbanFieldMath(reserveKanbanFieldMath(empty,field,0),field,0).occurrences).toBe(2);
});

it('rejects invalid math before sanitation can erase it and recovers',async()=>{
 const value=ProvenanceText.identity('<script>$$\\href{x}{y}$$</script>safe');
 const normalized=await normalizeKanbanField(value,'title',true);
 expect(normalized.mappedInput.text).toBe('safe');
 expect(()=>validateKanbanMathField(value,'title',true,normalized.witnesses)).toThrow(/unsupported TeX command/);
 const next=await checked(ProvenanceText.identity('$$x$$'));expect(next.cost.occurrences).toBe(1);
});

it('preserves standard matrix backslashes and mapped formula origins',async()=>{
 const text='<br/> $$\\begin{matrix}a&b\\\\c&d\\end{matrix}$$';
 const field=await checked(ProvenanceText.identity(text));
 const part=field.canonical.parts.find(part=>part.kind==='math')!;
 expect(part.tex).toBe('\\begin{matrix}a&b\\\\c&d\\end{matrix}');
 expect(field.cost.occurrences).toBe(1);
 expect(field.canonical.input.mapRange(part.start,part.end)).toEqual({synthetic:false,intervals:[{start:text.indexOf('$$'),end:text.length}]});
});

it('counts delimiters introduced by native HTML entity normalization',async()=>{
 const field=await checked(ProvenanceText.identity('<br/> &dollar;&dollar;x&dollar;&dollar;'));
 expect(field.canonical.parts.find(part=>part.kind==='math')!.tex).toBe('x');
 expect(field.cost.occurrences).toBe(1);
});

it('enforces aggregate copy limits and validates caller totals even for plain text',async()=>{
 const field=await checked(ProvenanceText.identity('$$x$$'));
 const near={svgBytes:0,elementCount:0,occurrences:MATH_LIMITS.documentOccurrences-1};
 expect(reserveKanbanFieldMath(near,field,1).occurrences).toBe(MATH_LIMITS.documentOccurrences);
 expect(()=>reserveKanbanFieldMath(near,field,2)).toThrow(/document budget/);
 for(const copies of [-1,1.5,Infinity,NaN])expect(()=>reserveKanbanFieldMath(empty,field,copies)).toThrow(/nonnegative safe integer/);
 const plain=await checked(ProvenanceText.identity('plain'));
 expect(()=>reserveKanbanFieldMath({...empty,occurrences:-1},plain,0)).toThrow(/nonnegative safe integer/);
});

it('checks the original label before addNode sanitation and does not double-charge retained math',async()=>{
 const {sanitizeKanbanField}=await import('../../packages/core/src/mermaid/kanban-sanitize.ts');
 const raw=ProvenanceText.identity('<script>$$\\href{x}{y}$$</script>$$x$$');
 const initial=await sanitizeKanbanField(raw,true);
 const normalized=await normalizeKanbanField(initial.value,'title',true);
 expect(initial.value.text).toBe('$$x$$');
 expect(()=>validateKanbanMathField(raw,'title',true,normalized.witnesses,initial.witness)).toThrow(/unsupported TeX command/);
 const safe=ProvenanceText.identity('<br/> $$x$$'),base=await sanitizeKanbanField(safe,true);
 const next=await normalizeKanbanField(base.value,'title',true);
 const field=validateKanbanMathField(safe,'title',true,next.witnesses,base.witness);
 expect(field.cost.occurrences).toBe(1);
 expect(field.canonical.input.text).toBe('\n $$x$$');
 expect(()=>validateKanbanMathField(safe,'title',false,next.witnesses,base.witness)).toThrow(/initial sanitation mode differs/);
});

it('stops scalar validation at the shared field limit and rejects foreign provenance',async()=>{
 const {validateKanbanAuthoredField,mergeKanbanScalarChecks}=await import('../../packages/core/src/mermaid/kanban-field-math.ts');
 const source='$$x$$,'.repeat(MATH_LIMITS.documentOccurrences)+'$$y$$';
 const root=ProvenanceText.identity(source),effective=validateKanbanAuthoredField(root.slice(0,source.length-5));
 let consumed=0;
 function* scalars(){
  consumed++;yield validateKanbanAuthoredField(root.slice(source.length-5,source.length));
  throw new Error('scalar iterator consumed after limit');
 }
 expect(()=>mergeKanbanScalarChecks(effective,scalars())).toThrow(/document budget/);
 expect(consumed).toBe(1);
 expect(()=>mergeKanbanScalarChecks(effective,[validateKanbanAuthoredField(ProvenanceText.identity('$$z$$'))])).toThrow(/different source/);
});
