import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {expect,it} from 'vitest';
import {normalizeERDisplayField,traceERDisplayField,mapERMathInput} from '../../packages/core/src/mermaid/er-display-normalize.ts';
import {erMathText,type ERDisplayPath} from '../../packages/core/src/mermaid/er-text.ts';
import {ProvenanceText} from '../../packages/core/src/mermaid/source-provenance.ts';
const paths:ERDisplayPath[]=['simple-header','table','edge','group-cluster','group-node','raw-cluster'];
it('matches native sanitation stages for each display path in both modes',()=>{
 const output=execFileSync(process.execPath,[resolve('tests/fixtures/math/er-display-normalize-oracle.mjs')],{encoding:'utf8',timeout:30000});expect(JSON.parse(output)).toEqual({cases:108});
},35000);
it('recovers one serialization layer only at final sanitizer-owned inputs',async()=>{
 for(const path of paths) {
  const input=ProvenanceText.identity('$$a&amp;amp;b$$');
  const field=await normalizeERDisplayField(input,path,true);
  expect(field.mappedInput.text).toBe(path==='table'||path==='edge'||path==='raw-cluster'?'$$a&amp;amp;b$$':'$$a&amp;b$$');
  expect(field.stages.every(stage=>stage.text==='$$a&amp;amp;b$$')).toBe(true);
  expect(traceERDisplayField(input,path,true,field.witness).mappedInput.text).toBe(field.mappedInput.text);
 }
 const group=await normalizeERDisplayField(ProvenanceText.identity('$$x$$'),'group-node',true);
 expect(group.witness).toBeDefined();
 expect((await normalizeERDisplayField(ProvenanceText.identity('$$x$$'),'group-cluster',true)).witness).toBeUndefined();
});
it('preserves exact provenance, TeX escapes and generic prose without decoding new delimiters',()=>{
 const source=String.raw`😀List~$$a,b~c$$~ $$\begin{matrix}a&b\\c&d\end{matrix}$$`;
 const mapped=mapERMathInput(ProvenanceText.identity(source),'table');
 expect(mapped.text).toBe(String.raw`😀List<$$a,b~c$$> $$\begin{matrix}a&b\\c&d\end{matrix}$$`);
 for(let i=0;i<source.length;i++)expect(mapped.mapRange(i,i+1)).toEqual({synthetic:false,intervals:[{start:i,end:i+1}]});
 for(const path of paths)for(const text of ['&dollar;&dollar;x&dollar;&dollar;','$$x<br/>y$$','$$xﬂ°amp¶ßy$$',source])expect(mapERMathInput(ProvenanceText.identity(text),path).text).toBe(erMathText(text,path));
 expect(erMathText('$$x<br/>y$$','edge')).toBe('$$x\ny$$');
 expect(erMathText('&dollar;&dollar;x&dollar;&dollar;','group-cluster')).toBe('&dollar;&dollar;x&dollar;&dollar;');
 const amp=mapERMathInput(ProvenanceText.identity('$$x&amp;y$$'),'group-cluster');
 expect(amp.mapRange(3,4)).toEqual({synthetic:false,intervals:[{start:3,end:8}]});
});
it('rejects path/mode/witness confusion and detaches mutable witnesses',async()=>{
 const input=ProvenanceText.identity('x');
 for(const path of ['simple-header','group-node'] as const) {
  for(const witness of [undefined,null,[],{htmlLabels:false,passes:['x']},{htmlLabels:true,passes:['x']},{htmlLabels:true,passes:['x','x'],extra:true}])expect(()=>traceERDisplayField(input,path,true,witness as any)).toThrow();
 }
 for(const path of ['table','edge','group-cluster','raw-cluster'] as const)expect(()=>traceERDisplayField(input,path,true,{htmlLabels:true,passes:['x','x']})).toThrow(/unexpected/);
 await expect(normalizeERDisplayField(input,'bad' as any,true)).rejects.toThrow();
 await expect(normalizeERDisplayField(input,'table','true' as any)).rejects.toThrow();
 const witness={htmlLabels:true,passes:['x','x']},result=traceERDisplayField(input,'simple-header',true,witness);witness.passes[0]='changed';
 expect(result.witness!.passes).toEqual(['x','x']);expect(Object.isFrozen(result.witness!.passes)).toBe(true);
});
