import {beforeAll,expect,it} from 'vitest';
import {parseMermaid} from '../../packages/core/src/mermaid/parse.ts';
import {sankeyMathSourceMap} from '../../packages/core/src/mermaid/sankey-source-map.ts';
import type {SankeyRenderMath} from '../../packages/core/src/mermaid/sankey-transport.ts';

const original='\uFEFF  sankey\r\n  %% ignored $$hidden$$\r\n  "$$x < y$$<br/>","&dollar;&dollar;z&dollar;&dollar;<br/>",1\r\n  "$$x &lt; y$$<br/>","&dollar;&dollar;z&dollar;&dollar;<br/>",2\r\n  "same ""quoted""",plain,3\r\n';
const source='sankey\n%% ignored $$hidden$$\n"$$x < y$$<br/>","&dollar;&dollar;z&dollar;&dollar;<br/>",1\n"$$x &lt; y$$<br/>","&dollar;&dollar;z&dollar;&dollar;<br/>",2\n"same ""quoted""",plain,3\n',bytes=new TextEncoder().encode(original);
let math:SankeyRenderMath;
beforeAll(()=>{const result=parseMermaid([{figureId:'sankey',type:'other',sankey:true,source,originalSource:original}]).get('sankey')!;if(!result.ok||!result.sankeyMath)throw new Error(JSON.stringify(result));math=result.sankeyMath;});
const map=(sankeyMath=math,bodyStart=0,document=bytes)=>sankeyMathSourceMap({source,mathBodyStartByte:bodyStart,sankeyMath},document);

it('maps first sanitized Sankey owners to canonical slots while retaining every authored charge',()=>{
 const result=map();expect(result.format).toBe('sankey');expect(result.labels.map(label=>label.key)).toEqual(['node:0','node:1']);expect(math.candidates).toEqual([{key:'node:0',nodeIndex:0,recordIndex:1},{key:'node:1',nodeIndex:1,recordIndex:2},{key:'node:2',nodeIndex:2,recordIndex:5},{key:'node:3',nodeIndex:3,recordIndex:6}]);expect(math.total.occurrences).toBe(4);
 const expression=(key:string)=>result.labels.find(label=>label.key===key)!.expressions[0]!;
 expect(expression('node:0')).toMatchObject({tex:'x < y',rawSource:'$$x < y$$'});
 expect(expression('node:1')).toMatchObject({tex:'z',rawSource:'&dollar;&dollar;z&dollar;&dollar;',encoded:true});
 expect(result.labels.flatMap(label=>label.expressions)).toHaveLength(2);
 for(const label of result.labels)for(const part of label.expressions)if('rawSource'in part)expect(result.source.slice(part.start,part.end)).toBe(part.rawSource);
});

it('preserves BOM, CRLF, dedent, comments, doubled CSV quotes, and distinct encoded origins',()=>{
 const result=map();expect(result.source).not.toContain('ignored');expect(result.source).not.toContain('\r');expect(result.source).toContain('same ""quoted""');
 const records=math.records.flatMap(record=>record.parts.filter(part=>part.kind==='math').map(part=>({record,part})));expect(records).toHaveLength(4);
 const x=records.filter(({part})=>part.tex==='x < y'),z=records.filter(({part})=>part.tex==='z');expect(x).toHaveLength(2);expect(z).toHaveLength(2);
 expect(x[0]!.part.origins[0]!.startByte).not.toBe(x[1]!.part.origins[0]!.startByte);expect(z[0]!.part.origins[0]!.startByte).not.toBe(z[1]!.part.origins[0]!.startByte);
 for(const {part} of records)for(const origin of part.origins)expect(original.slice(origin.sourceStart,origin.sourceEnd)).toBe(origin.rawSource);
});

it('rejects stale bytes, body offsets, forged candidates, and forged expression origins',()=>{
 expect(()=>sankeyMathSourceMap({source,sankeyMath:math},bytes)).toThrow(/body byte offset/);
 expect(()=>map(math,0,new TextEncoder().encode(original.replace('quoted','changed')))).toThrow();
 const candidate=structuredClone(math)as any;candidate.candidates[0].recordIndex=999;expect(()=>map(candidate)).toThrow();
 const origins=structuredClone(math)as any;const part=origins.records[0].parts.find((value:any)=>value.kind==='math');part.origins[0].rawSource='$$forged$$';expect(()=>map(origins)).toThrow();
});

it('propagates the Sankey transport through figures and document math budgets',async()=>{
 const {buildMermaidFigure}=await import('../../packages/core/src/mermaid/figure.ts');const {mermaidMathTotal}=await import('../../packages/core/src/mermaid/index.ts');const {MATH_LIMITS,EMPTY_MATH_RESOURCE_TOTAL}=await import('../../packages/core/src/math/policy.ts');
 const figure=buildMermaidFigure('sankey',source,'sankey','other',{figureId:'sankey',ok:true,type:'other',sankeyMath:math}as any).figure;
 expect(figure.sankeyMath).toBe(math);expect(mermaidMathTotal([figure])).toEqual(math.total);expect(()=>mermaidMathTotal([figure],{...EMPTY_MATH_RESOURCE_TOTAL,occurrences:MATH_LIMITS.documentOccurrences-3})).toThrow(/budget/i);
});
