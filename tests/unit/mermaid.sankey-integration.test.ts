import {expect,it} from 'vitest';
import {clearMermaidParseCache,parseMermaid} from '../../packages/core/src/mermaid/parse.ts';
import {decodeSankeyTransportSnapshot,reserveSankeyTransportMath} from '../../packages/core/src/mermaid/sankey-transport.ts';
import {EMPTY_MATH_RESOURCE_TOTAL,MATH_LIMITS} from '../../packages/core/src/math/policy.ts';

const source=String.raw`sankey
"$$x < y$$<br/>","&dollar;&dollar;z&dollar;&dollar;<br/>",1
"$$x &lt; y$$<br/>","&dollar;&dollar;z&dollar;&dollar;<br/>",2
"same ""quoted""",plain,3
"same ""quoted""",plain,4
`;
const request=(figureId:string,text=source,originalSource=text)=>({figureId,type:'other' as const,sankey:true,source:text,originalSource});
function parsed(text=source,originalSource=text){const result=parseMermaid([request('sankey',text,originalSource)]).get('sankey')!;if(!result.ok||!result.sankeyMath)throw new Error(JSON.stringify(result));return result.sankeyMath;}

it('transports every authored Sankey endpoint, first sanitized owners, rows, and exact origins through the worker',()=>{
 const math=parsed();expect(math.records).toHaveLength(8);expect(math.rows).toHaveLength(4);expect(math.candidates).toEqual([{key:'node:0',nodeIndex:0,recordIndex:1},{key:'node:1',nodeIndex:1,recordIndex:2},{key:'node:2',nodeIndex:2,recordIndex:5},{key:'node:3',nodeIndex:3,recordIndex:6}]);
 expect(math.total.occurrences).toBe(4);expect(math.snapshot.graph.links.map(link=>link.value)).toEqual(['1','2','3','4']);expect(reserveSankeyTransportMath(JSON.parse(JSON.stringify(math)))).toEqual(math.total);
 const left=math.records[0]!.parts.find(part=>part.kind==='math')!,right=math.records[1]!.parts.find(part=>part.kind==='math')!;expect(left).toMatchObject({origins:[{rawSource:'$$x < y$$'}]});expect(right).toMatchObject({origins:[{rawSource:'&dollar;&dollar;z&dollar;&dollar;'}]});
});

it('preserves canonical negative zero and rejects transport parts, graph, rows, order, and candidate forgery',()=>{
 const math=parsed('sankey\n"$$x$$",a,-0\na,b,1\n');expect(math.snapshot.graph.links[0]!.value).toBe('-0');expect(Object.is(decodeSankeyTransportSnapshot(math.snapshot).graph.links[0]!.value,-0)).toBe(true);
 const mutations:Array<(m:any)=>void>=[m=>m.records[0].dbValue='forged',m=>m.records[0].parts=[],m=>m.total.occurrences--,m=>m.snapshot.graph.links.reverse(),m=>m.rows.reverse(),m=>m.candidates.reverse(),m=>m.rows[0].value='1e0',m=>m.snapshot.graph.links[0].value='0.0',m=>m.rows[0].value='NaN',m=>{m.records[0].parts[0].mathmlBytes--;m.total.svgBytes--;}];
 for(const mutate of mutations){const changed=structuredClone(math);mutate(changed);expect(()=>reserveSankeyTransportMath(changed)).toThrow();}
});

it('requires original source for math, rejects mismatched/family-conflicting and invalid numeric math requests, then recovers',()=>{
 const bad=parseMermaid([{figureId:'missing',type:'other' as const,sankey:true,source},{...request('mismatch'),originalSource:source.replace('$$x < y$$','$$other$$')},{...request('family'),xy:true},request('negative','sankey\n"$$x$$",a,-1\n'),request('nan','sankey\n"$$x$$",a,NaN\n'),request('good','sankey\n"$$x$$",a,1\n')]);
 for(const key of ['missing','mismatch','family','negative','nan'])expect(bad.get(key)).toMatchObject({ok:false,code:'E_MATH'});
 expect(bad.get('good')).toMatchObject({ok:true,sankeyMath:{total:{occurrences:1}}});
});

it('keeps plain numeric quirks plain and enforces document budgets without treating a disabled cache mode as a Sankey result',()=>{
 expect(parseMermaid([request('plain','sankey\na,b,1tail\n')]).get('plain')).toMatchObject({ok:true});expect((parseMermaid([request('plain2','sankey\na,b,1tail\n')]).get('plain2')as any).sankeyMath).toBeUndefined();
 const math=parsed();expect(()=>reserveSankeyTransportMath(math,{...EMPTY_MATH_RESOURCE_TOTAL,occurrences:MATH_LIMITS.documentOccurrences-3})).toThrow(/budget/i);clearMermaidParseCache();
 const enabled=request('cache','sankey\n"$$x$$",a,1\n');
 expect(parseMermaid([enabled]).get('cache')).toMatchObject({ok:true,sankeyMath:{total:{occurrences:1}}});
 const disabled=parseMermaid([{...enabled,sankey:false}]).get('cache');expect(disabled).toMatchObject({ok:false});expect((disabled as any).sankeyMath).toBeUndefined();
 expect(parseMermaid([enabled]).get('cache')).toMatchObject({ok:true,sankeyMath:{total:{occurrences:1}}});
});
