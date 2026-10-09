import { afterAll, beforeAll, expect, it } from 'vitest';
import DOMPurify from 'dompurify';
// @ts-expect-error jsdom is supplied without declarations.
import { JSDOM } from 'jsdom';
import { extractXYMath } from '../../packages/core/src/mermaid/xychart-math.ts';
const original = Object.getOwnPropertyDescriptors(DOMPurify);
beforeAll(()=>{
 const instance=DOMPurify(new JSDOM('').window);
 Object.assign(DOMPurify,{sanitize:instance.sanitize,addHook:instance.addHook});
});
afterAll(()=>{
 for(const name of ['sanitize','addHook']) {
  if(original[name]) Object.defineProperty(DOMPurify,name,original[name]!);
  else Reflect.deleteProperty(DOMPurify,name);
 }
});

it('matches native sanitized fields while retaining fields the native DB discards',async()=>{
 // @ts-expect-error Mermaid's pinned internal chunk has no declarations.
 const {diagram}=await import('mermaid/dist/chunks/mermaid.core/xychartDiagram-PMCCYNJV.mjs');
 const source=`xychart
title " title<br/>$$t$$ "
accTitle: accessible<br/>$$a$$
accDescr { first<br/>$$d$$
   second }
x-axis " X<br/>$$x$$ " [" A<br/>$$c$$ ","B"]
y-axis " Y<br/>$$y$$ " 0 --> 10
line " L<br/>$$s$$ " [1 " P<br/>$$p$$ ",2,3 " discarded<br/>$$q$$ "]
bar " B<br/>$$b$$ " [1 "ignored<br/>$$i$$"]
`;
 const parser=new diagram.parser.parser.Parser();
 diagram.db.clear(); parser.yy=diagram.db;
 try {
  parser.parse(source);
  const snapshot=structuredClone({data:diagram.db.getXYChartData(),title:diagram.db.getDiagramTitle(),accTitle:diagram.db.getAccTitle(),accDescr:diagram.db.getAccDescription()});
  const math=await extractXYMath(source);
  const records=(role:string)=>math.records.filter(r=>r.role===role).map(r=>r.dbValue);
  expect(records('title')).toEqual([snapshot.title]);
  expect(records('accTitle')).toEqual([snapshot.accTitle]);
  expect(records('accDescr')).toEqual([snapshot.accDescr]);
  expect(records('xTitle')).toEqual([snapshot.data.xAxis.title]);
  expect(records('yTitle')).toEqual([snapshot.data.yAxis.title]);
  expect(records('category')).toEqual(snapshot.data.xAxis.categories);
  expect(records('seriesTitle')).toEqual(snapshot.data.plots.map((p:{title:string})=>p.title));
  expect(records('pointLabel').slice(0,3)).toEqual(snapshot.data.plots[0].pointLabels);
  expect(snapshot.data.plots[0].data).toHaveLength(2);
  expect(snapshot.data.plots[1]).not.toHaveProperty('pointLabels');
  expect(records('pointLabel')[3]).toBe('ignored<br>$$i$$');
 } finally { diagram.db.clear(); }
});
