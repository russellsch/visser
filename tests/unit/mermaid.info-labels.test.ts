import {expect,it} from 'vitest';
import {extractInfoLabels} from '../../packages/core/src/mermaid/info-labels.ts';
it('retains overwritten and active common fields without visible-version owners',async()=>{
 const source='info showInfo\ntitle $$first$$\ntitle $$last$$\naccTitle: $$a$$\naccDescr: $$d$$\n';
 const found=await extractInfoLabels(source);
 expect(found.records.map(r=>[r.role,r.semanticValue,r.active])).toEqual([['title','$$first$$',false],['title','$$last$$',true],['accTitle','$$a$$',true],['accDescr','$$d$$',true]]);
 for(const r of found.records)for(const span of r.intervals)expect(source.slice(span.sourceStart,span.sourceEnd)).toBe(span.rawSource);
 expect(found.records.some(r=>r.semanticValue==='12.0.0')).toBe(false);
});
it('maps common converter whitespace normalization through BOM CRLF and fence dedent',async()=>{
 const shown='info\n%% hidden $$ignored$$\naccDescr {\n  雪  $$x$$\n\n  $$x$$\n}\ntitle  $$same$$\naccTitle: $$same$$\n';
 const original='\uFEFF  '+shown.replaceAll('\n','\r\n  '),found=await extractInfoLabels(original,shown);
 expect(found.parserSource).not.toContain('ignored');
 expect(found.records.map(r=>r.semanticValue)).toEqual(['雪 $$x$$\n$$x$$','$$same$$','$$same$$']);
 const records=found.records;
 expect(records[1]!.intervals[0]!.sourceStart).not.toBe(records[2]!.intervals[0]!.sourceStart);
 for(const r of records)for(const span of r.intervals){expect(original.slice(span.sourceStart,span.sourceEnd)).toBe(span.rawSource);expect(span.startByte).toBe(Buffer.byteLength(original.slice(0,span.sourceStart)));}
});
it('rejects altered rendered source and recovers after grammar failure',async()=>{
 await expect(extractInfoLabels('info\ntitle $$a$$\n','info\ntitle $$b$$\n')).rejects.toThrow();
 await expect(extractInfoLabels('info\nunknown $$x$$\n')).rejects.toThrow();
 expect((await extractInfoLabels('info\ntitle $$ok$$\n')).records[0]!.semanticValue).toBe('$$ok$$');
});
