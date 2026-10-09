import {beforeAll,expect,it} from 'vitest';
import {clearMermaidParseCache,parseMermaid} from '../../packages/core/src/mermaid/parse.ts';
import {erMathSourceMap} from '../../packages/core/src/mermaid/er-source-map.ts';
import {reserveERTransportMath,type ERRenderMath} from '../../packages/core/src/mermaid/er-transport.ts';
import {resolveMermaidFigures,mermaidMathTotal} from '../../packages/core/src/mermaid/index.ts';

const source=String.raw`erDiagram
%% hidden $$comment$$
subgraph g["Group 雪 $$g$$"]
 A["$$\frac{1}{a}$$"] {
  string field "$$\frac{1}{v}$$"
 }
 B
end
A ||--|| B : "$$r$$"
`;
const original='\uFEFF  '+source.replaceAll('\n','\r\n  '),bytes=new TextEncoder().encode(original);
let math:ERRenderMath;
beforeAll(()=>{
 const result=parseMermaid([{figureId:'er-source',type:'other',er:true,source,originalSource:original}]).get('er-source');
 if(!result?.ok||!result.erMath)throw new Error(JSON.stringify(result));math=result.erMath;
});
const map=(erMath=math)=>erMathSourceMap({source,mathBodyStartByte:0,erMath},bytes);
it('binds every retained native slot and excludes temporary group measurements',()=>{
 const result=map();expect(result.format).toBe('er');
 expect(math.slots.some(slot=>slot.lifetime==='measurement')).toBe(true);
 expect(result.labels.map(label=>label.key)).toEqual(math.slots.filter(slot=>slot.lifetime==='retained').map(slot=>slot.key));
 expect(result.labels.some(label=>label.expressions.length===0)).toBe(true);
 expect(result.labels.flatMap(label=>label.expressions).map(part=>part.tex)).toEqual(expect.arrayContaining(['g','\\frac{1}{a}','\\frac{1}{v}','r']));
 for(const label of result.labels)for(const part of label.expressions)if('rawSource'in part)expect(result.source.slice(part.start,part.end)).toBe(part.rawSource);
 for(const slot of math.slots)for(const part of slot.parts)if(part.kind==='math')for(const origin of part.origins)expect(original.slice(origin.sourceStart,origin.sourceEnd)).toBe(origin.rawSource);
});
it('rejects source forgeries independently of structurally valid resource claims',()=>{
 const forged=structuredClone(math),parts=forged.slots.flatMap(slot=>slot.parts).filter(part=>part.kind==='math');
 const left=parts.find(part=>part.tex==='r')!,right=parts.find(part=>part.tex==='g')!;
 Object.assign(left,{origins:structuredClone(right.origins)});
 expect(()=>reserveERTransportMath(forged)).not.toThrow();
 expect(()=>map(forged)).toThrow(/authenticated source ownership/);
 expect(()=>erMathSourceMap({source,erMath:math},bytes)).toThrow(/body byte offset/);
});
it('revalidates detached payloads and propagates ER math through public figure resolution',()=>{
 const detached=structuredClone(math);clearMermaidParseCache();expect(()=>map(detached)).not.toThrow();
 const resolved=resolveMermaidFigures([{figureId:'er-public',source,originalSource:original,mathBodyStartByte:0}]).get('er-public')!;
 expect(resolved.issues).toEqual([]);expect(resolved.figure.erMath).toBeDefined();
 expect(mermaidMathTotal([resolved.figure])).toEqual(math.total);
});
