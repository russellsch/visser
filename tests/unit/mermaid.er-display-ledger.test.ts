import {expect,it} from 'vitest';
import {ProvenanceText} from '../../packages/core/src/mermaid/source-provenance.ts';
import {normalizeERDbField} from '../../packages/core/src/mermaid/er-db-normalize.ts';
import {normalizeERDisplayField} from '../../packages/core/src/mermaid/er-display-normalize.ts';
import {validateERAuthoredField} from '../../packages/core/src/mermaid/er-authored-math.ts';
it('keeps authored canonical and separate path outputs while extending one ledger',async()=>{
 const value=ProvenanceText.identity('List~$$x~y$$~');
 const table=await normalizeERDisplayField(value,'table',true),simple=await normalizeERDisplayField(value,'simple-header',true);
 const field=validateERAuthoredField(value,undefined,[table,simple]);
 expect(field.canonical.input.text).toBe(value.text);
 expect(field.displays.map(d=>[d.normalization.path,d.variant.input.text])).toEqual([['table','List<$$x~y$$>'],['simple-header',value.text]]);
 expect(field.cost.occurrences).toBe(1);
 expect(validateERAuthoredField(value,undefined,[simple,table]).cost).toEqual(field.cost);
 expect(()=>validateERAuthoredField(value,undefined,[table,table])).toThrow(/duplicate/);
});
it('replays group candidates from unrecovered DB text and preserves matrix origins',async()=>{
 const raw=String.raw`  $$\begin{matrix}a&b\\c&d\end{matrix}$$  `,value=ProvenanceText.identity(raw);
 const db=await normalizeERDbField(value,'subgraph.title',true);
 const paths=await Promise.all((['group-cluster','group-node'] as const).map(path=>normalizeERDisplayField(db.dbValue,path,true)));
 const field=validateERAuthoredField(value,db,paths);
 expect(field.cost.occurrences).toBe(1);
 for(const display of field.displays){
  const part=display.variant.parts.find(p=>p.kind==='math')!;
  expect(part.tex).toBe(String.raw`\begin{matrix}a&b\\c&d\end{matrix}`);
  expect(display.variant.input.mapRange(part.start,part.end)).toEqual({synthetic:false,intervals:[{start:2,end:raw.length-2}]});
 }
 expect(validateERAuthoredField(value,db,[...paths].reverse()).cost).toEqual(field.cost);
 expect(()=>validateERAuthoredField(value,db,[{...paths[0]!,htmlLabels:false}])).toThrow(/mode/);
});
it('reconstructs output provenance and rejects different display text',async()=>{
 const value=ProvenanceText.identity('SOURCE prefix $$x$$ suffix END').slice(7,26),display=await normalizeERDisplayField(value,'edge',true);
 const foreign=ProvenanceText.identity(value.text);
 const reconstructed=validateERAuthoredField(value,undefined,[{...display,mappedInput:foreign}]);
 expect(reconstructed.displays[0]!.variant.input.source).toBe(value.source);
 expect(reconstructed.displays[0]!.normalization.mappedInput.mapRange(7,12)).toEqual({synthetic:false,intervals:[{start:14,end:19}]});
 expect(()=>validateERAuthoredField(value,undefined,[{...display,mappedInput:value.synthetic('$$y$$')}])).toThrow(/differs/);
});
it('charges math introduced by native sanitation and validates erased authored math',async()=>{
 const value=ProvenanceText.identity('<br> &dollar;&dollar;x&dollar;&dollar;');
 const display=await normalizeERDisplayField(value,'simple-header',true);
 const field=validateERAuthoredField(value,undefined,[display]);
 expect(field.canonical.parts.some(p=>p.kind==='math')).toBe(false);
 expect(field.displays[0]!.variant.parts.find(p=>p.kind==='math')!.tex).toBe('x');
 expect(field.cost.occurrences).toBe(1);
 const unsafe=ProvenanceText.identity('<script>$$\\href{x}{y}$$</script>safe');
 const cleaned=await normalizeERDisplayField(unsafe,'simple-header',true);
 expect(cleaned.mappedInput.text).toBe('safe');
 expect(()=>validateERAuthoredField(unsafe,undefined,[cleaned])).toThrow(/unsupported TeX/);
});
