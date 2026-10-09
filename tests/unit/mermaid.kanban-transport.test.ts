import {expect,it} from 'vitest';
import {EMPTY_MATH_RESOURCE_TOTAL} from '../../packages/core/src/math/policy.ts';
import {extractKanbanMath} from '../../packages/core/src/mermaid/kanban-math.ts';
import {kanbanMathTransport,reserveKanbanTransportMath} from '../../packages/core/src/mermaid/kanban-transport.ts';
import {validateMermaidMathLabel} from '../../packages/core/src/mermaid/math.ts';

const options={width:200,padding:10};
async function transport(source:string){return kanbanMathTransport(await extractKanbanMath(source,options));}

it('round-trips JSON with hidden YAML charges and sparse visible draw copies',async()=>{
 const value=await transport('kanban\na[Column]\n  i[Plain]@{priority: "$$p$$", ticket: "$$t$$"}\na[Again]\n  j["$$x$$"]\n');
 const json=JSON.parse(JSON.stringify(value));
 expect(reserveKanbanTransportMath(json)).toEqual(value.total);
 expect(json.draws.map((draw:any)=>draw.key)).toEqual([
  'kanban-render:0:1:item','kanban-render:0:2:item','kanban-render:0:4:item','kanban-render:0:5:item',
  'kanban-render:1:1:item','kanban-render:1:2:item','kanban-render:1:4:item','kanban-render:1:5:item',
 ]);
 const hidden=json.records.find((record:any)=>record.role==='metadata.priority');
 expect(hidden.charges).toHaveLength(1);
 expect(hidden.charges[0]).toEqual(['$$p$$']);
 expect(reserveKanbanTransportMath(json,{...EMPTY_MATH_RESOURCE_TOTAL,occurrences:1}).occurrences).toBe(value.total.occurrences+1);
});

it('rejects malformed canonical parts/proofs/totals and draw ownership',async()=>{
 const value=await transport('kanban\nc["$$c$$"]\n  i["$$x$$"]@{ticket: "$$t$$"}\n');
 const mutation:Array<(payload:any)=>void>=[
  payload=>payload.records.find((record:any)=>record.parts.some((part:any)=>part.kind==='math')).parts.pop(),
  payload=>payload.records.find((record:any)=>record.charges.length).charges[0][0]='$$bad',
  payload=>payload.total.occurrences--,
  payload=>payload.records[0].role='metadata.untrusted',
  payload=>{const draw=payload.draws.find((entry:any)=>entry.kind==='section');draw.kind='item';draw.key=`kanban-render:${draw.sectionIndex}:${draw.displayIndex}:item`;},
  payload=>payload.draws[0].binding.labelRecord=999,
 ];
 for(const change of mutation){const hostile=structuredClone(value);change(hostile);expect(()=>reserveKanbanTransportMath(hostile)).toThrow();}
});

it('uses two formula witnesses when different variants attain the two resource maxima',async()=>{
 const formulas=[String.raw`$$\frac{x}{y}$$`,String.raw`$$\text{abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz}$$`];
 const measured=formulas.map(source=>validateMermaidMathLabel(source).parts.find(part=>part.kind==='math')!);
 expect(measured[0]!.elementCount).toBeGreaterThan(measured[1]!.elementCount);
 expect(measured[1]!.mathmlBytes).toBeGreaterThan(measured[0]!.mathmlBytes);
 const math=await extractKanbanMath(`kanban\nc[Column]@{priority: ${JSON.stringify(formulas)}}\n`,options);
 const record=math.records.find(record=>record.role==='metadata.priority')!;
 const charge={svgBytes:measured[1]!.mathmlBytes,elementCount:measured[0]!.elementCount};
 const total={...charge,occurrences:1};
 // Isolate the coordinatewise-maximum projection from provenance merging.
 // Both witnesses come from real validated variants of this internal field.
 const merged={...record,math:{...record.math,chargeEntries:[{...record.math.chargeEntries[0]!,cost:charge}],charges:[charge],cost:total}};
 const payload=kanbanMathTransport({...math,records:math.records.map(entry=>entry===record?merged:entry),total});
 expect(payload.records[record.recordIndex]!.charges).toEqual([[formulas[1],formulas[0]]]);
 expect(reserveKanbanTransportMath(payload,{svgBytes:1,elementCount:2,occurrences:3})).toEqual({svgBytes:charge.svgBytes+1,elementCount:charge.elementCount+2,occurrences:4});
});
