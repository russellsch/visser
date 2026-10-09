import {expect,it} from 'vitest';
import {clearMermaidParseCache,parseMermaid} from '../../packages/core/src/mermaid/parse.ts';
import {reserveRadarTransportMath} from '../../packages/core/src/mermaid/radar-transport.ts';
const source='radar-beta\ntitle $$title$$\naxis a["$$x$$"],a\ncurve c["$$hidden$$"]{a:1}\nshowLegend false\n';
const request=(figureId:string,text=source)=>({figureId,type:'other' as const,radar:true,source:text,originalSource:text});
it('transports all authored math and native duplicate-axis state with only visible owners',()=>{
 const result=parseMermaid([request('radar')]).get('radar')!;
 expect(result).toMatchObject({ok:true,radarMath:{total:{occurrences:3},snapshot:{curves:[{entries:['1','1']}]},slots:[{key:'title',recordIndex:1},{key:'axis:0',recordIndex:3},{key:'axis:1',recordIndex:4}]}});
 if(!result.ok||!result.radarMath)throw new Error('missing Radar transport');
 expect(reserveRadarTransportMath(JSON.parse(JSON.stringify(result.radarMath)))).toEqual(result.radarMath.total);
 expect(result.radarMath.records[2]!.parts[0]).toMatchObject({origins:[{rawSource:'$$x$$',startLine:3}]});
});
it('admits native header forms and rejects missing source, mismatched source, conflicting family and invalid hidden math before recovery',()=>{
 const invalid=source.replace('$$hidden$$',()=>String.raw`$$\\badRadarCommand$$`);
 const results=parseMermaid([
  request('colon',source.replace('radar-beta','radar-beta:')),request('spaced',source.replace('radar-beta','radar-beta :')),
  {...request('missing'),originalSource:undefined},{...request('mismatch'),originalSource:source.replace('$$x$$','$$other$$')},
  {...request('conflict'),sankey:true},request('invalid',invalid),request('recovery'),request('plain','radar-beta\naxis a\ncurve c {1}\n')]);
 for(const id of ['colon','spaced','recovery','plain'])expect(results.get(id)).toMatchObject({ok:true});
 for(const id of ['missing','mismatch','conflict','invalid'])expect(results.get(id)).toMatchObject({ok:false,code:'E_MATH'});
 expect(results.get('invalid')).toMatchObject({line:4});
 expect((results.get('plain')as any).radarMath).toBeUndefined();
});
it('separates enabled and disabled Radar requests in the parse cache',()=>{
 clearMermaidParseCache();const enabled=request('cache');
 expect(parseMermaid([enabled]).get('cache')).toMatchObject({ok:true,radarMath:{total:{occurrences:3}}});
 const disabled=parseMermaid([{...enabled,radar:false}]).get('cache');
 expect(disabled).toMatchObject({ok:false});expect((disabled as any).radarMath).toBeUndefined();
 expect(parseMermaid([enabled]).get('cache')).toMatchObject({ok:true,radarMath:{total:{occurrences:3}}});
});
