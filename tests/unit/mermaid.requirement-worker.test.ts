import {expect,it} from 'vitest';
import {clearMermaidParseCache,parseMermaid} from '../../packages/core/src/mermaid/parse.ts';
import {reserveRequirementTransportMath} from '../../packages/core/src/mermaid/requirement-transport.ts';

const matrix=String.raw`$$\begin{matrix}a\\b\end{matrix}$$`;
const source=`requirementDiagram
accTitle: &dollar;&dollar;access&dollar;&dollar;<br/>
accDescr: $$description$$
requirement req {
 text: "${matrix}"
}
requirement req {
 text: "$$hidden$$"
}
`;
const overBudget=`requirementDiagram
requirement visible {
 text: "$$visible$$"
}
requirement visible {
${Array.from({length:1000},()=> ' text: "$$x$$"').join('\n')}
}
`;
const request=(figureId:string,text=source,originalSource=text)=>({figureId,type:'other' as const,requirement:true,source:text,originalSource});

it('exports native Requirement rows, sanitized metadata, a standard matrix, and hidden duplicate authored costs',()=>{
 const result:any=parseMermaid([request('requirement')]).get('requirement');
 expect(result).toMatchObject({ok:true,requirementMath:{total:{occurrences:4},snapshot:{accTitle:'$$access$$<br>'}}});
 expect(result.requirementMath.slots.map((slot:any)=>slot.key)).toEqual(['requirement:0:name','requirement:0:text']);
 const body=result.requirementMath.records.find((record:any)=>record.role==='requirement.text');
 expect(body.parts.find((part:any)=>part.kind==='math')).toMatchObject({tex:String.raw`\begin{matrix}a\\b\end{matrix}`,origins:[{rawSource:matrix,startLine:5}]});
 expect(result.requirementMath.records.filter((record:any)=>record.role==='requirement.text')).toHaveLength(2);
 expect(reserveRequirementTransportMath(JSON.parse(JSON.stringify(result.requirementMath)))).toEqual(result.requirementMath.total);
});

it('rejects hidden invalid math, original-source failures, and mismatched diagram-family flags while recovering later figures',()=>{
 const invalid=source.replace('$$hidden$$',()=>String.raw`$$\badRequirementCommand$$`),results=parseMermaid([
  request('invalid',invalid),{...request('missing'),originalSource:undefined},{...request('mismatch'),originalSource:source.replace('$$hidden$$','$$other$$')},
  {...request('mixed'),radar:true},{...request('xy-conflict'),xy:true},{...request('wrong','sankey\na,b,1\n'),sankey:false},{...request('type-conflict','flowchart LR\nA --> B\n'),type:'flowchart' as const},request('overflow',overBudget),request('recovery'),request('plain','requirementDiagram\nrequirement plain {\n text: plain\n}\n'),
 ]);
 for(const id of ['invalid','missing','mismatch','mixed','xy-conflict','wrong','type-conflict'])expect(results.get(id)).toMatchObject({ok:false,code:'E_MATH'});
 expect(results.get('invalid')).toMatchObject({line:8});expect(results.get('recovery')).toMatchObject({ok:true,requirementMath:{total:{occurrences:4}}});
 expect(results.get('overflow')).toMatchObject({ok:false,code:'E_LIMIT'});expect(results.get('plain')).toMatchObject({ok:true});expect((results.get('plain')as any).requirementMath).toBeUndefined();
});

it('accepts a BOM/CRLF original source normalized into the displayed Requirement input and keeps request cache families separate',()=>{
 clearMermaidParseCache();
 const normalized=parseMermaid([request('normalized',source,'\uFEFF'+source.replaceAll('\n','\r\n'))]).get('normalized') as any;
 expect(normalized).toMatchObject({ok:true,requirementMath:{total:{occurrences:4}}});
 const enabled=request('cache');expect(parseMermaid([enabled]).get('cache')).toMatchObject({ok:true,requirementMath:{total:{occurrences:4}}});
 const disabled=parseMermaid([{...enabled,requirement:false}]).get('cache') as any;
 expect(disabled).toMatchObject({ok:false});expect(disabled.requirementMath).toBeUndefined();
 expect(parseMermaid([enabled]).get('cache')).toMatchObject({ok:true,requirementMath:{total:{occurrences:4}}});
});
