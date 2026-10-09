import { afterAll,beforeAll,expect,it } from 'vitest';
import DOMPurify from 'dompurify';
// @ts-expect-error jsdom is supplied without declarations.
import { JSDOM } from 'jsdom';
import { extractXYMath,type XYMath } from '../../packages/core/src/mermaid/xychart-math.ts';
import { captureXYBaseline,captureXYDb,reconcileXYDb,type XYDbSnapshot } from '../../packages/core/src/mermaid/xychart-db.ts';
// @ts-expect-error pinned native Mermaid chunk has no declarations.
import {diagram} from 'mermaid/dist/chunks/mermaid.core/xychartDiagram-PMCCYNJV.mjs';
const original=Object.getOwnPropertyDescriptors(DOMPurify);
beforeAll(()=>{
 const instance=DOMPurify(new JSDOM('').window);
 Object.assign(DOMPurify,{sanitize:instance.sanitize,addHook:instance.addHook});
});
afterAll(()=>{
 diagram.db.clear();
 for(const name of ['sanitize','addHook']) {
  if(original[name])Object.defineProperty(DOMPurify,name,original[name]!);
  else Reflect.deleteProperty(DOMPurify,name);
 }
});
async function parsed(source:string) {
 const math=await extractXYMath(source),db=diagram.db;
 db.clear();
 try {
  const baseline=captureXYBaseline(db),parser=new diagram.parser.parser.Parser();parser.yy=db;parser.parse(source);
  const native=captureXYDb(db),plan=reconcileXYDb(math,native,baseline);
  return {math,native,baseline,plan};
 } finally {db.clear();}
}
it('reconciles every sanitized field and keeps duplicate categories as separate candidate owners',async()=>{
 const result=await parsed(`xychart horizontal
title "old $$old$$"
title "title<br/>$$t < x$$"
accTitle: $$a$$
accDescr { $$d$$ }
x-axis "X $$x$$" ["<br/>&dollar;&dollar;c&dollar;&dollar;","<br/>$$c$$"]
y-axis "Y $$y$$" 0 --> 10
line "line $$s$$" [1 "$$p$$", 2 "$$p$$", 3 "$$truncated$$"]
bar "bar $$s$$" [4 "$$ignored$$"]
`);
 expect(result.plan.snapshot.data.title).toBe('');
 expect(result.plan.snapshot.title).toBe('title<br>$$t &lt; x$$');
 expect(result.plan.snapshot.orientation).toBe('horizontal');
 expect(result.plan.candidates.map(s=>s.key)).toEqual(['title','xTitle','yTitle','category:0','category:1','series:0','point:0:0','point:0:1','series:1']);
 const categories=result.plan.candidates.filter(s=>s.role==='category');
 expect(categories.map(s=>result.math.records[s.recordIndex-1]!.dbValue)).toEqual(['<br>$$c$$','<br>$$c$$']);
 expect(categories[0]!.recordIndex).not.toBe(categories[1]!.recordIndex);
 expect(result.plan.snapshot.data.plots[0]!.pointLabels).toEqual(['$$p$$','$$p$$','$$truncated$$']);
 expect(result.plan.snapshot.data.plots[0]!.data).toHaveLength(2);
 expect(result.plan.snapshot.data.plots[1]!.data[1]![1]).toBeUndefined();
 expect(result.plan.snapshot.data.plots[1]).not.toHaveProperty('pointLabels');
});
it('replays axis history instead of projecting every series onto final axes',async()=>{
 const {plan}=await parsed(`xychart
line "first $$a$$" [2,4]
line "next $$b$$" [10,20,30]
x-axis "middle" [a,b,c]
bar [5,6]
x-axis "last $$x$$" 100 --> 200
line [7]
y-axis "last $$y$$" -1 --> 99
`);
 expect(plan.snapshot.data.plots.map(p=>p.data)).toEqual([
  [['1',2],['2',4]],[['1',10],['1.5',20],['2',30]],[['a',5],['b',6],['c',undefined]],[['100',7]],
 ]);
 expect(plan.snapshot.data.xAxis).toEqual({type:'linear',title:'last $$x$$',min:100,max:200});
 expect(plan.snapshot.data.yAxis).toEqual({type:'linear',title:'last $$y$$',min:-1,max:99});
 expect(plan.candidates.filter(s=>s.role==='category')).toEqual([]);
});
it('accumulates auto-Y only over retained input values and preserves explicit ranges',async()=>{
 const auto=await parsed('xychart\nx-axis [a,b,c]\nline [2,4,6,999]\nbar [1]\n');
 expect(auto.plan.snapshot.data.yAxis).toEqual({type:'linear',title:'',min:1,max:6});
 const explicit=await parsed('xychart\nline [1,2]\ny-axis -5 --> 5\nline [-99,99]\n');
 expect(explicit.plan.snapshot.data.yAxis).toEqual({type:'linear',title:'',min:-5,max:5});
});
it('preserves native orientation case behavior and captures a configured baseline',async()=>{
 const lower=await parsed('xychart horizontal\nline [1]\n');
 const upper=await parsed('xychart HORIZONTAL\nline [1]\n');
 expect(lower.plan.snapshot.orientation).toBe('horizontal');
 expect(upper.plan.snapshot.orientation).toBe('vertical');
 const math=await extractXYMath('xychart\nline [1]\n'),db=diagram.db;db.clear();
 try{
  db.getChartConfig().chartOrientation='horizontal';
  const baseline=captureXYBaseline(db),parser=new diagram.parser.parser.Parser();parser.yy=db;parser.parse('xychart\nline [1]\n');
  expect(reconcileXYDb(math,captureXYDb(db),baseline).snapshot.orientation).toBe('horizontal');
 }finally{db.clear();}
});
it('detaches both captured and returned snapshots from later native mutations',async()=>{
 const {math,baseline,native,plan}=await parsed('xychart\ntitle "$$t$$"\nx-axis [a,b]\nline [1 "$$p$$",2]\n');
 const old=structuredClone(plan.snapshot);
 native.data.plots[0]!.data[0]![0]='changed';native.data.xAxis.title='changed';
 expect(plan.snapshot).toEqual(old);
 expect(()=>reconcileXYDb(math,native,baseline)).toThrow(/actual native/);
});
it('rejects native mutations, wrong source owners, missing records and effect reordering',async()=>{
 const {math,native,baseline}=await parsed('xychart\ntitle "$$t$$"\nx-axis ["$$a$$","$$a$$"]\nline "$$s$$" [1 "$$p$$",2 "$$p$$"]\n');
 const mutations:Array<(s:XYDbSnapshot)=>void>=[s=>{s.title='bad';},s=>{s.data.plots[0]!.data.reverse();},s=>{s.data.plots[0]!.strokeFill='bad';},s=>{s.data.plots[0]!.pointLabels!.pop();},s=>{s.data.xAxis.title='bad';},s=>{s.orientation='horizontal';}];
 for(const mutate of mutations){const altered=structuredClone(native);mutate(altered);expect(()=>reconcileXYDb(math,altered,baseline)).toThrow(/actual native/);}
 const badEffects=math.labels.effects.map(e=>e.method==='setXAxisBand'?{...e,records:[e.records[0]!,e.records[0]!]}:e);
 expect(()=>reconcileXYDb({...math,labels:{...math.labels,effects:badEffects}},native,baseline)).toThrow(/ownership/);
 expect(()=>reconcileXYDb({...math,records:math.records.slice(1)},native,baseline)).toThrow(/coverage/);
 const bad:XYMath={...math,labels:{...math.labels,effects:[...math.labels.effects].reverse()}};
 expect(()=>reconcileXYDb(bad,native,baseline)).toThrow(/ownership|order/);
});
it('rejects nonfinite authored numbers without changing preserved native finite interpolation',async()=>{
 const source='xychart\ntitle "$$t$$"\nline ['+'9'.repeat(400)+']\n';
 const math=await extractXYMath(source),db=diagram.db;db.clear();
 try{
  const baseline=captureXYBaseline(db),parser=new diagram.parser.parser.Parser();parser.yy=db;parser.parse(source);
  expect(()=>reconcileXYDb(math,captureXYDb(db),baseline)).toThrow(/nonfinite authored/);
 }finally{db.clear();}
 const recovered=await parsed('xychart\nline [1,2]\n');
 expect(recovered.plan.snapshot.data.plots[0]!.data).toEqual([['1',1],['2',2]]);
});
it('retains signed zero and native overflow strings without JSON coercion',async()=>{
 const zero=await parsed('xychart\nx-axis -0 --> 1\nline [-0,1]\n');
 expect(Object.is((zero.plan.snapshot.data.xAxis as {min:number}).min,-0)).toBe(true);
 expect(Object.is(zero.plan.snapshot.data.plots[0]!.data[0]![1],-0)).toBe(true);
 const bound='1'+'0'.repeat(308);
 const overflow=await parsed('xychart\nx-axis -'+bound+' --> '+bound+'\nline [1,2]\n');
 expect(overflow.plan.snapshot.data.plots[0]!.data.map(d=>d[0])).toEqual(['NaN','Infinity']);
 // This is semantic parity only. The measured renderer must reject nonfinite geometry.
});
it('uses configured palette whitespace and wraparound from clear-state baseline',async()=>{
 // @ts-expect-error pinned native Mermaid config chunk has no declarations.
 const {getConfig,setConfig}=await import('mermaid/dist/chunks/mermaid.core/chunk-O7XYJQB3.mjs');
 const previous=getConfig();
 try{
  setConfig({themeVariables:{xyChart:{plotColorPalette:' #123456 , #abcdef '}}});
  const {baseline,plan}=await parsed('xychart\nline "$$a$$" [1]\nbar "$$b$$" [2]\nline "$$c$$" [3]\n');
  expect(baseline.plotColorPalette).toBe(' #123456 , #abcdef ');
  expect(plan.snapshot.data.plots.map(p=>p.strokeFill??p.fill)).toEqual(['#123456','#abcdef','#123456']);
 }finally{setConfig(previous);diagram.db.clear();}
});
