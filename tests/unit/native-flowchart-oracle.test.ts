import { describe, it, expect } from 'vitest';
import { layoutGraph } from '../../packages/core/src/compiler/layout.ts';
import { graphSvg } from '../../packages/core/src/compiler/svg.ts';
import { render } from '../../packages/core/src/compiler/html.ts';
// @ts-expect-error test-only jsdom package has no declarations.
import { JSDOM } from 'jsdom';

// Expected labels/endpoints are an authored table, independent of adapter helpers.
const expected = [
 {id:'enter',from:'start',to:'choice',label:''},
 {id:'accept',from:'choice',to:'end',label:'Accept'},
 {id:'reject',from:'choice',to:'repair',label:'Repair'},
 {id:'retry',from:'repair',to:'choice',label:'Retest'},
];
describe('native flowchart independent topology oracle @FCgeometry',()=>{
 it('keeps terminal callout keys above nodes and fold controls before nodes',()=>{
  const layout={width:200,height:340,
   groups:[{id:'g',label:'G',x:0,y:0,width:200,height:200}],
   nodes:[{id:'a',x:90,y:100,width:20,height:20,lines:['A']},{id:'b',x:90,y:300,width:20,height:20,lines:['B']}],
   edges:[{id:'ab',points:[{x:100,y:120},{x:100,y:300}],label:{x:90,y:140,width:90,height:400,lines:['Oversize label']}}]};
  const doc=new JSDOM(render(graphSvg({figureId:'f',title:'F',layout,flowchart:true,collapsed:['g'],
   parentOf:id=>id==='a'?'g':undefined,labelOf:id=>id,roleOf:()=>undefined,kindOf:()=>undefined,
   relationship:id=>id==='ab'?{from:'a',to:'b'}:undefined}))).window.document;
  const callout=doc.querySelector('.vs-proxy-callout')!;
  expect(callout).not.toBeNull();
  expect([...callout.querySelectorAll('.vs-proxy-callout-key-text')].map(n=>n.textContent)).toEqual(['1','1']);
  // The folded group's Expand remains visible even while its title is hidden.
  const expand=doc.querySelector('[data-vs-fold-expand] rect')!;
  const bounds=(el:Element)=>({x:Number(el.getAttribute('x')),y:Number(el.getAttribute('y')),width:Number(el.getAttribute('width')),height:Number(el.getAttribute('height'))});
  const clearControl=()=>{const c=bounds(expand);for(const el of callout.querySelectorAll('.vs-proxy-callout-bg, .vs-proxy-callout-key')){
   const r=bounds(el);expect(r.x<c.x+c.width&&c.x<r.x+r.width&&r.y<c.y+c.height&&c.y<r.y+r.height).toBe(false);
  }};
  clearControl();
  const key=callout.querySelector('.vs-proxy-callout-key')!;
  const saved=key.outerHTML;
  for(const attr of ['x','y','width','height'])key.setAttribute(attr,expand.getAttribute(attr)!);
  expect(clearControl).toThrow();key.outerHTML=saved;
  const children=[...doc.querySelector('svg')!.children];
  const nodes=[...doc.querySelectorAll('.vs-node')];
  for(const node of nodes){
   expect(children.indexOf(callout)).toBeGreaterThan(children.indexOf(node));
   expect(children.indexOf(doc.querySelector('[data-vs-fold-toggle]')!)).toBeLessThan(children.indexOf(node));
  }
 });
 it('detects swapped outcomes, reversed routes, and a missing folded flow',async()=>{
  const nodes=[{id:'start',label:'Start',flowKind:'start' as const},{id:'choice',label:'Approved?',group:'phase',flowKind:'decision' as const},{id:'repair',label:'Repair',group:'phase',flowKind:'action' as const},{id:'end',label:'End',flowKind:'end' as const}];
  const layout=await layoutGraph({id:'f',direction:'DOWN',nodes,groups:[{id:'phase',label:'Review'}],edges:expected});
  const routes=(edges:typeof layout.edges)=>{for(const row of expected){const e=edges.find(e=>e.id===row.id)!;const n=layout.nodes.find(n=>n.id===row.to)!;const p=e.points.at(-1)!;expect(p.x).toBeGreaterThanOrEqual(n.x-.01);expect(p.x).toBeLessThanOrEqual(n.x+n.width+.01);expect(p.y).toBeGreaterThanOrEqual(n.y-.01);expect(p.y).toBeLessThanOrEqual(n.y+n.height+.01);}};
  routes(layout.edges);
  const reversed=structuredClone(layout.edges);reversed.find(e=>e.id==='accept')!.points.reverse();
  expect(()=>routes(reversed)).toThrow();
  const labels=new Map([...nodes,{id:'phase',label:'Review'},...expected].map(x=>[x.id,x.label]));
  const svg=render(graphSvg({figureId:'f',title:'Review',layout,flowchart:true,collapsed:['phase'],initialCollapsed:['phase'],labelOf:id=>labels.get(id)??id,parentOf:id=>nodes.find(n=>n.id===id)?.group,kindOf:id=>nodes.find(n=>n.id===id)?.flowKind,roleOf:()=>undefined,relationship:id=>expected.find(e=>e.id===id)}));
  const doc=new JSDOM(svg).window.document;
  const outcomes=(d:Document)=>{for(const row of expected.filter(r=>r.label)){const original=d.getElementById(`v-f.${row.id}`)!;expect(original.textContent).toContain(row.label);}};
  outcomes(doc);
  const swapped=new JSDOM(svg).window.document;
  for(const [id,label] of [['accept','Repair'],['reject','Accept']]){const text=swapped.getElementById(`v-f.${id}`)!.querySelector('.vs-edge-label')!;text.textContent=label!;}
  expect(()=>outcomes(swapped)).toThrow();
  const folded=(d:Document)=>expect([...d.querySelectorAll('[data-vs-proxy-for]')].map(e=>e.getAttribute('data-vs-proxy-for')).sort()).toEqual(['accept','enter']);
  folded(doc);
  doc.querySelector('[data-vs-proxy-for="accept"]')!.remove();expect(()=>folded(doc)).toThrow();
 });
});
