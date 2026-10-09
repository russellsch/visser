import {beforeAll,expect,it} from 'vitest';
import {parseMermaid} from '../../packages/core/src/mermaid/parse.ts';
import {normalizeMermaidSource} from '../../packages/core/src/mermaid/rules.ts';
import {xyMathSourceMap} from '../../packages/core/src/mermaid/xychart-source-map.ts';
import {visibleXYSlots} from '../../packages/core/src/mermaid/xychart-visibility.ts';
import type {XYRenderMath} from '../../packages/core/src/mermaid/xychart-transport.ts';

const original='\uFEFF  xychart\r\n  %% ignored $$hidden$$\r\n  title "old $$old$$"\r\n  title "雪 $$t$$"\r\n  x-axis "$$x$$" ["&dollar;&dollar;a&dollar;&dollar;<br/>","$$a$$"]\r\n  y-axis "$$y$$" 0 --> 10\r\n  line "$$series$$" [2 "$$p$$",2,8 "$$p$$"]\r\n  bar "$$bar$$" [3 "$$ignored$$",4]\r\n';
const source=normalizeMermaidSource(original),bytes=new TextEncoder().encode(original);
let math:XYRenderMath;
beforeAll(()=>{const result=parseMermaid([{figureId:'xy',type:'other',xy:true,source,originalSource:original}]).get('xy')!;if(!result.ok||!result.xyMath)throw new Error(JSON.stringify(result));math=result.xyMath;});
const map=(xyMath=math)=>xyMathSourceMap({source,mathBodyStartByte:0,xyMath},bytes);

it('maps duplicate authored records to canonical XY keys and exact original bytes',()=>{
 const result=map();expect(result.format).toBe('xychart');
 expect(result.labels.map(label=>label.key).sort()).toEqual(['category:0','category:1','point:0:0','series:0','series:1','title','xTitle','yTitle']);
 const expression=(key:string)=>result.labels.find(label=>label.key===key)!.expressions[0]!;
 expect(expression('category:0')).toMatchObject({tex:'a',rawSource:'&dollar;&dollar;a&dollar;&dollar;',encoded:true});
 expect(expression('category:1')).toMatchObject({tex:'a',rawSource:'$$a$$'});
 expect(new Set(['title','category:0','category:1','point:0:0'].map(key=>(expression(key)as any).start)).size).toBe(4);
 for(const label of result.labels)for(const part of label.expressions)if('rawSource'in part)expect(result.source.slice(part.start,part.end)).toBe(part.rawSource);
});

it('keeps authored costs and rejects visibility plans changed after parsing',()=>{
 expect(math.total.occurrences).toBe(11);expect(math.records).toHaveLength(13);
 const hidden:any=structuredClone(math);hidden.visibility={title:false,xTitle:false,yTitle:false,categories:false,legend:false};hidden.slots=structuredClone(visibleXYSlots(hidden.candidates,hidden.visibility));
 expect(hidden.slots.map((slot:{key:string})=>slot.key)).toEqual(['point:0:0']);
 expect(()=>map(hidden)).toThrow(/authenticated source ownership/);
});

it('rejects stale bytes, forged slots and source-body offsets',()=>{
 const forged=structuredClone(math)as any;forged.slots[0].recordIndex=999;
 expect(()=>map(forged)).toThrow();
 expect(()=>xyMathSourceMap({source,xyMath:math},bytes)).toThrow(/body byte offset/);
 expect(()=>xyMathSourceMap({source,mathBodyStartByte:0,xyMath:math},new TextEncoder().encode(original.replace('雪','changed')))).toThrow();
});

it('preserves authored charges through figure transport and document budget limits',async()=>{
 const {buildMermaidFigure}=await import('../../packages/core/src/mermaid/figure.ts');const {mermaidMathTotal}=await import('../../packages/core/src/mermaid/index.ts');const {MATH_LIMITS,EMPTY_MATH_RESOURCE_TOTAL}=await import('../../packages/core/src/math/policy.ts');
 const figure=buildMermaidFigure('xy',source,'xychart','other',{figureId:'xy',ok:true,type:'other',xyMath:math}).figure;
 expect(figure.xyMath).toBe(math);expect(mermaidMathTotal([figure])).toEqual(math.total);
 expect(()=>mermaidMathTotal([figure],{...EMPTY_MATH_RESOURCE_TOTAL,occurrences:MATH_LIMITS.documentOccurrences-10})).toThrow();
});

it('retains an empty source map for accessibility-only math',()=>{
 const text='xychart\naccTitle: $$hidden$$\nx-axis [a]\ny-axis 0 --> 1\nline [1]\n';
 const result=parseMermaid([{figureId:'hidden',type:'other',xy:true,source:text,originalSource:text}]).get('hidden')!;if(!result.ok||!result.xyMath)throw new Error(JSON.stringify(result));
 expect(result.xyMath.total.occurrences).toBe(1);
 const resultMap=xyMathSourceMap({source:text,mathBodyStartByte:0,xyMath:result.xyMath},new TextEncoder().encode(text));expect(resultMap.labels).toEqual([]);
});
