import { afterAll, beforeAll, expect, it } from 'vitest';
import DOMPurify from 'dompurify';
// @ts-expect-error jsdom is supplied without declarations.
import { JSDOM } from 'jsdom';
import { extractSankeyMath } from '../../packages/core/src/mermaid/sankey-math.ts';
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

it('matches native sanitized node identities and ordered links without using stale exported maps',async()=>{
 // @ts-expect-error pinned internal chunk has no declarations.
 const {diagram}=await import('mermaid/dist/chunks/mermaid.core/sankeyDiagram-IPEJSGJF.mjs');
 const source='sankey\n"$$x < y$$<br/>","&dollar;&dollar;z&dollar;&dollar;<br/>",1\n"$$x &lt; y$$<br/>","&dollar;&dollar;z&dollar;&dollar;<br/>",2\n';
 const old=diagram.parser.yy;diagram.db.clear();diagram.parser.yy=diagram.db;
 try {
  diagram.parser.parse(source);
  const graph=structuredClone(diagram.db.getGraph()),math=await extractSankeyMath(source);
  const names=[...new Set(math.records.map(record=>record.dbValue))];
  expect(graph.nodes).toEqual(names.map(id=>({id})));expect(graph.nodes).toHaveLength(2);
  expect(graph.links).toEqual(math.labels.rows.map(row=>({source:math.records[row.sourceRecord-1]!.dbValue,target:math.records[row.targetRecord-1]!.dbValue,value:row.value})));
  expect(math.total.occurrences).toBe(4);expect(math.records).toHaveLength(4);
 } finally {diagram.parser.yy=old;diagram.db.clear();}
});

it('matches generic Mermaid entity preprocessing inside CSV identities',async()=>{
 const {default:mermaid}=await import('mermaid');mermaid.initialize({startOnLoad:false,securityLevel:'strict'});
 for(const name of ['style:x# $$a$$;','classDef:x# $$b$$;']){
  const source=`sankey\n"${name}",b,1\n`;
  const diagram=await mermaid.mermaidAPI.getDiagramFromText(source);
  try{
   const graph=(diagram.db as any).getGraph(),math=await extractSankeyMath(source);
   expect(graph.nodes[0].id).toBe(name.slice(0,-1));expect(math.records[0]!.dbValue).toBe(graph.nodes[0].id);
   const formula=math.records[0]!.parts.find(part=>part.kind==='math')!;
   expect(formula).toMatchObject({origins:[{rawSource:name.includes('$$a$$')?'$$a$$':'$$b$$'}]});
  }finally{diagram.db.clear!();}
 }
});
