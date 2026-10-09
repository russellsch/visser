import { describe, expect, it } from 'vitest';
import { extractQuadrantLabels } from '../../packages/core/src/mermaid/quadrant-labels.ts';

const all = `quadrantChart
title $$title$$
accTitle: $$accessible$$
accDescr { description $$description$$ }
x-axis "$$left$$" --> "$$right$$"
y-axis "$$bottom$$" --> "$$top$$"
quadrant-1 "$$one$$"
quadrant-2 "$$two$$"
quadrant-3 "$$three$$"
quadrant-4 "$$four$$"
"$$point$$": [0.2, 0.3]
`;
describe('quadrant grammar source ownership',()=>{
 it('collects every text role with exact original spans',async()=>{
  const found=await extractQuadrantLabels(all);
  expect(found.records.map(r=>r.role)).toEqual(['title','accTitle','accDescr','xLeft','xRight','yBottom','yTop','quadrant1','quadrant2','quadrant3','quadrant4','point']);
  expect(found.records.map(r=>r.semanticValue)).toEqual(['$$title$$','$$accessible$$','description $$description$$','$$left$$','$$right$$','$$bottom$$','$$top$$','$$one$$','$$two$$','$$three$$','$$four$$','$$point$$']);
  for(const r of found.records) {
   expect(r.synthetic).toBe(false);
   expect(r.intervals.map(i=>all.slice(i.sourceStart,i.sourceEnd)).join('')).toBe(r.semanticValue);
  }
  expect(found.points).toEqual([{recordIndex:12,className:'',x:'0.2',y:'0.3',styles:[]}]);
 });
 it('retains overwritten fields, one-sided axis assignments and synthetic arrows',async()=>{
  const found=await extractQuadrantLabels('quadrantChart\nx-axis low --> high\nx-axis next -->\ny-axis first --> last\ny-axis next\n');
  expect(found.records.map(r=>[r.role,r.semanticValue])).toEqual([['xLeft','low'],['xRight','high'],['xLeft','next ⟶ '],['yBottom','first'],['yTop','last'],['yBottom','next']]);
  expect(found.records[2]!.synthetic).toBe(true);
  expect(found.records[2]!.intervals.map(i=>i.rawSource).join('')).toBe('next');
 });
 it('preserves duplicate points in authored order with separate origins and styles',async()=>{
  const source='quadrantChart\nclassDef hot color:#ff0000\n"$$x$$":::hot: [0.1, 0.2] radius:7\n"$$x$$": [0.1, 0.2]\n';
  const found=await extractQuadrantLabels(source);
  expect(found.points).toEqual([{recordIndex:1,className:'hot',x:'0.1',y:'0.2',styles:['radius:7']},{recordIndex:2,className:'',x:'0.1',y:'0.2',styles:[]}]);
  expect(found.classes).toEqual([{name:'hot',styles:['color:#ff0000']}]);
  expect(found.records.map(r=>r.pointIndex)).toEqual([0,1]);
  expect(found.records[0]!.intervals[0]!.startByte).toBeLessThan(found.records[1]!.intervals[0]!.startByte);
 });
 it('preserves quoted and markdown token provenance without interpreting either',async()=>{
  const source='quadrantChart\nquadrant-1 "`bold **$$x$$**`"\nquadrant-2 "$$\\frac{a}{b}$$"\n';
  const found=await extractQuadrantLabels(source);
  expect(found.records.map(r=>[r.textType,r.semanticValue])).toEqual([['markdown','bold **$$x$$**'],['text','$$\\frac{a}{b}$$']]);
  expect(found.records[0]!.intervals[0]!.rawSource).toBe('bold **$$x$$**');
 });
 it('maps Unicode, BOM, CRLF, dedent and comments to original byte positions',async()=>{
  const source='\uFEFF  quadrantChart\r\n  %% ignored $$hidden$$\r\n  title 雪 $$x$$\r\n  "😀 $$p$$": [0, 1]\r\n';
  const found=await extractQuadrantLabels(source);
  expect(found.records.map(r=>r.semanticValue)).toEqual(['雪 $$x$$','😀 $$p$$']);
  for(const r of found.records) for(const interval of r.intervals) expect(Buffer.from(source).subarray(interval.startByte,interval.endByte).toString()).toBe(interval.rawSource);
 });
 it('keeps collectors isolated after parse failures and concurrent requests',async()=>{
  await expect(extractQuadrantLabels('quadrantChart\nnot a point: [2, 4]\n')).rejects.toThrow();
  const [a,b]=await Promise.all([extractQuadrantLabels('quadrantChart\nquadrant-1 first'),extractQuadrantLabels('quadrantChart\nquadrant-2 second')]);
  expect(a.records.map(r=>r.semanticValue)).toEqual(['first']);
  expect(b.records.map(r=>r.semanticValue)).toEqual(['second']);
 });
});
