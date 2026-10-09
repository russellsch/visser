import { expect, it } from 'vitest';
import { extractXYMath } from '../../packages/core/src/mermaid/xychart-math.ts';
import { EMPTY_MATH_RESOURCE_TOTAL, MATH_LIMITS } from '../../packages/core/src/math/policy.ts';

it('charges every authored XY field once, including overwritten axes and unused datum labels',async()=>{
 const result=await extractXYMath(`xychart
title "$$t$$"
accTitle: $$a$$
accDescr: $$d$$
x-axis "$$x$$" ["$$c$$", "$$c$$"]
y-axis "$$y$$" 0 --> 5
line "$$s$$" [1 "$$p$$",2,3 "$$truncated$$"]
bar "$$b$$" [1 "$$ignored$$"]
x-axis ["$$replacement$$"]
`);
 expect(result.total.occurrences).toBe(13);
 expect(result.records.flatMap(r=>r.parts.filter(p=>p.kind==='math')).every(p=>!p.synthetic)).toBe(true);
 expect(result.records.filter(r=>r.dbValue==='$$c$$').map(r=>r.recordIndex)).toHaveLength(2);
});
it('retains matrix slashes, literal backticks, HTML provenance and encoded formula origins',async()=>{
 const source=String.raw`xychart
title "$$\begin{matrix}a&b\\c&d\end{matrix}$$"
x-axis ["before<br/>$$x < y$$", "&dollar;&dollar;z&dollar;&dollar;<br/>"]
line "`+'`$$s$$`'+String.raw`" [1,2]
`;
 const result=await extractXYMath(source);
 expect(result.records[0]!.parts).toMatchObject([{kind:'math',tex:String.raw`\begin{matrix}a&b\\c&d\end{matrix}`}]);
 expect(result.records[1]!.dbValue).toBe('before<br>$$x &lt; y$$');
 expect(result.records[1]!.renderedValue).toBe('before<br>$$x < y$$');
 expect(result.records[2]!.parts).toMatchObject([{kind:'math',tex:'z',origins:[{rawSource:'&dollar;&dollar;z&dollar;&dollar;'}]},{kind:'text',source:'<br>'}]);
 expect(result.records.find(r=>r.role==='seriesTitle')!.renderedValue).toBe('`$$s$$`');
});
it('rejects invalid equations in overwritten, truncated and ignored fields with locations',async()=>{
 for(const body of [
  'x-axis ["$$\\unknownVisser$$"]\nx-axis [safe]\nline [1]',
  'x-axis [a]\nline [1,2 "$$\\unknownVisser$$"]',
  'bar [1 "$$\\unknownVisser$$"]',
 ]) await expect(extractXYMath('xychart\n'+body)).rejects.toMatchObject({name:'LocatedXYMathError',code:'E_MATH_INVALID'});
 await expect(extractXYMath('xychart\ntitle "$$x<br/>y$$"\nline [1]')).rejects.toMatchObject({name:'LocatedXYMathError',startLine:2});
});
it('charges incoming totals and maps normalized Unicode bytes',async()=>{
 await expect(extractXYMath('xychart\ntitle "$$x$$"\n',{...EMPTY_MATH_RESOURCE_TOTAL,occurrences:MATH_LIMITS.documentOccurrences})).rejects.toMatchObject({code:'E_MATH_DOCUMENT_LIMIT'});
 const source='\uFEFF  xychart\r\n  title "雪 $$x < y$$"\r\n  line [1 "😀 $$p$$"]\r\n';
 const result=await extractXYMath(source);
 for(const part of result.records.flatMap(r=>r.parts)) if(part.kind==='math') for(const origin of part.origins) expect(Buffer.from(source).subarray(origin.startByte,origin.endByte).toString()).toBe(origin.rawSource);
});

