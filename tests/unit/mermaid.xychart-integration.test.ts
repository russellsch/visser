import {expect,it} from 'vitest';
import {parseMermaid,clearMermaidParseCache} from '../../packages/core/src/mermaid/parse.ts';
import {reserveXYTransportMath,decodeXYTransportSnapshot} from '../../packages/core/src/mermaid/xychart-transport.ts';
import {EMPTY_MATH_RESOURCE_TOTAL,MATH_LIMITS} from '../../packages/core/src/math/policy.ts';
const source=`xychart horizontal
title "$$old$$"
title "$$t$$"
accTitle: $$a$$
accDescr { $$d$$ }
x-axis "$$x$$" ["<br/>&dollar;&dollar;c&dollar;&dollar;","<br/>$$c$$"]
y-axis "$$y$$" 0 --> 10
line "$$s$$" [1 "$$p$$",2,3 "$$truncated$$"]
bar "$$b$$" [4 "$$ignored$$"]
`;
const request=(figureId:string,text=source)=>({figureId,type:'other' as const,xy:true,source:text,originalSource:text});
function parsed(text=source){const result=parseMermaid([request('xy',text)]).get('xy')!;if(!result.ok||!result.xyMath)throw new Error(JSON.stringify(result));return result.xyMath;}
it('transports every authored charge and exact candidate owners through the actual worker',()=>{
 const math=parsed();
 expect(math.total.occurrences).toBe(13);
 expect(math.candidates.map(s=>s.key)).toEqual(['title','xTitle','yTitle','category:0','category:1','series:0','point:0:0','series:1']);
 expect(math.snapshot.data.plots[1]!.data).toEqual([['<br>$$c$$','4'],['<br>$$c$$','undefined']]);
 expect(reserveXYTransportMath(JSON.parse(JSON.stringify(math)))).toEqual(math.total);
 expect(()=>reserveXYTransportMath(math,{...EMPTY_MATH_RESOURCE_TOTAL,occurrences:MATH_LIMITS.documentOccurrences})).toThrow(/budget/i);
 const category=math.records.find(r=>r.role==='category')!;
 expect(category.parts.filter(p=>p.kind==='math')).toMatchObject([{tex:'c',origins:[{rawSource:'&dollar;&dollar;c&dollar;&dollar;'}]}]);
});
it('preserves signed zero and missing Y and rejects noncanonical numeric aliases',()=>{
 const math=parsed('xychart\nx-axis [a,b]\nline [-0 "$$p$$"]\n');
 expect(math.snapshot.data.plots[0]!.data).toEqual([['a','-0'],['b','undefined']]);
 const decoded=decodeXYTransportSnapshot(JSON.parse(JSON.stringify(math.snapshot)));
 expect(Object.is(decoded.data.plots[0]!.data[0]![1],-0)).toBe(true);
 expect(decoded.data.plots[0]!.data[1]![1]).toBeUndefined();
 for(const spelling of ['0x0','-0.0','0 ','1e0','00','undefined']){
  const changed=structuredClone(math),plot=changed.effects.find(e=>e.method==='setLineData');
  if(!plot||!('data'in plot))throw new Error('missing line effect');
  (plot.data[0] as {value:string}).value=spelling;
  expect(()=>reserveXYTransportMath(changed)).toThrow();
 }
 const malformed=structuredClone(parsed('xychart\nx-axis [a]\nline [4 "$$p$$"]\n'));(malformed.snapshot.data.plots[0]!.data as unknown[])[0]='a4';
 expect(()=>reserveXYTransportMath(malformed)).toThrow(/tuple/);
 const changed=structuredClone(math);changed.snapshot.data.yAxis.min='undefined';
 expect(()=>reserveXYTransportMath(changed)).toThrow();
});
it('recomputes formula costs and rejects hidden-record, history and candidate forgery',()=>{
 const math=parsed();
 const mutations:Array<(m:any)=>void>=[
  m=>m.records[0].role='bogus',m=>m.records[0].dbValue='changed',m=>m.effects.reverse(),
  m=>m.snapshot.data.plots[1].data[0]=['<br>$$c$$','4','extra'],
  m=>m.snapshot.data.plots[0].data[0]=42,
  m=>m.candidates.reverse(),m=>m.candidates[0].recordIndex=999,m=>m.snapshot.orientation='vertical',
  m=>m.effects.find((e:any)=>e.method==='setXAxisBand').records.reverse(),
  m=>{const p=m.records[0].parts.find((p:any)=>p.kind==='math');p.mathmlBytes--;m.total.svgBytes--;},
 ];
 for(const mutate of mutations){const changed=structuredClone(math);mutate(changed);expect(()=>reserveXYTransportMath(changed)).toThrow();}
});
it('rejects located invalid hidden math, mismatched source and numeric overflow, then recovers',()=>{
 const bad='xychart\nbar [1 "$$\\unknownVisser$$"]\n';
 const overflow='xychart\ntitle "$$t$$"\nline ['+'9'.repeat(400)+']\n';
 const outcomes=parseMermaid([request('bad',bad),request('overflow',overflow),{...request('mismatch'),originalSource:source.replace('$$old$$','$$other$$')},request('good'),request('plain','xychart\nline [1,2]\n')]);
 expect(outcomes.get('bad')).toMatchObject({ok:false,code:'E_MATH',line:2});
 expect(outcomes.get('overflow')).toMatchObject({ok:false,code:'E_MATH'});
 expect(outcomes.get('mismatch')).toMatchObject({ok:false});
 expect(outcomes.get('good')).toMatchObject({ok:true,xyMath:{total:{occurrences:13}}});
 expect(outcomes.get('plain')).toMatchObject({ok:true});
 expect((outcomes.get('plain')as any).xyMath).toBeUndefined();
});
it('requires original source, admits both native family spellings and isolates cache modes',()=>{
 const invalid=parseMermaid([{...request('missing'),originalSource:undefined},{...request('wrong','journey\nTask: 1\n')},{...request('both'),quadrant:true}]);
 for(const outcome of invalid.values())expect(outcome).toMatchObject({ok:false,code:'E_MATH'});
 expect(parsed('xychart-beta\ntitle "$$t$$"\nline [1]\n').total.occurrences).toBe(1);
 clearMermaidParseCache();
 const plainMode=parseMermaid([{...request('disabled'),xy:false}]).get('disabled');
 expect(plainMode).toMatchObject({ok:false,error:'db.getActors is not a function'});expect((plainMode as any).xyMath).toBeUndefined();
 expect(parseMermaid([request('enabled')]).get('enabled')).toMatchObject({ok:true,xyMath:{total:{occurrences:13}}});
});
