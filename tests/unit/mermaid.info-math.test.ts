import {expect,it} from 'vitest';
import {MATH_LIMITS} from '../../packages/core/src/math/policy.ts';
import {extractInfoMath,LocatedInfoMathError} from '../../packages/core/src/mermaid/info-math.ts';

it('charges distinct equal-TeX assignments including overwritten hidden fields',async()=>{
 const result=await extractInfoMath('info\ntitle $$x$$\ntitle $$x$$\naccTitle: $$x$$\naccDescr: $$\\begin{matrix}a\\\\b\\end{matrix}$$\n');
 expect(result.records).toHaveLength(4);expect(result.records.filter(record=>!record.active)).toHaveLength(1);expect(result.total.occurrences).toBe(4);
 const origins=result.records.flatMap(record=>record.parts.filter(part=>part.kind==='math').map((part:any)=>part.origins[0].sourceStart));expect(new Set(origins)).toHaveLength(4);
});
it('locates invalid hidden source in the original BOM/CRLF fence',async()=>{
 const source='\uFEFF  info\r\n  title $$ok$$\r\n  title $$\\href{x}{bad}$$\r\n';
 await expect(extractInfoMath(source)).rejects.toBeInstanceOf(LocatedInfoMathError);
 try{await extractInfoMath(source);}catch(error){const located=error as LocatedInfoMathError;expect(located.role).toBe('title');expect(located.startByte).toBeGreaterThan(0);expect(located.startLine).toBe(3);}
});
it('checks existing budget even without Info fields and cumulative occurrence limits',async()=>{
 await expect(extractInfoMath('info',{svgBytes:0,elementCount:0,occurrences:MATH_LIMITS.documentOccurrences+1})).rejects.toThrow(/budget/);
 await expect(extractInfoMath('info\ntitle $$x$$\n',{svgBytes:0,elementCount:0,occurrences:MATH_LIMITS.documentOccurrences})).rejects.toThrow(/occurrences/);
});
it('reports per-record costs without repeating the initial or preceding budget',async()=>{
 const initial={svgBytes:300,elementCount:7,occurrences:2};
 const found=await extractInfoMath('info\ntitle $$x$$\naccTitle: plain\naccDescr: $$y$$\n',initial);
 expect(found.records.map(r=>r.cost.occurrences)).toEqual([1,0,1]);
 expect(found.records[1]!.cost).toEqual({svgBytes:0,elementCount:0,occurrences:0});
 expect(found.records.reduce((sum,r)=>sum+r.cost.svgBytes,initial.svgBytes)).toBe(found.total.svgBytes);
 expect(found.records.reduce((sum,r)=>sum+r.cost.elementCount,initial.elementCount)).toBe(found.total.elementCount);
 expect(initial).toEqual({svgBytes:300,elementCount:7,occurrences:2});
});
it('rejects overwritten invalid formulas at exact original Unicode byte locations',async()=>{
 for(const tex of ['\\href{x}{bad}','\\doesNotExist','x$$broken']){
  const shown=`info\naccTitle: 雪\ntitle $$${tex}$$\ntitle $$ok$$\n`;
  const original='\uFEFF  '+shown.replaceAll('\n','\r\n  '),start=original.indexOf('$$');
  try{await extractInfoMath(original,undefined,shown);expect.fail('invalid hidden formula accepted');}catch(error){
   expect(error).toBeInstanceOf(LocatedInfoMathError);const found=error as LocatedInfoMathError;
   expect(found.startLine).toBe(3);expect(found.startByte).toBe(Buffer.byteLength(original.slice(0,start)));expect(found.intervals[0]!.rawSource).toBe(`$$${tex}$$`);
  }
 }
});
it('accepts an exact occurrence boundary and rejects the next authored hidden field',async()=>{
 const initial={svgBytes:0,elementCount:0,occurrences:MATH_LIMITS.documentOccurrences-1};
 expect((await extractInfoMath('info\ntitle $$x$$\n',initial)).total.occurrences).toBe(MATH_LIMITS.documentOccurrences);
 await expect(extractInfoMath('info\ntitle $$x$$\ntitle $$y$$\n',initial)).rejects.toMatchObject({recordIndex:2,startLine:3});
});
