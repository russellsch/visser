import {afterAll,beforeAll,expect,it} from 'vitest';
import DOMPurify from 'dompurify';
// @ts-expect-error jsdom is supplied by the test harness without declarations.
import {JSDOM} from 'jsdom';
import {EMPTY_MATH_RESOURCE_TOTAL,MATH_LIMITS} from '../../packages/core/src/math/policy.ts';
import {captureRequirementDb} from '../../packages/core/src/mermaid/requirement-db.ts';
import {validateMermaidMathLabel} from '../../packages/core/src/mermaid/math.ts';
import {LocatedRequirementMathError,extractRequirementMath} from '../../packages/core/src/mermaid/requirement-math.ts';
import {reconcileRequirementRows} from '../../packages/core/src/mermaid/requirement-ownership.ts';

const descriptors=Object.getOwnPropertyDescriptors(DOMPurify);
beforeAll(()=>{const instance=DOMPurify(new JSDOM('').window);Object.assign(DOMPurify,{sanitize:instance.sanitize,addHook:instance.addHook});});
afterAll(()=>{for(const key of ['sanitize','addHook'])if(descriptors[key])Object.defineProperty(DOMPurify,key,descriptors[key]!);else Reflect.deleteProperty(DOMPurify,key);});
async function native(source:string){const {default:mermaid}=await import('mermaid');mermaid.initialize({startOnLoad:false,securityLevel:'strict'});return captureRequirementDb((await mermaid.mermaidAPI.getDiagramFromText(source)).db as any);}

it('keeps standard TeX row backslashes and charges one physical formula across authored, decoded, and rendered variants',async()=>{
 const source=String.raw`requirementDiagram
requirement req {
 text: "$$\begin{matrix}a\\b\end{matrix}$$"
}
`;
 const result=await extractRequirementMath(source),row=result.records.find(record=>record.role==='requirement.text')!;
 expect(row.dbValue).toBe(String.raw`$$\begin{matrix}a\\b\end{matrix}$$`);
 expect(row.nativeInput.text).toContain(String.raw`Text: $$\begin{matrix}a\\b\end{matrix}$$`);
 expect(row.mappedInput.text).toContain(String.raw`\begin{matrix}a\\b\end{matrix}`);
 expect(row.variants).toHaveLength(3);expect(row.parts).toBe(row.variants[2]!.parts);expect(row.cost.occurrences).toBe(1);expect(result.total.occurrences).toBe(1);
 const formula=row.parts.find(part=>part.kind==='math')!,expected=validateMermaidMathLabel(String.raw`Text: $$\begin{matrix}a\\b\end{matrix}$$`).parts.find(part=>part.kind==='math')!;
 expect(formula.tex).toBe(String.raw`\begin{matrix}a\\b\end{matrix}`);expect(formula.mathmlBytes).toBe(expected.mathmlBytes);expect(formula.elementCount).toBe(expected.elementCount);expect(formula.origins.map(origin=>origin.rawSource).join('')).toBe(String.raw`$$\begin{matrix}a\\b\end{matrix}$$`);
});

it('validates every repeated, duplicate, and accessibility occurrence even when no native row will own it',async()=>{
 const invalids=[
  String.raw`requirementDiagram
requirement req {
 text: "$$\unknownRequirement$$"
}
`,
  String.raw`requirementDiagram
requirement req {
 text: "$$ok$$"
}
requirement req {
 text: "$$\unknownRequirement$$"
}
`,
  String.raw`requirementDiagram
requirement req {
 text: "$$ok$$"
 text: "$$\unknownRequirement$$"
}
`,
  String.raw`requirementDiagram
accTitle: $$\unknownRequirement$$
requirement req {
 text: plain
}
`,
  String.raw`requirementDiagram
requirement req {
 text: "$$a<br/>b$$"
}
`,
 ];
 for(const source of invalids){try{await extractRequirementMath(source);throw new Error('unexpected success');}catch(error){expect(error).toBeInstanceOf(LocatedRequirementMathError);const located=error as LocatedRequirementMathError;expect(located.recordIndex).toBeGreaterThan(0);expect(located.startLine).toBeGreaterThan(1);}}
});

it('charges identical repeated body formulas separately when their source spans differ',async()=>{
 const source=`requirementDiagram
requirement req {
 text: "$$x$$"
 text: "$$x$$"
}
`;
 const result=await extractRequirementMath(source),rows=result.records.filter(record=>record.role==='requirement.text');
 expect(rows).toHaveLength(2);expect(result.total.occurrences).toBe(2);
 const first=rows[0]!.parts.find(part=>part.kind==='math')!,second=rows[1]!.parts.find(part=>part.kind==='math')!;
 expect(first.tex).toBe('x');expect(second.tex).toBe('x');
 expect(first.origins[0]!.sourceStart).not.toBe(second.origins[0]!.sourceStart);
 expect(first.origins[0]!.sourceEnd).not.toBe(second.origins[0]!.sourceEnd);
});

it('matches sanitized common metadata to native DB while keeping body DB text literal and source-origin charges distinct',async()=>{
 const source=`requirementDiagram
accTitle: &dollar;&dollar;a&dollar;&dollar;<br/>
accDescr: &dollar;&dollar;a&dollar;&dollar;<br/>
requirement req {
 text: "&dollar;&dollar;body&dollar;&dollar;<br/>"
}
`;
 const result=await extractRequirementMath(source),snapshot=await native(source),byRole=(role:string)=>result.records.filter(record=>record.role===role);
 expect(byRole('accTitle')[0]!.dbValue).toBe(snapshot.accTitle);expect(byRole('accDescr')[0]!.dbValue).toBe(snapshot.accDescr);
 expect(byRole('requirement.text')[0]!.dbValue).toBe('&dollar;&dollar;body&dollar;&dollar;<br/>');
 expect(result.total.occurrences).toBe(3);
 const common=byRole('accTitle')[0]!.parts.find(part=>part.kind==='math')!,description=byRole('accDescr')[0]!.parts.find(part=>part.kind==='math')!;
 expect(common.origins[0]!.sourceStart).not.toBe(description.origins[0]!.sourceStart);expect(common.origins[0]!.rawSource).toBe('&dollar;&dollar;a&dollar;&dollar;');
 const owned=reconcileRequirementRows(result.labels,result.records.map(record=>({recordIndex:record.recordIndex,role:record.role,dbValue:record.dbValue})),snapshot);
 expect(owned.slots.map(slot=>slot.role)).toEqual(['requirement.name','requirement.text']);
});

it('enforces aggregate document limits across independently authored formula spans',async()=>{
 const source=`requirementDiagram
accTitle: $$first$$
accDescr: $$second$$
requirement req {
 text: "$$third$$"
}
`;
 await expect(extractRequirementMath(source,{...EMPTY_MATH_RESOURCE_TOTAL,occurrences:MATH_LIMITS.documentOccurrences-2})).rejects.toThrow(/budget/i);
});

it('charges valid formulas before sanitation erases a comment and rejects an invalid erased formula',async()=>{
 const valid=`requirementDiagram
requirement req {
 text: "<!-- $$x$$ -->"
}
`;
 const result=await extractRequirementMath(valid),row=result.records.find(record=>record.role==='requirement.text')!;
 expect(row.variants[0]!.parts.some(part=>part.kind==='math')).toBe(true);expect(row.parts.some(part=>part.kind==='math')).toBe(false);expect(row.cost.occurrences).toBe(1);
 const invalid=valid.replace('$$x$$',()=>String.raw`$$\unknownRequirement$$`);
 await expect(extractRequirementMath(invalid)).rejects.toBeInstanceOf(LocatedRequirementMathError);
});

it('counts identical formulas at different positions within one row separately',async()=>{
 const source='requirementDiagram\nrequirement r {\ntext: "$$x$$ and $$x$$"\n}\n';
 const result=await extractRequirementMath(source),row=result.records.find(record=>record.role==='requirement.text')!;
 const formulas=row.parts.filter(part=>part.kind==='math');
 expect(row.cost.occurrences).toBe(2);expect(result.total.occurrences).toBe(2);
 expect(formulas.map(part=>part.origins[0]!.sourceStart)).toEqual([source.indexOf('$$x$$'),source.lastIndexOf('$$x$$')]);
});

it('sanitizes the full prefixed multiline row and preserves original CRLF formula bytes',async()=>{
 const source='requirementDiagram\r\nrequirement r {\r\ntext: "\r\n<br> $$x < y$$"\r\n}\r\n';
 const result=await extractRequirementMath(source),row=result.records.find(record=>record.role==='requirement.text')!;
 expect(row.dbValue).toBe('\n<br> $$x < y$$');
 expect(row.nativeInput.text).toBe('Text: \n<br> $$x &lt; y$$');
 expect(row.renderedValue).toBe('Text: \n\n $$x < y$$');
 const formula=row.parts.find(part=>part.kind==='math')!,start=source.indexOf('$$x < y$$');
 expect(formula.tex).toBe('x < y');expect(formula.synthetic).toBe(false);
 expect(formula.origins).toEqual([{sourceStart:start,sourceEnd:start+9,startByte:start,endByte:start+9,startLine:4,endLine:4,rawSource:'$$x < y$$'}]);
 expect(row.cost.occurrences).toBe(1);
});
