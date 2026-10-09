import {expect,it} from 'vitest';
import {ProvenanceText} from '../../packages/core/src/mermaid/source-provenance.ts';
import {extractERLabels} from '../../packages/core/src/mermaid/er-labels.ts';
import {normalizeERDbEffects} from '../../packages/core/src/mermaid/er-db-effects.ts';
import {normalizeERDbField} from '../../packages/core/src/mermaid/er-db-normalize.ts';
import {validateERAuthoredField,validateERAuthoredMath,LocatedERMathError} from '../../packages/core/src/mermaid/er-authored-math.ts';
import {EMPTY_MATH_RESOURCE_TOTAL as empty,MATH_LIMITS} from '../../packages/core/src/math/policy.ts';
async function check(source:string,initial=empty){const labels=await extractERLabels(source);return validateERAuthoredMath(source,labels,await normalizeERDbEffects(labels,true),initial);}
it('validates raw and DB semantic views without double charging matrix equations',async()=>{
 const text=String.raw`  $$\begin{matrix}a&b\\c&d\end{matrix}$$  `,value=ProvenanceText.identity(text);
 const db=await normalizeERDbField(value,'subgraph.title',true),field=validateERAuthoredField(value,db);
 expect(field.variants).toHaveLength(3);expect(field.cost.occurrences).toBe(1);
 expect(field.canonical.parts.find(p=>p.kind==='math')!.tex).toBe(String.raw`\begin{matrix}a&b\\c&d\end{matrix}`);
 expect(field.canonical.input.text).toBe(text.trim());
 const nested=ProvenanceText.identity('$$\\begin{matrix}a&amp;amp;b\\end{matrix}$$');
 const normalized=await normalizeERDbField(nested,'accTitle',true);
 expect(validateERAuthoredField(nested,normalized).canonical.input.text).toBe('$$\\begin{matrix}a&amp;b\\end{matrix}$$');
});
it('rejects erased, ignored and overwritten invalid TeX, then recovers',async()=>{
 const raw=ProvenanceText.identity('<script>$$\\href{x}{y}$$</script>safe');
 const db=await normalizeERDbField(raw,'accTitle',true);expect(db.dbValue.text).toBe('safe');
 expect(()=>validateERAuthoredField(raw,db)).toThrow(/unsupported TeX/);
 for(const source of ['erDiagram\nA["$$ok$$"]\nA["$$unfinished"]\n','erDiagram\naccTitle: $$\\href{x}{y}$$\naccTitle: safe\nA\n']){
  await expect(check(source)).rejects.toBeInstanceOf(LocatedERMathError);
 }
 await expect(check('erDiagram\nA["$$x$$"]\n')).resolves.toMatchObject({total:{occurrences:1}});
});
it('preserves distinct equal occurrences and original Unicode CRLF byte positions',async()=>{
 const source='\uFEFF erDiagram\r\n Ω {\r\n string first "$$x$$"\r\n string second "$$x$$"\r\n}\r\n';
 const result=await check(source);expect(result.total.occurrences).toBe(2);
 const equations=result.records.flatMap(r=>r.parts).filter(p=>p.kind==='math');
 expect(equations.map(p=>p.origins[0]!.sourceStart)).toEqual([source.indexOf('$$x$$'),source.lastIndexOf('$$x$$')]);
 for(const equation of equations){const origin=equation.origins[0]!;expect(origin.startByte).toBe(new TextEncoder().encode(source.slice(0,origin.sourceStart)).length);}
 const root=ProvenanceText.identity('$$x$$'),repeated=root.concat(root.synthetic(' '),root);
 expect(validateERAuthoredField(repeated).cost.occurrences).toBe(2);
});
it('shares only implicit group header occurrences, not explicit equal titles',async()=>{
 expect((await check('erDiagram\nsubgraph "$$x$$"\n A\nend\n')).total.occurrences).toBe(1);
 expect((await check('erDiagram\nsubgraph "$$x$$"["$$x$$"]\n A\nend\n')).total.occurrences).toBe(2);
});
it('enforces cumulative limits and rejects malformed math and normalization',async()=>{
 const source='erDiagram\nA["$$x$$"]\n',near={...empty,occurrences:MATH_LIMITS.documentOccurrences-1};
 expect((await check(source,near)).total.occurrences).toBe(MATH_LIMITS.documentOccurrences);
 await expect(check(source,{...near,occurrences:MATH_LIMITS.documentOccurrences})).rejects.toThrow(/document budget/);
 await expect(check('erDiagram\nA\n',{...empty,occurrences:-1})).rejects.toThrow(/nonnegative/);
 for(const text of ['$$x','$$x\ny$$','$$x<br>y$$'])expect(()=>validateERAuthoredField(ProvenanceText.identity(text))).toThrow(/unmatched/);
 const value=ProvenanceText.identity('$$x$$'),db=await normalizeERDbField(value,'accTitle',true);
 expect(()=>validateERAuthoredField(value,{...db,dbValue:value.synthetic('other')})).toThrow(/differs/);
 const labels=await extractERLabels('erDiagram\naccTitle: $$x$$\nA\n');
 expect(()=>validateERAuthoredMath('erDiagram\naccTitle: $$x$$\nA\n',labels,{effects:labels.effects,fields:[]})).toThrow(/missing/);
});
