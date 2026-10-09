import { afterAll, beforeAll, expect, it } from 'vitest';
import DOMPurify from 'dompurify';
// @ts-expect-error jsdom is supplied without declarations.
import { JSDOM } from 'jsdom';
import { extractQuadrantMath } from '../../packages/core/src/mermaid/quadrant-math.ts';
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
it('matches independently initialized native DB sanitation and reversed point order',async()=>{
 const source='quadrantChart\ntitle old $$old$$\ntitle $$x < y$$\naccTitle: $$a < b$$\naccDescr {\n $$c < d$$\n}\nx-axis left --> right\nx-axis "$$l$$" -->\ny-axis bottom --> top\nquadrant-1 "before<br/>&dollar;&dollar;q&dollar;&dollar;"\nquadrant-2 "`**$$two$$**`"\nquadrant-3 "$$three$$"\nquadrant-4 "$$four$$"\n"$$first < second$$": [0.1, 0.2]\n"$$last$$": [0.8, 0.9]\n';
 const math=await extractQuadrantMath(source);
 // @ts-expect-error pinned internal Mermaid chunk has no declarations.
 const {diagram}=await import('mermaid/dist/chunks/mermaid.core/quadrantDiagram-O4NWA36T.mjs');
 diagram.db.clear();
 try {
  const parser=new diagram.parser.parser.Parser(); parser.yy=diagram.db;
  parser.parse(source);
  const native=diagram.db.getQuadrantData();
  const final=(role:string)=>math.records.filter(r=>r.role===role).at(-1)?.dbValue;
  expect(native.title.text).toBe(final('title'));
  expect(diagram.db.getAccTitle()).toBe(final('accTitle'));
  expect(diagram.db.getAccDescription()).toBe(final('accDescr'));
  expect(native.quadrants.map((q:any)=>q.text.text)).toEqual([1,2,3,4].map(i=>final(`quadrant${i}`)));
  expect(native.axisLabels.map((a:any)=>a.text)).toEqual(['xLeft','xRight','yBottom','yTop'].map(final));
  expect(native.points.map((p:any)=>p.text.text)).toEqual(math.records.filter(r=>r.role==='point').map(r=>r.dbValue).reverse());
  expect(math.records.find(r=>r.role==='quadrant1')!.parts.filter(p=>p.kind==='math')).toMatchObject([{tex:'q',origins:[{rawSource:'&dollar;&dollar;q&dollar;&dollar;'}]}]);
 } finally {diagram.db.clear();}
});
