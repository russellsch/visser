import {beforeAll,expect,it} from 'vitest';
import {parseMermaid} from '../../packages/core/src/mermaid/parse.ts';
import {radarMathSourceMap} from '../../packages/core/src/mermaid/radar-source-map.ts';
import type {RadarRenderMath} from '../../packages/core/src/mermaid/radar-transport.ts';

const original='\uFEFF  radar-beta\r\n  %% ignored $$hidden$$\r\n  title $$old$$\r\n  title &dollar;&dollar;t&dollar;&dollar;<br/>\r\n  axis dup["$$\\\\frac{a}{b}$$"],dup,plain\r\n  curve same["$$curve$$"]{dup: 1, dup: 2, plain: 3}\r\n  showLegend false\r\n';
const source='radar-beta\n%% ignored $$hidden$$\ntitle $$old$$\ntitle &dollar;&dollar;t&dollar;&dollar;<br/>\naxis dup["$$\\\\frac{a}{b}$$"],dup,plain\ncurve same["$$curve$$"]{dup: 1, dup: 2, plain: 3}\nshowLegend false\n';
const bytes=new TextEncoder().encode(original);
let math:RadarRenderMath;
beforeAll(()=>{const result=parseMermaid([{figureId:'radar',type:'other',radar:true,source,originalSource:original}]).get('radar')!;if(!result.ok||!result.radarMath)throw new Error(JSON.stringify(result));math=result.radarMath;});
const map=(radarMath=math,bodyStart=0,document=bytes)=>radarMathSourceMap({source,mathBodyStartByte:bodyStart,radarMath},document);

it('maps only visible Radar owners while retaining overwritten, hidden, and duplicate authored charges',()=>{
 const result=map();expect(result.format).toBe('radar');expect(result.labels.map(label=>label.key)).toEqual(['title','axis:0']);
 expect(math.slots.map(slot=>slot.key)).toEqual(['title','axis:0','axis:1','axis:2']);
 expect(math.slots.find(slot=>slot.key==='axis:0')!.recordIndex).not.toBe(math.slots.find(slot=>slot.key==='axis:1')!.recordIndex);
 expect(math.records.filter(record=>record.parts.some(part=>part.kind==='math')).map(record=>[record.role,record.active])).toEqual([
  ['title',false],['title',true],['axis.label',true],['curve.label',true],
 ]);
 const expression=(key:string)=>result.labels.find(label=>label.key===key)!.expressions[0]!;
 expect(expression('title')).toMatchObject({tex:'t',rawSource:'&dollar;&dollar;t&dollar;&dollar;',encoded:true});
 expect(expression('axis:0')).toMatchObject({tex:'\\frac{a}{b}',rawSource:'$$\\\\frac{a}{b}$$'});
 expect(result.labels.find(label=>label.key==='curve:0')).toBeUndefined();
 expect(result.labels.flatMap(label=>label.expressions)).toHaveLength(2);
 for(const label of result.labels)for(const part of label.expressions)if('rawSource'in part)expect(result.source.slice(part.start,part.end)).toBe(part.rawSource);
});

it('preserves BOM, CRLF, dedent, comments, encoded common text, and distinct duplicate-axis origins',()=>{
 const result=map();expect(result.source).not.toContain('ignored');expect(result.source).not.toContain('\r');expect(result.source).toContain('axis dup');
 const records=math.records.flatMap(record=>record.parts.filter(part=>part.kind==='math').map(part=>({record,part})));expect(records).toHaveLength(4);
 const titles=records.filter(({record})=>record.role==='title'),axes=records.filter(({record})=>record.role==='axis.label');
 expect(titles[0]!.part.origins[0]!.startByte).not.toBe(titles[1]!.part.origins[0]!.startByte);expect(axes[0]!.part.origins[0]!.rawSource).toBe('$$\\\\frac{a}{b}$$');
 for(const {part} of records)for(const origin of part.origins)expect(original.slice(origin.sourceStart,origin.sourceEnd)).toBe(origin.rawSource);
});

it('rejects stale bytes and offsets plus forged transport slots, records, and origins',()=>{
 expect(()=>radarMathSourceMap({source,radarMath:math},bytes)).toThrow(/body byte offset/);
 expect(()=>map(math,0,new TextEncoder().encode(original.replace('curve same','curve changed')))).toThrow();
 const slots=structuredClone(math)as any;slots.slots[0].recordIndex=999;expect(()=>map(slots)).toThrow();
 const records=structuredClone(math)as any;records.records[0].recordIndex=999;expect(()=>map(records)).toThrow();
 const origins=structuredClone(math)as any;const part=origins.records.find((record:any)=>record.role==='title'&&record.active).parts.find((value:any)=>value.kind==='math');part.origins[0].rawSource='$$forged$$';expect(()=>map(origins)).toThrow();
});

it('propagates Radar transport through figures and document math budgets',async()=>{
 const {buildMermaidFigure}=await import('../../packages/core/src/mermaid/figure.ts');const {mermaidMathTotal}=await import('../../packages/core/src/mermaid/index.ts');const {MATH_LIMITS,EMPTY_MATH_RESOURCE_TOTAL}=await import('../../packages/core/src/math/policy.ts');
 const figure=buildMermaidFigure('radar',source,'radar','other',{figureId:'radar',ok:true,type:'other',radarMath:math}as any).figure;
 expect(figure.radarMath).toBe(math);expect(mermaidMathTotal([figure])).toEqual(math.total);expect(()=>mermaidMathTotal([figure],{...EMPTY_MATH_RESOURCE_TOTAL,occurrences:MATH_LIMITS.documentOccurrences-3})).toThrow(/budget/i);
});
