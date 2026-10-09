import {afterAll,beforeAll,expect,it} from 'vitest';
import DOMPurify from 'dompurify';
// @ts-expect-error jsdom is supplied by the test harness without declarations.
import {JSDOM} from 'jsdom';
import {extractRequirementLabels} from '../../packages/core/src/mermaid/requirement-labels.ts';
import {captureRequirementDb,replayRequirementDb} from '../../packages/core/src/mermaid/requirement-db.ts';
// @ts-expect-error pinned Mermaid common chunk has no declarations.
import {getAccDescription,getAccTitle,setAccDescription,setAccTitle} from 'mermaid/dist/chunks/mermaid.core/chunk-O7XYJQB3.mjs';

const descriptors=Object.getOwnPropertyDescriptors(DOMPurify);
beforeAll(()=>{const instance=DOMPurify(new JSDOM('').window);Object.assign(DOMPurify,{sanitize:instance.sanitize,addHook:instance.addHook});});
afterAll(()=>{for(const key of ['sanitize','addHook'])if(descriptors[key])Object.defineProperty(DOMPurify,key,descriptors[key]!);else Reflect.deleteProperty(DOMPurify,key);});

it('keeps Requirement records in source order while preserving native right-recursive callback order',async()=>{
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
`;
 const found=await extractRequirementLabels(source);
 expect(found.records.map(record=>[record.recordIndex,record.role,record.declarationIndex,record.semanticValue])).toEqual([
  [1,'accTitle',undefined,'first access'],[2,'accTitle',undefined,'final access'],[3,'accDescr',undefined,'first description'],[4,'accDescr',undefined,'final description'],
  [5,'requirement.name',0,'req'],[6,'requirement.id',0,'firstid'],[7,'requirement.id',0,'finalid'],[8,'requirement.text',0,'first text'],[9,'requirement.text',0,'final text'],[10,'requirement.risk',0,'Low'],[11,'requirement.verifyMethod',0,'Test'],
 ]);
 expect(found.effects.map(entry=>[entry.effect.method,entry.recordIndex])).toEqual([
  ['setAccTitle',1],['setAccTitle',2],['setAccDescription',3],['setAccDescription',4],
  ['setNewReqVerifyMethod',11],['setNewReqRisk',10],['setNewReqText',9],['setNewReqText',8],['setNewReqId',7],['setNewReqId',6],['addRequirement',5],
 ]);
 for(const [effectIndex,effect] of found.effects.entries())if(effect.recordIndex!==undefined)expect(found.records[effect.recordIndex-1]!.effectIndex).toBe(effectIndex);
 const texts=found.records.filter(record=>record.role==='requirement.text');
 expect(texts.map(record=>record.intervals.map(span=>[span.sourceStart,span.sourceEnd,span.rawSource]))).toEqual(['first text','final text'].map(value=>[[source.indexOf(value),source.indexOf(value)+value.length,value]]));
 const replay=replayRequirementDb(found.effects.map(entry=>entry.effect));expect(replay.requirements).toEqual([['req',expect.objectContaining({requirementId:'firstid',text:'first text',risk:'Low',verifyMethod:'Test'})]]);
 const {default:mermaid}=await import('mermaid');mermaid.initialize({startOnLoad:false,securityLevel:'strict'});const native=captureRequirementDb((await mermaid.mermaidAPI.getDiagramFromText(source)).db as any);expect(replay).toEqual(native);
});

it('retains duplicate declarations and fields, but does not turn directions or class identifiers into labels',async()=>{
 const source=`requirementDiagram
direction LR
requirement req:::hot {
  text: "$$first$$"
}
requirement req {
  text: "$$ignored-by-first-wins$$"
}
element impl {
  type: "quoted \\\\frac{a}{b}"
  docRef: firstref
}
element impl {
  docRef: secondref
}
classDef hot fill:#f00,color:#fff
class req hot
style req fill:#abc
impl - satisfies -> req
`;
 const found=await extractRequirementLabels(source);
 expect(found.records.map(record=>[record.role,record.declarationIndex,record.semanticValue])).toEqual([
  ['requirement.name',0,'req'],['requirement.text',0,'$$first$$'],['requirement.name',1,'req'],['requirement.text',1,'$$ignored-by-first-wins$$'],
  ['element.name',0,'impl'],['element.type',0,String.raw`quoted \\frac{a}{b}`],['element.docRef',0,'firstref'],['element.name',1,'impl'],['element.docRef',1,'secondref'],
 ]);
 expect(found.effects.map(entry=>entry.effect.method)).toEqual([
  'setDirection','setNewReqText','addRequirement','setClass','setNewReqText','addRequirement','setNewElementDocRef','setNewElementType','addElement','setNewElementDocRef','addElement','defineClass','setClass','setCssStyle','addRelationship',
 ]);
 expect(found.records.some(record=>record.role==='requirement.name'&&record.semanticValue==='hot')).toBe(false);
});

it('keeps BOM/CRLF/dedent/comment and quoted backslash provenance without common-metadata side effects',async()=>{
 const original='\uFEFF  requirementDiagram\r\n  %% ignored $$hidden$$\r\n  accTitle: one $$access$$\r\n  requirement req {\r\n    text: "snow 雪 \\\\frac{a}{b}"\r\n  }\r\n';
 const rendered='requirementDiagram\n%% ignored $$hidden$$\naccTitle: one $$access$$\nrequirement req {\n  text: "snow 雪 \\\\frac{a}{b}"\n}\n';
 const prior={title:getAccTitle(),description:getAccDescription()};setAccTitle('sentinel title');setAccDescription('sentinel description');
 const found=await extractRequirementLabels(original,rendered),access=found.records.find(record=>record.role==='accTitle')!,text=found.records.find(record=>record.role==='requirement.text')!;
 expect(found.parserSource).not.toContain('ignored');expect(found.parserSource).not.toContain('\r');expect(text.semanticValue).toBe(String.raw`snow 雪 \\frac{a}{b}`);
 for(const record of [access,text])for(const interval of record.intervals)expect(original.slice(interval.sourceStart,interval.sourceEnd)).toBe(interval.rawSource);
 const expectedStart=original.indexOf('snow'),expectedEnd=original.indexOf('\"',expectedStart);
 expect(text.intervals).toEqual([{sourceStart:expectedStart,sourceEnd:expectedEnd,startByte:Buffer.byteLength(original.slice(0,expectedStart)),endByte:Buffer.byteLength(original.slice(0,expectedEnd)),startLine:5,endLine:5,rawSource:original.slice(expectedStart,expectedEnd)}]);
 expect({title:getAccTitle(),description:getAccDescription()}).toEqual({title:'sentinel title',description:'sentinel description'});
 const fresh=await extractRequirementLabels('requirementDiagram\naccTitle: isolated\nrequirement r {\n text: plain\n}\n');
 expect(fresh.records.map(record=>record.semanticValue)).toEqual(['isolated','r','plain']);
 setAccTitle(prior.title);setAccDescription(prior.description);
});

it('rejects an empty quoted Requirement body field because native grammar has no empty qString production',async()=>{
 await expect(extractRequirementLabels('requirementDiagram\nrequirement req {\n text: ""\n}\n')).rejects.toThrow(/Expecting 'unqString', 'qString'/);
});
