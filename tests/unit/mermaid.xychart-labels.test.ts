import { describe, expect, it } from 'vitest';
import { extractXYLabels } from '../../packages/core/src/mermaid/xychart-labels.ts';

describe('XY grammar source ownership',()=>{
 it('retains every role, ignored bar labels and declaration callback order',async()=>{
  const source=`xychart horizontal
title " $$title$$ "
accTitle: $$accessible$$
accDescr { description $$description$$ }
x-axis "$$x$$" ["$$a$$", "$$a$$"]
y-axis "$$y$$" 0 --> 10
line "$$series$$" [1 "$$p$$", 2, 3 "$$truncated$$"]
bar [4 "$$ignored$$",5]
x-axis ["replacement"]
`;
  const found=await extractXYLabels(source);
  expect(found.records.map(r=>[r.role,r.semanticValue])).toEqual([
   ['title','$$title$$'],['accTitle','$$accessible$$'],['accDescr','description $$description$$'],
   ['category','$$a$$'],['category','$$a$$'],['xTitle','$$x$$'],['yTitle','$$y$$'],
   ['seriesTitle','$$series$$'],['pointLabel','$$p$$'],['pointLabel',''],['pointLabel','$$truncated$$'],
   ['seriesTitle',''],['pointLabel','$$ignored$$'],['pointLabel',''],['category','replacement'],['xTitle',''],
  ]);
  expect(found.effects.map(e=>e.method)).toEqual(['setOrientation','setDiagramTitle','setAccTitle','setAccDescription','setXAxisBand','setXAxisTitle','setYAxisRangeData','setYAxisTitle','setLineData','setBarData','setXAxisBand','setXAxisTitle']);
  expect(found.effects[8]).toEqual({method:'setLineData',seriesIndex:0,recordIndex:8,data:[{value:1,recordIndex:9},{value:2,recordIndex:10},{value:3,recordIndex:11}]});
  expect(found.records[3]!.intervals[0]!.startByte).toBeLessThan(found.records[4]!.intervals[0]!.startByte);
  for(const r of found.records) expect(r.intervals.map(i=>source.slice(i.sourceStart,i.sourceEnd)).join('')).toBe(r.semanticValue);
 });
 it('maps skipped spaces in unquoted concatenation without assigning them to the label',async()=>{
  const source='xychart\ntitle Hello World + suffix\nx-axis [A A,B B]\nline [1,2]\n';
  const found=await extractXYLabels(source);
  expect(found.records.slice(0,3).map(r=>r.semanticValue)).toEqual(['HelloWorld+suffix','AA','BB']);
  expect(found.records[0]!.intervals.map(i=>i.rawSource)).toEqual(['Hello','World','+','suffix']);
  expect(found.records[1]!.intervals.map(i=>i.rawSource)).toEqual(['A','A']);
 });
 it('does not interpret backticks, escapes or entities inside quoted strings',async()=>{
  const found=await extractXYLabels('xychart\ntitle "`**$$x$$**`"\nx-axis ["$$\\frac{a}{b}$$", "&dollar;&dollar;y&dollar;&dollar;"]\nline [1 "<br/>$$z$$",2]\n');
  expect(found.records.slice(0,3).map(r=>[r.textType,r.semanticValue])).toEqual([
   ['text','`**$$x$$**`'],['text','$$\\frac{a}{b}$$'],['text','&dollar;&dollar;y&dollar;&dollar;'],
  ]);
  expect(found.records.find(r=>r.role==='pointLabel')!.semanticValue).toBe('<br/>$$z$$');
 });
 it('preserves range replacements and series history including signed and fractional data',async()=>{
  const found=await extractXYLabels('xychart\nx-axis "first" -1 --> 3\nline [+.5,-2]\nx-axis [a,b]\nbar "bars" [3,4]\nx-axis "last" 10 --> 20\ny-axis -5 --> 6\n');
  expect(found.effects.map(e=>e.method)).toEqual(['setXAxisRangeData','setXAxisTitle','setLineData','setXAxisBand','setXAxisTitle','setBarData','setXAxisRangeData','setXAxisTitle','setYAxisRangeData','setYAxisTitle']);
  expect(found.effects[0]).toEqual({method:'setXAxisRangeData',min:-1,max:3});
  expect(found.effects[2]).toMatchObject({data:[{value:.5},{value:-2}]});
  expect(found.records.filter(r=>r.synthetic).map(r=>r.role)).toEqual(['seriesTitle','pointLabel','pointLabel','xTitle','pointLabel','pointLabel','yTitle']);
 });
 it('maps quoted Unicode, BOM, CRLF, dedent and comments to exact original bytes',async()=>{
  const source='\uFEFF  xychart\r\n  %% ignored $$hidden$$\r\n  title "雪 $$x$$"\r\n  line "😀 $$s$$" [1 "$$p$$"]\r\n';
  const found=await extractXYLabels(source);
  expect(found.records.map(r=>r.semanticValue)).toEqual(['雪 $$x$$','😀 $$s$$','$$p$$']);
  for(const r of found.records) for(const interval of r.intervals) expect(Buffer.from(source).subarray(interval.startByte,interval.endByte).toString()).toBe(interval.rawSource);
 });
 it('isolates failed and concurrent collectors',async()=>{
  await expect(extractXYLabels('xychart\nline [oops]\n')).rejects.toThrow();
  const [a,b]=await Promise.all([extractXYLabels('xychart\ntitle "$$a$$"\nline [1]'),extractXYLabels('xychart\ntitle "$$b$$"\nline [2]')]);
  expect(a.records[0]!.semanticValue).toBe('$$a$$');
  expect(b.records[0]!.semanticValue).toBe('$$b$$');
  expect(a.effects[1]).toMatchObject({data:[{value:1}]});
  expect(b.effects[1]).toMatchObject({data:[{value:2}]});
 });
});

it('matches uninstrumented native callback values and order',async()=>{
 const source=`xychart horizontal
title " title "
accTitle: accessible
accDescr { description }
x-axis "X" [A A,"B B"]
line "one" [1 "p", 2, 3 "overflow"]
x-axis -2 --> 4
y-axis "Y" -5 --> 10
bar [3 "ignored",4]
x-axis ["final"]
`;
 // This parser has no collector action wrapper. Observe the native callbacks.
 // @ts-expect-error Mermaid's pinned internal chunk has no declarations.
 const {diagram}=await import('mermaid/dist/chunks/mermaid.core/xychartDiagram-PMCCYNJV.mjs');
 const native=new diagram.parser.parser.Parser();
 const calls:unknown[]=[];
 const methods=['setOrientation','setDiagramTitle','setAccTitle','setAccDescription','setXAxisTitle','setYAxisTitle','setXAxisBand','setXAxisRangeData','setYAxisRangeData','setLineData','setBarData'];
 native.yy=Object.fromEntries(methods.map(method=>[method,(...args:unknown[])=>calls.push({method,args})]));
 native.parse(source);
 const found=await extractXYLabels(source);
 const value=(index:number)=>found.records[index-1]!.semanticValue;
 const text=(index:number)=>({text:value(index),type:found.records[index-1]!.textType});
 const reconstructed=found.effects.map(e=>{
  switch(e.method){
   case 'setOrientation': return {method:e.method,args:[e.orientation]};
   case 'setDiagramTitle': case 'setAccTitle': case 'setAccDescription': return {method:e.method,args:[value(e.recordIndex)]};
   case 'setXAxisTitle': case 'setYAxisTitle': return {method:e.method,args:[text(e.recordIndex)]};
   case 'setXAxisBand': return {method:e.method,args:[e.records.map(text)]};
   case 'setXAxisRangeData': case 'setYAxisRangeData': return {method:e.method,args:[e.min,e.max]};
   case 'setLineData': case 'setBarData': return {method:e.method,args:[text(e.recordIndex),e.data.map(d=>({value:d.value,label:value(d.recordIndex)}))]};
  }
 });
 expect(reconstructed).toEqual(calls);
});
