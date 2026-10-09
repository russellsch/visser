// @ts-expect-error jsdom is supplied by the test harness without declarations.
import { JSDOM } from 'jsdom';
import { expect, it } from 'vitest';
import { stampStateMathLabels, type StateMathDomSlot } from '../../packages/runtime/src/mermaid-state-source.ts';
const fo=(tex?:string)=>`<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">${tex?`<math xmlns="http://www.w3.org/1998/Math/MathML" data-vs-mermaid-formula="${tex}"><mi>${tex}</mi></math>`:'plain'}</div></foreignObject>`;
const draw=(body:string)=>new JSDOM(`<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`).window.document.querySelector('svg') as SVGElement;
const slot=(role:'title'|'body'):StateMathDomSlot=>({key:JSON.stringify(['node','A',role]),ownerKind:'node',ownerId:'A',domId:'state-A-0',shape:'rectWithTitle',role,inputPath:'createLabel',formulas:['x']});
it('identifies equal title/body equations independently by native order',()=>{
 const svg=draw(`<g id="r-state-A-0"><g class="label">${fo('x')}${fo('x')}</g></g>`);
 stampStateMathLabels(svg,'r',[slot('title'),slot('body')]);
 expect([...svg.querySelectorAll('foreignObject')].map(n=>n.getAttribute('data-vs-mermaid-label'))).toEqual([slot('title').key,slot('body').key]);
});
it.each(['title','body'] as const)('counts plain siblings when resolving the %s',role=>{
 const svg=draw(`<g id="r-state-A-0"><g class="label">${fo(role==='title'?'x':undefined)}${fo(role==='body'?'x':undefined)}</g></g>`);
 stampStateMathLabels(svg,'r',[slot(role)]);
 expect(svg.querySelector('[data-vs-mermaid-label]')).toBe(svg.querySelectorAll('foreignObject')[role==='title'?0:1]);
});
it('rejects missing/duplicate owners, stale shape structure, unclaimed formulas and wrong TeX without mutation',()=>{
 const valid=`<g id="r-state-A-0"><g class="label">${fo('x')}${fo('x')}</g></g>`;
 for(const [body,slots] of [
  [valid.replace('r-state-A-0','wrong'),[slot('title'),slot('body')]],
  [valid+valid,[slot('title'),slot('body')]],
  [valid.replace(fo('x'),''),[slot('body')]],
  [valid,[slot('title')]],
  [valid,[slot('title'),{...slot('body'),formulas:['y']}]],
  [valid,[slot('title'),slot('title')]],
 ] as Array<[string,StateMathDomSlot[]]>) {
  const svg=draw(body), before=svg.outerHTML;
  expect(()=>stampStateMathLabels(svg,'r',slots)).toThrow();
  expect(svg.outerHTML).toBe(before);
 }
});
it('binds a note and edge by exact native IDs without interpolating selectors',()=>{
 const svg=draw(`<g id="r-state-A----note-0-1"><g class="label noteLabel">${fo('n')}</g></g><g class="edgeLabel"><g class="label" data-id="edge1">${fo('e')}</g></g>`);
 const slots:StateMathDomSlot[]=[{key:JSON.stringify(['node','A----note-0','label']),ownerKind:'node',ownerId:'A----note-0',domId:'state-A----note-0-1',shape:'note',role:'label',inputPath:'labelHelper',formulas:['n']},{key:JSON.stringify(['edge','edge1','label']),ownerKind:'edge',ownerId:'edge1',shape:'edge',role:'label',inputPath:'edge',formulas:['e']}];
 stampStateMathLabels(svg,'r',slots);
 expect(svg.querySelectorAll('[data-vs-mermaid-label]')).toHaveLength(2);
});
