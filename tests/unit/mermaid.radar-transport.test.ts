import {expect,it} from 'vitest';
import {EMPTY_MATH_RESOURCE_TOTAL,MATH_LIMITS} from '../../packages/core/src/math/policy.ts';
import {replayRadarDb} from '../../packages/core/src/mermaid/radar-db.ts';
import {reconcileRadarMathDb} from '../../packages/core/src/mermaid/radar-math-db.ts';
import {extractRadarMath} from '../../packages/core/src/mermaid/radar-math.ts';
import {decodeRadarTransportSnapshot,radarMathTransport,reserveRadarTransportMath} from '../../packages/core/src/mermaid/radar-transport.ts';

async function transportFor(source:string){
 const math=await extractRadarMath(source);
 const last=(role:'title'|'accTitle'|'accDescr')=>{
  const label=math.labels.records.findLast(record=>record.role===role);
  if(!label?.semanticValue)return '';
  return math.records.find(record=>record.recordIndex===label.recordIndex)!.dbValue;
 };
 const snapshot=replayRadarDb({axes:math.labels.ast.axes,curves:math.labels.ast.curves,options:math.labels.ast.options,
  metadata:{title:last('title'),accTitle:last('accTitle'),accDescr:last('accDescr')}});
 const {slots}=reconcileRadarMathDb(math,snapshot);
 return {math,snapshot,slots,transport:radarMathTransport(math,snapshot,slots)};
}

const source=String.raw`radar-beta
title $$old$$
title $$title$$
accTitle: $$access$$
accDescr: $$description$$
axis dup["$$axis$$"],dup,plain
curve same["$$curve-one$$"]{dup: 1, dup: 2, plain: 3}
curve same {4,5}
showLegend true
ticks 3
`;

it('round-trips canonical Radar DB state, duplicate references, and every authored math charge',async()=>{
 const {math,snapshot,slots,transport}=await transportFor(source);
 const json=JSON.parse(JSON.stringify(transport));
 expect(reserveRadarTransportMath(json)).toEqual(math.total);
 expect(decodeRadarTransportSnapshot(json.snapshot)).toEqual(snapshot);
 expect(json.input.curves[0].entries).toEqual([
  {value:'1',axis:{$refText:'dup'}},{value:'2',axis:{$refText:'dup'}},{value:'3',axis:{$refText:'plain'}},
 ]);
 expect(json.snapshot.curves[0].entries).toEqual(['1','1','3']);
 expect(json.slots).toEqual(slots);
 expect(json.records.filter((record:any)=>record.role==='title').map((record:any)=>[record.semanticValue,record.active])).toEqual([['$$old$$',false],['$$title$$',true]]);
 expect(()=>reserveRadarTransportMath(json,{...EMPTY_MATH_RESOURCE_TOTAL,occurrences:MATH_LIMITS.documentOccurrences})).toThrow(/budget/i);
});

it('retains overwritten and empty authored roots and hidden legend costs without assigning hidden slots',async()=>{
 const hidden=String.raw`radar-beta
title $$old$$
title
accTitle: $$access$$
accTitle:
accDescr: $$description$$
accDescr:
axis a["$$axis$$"],b
curve c["$$hidden-curve$$"]{1,2}
showLegend false
`;
 const {math,transport}=await transportFor(hidden);
 expect(transport.slots.map(slot=>slot.key)).toEqual(['axis:0','axis:1']);
 expect(transport.records.filter(record=>record.role==='curve.label').at(-1)!.parts.some(part=>part.kind==='math')).toBe(true);
 expect(math.total.occurrences).toBe(5);
 expect(reserveRadarTransportMath(JSON.parse(JSON.stringify(transport)))).toEqual(math.total);
});

it('preserves numeric sentinels through JSON while rejecting noncanonical numeric spellings',()=>{
 const encoded:any={version:1,title:'',accTitle:'',accDescr:'',axes:[],curves:[{name:'c',label:'c',entries:['-0','NaN','Infinity','-Infinity']}],
  options:{showLegend:true,ticks:'-0',max:'NaN',min:'Infinity',graticule:'circle'}};
 const decoded=decodeRadarTransportSnapshot(JSON.parse(JSON.stringify(encoded)));
 expect(Object.is(decoded.curves[0]!.entries[0],-0)).toBe(true);
 expect(decoded.curves[0]!.entries.slice(1).map(Number.isFinite)).toEqual([false,false,false]);
 expect(Object.is(decoded.options.ticks,-0)).toBe(true);
 expect(Number.isNaN(decoded.options.max!)).toBe(true);
 expect(decoded.options.min).toBe(Infinity);
 for(const mutate of [(value:any)=>value.options.ticks='0.0',(value:any)=>value.curves[0].entries[0]='1e0',(value:any)=>value.options.min=0]){
  const hostile=structuredClone(encoded);mutate(hostile);expect(()=>decodeRadarTransportSnapshot(hostile)).toThrow(/canonical/);
 }
});

it('rejects forged parts, identities, slots, parser input, and native snapshot state',async()=>{
 const {transport}=await transportFor(source);
 const mutations:Array<(value:any)=>void>=[
  value=>value.records.find((record:any)=>record.parts.some((part:any)=>part.kind==='math')).parts.find((part:any)=>part.kind==='math').mathmlBytes--,
  value=>value.total.occurrences--,
  value=>value.records[0].renderedValue='forged',
  value=>value.records[0].role='axis.label',
  value=>value.records.find((record:any)=>record.role==='axis.name').itemIndex=9,
  value=>value.records.reverse(),
  value=>value.records.pop(),
  value=>value.records.push({...value.records.at(-1),recordIndex:value.records.length+1}),
  value=>value.slots.pop(),
  value=>value.slots.push({...value.slots[0]}),
  value=>value.input.axes[0].name='forged',
  value=>value.input.curves[0].entries[0].value='1e0',
  value=>value.snapshot.axes[0].label='forged',
  value=>value.snapshot.options.ticks='0.0',
 ];
 for(const mutate of mutations){const hostile:any=structuredClone(transport);mutate(hostile);expect(()=>reserveRadarTransportMath(hostile)).toThrow();}
});
