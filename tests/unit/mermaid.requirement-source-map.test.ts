import {beforeAll,expect,it} from 'vitest';
import {clearMermaidParseCache,parseMermaid} from '../../packages/core/src/mermaid/parse.ts';
import {requirementMathSourceMap} from '../../packages/core/src/mermaid/requirement-source-map.ts';
import {reserveRequirementTransportMath,type RequirementRenderMath} from '../../packages/core/src/mermaid/requirement-transport.ts';

const source=String.raw`requirementDiagram
%% ignored $$comment$$
accTitle: &dollar;&dollar;access&dollar;&dollar;<br/>
accDescr: $$description$$
requirement req {
 id: "$$id$$"
 text: "$$\begin{matrix}a\\b\end{matrix}$$"
 risk: high
 verifyMethod: inspection
}
requirement req {
 text: "$$hidden$$"
}
element impl {
 type: "$$\frac{type}{kind}$$"
 docRef: "$$doc$$"
}
`;
const original='\uFEFF  '+source.replaceAll('\n','\r\n  '),bytes=new TextEncoder().encode(original);
let math:RequirementRenderMath;
beforeAll(()=>{const result:any=parseMermaid([{figureId:'requirement',type:'other',requirement:true,source,originalSource:original}]).get('requirement');if(!result?.ok||!result.requirementMath)throw new Error(JSON.stringify(result));math=result.requirementMath;});
const map=(requirementMath=math,bodyStart=0,document=bytes)=>requirementMathSourceMap({source,mathBodyStartByte:bodyStart,requirementMath},document);

it('maps visible Requirement row owners, retaining hidden and common authored costs',()=>{
 const result=map();expect(result.format).toBe('requirement');
 expect(math.slots.map(slot=>slot.key)).toEqual(['requirement:0:name','requirement:0:id','requirement:0:text','requirement:0:risk','requirement:0:verifyMethod','element:0:name','element:0:type','element:0:docRef']);
 expect(result.labels.map(label=>label.key)).toEqual(['requirement:0:id','requirement:0:text','element:0:type','element:0:docRef']);
 expect(math.records.filter(record=>record.parts.some(part=>part.kind==='math')).map(record=>record.role)).toEqual(['accTitle','accDescr','requirement.id','requirement.text','requirement.text','element.type','element.docRef']);
 const text=result.labels.find(label=>label.key==='requirement:0:text')!.expressions[0]!;expect(text).toMatchObject({tex:String.raw`\begin{matrix}a\\b\end{matrix}`,rawSource:String.raw`$$\begin{matrix}a\\b\end{matrix}$$`});
 for(const label of result.labels)for(const expression of label.expressions)if('rawSource'in expression)expect(result.source.slice(expression.start,expression.end)).toBe(expression.rawSource);
});

it('preserves BOM/CRLF/dedent/entity provenance and rejects stale source binding or forged transport',()=>{
 const result=map();expect(result.source).not.toContain('ignored');expect(result.source).not.toContain('\r');expect(math.records.find(record=>record.role==='accTitle')!.parts.find(part=>part.kind==='math')!.origins[0]!.rawSource).toBe('&dollar;&dollar;access&dollar;&dollar;');
 for(const record of math.records)for(const part of record.parts)if(part.kind==='math')for(const origin of part.origins)expect(original.slice(origin.sourceStart,origin.sourceEnd)).toBe(origin.rawSource);
 expect(()=>requirementMathSourceMap({source,requirementMath:math},bytes)).toThrow(/body byte offset/);expect(()=>map(math,0,new TextEncoder().encode(original.replace('element impl','element changed')))).toThrow();
 const slots:any=structuredClone(math);slots.slots[0].recordIndex=999;expect(()=>map(slots)).toThrow();const origins:any=structuredClone(math);origins.records.find((record:any)=>record.role==='requirement.text').parts.find((part:any)=>part.kind==='math').origins[0].rawSource='$$forged$$';expect(()=>map(origins)).toThrow();
});

it('propagates Requirement transport into figures and document budgets',async()=>{
 const {buildMermaidFigure}=await import('../../packages/core/src/mermaid/figure.ts'),{mermaidMathTotal}=await import('../../packages/core/src/mermaid/index.ts'),{MATH_LIMITS,EMPTY_MATH_RESOURCE_TOTAL}=await import('../../packages/core/src/math/policy.ts');const figure=buildMermaidFigure('requirement',source,'requirement','other',{figureId:'requirement',ok:true,type:'other',requirementMath:math}as any).figure;
 expect((figure as any).requirementMath).toBe(math);expect(mermaidMathTotal([figure])).toEqual(math.total);expect(()=>mermaidMathTotal([figure],{...EMPTY_MATH_RESOURCE_TOTAL,occurrences:MATH_LIMITS.documentOccurrences-6})).toThrow(/budget/i);
});

it('authenticates cloned transport independently of mutable cache state and rejects coherent equal-TeX origin swaps',()=>{
 const authSource='requirementDiagram\nrequirement req {\n text: "$$x$$ and $$x$$"\n}\n',request={figureId:'requirement-source-verification',type:'other' as const,requirement:true,source:authSource,originalSource:authSource};
 clearMermaidParseCache();const legitimate:any=parseMermaid([request]).get(request.figureId);expect(legitimate).toMatchObject({ok:true});const cloned:any=structuredClone(legitimate.requirementMath),authBytes=new TextEncoder().encode(authSource);
 expect(()=>requirementMathSourceMap({source:authSource,mathBodyStartByte:0,requirementMath:cloned},authBytes)).not.toThrow();
 const attack:any=structuredClone(cloned),record=attack.records.find((entry:any)=>entry.role==='requirement.text'),copy=(parts:any[])=>{const formulas=parts.filter(part=>part.kind==='math');expect(formulas).toHaveLength(2);formulas[1].origins=structuredClone(formulas[0].origins);};for(const variant of record.variants)copy(variant.parts);copy(record.parts);
 expect(()=>reserveRequirementTransportMath(attack)).not.toThrow();expect(()=>requirementMathSourceMap({source:authSource,mathBodyStartByte:0,requirementMath:attack},authBytes)).toThrow(/authenticated source ownership/);
 const crossSource='requirementDiagram\nrequirement req {\n id: "$$x$$"\n text: "$$x$$"\n}\n',crossRequest={...request,source:crossSource,originalSource:crossSource};clearMermaidParseCache();const cross:any=parseMermaid([crossRequest]).get(crossRequest.figureId),crossAttack:any=structuredClone(cross.requirementMath),id=crossAttack.records.find((entry:any)=>entry.role==='requirement.id'),text=crossAttack.records.find((entry:any)=>entry.role==='requirement.text'),swap=(left:any[],right:any[])=>{const a=left.find(part=>part.kind==='math'),b=right.find(part=>part.kind==='math'),origins=structuredClone(a.origins);a.origins=structuredClone(b.origins);b.origins=origins;};
 for(let index=0;index<3;index++)swap(id.variants[index].parts,text.variants[index].parts);swap(id.parts,text.parts);
 expect(()=>reserveRequirementTransportMath(crossAttack)).not.toThrow();expect(()=>requirementMathSourceMap({source:crossSource,mathBodyStartByte:0,requirementMath:crossAttack},new TextEncoder().encode(crossSource))).toThrow(/authenticated source ownership/);
 const cached:any=parseMermaid([request]).get(request.figureId);const cachedRecord=cached.requirementMath.records.find((entry:any)=>entry.role==='requirement.text');for(const variant of cachedRecord.variants)copy(variant.parts);copy(cachedRecord.parts);expect(()=>requirementMathSourceMap({source:authSource,mathBodyStartByte:0,requirementMath:cached.requirementMath},authBytes)).toThrow(/authenticated source ownership/);
 clearMermaidParseCache();expect(()=>requirementMathSourceMap({source:authSource,mathBodyStartByte:0,requirementMath:cloned},authBytes)).not.toThrow();
 const variant=authSource.replace('and','plus');expect(()=>requirementMathSourceMap({source:variant,mathBodyStartByte:0,requirementMath:cloned},new TextEncoder().encode(variant))).toThrow(/authenticated|source/i);
});
