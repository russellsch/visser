import {expect,it} from 'vitest';
import {extractERLabels} from '../../packages/core/src/mermaid/er-labels.ts';
import {normalizeERDbEffects} from '../../packages/core/src/mermaid/er-db-effects.ts';
import {prepareERPlannedMath} from '../../packages/core/src/mermaid/er-planned-math.ts';
import {erMathTransport,reserveERTransportMath,type ERRenderMath} from '../../packages/core/src/mermaid/er-transport.ts';

const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
async function groupPayload(){
 const source='erDiagram\nsubgraph "$$x$$"\n A\nend\n',labels=await extractERLabels(source),normalized=await normalizeERDbEffects(labels,true);
 const title=labels.records.find(record=>record.role==='subgraph.title')!,db=normalized.fields.find(field=>field.recordIndex===title.recordIndex)!.normalization;
 const copies=[
  {key:'node:0:title:measurement:single',token:'node:0',ownerKind:'group' as const,ownerIndex:0,field:'title',path:'group-node' as const,lifetime:'measurement' as const,copy:'single' as const,value:db.dbValue,fieldOwner:{kind:'record' as const,recordIndex:title.recordIndex}},
  {key:'node:0:title:retained:single',token:'node:0',ownerKind:'group' as const,ownerIndex:0,field:'title',path:'group-cluster' as const,lifetime:'retained' as const,copy:'single' as const,value:db.dbValue,fieldOwner:{kind:'record' as const,recordIndex:title.recordIndex}},
 ];
 return erMathTransport(await prepareERPlannedMath(source,labels,normalized,copies,'elk',true),true);
}
async function roughPayload(){
 const source='erDiagram\nA["$$x^2$$"]\n',labels=await extractERLabels(source),normalized=await normalizeERDbEffects(labels,true);
 const alias=labels.records.find(record=>record.role==='entity.alias')!;
 const copies=(['background','foreground'] as const).map(copy=>({key:`node:0:header:retained:${copy}`,token:'node:0',ownerKind:'entity' as const,ownerIndex:0,field:'header',path:'simple-header' as const,lifetime:'retained' as const,copy,value:alias.mappedValue,fieldOwner:{kind:'record' as const,recordIndex:alias.recordIndex}}));
 return erMathTransport(await prepareERPlannedMath(source,labels,normalized,copies,'elk',true),true);
}

it('projects shared implicit roots and both temporary and retained slots',async()=>{
 const payload=await groupPayload();
 expect(payload).toMatchObject({version:1,layout:'elk',htmlLabels:true,slots:[{lifetime:'measurement'},{lifetime:'retained'}],charges:[{id:'c0'}]});
 expect(payload.slots.every(slot=>slot.parts.some(part=>part.kind==='math'))).toBe(true);
 expect(payload.slots.map(slot=>slot.parts.find(part=>part.kind==='math')!.chargeID)).toEqual(['c0','c0']);
 expect(payload.total.occurrences).toBe(2);expect(reserveERTransportMath(clone(payload))).toEqual(payload.total);
 expect(payload.charges[0]!.proofs.length).toBeGreaterThanOrEqual(1);expect(payload.charges[0]!.proofs.length).toBeLessThanOrEqual(2);
});

it('counts rough foreground and background copies with sum-minus-max credit',async()=>{
 const payload=await roughPayload(),equations=payload.slots.map(slot=>slot.parts.find(part=>part.kind==='math')!);
 expect(payload.slots.map(slot=>slot.copy)).toEqual(['background','foreground']);
 expect(payload.total.occurrences).toBe(2);
 expect(payload.total.svgBytes).toBe(equations[0]!.mathmlBytes+equations[1]!.mathmlBytes);
 expect(reserveERTransportMath(payload)).toEqual(payload.total);
});

it('retains hidden and overwritten authored charges even with no slots',async()=>{
 const source='erDiagram\naccTitle: $$x$$\naccTitle: safe\nA\n',labels=await extractERLabels(source),normalized=await normalizeERDbEffects(labels,true);
 const payload=erMathTransport(await prepareERPlannedMath(source,labels,normalized,[],'elk',true),true);
 expect(payload.slots).toEqual([]);expect(payload.charges).toHaveLength(1);expect(payload.total.occurrences).toBe(1);
 expect(reserveERTransportMath(payload)).toEqual(payload.total);
});

it('carries plain retained Dagre slots with text parts and no charges',async()=>{
 const source='erDiagram\nA\n',labels=await extractERLabels(source),normalized=await normalizeERDbEffects(labels,true),name=labels.records.find(record=>record.role==='entity.name')!;
 const copies=[{key:'node:0:header:single',token:'node:0',ownerKind:'entity' as const,ownerIndex:0,field:'header',path:'simple-header' as const,lifetime:'retained' as const,copy:'single' as const,value:name.mappedValue,fieldOwner:{kind:'record' as const,recordIndex:name.recordIndex}}];
 const payload=erMathTransport(await prepareERPlannedMath(source,labels,normalized,copies,'dagre',true),true);
 expect(payload).toMatchObject({layout:'dagre',charges:[],total:{occurrences:0},slots:[{key:'node:0:header:single',input:'A',hookInput:'A',canonicalText:'A',parts:[{kind:'text',source:'A'}]}]});
 expect(reserveERTransportMath(payload)).toEqual(payload.total);
});

it('rejects tampered parts, costs, totals, assignments, and missing charges',async()=>{
 const original=await groupPayload(),mathIndex=original.slots[0]!.parts.findIndex(part=>part.kind==='math');
 const cases:ERRenderMath[]=[];
 const count=clone(original) as any;count.total.occurrences++;cases.push(count);
 const cost=clone(original) as any;cost.slots[0].parts[mathIndex].mathmlBytes++;cases.push(cost);
 const assignment=clone(original) as any;assignment.slots[0].parts[mathIndex].chargeID='c9';cases.push(assignment);
 const missing=clone(original) as any;missing.charges=[];cases.push(missing);
 const witness=clone(original) as any;witness.charges[0].proofs=['$$\\begin{matrix}a&b\\\\c&d\\end{matrix}$$'];cases.push(witness);
 for(const payload of cases)expect(()=>reserveERTransportMath(payload)).toThrow(/ER transport/);
});

it('validates layout keys, lifetime, paths, copy sets, and plain JSON',async()=>{
 const original=await roughPayload();
 for(const edit of [
  (p:any)=>{p.slots[0].key='wrong';},
  (p:any)=>{p.slots[0].lifetime='measurement';},
  (p:any)=>{p.slots[0].path='edge';},
  (p:any)=>{p.slots.pop();},
  (p:any)=>{p.slots[0].hookInput='$$y$$';},
 ]){const payload=clone(original);edit(payload);expect(()=>reserveERTransportMath(payload)).toThrow(/ER transport/);}
 const exotic=clone(original) as any;exotic.slots[0].parts=new (class extends Array {}) (...exotic.slots[0].parts);
 expect(()=>reserveERTransportMath(exotic)).toThrow(/plain|JSON/);
});
