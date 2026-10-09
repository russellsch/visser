// @ts-expect-error jsdom has no declarations in this test project.
import {JSDOM} from 'jsdom';
import {expect,it} from 'vitest';
import {bindMermaidSource,mermaidSourceSelection} from '../../packages/runtime/src/mermaid-source.ts';

it('binds encoded Kanban equations independently for repeated draw instances',()=>{
 const doc=new JSDOM('<!doctype html><body></body>').window.document;
 const figure=doc.createElement('figure'),render=doc.createElement('div'),pre=doc.createElement('pre'),code=doc.createElement('code');
 render.setAttribute('data-vs-mermaid-render','');pre.className='vs-mermaid-source';
 const source=String.raw`kanban
a[Column]
  i[Card]@{ticket: "\u0024\u0024x\u0024\u0024"}
`;
 code.textContent=source;pre.append(code);figure.append(render,pre);doc.body.append(figure);
 const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');render.append(svg);
 const raw=String.raw`\u0024\u0024x\u0024\u0024`,start=source.indexOf(raw);
 const keys=['kanban-render:0:1:item:ticket','kanban-render:1:1:item:ticket'];
 const formulas=keys.map(key=>{const label=doc.createElementNS(svg.namespaceURI,'g'),formula=doc.createElementNS(svg.namespaceURI,'text');label.setAttribute('data-vs-mermaid-label',key);formula.setAttribute('data-vs-mermaid-formula','x');formula.textContent='x';label.append(formula);svg.append(label);return formula;});
 figure.setAttribute('data-vs-mermaid-source-map',JSON.stringify({format:'kanban',source,labels:keys.map(key=>({key,expressions:[{tex:'x',rawSource:raw,start,end:start+raw.length,encoded:true}]}))}));
 bindMermaidSource(figure,svg);
 for(const formula of formulas){const range=doc.createRange();range.selectNodeContents(formula);const selection=mermaidSourceSelection(range);expect(selection.kind).toBe('source');if(selection.kind==='source')expect(selection.range.toString()).toBe(raw);}
 figure.setAttribute('data-vs-mermaid-source-map',JSON.stringify({format:'kanban',source,labels:keys.map(key=>({key,expressions:[{tex:'x',unrepresentable:true}]}))}));
 bindMermaidSource(figure,svg);
 const range=doc.createRange();range.selectNodeContents(formulas[0]!);expect(mermaidSourceSelection(range)).toEqual({kind:'unrepresentable'});
});
