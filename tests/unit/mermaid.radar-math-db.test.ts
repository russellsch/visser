import {afterAll,beforeAll,expect,it} from 'vitest';
import DOMPurify from 'dompurify';
// @ts-expect-error jsdom is supplied by the test harness without declarations.
import {JSDOM} from 'jsdom';
import {captureRadarDb} from '../../packages/core/src/mermaid/radar-db.ts';
import {reconcileRadarMathDb} from '../../packages/core/src/mermaid/radar-math-db.ts';
import {extractRadarMath} from '../../packages/core/src/mermaid/radar-math.ts';

const original=Object.getOwnPropertyDescriptors(DOMPurify);
beforeAll(()=>{const instance=DOMPurify(new JSDOM('').window);Object.assign(DOMPurify,{sanitize:instance.sanitize,addHook:instance.addHook});});
afterAll(()=>{for(const key of ['sanitize','addHook'])if(original[key])Object.defineProperty(DOMPurify,key,original[key]!);else Reflect.deleteProperty(DOMPurify,key);});
async function native(source:string){const {default:mermaid}=await import('mermaid');mermaid.initialize({startOnLoad:false,securityLevel:'strict'});return (await mermaid.mermaidAPI.getDiagramFromText(source)).db as any;}

const source=String.raw`radar-beta
title $$a < b$$<br/>
accTitle: $$access$$<br/>
accDescr: $$description$$<br/>
axis dup["$$axis$$"],dup,plain
curve same["$$curve-one$$"]{dup: 1, dup: 2, plain: 3}
curve same {4,5}
showLegend true
`;

it('reconciles sanitized common metadata and separate explicit/fallback duplicate axis and curve owners',async()=>{
 const db=await native(source);const snapshot=captureRadarDb(db);try{const math=await extractRadarMath(source),result=reconcileRadarMathDb(math,snapshot);expect(result.snapshot).toEqual(snapshot);expect(result.slots.map(slot=>slot.key)).toEqual(['title','axis:0','axis:1','axis:2','curve:0','curve:1']);
  const byRole=(role:string)=>math.records.filter(record=>record.role===role);expect(byRole('title').at(-1)!.dbValue).toBe(snapshot.title);expect(byRole('accTitle').at(-1)!.dbValue).toBe(snapshot.accTitle);expect(byRole('accDescr').at(-1)!.dbValue).toBe(snapshot.accDescr);
  expect(snapshot.axes.map(axis=>axis.label)).toEqual(['$$axis$$','dup','plain']);expect(snapshot.curves.map(curve=>[curve.name,curve.label,curve.entries])).toEqual([['same','$$curve-one$$',[1,1,3]],['same','same',[4,5]]]);
 }finally{db.clear();}
});

it('suppresses a final empty root owner and hidden legend slots while retaining every authored charge',async()=>{
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
 const db=await native(hidden);const snapshot=captureRadarDb(db);try{const math=await extractRadarMath(hidden),result=reconcileRadarMathDb(math,snapshot);expect(snapshot).toMatchObject({title:'',accTitle:'',accDescr:'',options:{showLegend:false}});expect(result.slots.map(slot=>slot.key)).toEqual(['axis:0','axis:1']);expect(math.records.filter(record=>record.role==='curve.label').at(-1)!.parts.some(part=>part.kind==='math')).toBe(true);expect(math.total.occurrences).toBe(5);
  expect(math.labels.records.filter(record=>['title','accTitle','accDescr'].includes(record.role)).map(record=>[record.role,record.semanticValue,record.active])).toEqual([['title','$$old$$',false],['title','',true],['accTitle','$$access$$',false],['accTitle','',true],['accDescr','$$description$$',false],['accDescr','',true]]);
 }finally{db.clear();}
});

it('rejects forged native snapshots, authored record order, and owned display values',async()=>{
 const db=await native(source);const snapshot=captureRadarDb(db);try{const math=await extractRadarMath(source);const badSnapshots:Array<(value:any)=>void>=[value=>value.axes[0].label='forged',value=>value.curves.reverse(),value=>value.accTitle='forged'];for(const mutate of badSnapshots){const hostile=structuredClone(snapshot);mutate(hostile);expect(()=>reconcileRadarMathDb(math,hostile)).toThrow();}
  const reordered={...math,records:[...math.records].reverse()}as any;expect(()=>reconcileRadarMathDb(reordered,snapshot)).toThrow();
  const axis=math.records.find(record=>record.role==='axis.label')!,forged={...math,records:math.records.map(record=>record.recordIndex===axis.recordIndex?{...record,dbValue:'forged'}:record)}as any;expect(()=>reconcileRadarMathDb(forged,snapshot)).toThrow();
 }finally{db.clear();}
});
