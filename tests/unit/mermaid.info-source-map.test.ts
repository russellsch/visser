import {expect,it} from 'vitest';
import {parseMermaid,clearMermaidParseCache} from '../../packages/core/src/mermaid/parse.ts';
import {infoMathSourceMap} from '../../packages/core/src/mermaid/info-source-map.ts';
import {reserveInfoTransportMath} from '../../packages/core/src/mermaid/info-transport.ts';
const source='info\ntitle $$old$$\ntitle $$new$$\naccTitle: $$a$$\n';
const parse=(value=source)=>parseMermaid([{figureId:'info',type:'other',info:true,source:value,originalSource:value}]).get('info');
it('returns hidden authored math with an authenticated empty drawing map',()=>{
 const result=parse();expect(result).toMatchObject({ok:true});if(!result?.ok)throw new Error(JSON.stringify(result));
 const infoMath=result.infoMath!;expect(infoMath.total.occurrences).toBe(3);
 const figure={source,mathBodyStartByte:0,infoMath},bytes=new TextEncoder().encode(source);
 expect(infoMathSourceMap(figure,bytes)).toEqual({format:'info',source,labels:[]});
 const forged:any=structuredClone(infoMath);forged.records=forged.records.slice(1).map((r:any,i:number)=>({...r,recordIndex:i+1}));
 const first=infoMath.records[0]!;
 // Coherent omission can pass structural budget validation; only receipt
 // authentication proves the source contained all authored records.
 const omitted=parse('info\ntitle $$new$$\naccTitle: $$a$$\n');if(!omitted?.ok)throw new Error('fixture parse failed');forged.total=omitted.infoMath!.total;
 expect(()=>reserveInfoTransportMath(forged)).not.toThrow();expect(()=>infoMathSourceMap({...figure,infoMath:forged},bytes)).toThrow(/authenticated/);
 clearMermaidParseCache();expect(()=>infoMathSourceMap(figure,bytes)).not.toThrow();expect(first.source).toBe('$$old$$');
});
it('checks family, original source, hidden failures and recovery',()=>{
 const results=parseMermaid([{figureId:'family',type:'other',info:true,source:'pie\n"x":1\n'},{figureId:'missing',type:'other',info:true,source},{figureId:'bad',type:'other',info:true,source:'info\ntitle $$\\badcommand$$\ntitle plain\n',originalSource:'info\ntitle $$\\badcommand$$\ntitle plain\n'},{figureId:'plain',type:'other',info:true,source:'info\n'},{figureId:'good',type:'other',info:true,source,originalSource:source}]);
 expect(results.get('family')).toMatchObject({ok:false,code:'E_MATH'});expect(results.get('missing')).toMatchObject({ok:false,code:'E_MATH'});expect(results.get('bad')).toMatchObject({ok:false,code:'E_MATH',line:2});expect(results.get('plain')).toMatchObject({ok:true});expect(results.get('plain')).not.toHaveProperty('infoMath');expect(results.get('good')).toMatchObject({ok:true});
});
