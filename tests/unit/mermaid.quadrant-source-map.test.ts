import {beforeAll,expect,it} from 'vitest';
import {parseMermaid} from '../../packages/core/src/mermaid/parse.ts';
import {normalizeMermaidSource} from '../../packages/core/src/mermaid/rules.ts';
import {quadrantMathSourceMap} from '../../packages/core/src/mermaid/quadrant-source-map.ts';
import type {QuadrantRenderMath} from '../../packages/core/src/mermaid/quadrant-transport.ts';
const original='\uFEFF  quadrantChart\r\n  %% private $$hidden$$\r\n  title old $$old$$\r\n  title 雪 $$x$$\r\n  x-axis $$x$$ -->\r\n  quadrant-1 "before<br/>&dollar;&dollar;q&dollar;&dollar;"\r\n  "😀 $$x$$": [0.1, 0.2]\r\n  "😀 $$x$$": [0.1, 0.2]\r\n';
const source=normalizeMermaidSource(original),bytes=new TextEncoder().encode(original);
let math:QuadrantRenderMath;
beforeAll(()=>{const result=parseMermaid([{figureId:'q',type:'other',quadrant:true,source,originalSource:original}]).get('q')!;if(!result.ok||!result.quadrantMath)throw new Error(JSON.stringify(result));math=result.quadrantMath;});
const map=(quadrantMath=math)=>quadrantMathSourceMap({source,mathBodyStartByte:0,quadrantMath},bytes);
it('maps canonical reversed points, transformed caption, synthetic axis suffix and exact original spelling',()=>{
 const result=map();expect(result.format).toBe('quadrant');expect(result.source).not.toContain('private');
 expect(result.labels.map(l=>l.key).sort()).toEqual(['point:0','point:1','quadrant1','title','xLeft']);
 const expr=(key:string)=>result.labels.find(l=>l.key===key)!.expressions[0]!;
 expect(expr('quadrant1')).toMatchObject({tex:'q',rawSource:'&dollar;&dollar;q&dollar;&dollar;',encoded:true});
 expect(expr('xLeft')).toMatchObject({tex:'x',rawSource:'$$x$$'});
 expect((expr('point:0')as any).start).toBeGreaterThan((expr('point:1')as any).start);
 expect(new Set(['title','xLeft','point:0','point:1'].map(k=>(expr(k)as any).start)).size).toBe(4);
 for(const l of result.labels)for(const p of l.expressions)if('rawSource'in p)expect(result.source.slice(p.start,p.end)).toBe(p.rawSource);
});
it('rejects stale source bytes, invalid ownership and missing body position',()=>{
 const changed=structuredClone(math)as any;changed.slots[0].recordIndex=999;
 expect(()=>map(changed)).toThrow();
 expect(()=>quadrantMathSourceMap({source,quadrantMath:math},bytes)).toThrow(/body byte offset/);
 expect(()=>quadrantMathSourceMap({source,mathBodyStartByte:0,quadrantMath:math},new TextEncoder().encode(original.replace('雪','changed')))).toThrow();
});
it('retains hidden authored costs through figure transport and document budgeting',async()=>{
 const {buildMermaidFigure}=await import('../../packages/core/src/mermaid/figure.ts');
 const {mermaidMathTotal}=await import('../../packages/core/src/mermaid/index.ts');
 const {MATH_LIMITS,EMPTY_MATH_RESOURCE_TOTAL}=await import('../../packages/core/src/math/policy.ts');
 const figure=buildMermaidFigure('q',source,'quadrantChart','other',{figureId:'q',ok:true,type:'other',quadrantMath:math}).figure;
 expect(figure.quadrantMath).toBe(math);expect(mermaidMathTotal([figure])).toEqual(math.total);
 expect(math.total.occurrences).toBe(6);
 expect(()=>mermaidMathTotal([figure],{...EMPTY_MATH_RESOURCE_TOTAL,occurrences:MATH_LIMITS.documentOccurrences-5})).toThrow();
});
