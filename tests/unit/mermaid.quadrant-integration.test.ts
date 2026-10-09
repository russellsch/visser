import {expect,it} from 'vitest';
import {parseMermaid} from '../../packages/core/src/mermaid/parse.ts';
import {reserveQuadrantTransportMath} from '../../packages/core/src/mermaid/quadrant-transport.ts';
const source='quadrantChart\ntitle $$title$$\naccTitle: $$accessible$$\nx-axis $$left$$ --> $$right$$\ny-axis $$bottom$$ --> $$top$$\nquadrant-1 "$$x < y$$"\n"$$p$$": [0.2, 0.3]\n"$$p$$": [0.2, 0.3]\n';
const request=(figureId:string,text=source)=>({figureId,type:'other' as const,quadrant:true,source:text,originalSource:text});
it('transports validated all-role math with reversed native point owners',()=>{
 const result=parseMermaid([request('q')]).get('q')!;
 if(!result.ok||!result.quadrantMath)throw new Error(JSON.stringify(result));
 const math=result.quadrantMath;
 expect(math.total.occurrences).toBe(9);
 expect(math.snapshot.data.quadrant1Text).toBe('$$x &lt; y$$');
 expect(math.slots.filter(s=>s.role==='point').map(s=>s.recordIndex)).toEqual([9,8]);
 expect(reserveQuadrantTransportMath(JSON.parse(JSON.stringify(math)))).toEqual(math.total);
 for(const mutate of [(x:any)=>x.slots[0].recordIndex=999,(x:any)=>x.slots.reverse(),(x:any)=>x.total.occurrences++]){
  const changed=structuredClone(math);mutate(changed);expect(()=>reserveQuadrantTransportMath(changed)).toThrow();
 }
});
it('rejects located math and source mismatches and recovers for later figures',()=>{
 const invalid='quadrantChart\nquadrant-1 "$$\\unknownVisser$$"\n';
 const nonfinite='quadrantChart\n"$$p$$": [0a2, 0.3]\n';
 const result=parseMermaid([request('bad',invalid),request('nan',nonfinite),{...request('mismatch'),originalSource:source.replace('$$title$$','$$different$$')},request('good'),request('plain','quadrantChart\nPlain: [0.1, 0.2]\n')]);
 expect(result.get('bad')).toMatchObject({ok:false,code:'E_MATH',line:2});
 expect(result.get('nan')).toMatchObject({ok:false,code:'E_MATH'});
 expect(result.get('mismatch')).toMatchObject({ok:false});
 expect(result.get('good')).toMatchObject({ok:true,quadrantMath:{total:{occurrences:9}}});
 expect(result.get('plain')).toMatchObject({ok:true});
 expect((result.get('plain')as any).quadrantMath).toBeUndefined();
});
it('requires original bytes for math and rejects mismatched adapter flags',()=>{
 const result=parseMermaid([{...request('missing'),originalSource:undefined},{...request('wrong','journey\nTask: 1\n')},{...request('both'),journey:true}]);
 for(const value of result.values())expect(value).toMatchObject({ok:false,code:'E_MATH'});
});

it('checks hidden overwritten record roles and native/display consistency',()=>{
 const text='quadrantChart\ntitle $$old$$\ntitle $$new$$\n';
 const result=parseMermaid([request('hidden',text)]).get('hidden')!;
 if(!result.ok||!result.quadrantMath)throw new Error(JSON.stringify(result));
 for(const mutate of [(x:any)=>x.records[0].role='bogus',(x:any)=>x.records[0].dbValue='changed']){
  const changed=structuredClone(result.quadrantMath);mutate(changed);expect(()=>reserveQuadrantTransportMath(changed)).toThrow();
 }
});
