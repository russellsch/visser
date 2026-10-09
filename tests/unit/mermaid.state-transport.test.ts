import { beforeAll, expect, it } from 'vitest';
import { parseMermaid } from '../../packages/core/src/mermaid/parse.ts';
import { reserveStateTransportMath, type StateRenderMath } from '../../packages/core/src/mermaid/state-transport.ts';
import { buildMermaidFigure } from '../../packages/core/src/mermaid/figure.ts';
import { mermaidMathTotal } from '../../packages/core/src/mermaid/index.ts';
import { MATH_LIMITS } from '../../packages/core/src/math/policy.ts';
let math:StateRenderMath;
const source='stateDiagram-v2\naccTitle: $$hidden$$\naccTitle: replaced\nA: $$x$$\nA: $$x$$\nA --> B: $$x$$\n';
beforeAll(()=>{
 const result=parseMermaid([{figureId:'f',type:'state',source,originalSource:source}]).get('f')!;
 if(!result.ok || !result.stateMath) throw new Error(JSON.stringify(result));
 math=result.stateMath;
});
it('retains authored hidden cost and charges surviving visible equations once through the figure model',()=>{
 const total=reserveStateTransportMath(math);
 expect(total.occurrences).toBe(4);
 const {figure}=buildMermaidFigure('f',source,'stateDiagram-v2','state',{figureId:'f',ok:true,type:'state',stateMath:math,state:{states:[],relations:[]}});
 expect(figure.stateMath).toBe(math);
 expect(mermaidMathTotal([figure,figure]).occurrences).toBe(8);
 expect(()=>mermaidMathTotal([figure],{svgBytes:0,elementCount:0,occurrences:MATH_LIMITS.documentOccurrences-3})).toThrow();
});
it('rejects stale, missing or duplicate transported cost identities',()=>{
 for(const mutate of [
  (m:any)=>m.records.push(m.records[0]),
  (m:any)=>m.recordCosts.pop(),
  (m:any)=>m.recordCosts.push(m.recordCosts[0]),
  (m:any)=>m.recordCosts[0].cost.occurrences++,
  (m:any)=>m.total.occurrences--,
  (m:any)=>m.records.find((r:any)=>r.cost.occurrences>0).cost.occurrences=0,
 ]) {const changed=structuredClone(math);mutate(changed);expect(()=>reserveStateTransportMath(changed)).toThrow();}
});
it('rejects lost copy identity and rendered source divergence',()=>{
 for(const mutate of [
  (m:any)=>m.slots.push(m.slots[0]),
  (m:any)=>m.slots[0].key='other',
  (m:any)=>m.slots[0].renderedValue='stale',
  (m:any)=>m.slots.find((s:any)=>s.parts.some((p:any)=>p.kind==='math')).recordIndices=[],
  (m:any)=>m.slots.flatMap((s:any)=>s.parts).find((p:any)=>p.kind==='math').recordIndex=9999,
 ]) {const changed=structuredClone(math);mutate(changed);expect(()=>reserveStateTransportMath(changed)).toThrow();}
});
