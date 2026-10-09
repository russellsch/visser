import {expect,it} from 'vitest';
import {extractRadarLabels} from '../../packages/core/src/mermaid/radar-labels.ts';

it('collects every root assignment and display field before native overwrite, with fallback ownership active',async()=>{
 const source=String.raw`radar-beta
title old $$old$$
title new $$title$$
accTitle: old $$access-old$$
accTitle:
accDescr {
  old $$description$$
}
axis speed["$$axis$$"],plain
curve team["$$curve$$"]{speed: 1, plain: 2}
curve raw {3,4}
`;
 const found=await extractRadarLabels(source);
 expect(found.records.map(record=>[record.role,record.itemIndex,record.semanticValue,record.active])).toEqual([
  ['title',undefined,'old $$old$$',false],['title',undefined,'new $$title$$',true],['accTitle',undefined,'old $$access-old$$',false],['accTitle',undefined,'',true],['accDescr',undefined,'old $$description$$',true],
  ['axis.name',0,'speed',false],['axis.label',0,'$$axis$$',true],['axis.name',1,'plain',true],['curve.name',0,'team',false],['curve.label',0,'$$curve$$',true],['curve.name',1,'raw',true]
 ]);
 expect({title:found.ast.title,accTitle:found.ast.accTitle,accDescr:found.ast.accDescr,axes:found.ast.axes.map(axis=>[axis.name,axis.label]),curves:found.ast.curves.map(curve=>[curve.name,curve.label])}).toEqual({title:'new $$title$$',accTitle:'',accDescr:'old $$description$$',axes:[['speed','$$axis$$'],['plain',undefined]],curves:[['team','$$curve$$'],['raw',undefined]]});
});

it('keeps BOM/CRLF/dedent/comment provenance and converts quoted escaping without losing original bytes',async()=>{
 const original='\uFEFF  radar-beta\r\n  %% ignored $$hidden$$\r\n  axis speed["雪 $$\\\\frac{a}{b}$$"],plain\r\n  curve c["quote \\\"$$c$$\\\""]{speed: 1, plain: 2}\r\n';
 const rendered='radar-beta\n%% ignored $$hidden$$\naxis speed["雪 $$\\\\frac{a}{b}$$"],plain\ncurve c["quote \\\"$$c$$\\\""]{speed: 1, plain: 2}\n';
 const found=await extractRadarLabels(original,rendered);expect(found.parserSource).not.toContain('ignored');expect(found.parserSource).not.toContain('\r');
 const axis=found.records.find(record=>record.role==='axis.label')!,curve=found.records.find(record=>record.role==='curve.label')!;
 expect(axis.semanticValue).toBe('雪 $$\\frac{a}{b}$$');expect(curve.semanticValue).toBe('quote "$$c$$"');expect(axis.synthetic).toBe(false);expect(curve.synthetic).toBe(false);
 for(const record of [axis,curve])for(const interval of record.intervals)expect(original.slice(interval.sourceStart,interval.sourceEnd)).toBe(interval.rawSource);
 expect(axis.intervals[0]!.rawSource).toContain('\\\\frac');expect(curve.intervals[0]!.rawSource).toContain('\\"');expect(axis.intervals[0]!.startByte).toBeGreaterThan(0);
});

it('uses the generic parser preprocessing contract, including style-semicolon deletion',async()=>{
 const found=await extractRadarLabels('radar-beta\ntitle style x:#; $$t$$\naxis a["$$a$$"]\ncurve c {1}\n');
 expect(found.parserSource).not.toContain(';');expect(found.records.find(record=>record.role==='title')!.semanticValue).toBe('style x:# $$t$$');
});

it('rejects stale fences and source-policy failures, then recovers independently',async()=>{
 const source='radar-beta\naxis a["$$x$$"]\ncurve c {1}\n';
 await expect(extractRadarLabels(source,'radar-beta\naxis changed["$$x$$"]\ncurve c {1}\n')).rejects.toThrow(/differs beyond leading indentation/);
 await expect(extractRadarLabels('radar-beta\n%%{init: {}}%%\naxis a["$$x$$"]\ncurve c {1}\n')).rejects.toThrow();
 const recovered=await extractRadarLabels(source);expect(recovered.records.map(record=>record.role)).toEqual(['axis.name','axis.label','curve.name']);
});
