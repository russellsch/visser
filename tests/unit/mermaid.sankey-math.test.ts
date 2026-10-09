import {expect,it} from 'vitest';
import {extractSankeyMath,LocatedSankeyMathError} from '../../packages/core/src/mermaid/sankey-math.ts';
import {EMPTY_MATH_RESOURCE_TOTAL,MATH_LIMITS} from '../../packages/core/src/math/policy.ts';

it('charges every repeated endpoint before native node merging',async()=>{
 const math=await extractSankeyMath('sankey\n"$$a$$","$$b$$",1\n"$$a$$","$$b$$",2\n');
 expect(math.records.map(record=>record.dbValue)).toEqual(['$$a$$','$$b$$','$$a$$','$$b$$']);
 expect(math.total.occurrences).toBe(4);
 const origins=math.records.map(record=>record.parts.flatMap(part=>part.kind==='math'?part.origins:[])[0]!.startByte);
 expect(new Set(origins).size).toBe(4);
 await expect(extractSankeyMath('sankey\n"$$a$$","$$a$$",1\n',{...EMPTY_MATH_RESOURCE_TOTAL,occurrences:MATH_LIMITS.documentOccurrences-1})).rejects.toThrow(/budget/i);
});

it('preserves CSV escapes, matrix slashes, serialized inequalities and entity provenance',async()=>{
 const source=String.raw`sankey
"before<br/>$$x < y$$","&dollar;&dollar;z&dollar;&dollar;<br/>",1
"$$\text{say ""yes""}$$","$$\begin{matrix}a&b\\c&d\end{matrix}$$",2
`;
 const math=await extractSankeyMath(source);
 expect(math.total.occurrences).toBe(4);
 expect(math.records[0]!.dbValue).toContain('&lt;');expect(math.records[0]!.renderedValue).toContain('$$x < y$$');
 const encoded=math.records[1]!.parts.find(part=>part.kind==='math')!;
 expect(encoded).toMatchObject({tex:'z',origins:[{rawSource:'&dollar;&dollar;z&dollar;&dollar;'}]});
 expect(math.records[2]!.parts).toMatchObject([{kind:'math',tex:'\\text{say "yes"}',origins:[{rawSource:'$$\\text{say ""yes""}$$'}]}]);
 expect(math.records[3]!.parts).toMatchObject([{kind:'math',tex:'\\begin{matrix}a&b\\\\c&d\\end{matrix}'}]);
});

it('does not decode plain entity text without the native HTML sanitation trigger',async()=>{
 const math=await extractSankeyMath('sankey\n"&dollar;&dollar;x&dollar;&dollar;",plain,1\n');
 expect(math.total.occurrences).toBe(0);expect(math.records[0]!.dbValue).toContain('&dollar;');
});

it('rejects invalid equations at the repeated authored field and recovers',async()=>{
 const source='\uFEFF  sankey\r\n"$$x$$",plain,1\r\n"$$\\badSankeyCommand$$",plain,2\r\n';
 let caught:unknown;try{await extractSankeyMath(source);}catch(error){caught=error;}
 expect(caught).toBeInstanceOf(LocatedSankeyMathError);expect(caught).toMatchObject({rowIndex:1,role:'source',startLine:3});
 const error=caught as LocatedSankeyMathError;
 expect(new TextDecoder().decode(new TextEncoder().encode(source).slice(error.startByte,error.endByte))).toBe('$$\\badSankeyCommand$$');
 expect((await extractSankeyMath('sankey\n"$$x$$",plain,1')).total.occurrences).toBe(1);
});

it('rejects math in flow values and nonfinite or negative values for math charts without changing plain extraction',async()=>{
 await expect(extractSankeyMath('sankey\na,b,2$$x$$')).rejects.toMatchObject({role:'value',rowIndex:0});
 for(const value of ['NaN','Infinity','-1']){
  await expect(extractSankeyMath(`sankey\n"$$x$$",b,${value}`)).rejects.toThrow(/finite nonnegative/);
  expect((await extractSankeyMath(`sankey\na,b,${value}`)).labels.rows[0]!.value).toBe(Number.parseFloat(value));
 }
 const math=await extractSankeyMath('sankey\n"$$x$$",b,1tail');expect(math.labels.rows[0]!.value).toBe(1);
});

it('does not join formula halves across native break markup',async()=>{
 await expect(extractSankeyMath('sankey\n"$$x<br/>y$$",plain,1')).rejects.toThrow();
});
