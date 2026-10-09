import {afterAll,beforeAll,expect,it} from 'vitest';
import DOMPurify from 'dompurify';
// @ts-expect-error jsdom is supplied by the test harness without declarations.
import {JSDOM} from 'jsdom';
import {EMPTY_MATH_RESOURCE_TOTAL,MATH_LIMITS} from '../../packages/core/src/math/policy.ts';
import {captureRequirementDb} from '../../packages/core/src/mermaid/requirement-db.ts';
import {extractRequirementMath} from '../../packages/core/src/mermaid/requirement-math.ts';
import {reconcileRequirementRows} from '../../packages/core/src/mermaid/requirement-ownership.ts';
import {requirementMathTransport,reserveRequirementTransportMath} from '../../packages/core/src/mermaid/requirement-transport.ts';

const descriptors=Object.getOwnPropertyDescriptors(DOMPurify);
beforeAll(()=>{const instance=DOMPurify(new JSDOM('').window);Object.assign(DOMPurify,{sanitize:instance.sanitize,addHook:instance.addHook});});
afterAll(()=>{for(const key of ['sanitize','addHook'])if(descriptors[key])Object.defineProperty(DOMPurify,key,descriptors[key]!);else Reflect.deleteProperty(DOMPurify,key);});
async function native(source:string){const {default:mermaid}=await import('mermaid');mermaid.initialize({startOnLoad:false,securityLevel:'strict'});return captureRequirementDb((await mermaid.mermaidAPI.getDiagramFromText(source)).db as any);}
async function transportFor(source:string){
 const math=await extractRequirementMath(source),snapshot=await native(source),owned=reconcileRequirementRows(math.labels,math.records.map(record=>({recordIndex:record.recordIndex,role:record.role,dbValue:record.dbValue})),snapshot);
 return {math,snapshot,slots:owned.slots,transport:requirementMathTransport(math,snapshot,owned.slots)};
}

const source=`requirementDiagram
direction LR
accTitle: &dollar;&dollar;meta&dollar;&dollar;<br/>
requirement req {
 text: "$$x$$$$x$$"
 risk: low
 verifyMethod: test
}
requirement req {
 text: "$$hidden$$"
}
element impl {
}
impl - satisfies -> req
`;

it('round-trips sanitized metadata, repeated declarations, hidden authored rows, and exact native ownership slots',async()=>{
 const {math,snapshot,slots,transport}=await transportFor(source),json=JSON.parse(JSON.stringify(transport));
 expect(reserveRequirementTransportMath(json)).toEqual(math.total);
 expect(json.snapshot).toEqual(snapshot);expect(json.slots).toEqual(slots);
 expect(json.snapshot.accTitle).toBe('$$meta$$<br>');
 expect(json.records.filter((record:any)=>record.role==='requirement.text')).toHaveLength(2);
 expect(json.records.find((record:any)=>record.role==='requirement.text')!.parts.filter((part:any)=>part.kind==='math')).toHaveLength(2);
 expect(json.slots.map((slot:any)=>slot.key)).toEqual(['requirement:0:name','requirement:0:text','requirement:0:risk','requirement:0:verifyMethod','element:0:name']);
 expect(math.total.occurrences).toBe(4);
 expect(()=>reserveRequirementTransportMath(json,{...EMPTY_MATH_RESOURCE_TOTAL,occurrences:MATH_LIMITS.documentOccurrences})).toThrow(/budget/i);
});

it('rejects malformed field sets, lost variants, canonical/cost/total forgeries, and ownership or snapshot mutations',async()=>{
 const {transport}=await transportFor(source);
 const mutations:Array<(value:any)=>void>=[
  value=>value.version=2,
  value=>delete value.records[0].sanitation,
  value=>value.records[0].unexpected=true,
  value=>value.records.pop(),
  value=>value.records.reverse(),
  value=>value.records.find((record:any)=>record.role==='requirement.text').variants.pop(),
  value=>value.records.find((record:any)=>record.role==='requirement.text').parts.pop(),
  value=>value.records.find((record:any)=>record.role==='requirement.text').cost.occurrences--,
  value=>value.total.occurrences--,
  value=>value.effects.pop(),
  value=>value.slots.pop(),
  value=>value.slots.push({...value.slots[0]}),
  value=>value.snapshot.requirements[0][1].text='forged',
  value=>value.records[0].effectIndex=999,
 ];
 for(const mutate of mutations){const hostile:any=structuredClone(transport);mutate(hostile);expect(()=>reserveRequirementTransportMath(hostile)).toThrow();}
});

it('rejects forged grammar-enum effects even when matching native snapshot fields are changed too',async()=>{
 const {transport}=await transportFor(source);
 const effect=(value:any,method:string)=>value.effects.find((entry:any)=>entry.effect.method===method).effect.args;
 const mutations:Array<(value:any)=>void>=[
  value=>{effect(value,'addRequirement')[1]='$$x$$';value.snapshot.requirements[0][1].type='$$x$$';},
  value=>{effect(value,'addRelationship')[0]='$$x$$';value.snapshot.relations[0].type='$$x$$';},
  value=>{effect(value,'setDirection')[0]='$$x$$';value.snapshot.direction='$$x$$';},
  value=>{effect(value,'setNewReqRisk')[0]='$$x$$';value.snapshot.requirements[0][1].risk='$$x$$';},
  value=>{effect(value,'setNewReqVerifyMethod')[0]='$$x$$';value.snapshot.requirements[0][1].verifyMethod='$$x$$';},
 ];
 for(const mutate of mutations){const hostile:any=structuredClone(transport);mutate(hostile);expect(()=>reserveRequirementTransportMath(hostile)).toThrow(/enum differs/);}
});

it('recomputes per-formula local identities instead of accepting copied origins and a reduced claimed budget',async()=>{
 const {transport}=await transportFor(source),hostile:any=structuredClone(transport),row=hostile.records.find((record:any)=>record.role==='requirement.text');
 const copyOrigins=(parts:any[])=>{const formulas=parts.filter(part=>part.kind==='math');expect(formulas).toHaveLength(2);formulas[1].origins=structuredClone(formulas[0].origins);};
 for(const variant of row.variants)copyOrigins(variant.parts);copyOrigins(row.parts);
 const before={...row.cost};
 for(const key of ['svgBytes','elementCount','occurrences']){row.cost[key]=before[key]/2;hostile.total[key]-=before[key]-row.cost[key];}
 expect(()=>reserveRequirementTransportMath(hostile)).toThrow(/cost|total|formula|origin/i);
});


it('agrees with original-span charging after BOM, CRLF, indentation and entity normalization',async()=>{
 const original='\uFEFF  requirementDiagram\r\n  %% ignored $$comment$$\r\n  accTitle: <br/> &dollar;&dollar;a&dollar;&dollar;\r\n  requirement r {\r\n    text: "<br/> &dollar;&dollar;x&dollar;&dollar; $$x$$"\r\n  }\r\n';
 const rendered='requirementDiagram\n%% ignored $$comment$$\naccTitle: <br/> &dollar;&dollar;a&dollar;&dollar;\nrequirement r {\n  text: "<br/> &dollar;&dollar;x&dollar;&dollar; $$x$$"\n}\n';
 const math=await extractRequirementMath(original,undefined,rendered);
 for(const record of math.records){
  const costs=new Map<string,{svgBytes:number;elementCount:number}>();
  for(const variant of record.variants)for(const part of variant.parts)if(part.kind==='math'){
   expect(part.synthetic).toBe(false);
   const key=JSON.stringify(part.origins.map(origin=>[origin.sourceStart,origin.sourceEnd])),previous=costs.get(key);
   costs.set(key,{svgBytes:Math.max(previous?.svgBytes??0,part.mathmlBytes),elementCount:Math.max(previous?.elementCount??0,part.elementCount)});
  }
  expect(record.cost).toEqual({occurrences:costs.size,svgBytes:[...costs.values()].reduce((sum,cost)=>sum+cost.svgBytes,0),elementCount:[...costs.values()].reduce((sum,cost)=>sum+cost.elementCount,0)});
 }
 expect(math.total.occurrences).toBe(3);
 const snapshot=await native(rendered),plan=reconcileRequirementRows(math.labels,math.records,snapshot);
 expect(reserveRequirementTransportMath(JSON.parse(JSON.stringify(requirementMathTransport(math,snapshot,plan.slots))))).toEqual(math.total);
});
