import {expect,it} from 'vitest';
import {assertMermaidSourceTransport,clearMermaidParseCache,parseMermaid} from '../../packages/core/src/mermaid/parse.ts';
import {reserveKanbanTransportMath} from '../../packages/core/src/mermaid/kanban-transport.ts';

const source='kanban\na[First]\n  i["雪 $$x$$"]@{label: ["$$y$$", "$$y$$"], ticket: "$$t$$"}\na[Second]\n  j["$$z$$"]\n';
const request=(figureId:string,text=source,originalSource=text)=>({figureId,type:'other' as const,kanban:true,source:text,originalSource});

it('transports duplicate Kanban draws and cyclic hidden YAML as checked JSON',()=>{
 const cyclic='kanban\nc[Column]\n  i["$$x$$"]@{priority: &p\n  self: *p\n  hidden: "$$y$$"\n}\n';
 const results=parseMermaid([request('draws'),request('cyclic',cyclic)]);
 const result:any=results.get('draws');expect(result).toMatchObject({ok:true,kanbanMath:{total:{occurrences:17}}});
 const math=JSON.parse(JSON.stringify(result.kanbanMath));
 expect(reserveKanbanTransportMath(math)).toEqual(math.total);
 assertMermaidSourceTransport('kanban',source,source,math);
 expect(math.draws).toHaveLength(8);
 expect(results.get('cyclic')).toMatchObject({ok:true,kanbanMath:{total:{occurrences:2}}});
});

it('rejects hidden errors, family conflicts, missing source, coercion expansion and recovers within the worker',()=>{
 const invalid=source.replace('$$x$$',()=>String.raw`$$\badKanbanCommand$$`);
 const aliases=Array.from({length:21},(_,i)=>i===0?'a0: &a0 [x]':`a${i}: &a${i} [*a${i-1}, *a${i-1}]`).join(', ');
 const oversized=`kanban\nc[Column]\n  i[Base]@{${aliases}, label: *a20}\n`;
 const results=parseMermaid([request('invalid',invalid),{...request('missing'),originalSource:undefined},request('mismatch',source,source.replace('First','Other')),{...request('mixed'),requirement:true},request('wrong','pie\n"a":1\n'),request('oversized',oversized),request('recovery'),request('plain','kanban\nc[Column]\n  i[Card]\n')]);
 for(const id of ['invalid','missing','mismatch','mixed','wrong'])expect(results.get(id)).toMatchObject({ok:false,code:'E_MATH'});
 expect(results.get('invalid')).toMatchObject({line:3});expect(results.get('oversized')).toMatchObject({ok:false,code:'E_LIMIT'});
 expect(results.get('recovery')).toMatchObject({ok:true,kanbanMath:{total:{occurrences:17}}});
 expect(results.get('plain')).toMatchObject({ok:true});expect((results.get('plain') as any).kanbanMath).toBeUndefined();
});

it('binds the entire JSON payload to original source and isolates mutable cache results',()=>{
 clearMermaidParseCache();
 const original='\uFEFF'+source.replaceAll('\n','\r\n');
 const result:any=parseMermaid([request('source',source,original)]).get('source');
 expect(result.ok).toBe(true);const valid=structuredClone(result.kanbanMath);
 assertMermaidSourceTransport('kanban',source,original,valid);
 // These edits remain structurally and arithmetically consistent. Only the
 // private source receipt can prove authored completeness and ownership.
 const swapped=structuredClone(valid);
 const repeated=swapped.records.find((r:any)=>r.role==='metadata.label').parts.filter((p:any)=>p.kind==='math');
 [repeated[0].origins,repeated[1].origins]=[repeated[1].origins,repeated[0].origins];
 expect(reserveKanbanTransportMath(swapped)).toEqual(valid.total);
 expect(()=>assertMermaidSourceTransport('kanban',source,original,swapped)).toThrow(/authenticated source ownership/);
 const omitted=structuredClone(valid),hidden=omitted.records.find((r:any)=>r.nodeIndex===1&&r.role==='label');
 const hiddenFormula=hidden.parts.find((p:any)=>p.kind==='math');hidden.charges=[];
 omitted.total.occurrences--;omitted.total.svgBytes-=hiddenFormula.mathmlBytes;omitted.total.elementCount-=hiddenFormula.elementCount;
 expect(reserveKanbanTransportMath(omitted)).toEqual(omitted.total);
 expect(()=>assertMermaidSourceTransport('kanban',source,original,omitted)).toThrow(/authenticated source ownership/);
 const mutations=[
  (m:any)=>{m.records.pop();},
  (m:any)=>{m.records.find((r:any)=>r.charges.length).charges=[];},
  (m:any)=>{m.draws.pop();},
  (m:any)=>{m.records.find((r:any)=>r.parts.some((p:any)=>p.kind==='math')).parts.find((p:any)=>p.kind==='math').origins[0].startByte++;},
  (m:any)=>{m.records[0].canonicalText+='changed';},
 ];
 for(const mutate of mutations){const changed=structuredClone(valid);mutate(changed);expect(()=>assertMermaidSourceTransport('kanban',source,original,changed)).toThrow(/authenticated source ownership/);}
 result.kanbanMath.records.length=0;
 const cached:any=parseMermaid([request('source',source,original)]).get('source');expect(cached.kanbanMath).toEqual(valid);
 const disabled:any=parseMermaid([{...request('disabled'),kanban:false}]).get('disabled');expect(disabled.ok).toBe(false);
 clearMermaidParseCache();assertMermaidSourceTransport('kanban',source,original,valid);
});
