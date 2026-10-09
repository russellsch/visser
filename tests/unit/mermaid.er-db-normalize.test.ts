import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {expect,it} from 'vitest';
import {normalizeERDbField,traceERDbNormalization} from '../../packages/core/src/mermaid/er-db-normalize.ts';
import {ProvenanceText} from '../../packages/core/src/mermaid/source-provenance.ts';

it('matches actual native DB outputs from raw input in both configured modes',()=>{
 const output=execFileSync(process.execPath,[resolve('tests/fixtures/math/er-db-normalize-oracle.mjs')],{encoding:'utf8',timeout:30000});
 expect(JSON.parse(output)).toEqual({cases:66,nativeHooksPrepared:true});
},35000);

it('maps precise trimmed and collapsed whitespace origins without renderer decoding',async()=>{
 const group=await normalizeERDbField(ProvenanceText.identity('  abc  '),'subgraph.title',true);
 expect(group.sanitation.text).toBe('  abc  ');expect(group.dbValue.text).toBe('abc');
 expect(group.dbValue.mapRange(0,3)).toEqual({synthetic:false,intervals:[{start:2,end:5}]});
 const title=await normalizeERDbField(ProvenanceText.identity('  abc  '),'accTitle',false);
 expect(title.dbValue.text).toBe('abc  ');expect(title.dbValue.mapRange(0,5)).toEqual({synthetic:false,intervals:[{start:2,end:7}]});
 const descr=await normalizeERDbField(ProvenanceText.identity('a\n\n\u00a0b  '),'accDescr',true);
 expect(descr.dbValue.text).toBe('a\nb  ');
 expect(descr.dbValue.mapRange(1,2)).toEqual({synthetic:false,intervals:[{start:1,end:4}]});
 expect(descr.dbValue.mapRange(2,3)).toEqual({synthetic:false,intervals:[{start:4,end:5}]});
 const text='$$x&amp;y$$ List~String~';
 expect((await normalizeERDbField(ProvenanceText.identity(text),'accTitle',true)).dbValue.text).toBe(text);
});

it('rejects malformed witnesses and detaches mutable caller data',async()=>{
 const input=ProvenanceText.identity('x');
 for(const witness of [null,[],{htmlLabels:true,passes:[],extra:1},{htmlLabels:'true',passes:[]},{htmlLabels:true,passes:[]},{htmlLabels:true,passes:['x',3]}])expect(()=>traceERDbNormalization(input,'accTitle',witness as any)).toThrow();
 expect(()=>traceERDbNormalization(input,'bad' as any,{htmlLabels:false,passes:['x']})).toThrow();
 await expect(normalizeERDbField(input,'accTitle','true' as any)).rejects.toThrow();
 const witness={htmlLabels:true,passes:['x','x']},result=traceERDbNormalization(input,'accTitle',witness);
 witness.passes[0]='changed';expect(result.witness.passes).toEqual(['x','x']);
 expect(Object.isFrozen(result.witness)).toBe(true);expect(Object.isFrozen(result.witness.passes)).toBe(true);
});
