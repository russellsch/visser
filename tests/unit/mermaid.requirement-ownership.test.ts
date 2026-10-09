import {afterAll,beforeAll,expect,it} from 'vitest';
import DOMPurify from 'dompurify';
// @ts-expect-error jsdom is supplied by the test harness without declarations.
import {JSDOM} from 'jsdom';
import {captureRequirementDb} from '../../packages/core/src/mermaid/requirement-db.ts';
import {extractRequirementLabels} from '../../packages/core/src/mermaid/requirement-labels.ts';
import {reconcileRequirementRows} from '../../packages/core/src/mermaid/requirement-ownership.ts';

const descriptors=Object.getOwnPropertyDescriptors(DOMPurify);
beforeAll(()=>{const instance=DOMPurify(new JSDOM('').window);Object.assign(DOMPurify,{sanitize:instance.sanitize,addHook:instance.addHook});});
afterAll(()=>{for(const key of ['sanitize','addHook'])if(descriptors[key])Object.defineProperty(DOMPurify,key,descriptors[key]!);else Reflect.deleteProperty(DOMPurify,key);});
async function native(source:string){const {default:mermaid}=await import('mermaid');mermaid.initialize({startOnLoad:false,securityLevel:'strict'});return captureRequirementDb((await mermaid.mermaidAPI.getDiagramFromText(source)).db as any);}
const source=`requirementDiagram
accTitle: first access
accTitle: final access
accDescr: first description
accDescr: final description
requirement req {
  id: firstid
  id: finalid
  text: first text
  text: final text
  risk: low
  verifyMethod: test
}
requirement req {
  id: ignoredid
  text: ignored text
}
element impl {
  type: firsttype
  type: finaltype
  docRef: firstref
  docRef: finalref
}
element impl {
  type: ignoredtype
  docRef: ignoredref
}
`;
async function prepared(){const labels=await extractRequirementLabels(source),snapshot=await native(source);return {labels,snapshot,records:labels.records.map(record=>({recordIndex:record.recordIndex,role:record.role,dbValue:record.semanticValue}))};}

it('selects first-authored owners after right-recursive callbacks, preserves literal rows, prefixes, and no common slots',async()=>{
 const {labels,snapshot,records}=await prepared(),result=reconcileRequirementRows(labels,records,snapshot);
 expect(result.snapshot).toEqual(snapshot);expect(result.effects).toEqual(labels.effects.map(entry=>entry.effect));
 expect(result.slots).toEqual([
  {key:'requirement:0:name',recordIndex:5,kind:'requirement',nodeIndex:0,nodeName:'req',role:'requirement.name',prefix:''},
  {key:'requirement:0:id',recordIndex:6,kind:'requirement',nodeIndex:0,nodeName:'req',role:'requirement.id',prefix:'ID: '},
  {key:'requirement:0:text',recordIndex:8,kind:'requirement',nodeIndex:0,nodeName:'req',role:'requirement.text',prefix:'Text: '},
  {key:'requirement:0:risk',recordIndex:10,kind:'requirement',nodeIndex:0,nodeName:'req',role:'requirement.risk',prefix:'Risk: '},
  {key:'requirement:0:verifyMethod',recordIndex:11,kind:'requirement',nodeIndex:0,nodeName:'req',role:'requirement.verifyMethod',prefix:'Verification: '},
  {key:'element:0:name',recordIndex:15,kind:'element',nodeIndex:0,nodeName:'impl',role:'element.name',prefix:''},
  {key:'element:0:type',recordIndex:16,kind:'element',nodeIndex:0,nodeName:'impl',role:'element.type',prefix:'Type: '},
  {key:'element:0:docRef',recordIndex:18,kind:'element',nodeIndex:0,nodeName:'impl',role:'element.docRef',prefix:'Doc Ref: '},
 ]);
 expect(result.slots.some(slot=>slot.role==='accTitle'||slot.role==='accDescr')).toBe(false);
});

it('keeps requirement and element names independently keyed and omits absent optional native rows',async()=>{
 const collision=`requirementDiagram
requirement same {
 text: reqbody
}
element same {
 type: worker
}
element bare {
}
`;
 const labels=await extractRequirementLabels(collision),snapshot=await native(collision),records=labels.records.map(record=>({recordIndex:record.recordIndex,role:record.role,dbValue:record.semanticValue}));
 const result=reconcileRequirementRows(labels,records,snapshot);
 expect(result.slots.map(slot=>[slot.kind,slot.nodeName,slot.role])).toEqual([
  ['requirement','same','requirement.name'],['requirement','same','requirement.text'],
  ['element','same','element.name'],['element','same','element.type'],['element','bare','element.name'],
 ]);
 expect(new Set(result.slots.map(slot=>slot.key)).size).toBe(result.slots.length);
});

it('rejects malformed collector coverage, stale effect references, normalized body changes, and native mismatches',async()=>{
 const {labels,snapshot,records}=await prepared();
 expect(()=>reconcileRequirementRows(labels,records.slice(1),snapshot)).toThrow(/coverage/);
 const role=structuredClone(records)as any;role[0].role='requirement.text';expect(()=>reconcileRequirementRows(labels,role,snapshot)).toThrow(/role/);
 const body=structuredClone(records)as any;body.find((record:any)=>record.role==='requirement.text').dbValue='forged';expect(()=>reconcileRequirementRows(labels,body,snapshot)).toThrow(/literal body/);
 const references=structuredClone(labels)as any;references.effects.find((entry:any)=>entry.recordIndex!==undefined).recordIndex=999;expect(()=>reconcileRequirementRows(references,records,snapshot)).toThrow(/reference|coverage/);
 const duplicate=structuredClone(labels)as any;const assigned=duplicate.effects.filter((entry:any)=>entry.recordIndex!==undefined);assigned[1].recordIndex=assigned[0].recordIndex;expect(()=>reconcileRequirementRows(duplicate,records,snapshot)).toThrow(/reference/);
 const forged=structuredClone(snapshot);forged.requirements[0]![1].text='forged';expect(()=>reconcileRequirementRows(labels,records,forged)).toThrow(/Requirement native reconciliation/);
});
