import { expect, it } from 'vitest';
import { extractQuadrantMath } from '../../packages/core/src/mermaid/quadrant-math.ts';
import { MATH_LIMITS, EMPTY_MATH_RESOURCE_TOTAL } from '../../packages/core/src/math/policy.ts';

it('validates all authored fields, including replaced axes and duplicate points',async()=>{
 const result=await extractQuadrantMath('quadrantChart\ntitle $$t$$\naccTitle: $$a$$\naccDescr: $$d$$\nx-axis $$l$$ --> $$r$$\nx-axis $$next$$ -->\ny-axis $$b$$ --> $$top$$\nquadrant-1 $$q$$\n"$$p$$": [0, 1]\n"$$p$$": [0, 1]\n');
 expect(result.total.occurrences).toBe(11);
 expect(result.records.find(r=>r.dbValue.includes('next'))?.renderedValue).toBe('$$next$$ ⟶');
 expect(result.records.flatMap(r=>r.parts.filter(p=>p.kind==='math')).every(p=>!p.synthetic)).toBe(true);
});
it('preserves matrix slashes and restores only formula serialization in sanitized labels',async()=>{
 const source=String.raw`quadrantChart
quadrant-1 "$$\begin{matrix}a&b\\c&d\end{matrix}$$"
quadrant-2 "before<br/>$$x < y$$"
`;
 const result=await extractQuadrantMath(source);
 expect(result.records[0]!.parts).toMatchObject([{kind:'math',tex:String.raw`\begin{matrix}a&b\\c&d\end{matrix}`}]);
 expect(result.records[1]!.dbValue).toBe('before<br>$$x &lt; y$$');
 expect(result.records[1]!.renderedValue).toBe('before<br>$$x < y$$');
 expect(result.records[1]!.parts.filter(p=>p.kind==='math')).toMatchObject([{tex:'x < y',origins:[{rawSource:'$$x < y$$'}]}]);
});
it('locates invalid overwritten equations and rejects split delimiters',async()=>{
 await expect(extractQuadrantMath('quadrantChart\nquadrant-1 "$$\\unknownVisser$$"\nquadrant-1 safe\n')).rejects.toMatchObject({name:'LocatedQuadrantMathError',startLine:2});
 await expect(extractQuadrantMath('quadrantChart\nquadrant-1 "$$x<br/>y$$"\n')).rejects.toMatchObject({name:'LocatedQuadrantMathError',startLine:2});
});
it('charges incoming document totals and retains source bytes after normalization',async()=>{
 await expect(extractQuadrantMath('quadrantChart\ntitle $$x$$\n',{...EMPTY_MATH_RESOURCE_TOTAL,occurrences:MATH_LIMITS.documentOccurrences})).rejects.toMatchObject({code:'E_MATH_DOCUMENT_LIMIT'});
 const source='\uFEFF  quadrantChart\r\n  title 雪 $$x < y$$\r\n';
 const result=await extractQuadrantMath(source);
 for(const part of result.records.flatMap(r=>r.parts)) if(part.kind==='math') for(const origin of part.origins) expect(Buffer.from(source).subarray(origin.startByte,origin.endByte).toString()).toBe(origin.rawSource);
});
