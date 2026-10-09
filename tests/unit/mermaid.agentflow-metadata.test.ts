import {expect,it} from 'vitest';
import {ProvenanceText} from '../../packages/core/src/mermaid/source-provenance.ts';
import {decodeAgentflowMetadata,stripAgentflowTrailingCommas} from '../../packages/core/src/mermaid/agentflow-metadata.ts';
const decode=(rawValue:string)=>decodeAgentflowMetadata({rawValue,mappedRawValue:ProvenanceText.identity(rawValue)});
it('retries native invalid multiline comma syntax with original scalar origins',()=>{
 const source='label: "$$x$$", # comment\nshape: rect,\n';
 const decoded=decode(source);
 expect(decoded.label?.mappedValue?.text).toBe('$$x$$');
 expect(decoded.label?.mappedValue?.mapRange(0,5)).toEqual({synthetic:false,intervals:[{start:8,end:13}]});
});
it('retains a comma that already belongs to a valid YAML scalar',()=>{
 expect(decode('label: $$x$$,\nshape: rect').label?.mappedValue?.text).toBe('$$x$$,');
});
it('does not remove commas inside quotes, flow containers or block scalars',()=>{
 const source='label: |\n  $$x$$,\nnotes: ["a,",\n  "b,"]\nshape: rect,\n';
 expect(stripAgentflowTrailingCommas(ProvenanceText.identity(source)).text).toBe(source.replace('shape: rect,','shape: rect'));
});
it('preserves shared unsafe metadata rejection after retry',()=>{
 expect(()=>decode('label: "$$x$$",\nicon: "danger",\n')).toThrow(/icon/);
});
it('matches native truthy typed label coercion including empty and nested arrays',()=>{
 for(const [input,expected] of [
  ['true','true'],['7','7'],['[]',''],['["$$x$$", "$$y$$"]','$$x$$,$$y$$'],
  ['[null, ["$$x$$", false], 7]',',$$x$$,false,7'],['{a: b}','[object Object]'],
 ] as const) expect(decode(`label: ${input}`).label?.mappedValue?.text).toBe(expected);
 for(const input of ['false','0','null','""']) expect(decode(`label: ${input}`).label).toBeUndefined();
});
it('marks array separators synthetic without losing either authored formula origin',()=>{
 const mapped=decode('label: ["$$x$$", "$$y$$"]').label!.mappedValue!;
 expect(mapped.mapRange(0,5).synthetic).toBe(false);
 expect(mapped.mapRange(5,6).synthetic).toBe(true);
 expect(mapped.mapRange(6,11).synthetic).toBe(false);
});
it('bounds expanded array labels by the existing figure byte limit',()=>{
 let metadata='a0: &a0 ["$$$$"]\n';
 for(let i=1;i<16;i++) metadata+=`a${i}: &a${i} [*a${i-1}, *a${i-1}]\n`;
 metadata+='label: *a15';
 expect(()=>decode(metadata)).toThrow(/figure source byte limit/);
});
it('rejects cyclic metadata instead of recursively expanding aliases',()=>{
 expect(()=>decode('label: &loop [*loop]')).toThrow(/cyclic/);
});
