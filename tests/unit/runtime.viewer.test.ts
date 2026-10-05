import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error jsdom is provided by the test harness without declaration files.
import { JSDOM } from 'jsdom';
import { FigureViewer } from '../../packages/runtime/src/figure-viewer.ts';

function setup(extraClass = '', extra = '') {
  const dom = new JSDOM(`<!doctype html><body><main><figure class="vs-figure vs-graph ${extraClass}" id="x-fig"><figcaption>Example</figcaption><div class="vs-viewport"><svg viewBox="0 0 800 500"><a data-vs-target="node" id="v-node"><rect width="100" height="50"/></a></svg></div><div class="vs-lists"><a id="l-node" href="#x-node">Node</a></div>${extra}</figure></main><details id="x-node">Canonical detail</details></body>`, {pretendToBeVisual:true});
  for(const key of ['window','document','Element','HTMLElement','SVGElement','HTMLDialogElement','AbortController','MouseEvent','getSelection'] as const) vi.stubGlobal(key, dom.window[key]);
  vi.stubGlobal('innerWidth',390);vi.stubGlobal('scrollX',0);vi.stubGlobal('scrollY',400);
  vi.stubGlobal('matchMedia',()=>({matches:true}));vi.stubGlobal('addEventListener',dom.window.addEventListener.bind(dom.window));
  dom.window.scrollTo=vi.fn();
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  const figure=document.querySelector<HTMLElement>('figure')!; const svg=figure.querySelector('svg')!;
  Object.defineProperty(svg,'viewBox',{value:{baseVal:{x:0,y:0,width:800,height:500}}});
  const hooks={closeDetail:vi.fn(),clearTransient:vi.fn(),referenceMode:()=>false,setReferenceMode:vi.fn(),escape:()=>false};
  const viewer=new FigureViewer(hooks);viewer.init();
  return {dom,figure,svg,viewer,hooks};
}
afterEach(()=>vi.unstubAllGlobals());
describe('figure viewer lifecycle',()=>{
  it('moves the actual figure/list and restores article geometry and original list positions',()=>{
    const {figure,svg,viewer}=setup('', '<div class="vs-glossary-wrap"><a id="glossary">Glossary</a></div>');
    const origin=figure.querySelector<HTMLButtonElement>('button')!;
    viewer.open(figure,origin);
    expect(viewer.dialog?.contains(figure)).toBe(true);
    expect(document.querySelectorAll('#x-fig')).toHaveLength(1);
    expect(viewer.dialog?.querySelector('.vs-viewer-parts #glossary')).not.toBeNull();
    const zoom=Array.from(viewer.dialog!.querySelectorAll('button')).find(b=>b.textContent==='Zoom in')!;zoom.click();
    const zoomed=svg.getAttribute('viewBox');expect(zoomed).not.toBe('0 0 800 500');
    viewer.close();
    expect(document.querySelector('main > figure')).toBe(figure);
    expect(figure.querySelector('.vs-lists #l-node')).not.toBeNull();
    expect(figure.querySelector('.vs-glossary-wrap #glossary')).not.toBeNull();
    expect(svg.getAttribute('viewBox')).toBe('0 0 800 500');
    expect(document.querySelector('.vs-viewer-placeholder')).toBeNull();
    viewer.open(figure,origin);
    const restored=svg.getAttribute('viewBox')!.split(' ').map(Number);
    zoomed!.split(' ').map(Number).forEach((value,index)=>expect(restored[index]).toBeCloseTo(value,10));
    viewer.close();
  });
  it('capture consumes the first touch activation before fold/target handlers',()=>{
    const {figure,viewer}=setup();const part=figure.querySelector('#v-node')!;const activate=vi.fn();part.addEventListener('click',activate);
    const down=new window.MouseEvent('pointerdown',{bubbles:true});Object.defineProperty(down,'pointerType',{value:'touch'});part.dispatchEvent(down);
    expect(viewer.guardingEntry).toBe(true);
    part.dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true,detail:1}));
    expect(viewer.active).toBe(true);expect(activate).not.toHaveBeenCalled();
    expect(document.querySelectorAll('#x-node')).toHaveLength(1);
    expect(viewer.dialog?.querySelector('.vs-inspector')).toBeNull();
    viewer.close();
  });
  it('resolves a list activation to its drawn part before deciding whether to pan',()=>{
    const {figure,svg,viewer}=setup();viewer.open(figure,figure);
    Object.defineProperty(svg,'getScreenCTM',{value:()=>({a:1})});
    const drawing=svg.querySelector('[data-vs-target]')!;
    drawing.getBoundingClientRect=()=>({top:10,bottom:30,left:0,right:100,width:100,height:20,x:0,y:10,toJSON:()=>({})});
    const list=document.getElementById('l-node')!;list.setAttribute('data-vs-target','node');
    list.getBoundingClientRect=()=>({top:120,bottom:170,left:0,right:100,width:100,height:50,x:0,y:120,toJSON:()=>({})});
    const sheet=document.createElement('aside');sheet.getBoundingClientRect=()=>({top:100,bottom:300,left:0,right:100,width:100,height:200,x:0,y:100,toJSON:()=>({})});
    const box=svg.getAttribute('viewBox');viewer.revealTarget(list,sheet);
    expect(svg.getAttribute('viewBox')).toBe(box);viewer.close();
  });
  it('can zoom out far enough to contain a tall graph as well as a wide graph',()=>{
    const {figure,svg,viewer}=setup();
    svg.viewBox.baseVal.width=200;svg.viewBox.baseVal.height=1200;
    svg.setAttribute('viewBox','0 0 200 1200');
    svg.getBoundingClientRect=()=>({x:0,y:0,left:0,top:0,right:320,bottom:396,width:320,height:396,toJSON:()=>({})});
    viewer.open(figure,figure);
    const zoom=Array.from(viewer.dialog!.querySelectorAll('button')).find(b=>b.textContent==='Zoom out')!;
    for(let i=0;i<12;i++)zoom.click();
    expect(Number(svg.getAttribute('viewBox')!.split(' ')[3])).toBeGreaterThanOrEqual(1200);
    viewer.close();
    // Reopen landscape then portrait: remembered scale must not retain an old aspect.
    svg.getBoundingClientRect=()=>({x:0,y:0,left:0,top:0,right:844,bottom:214,width:844,height:214,toJSON:()=>({})});
    viewer.open(figure,figure);
    Array.from(viewer.dialog!.querySelectorAll('button')).find(b=>b.textContent==='Reset view')!.click();
    viewer.close();
    svg.getBoundingClientRect=()=>({x:0,y:0,left:0,top:0,right:320,bottom:396,width:320,height:396,toJSON:()=>({})});
    viewer.open(figure,figure);
    expect(Number(svg.getAttribute('viewBox')!.split(' ')[2])/Number(svg.getAttribute('viewBox')!.split(' ')[3])).toBeCloseTo(320/396);
    const out=Array.from(viewer.dialog!.querySelectorAll('button')).find(b=>b.textContent==='Zoom out')!;
    for(let i=0;i<12;i++)out.click();
    const restored=svg.getAttribute('viewBox')!.split(' ').map(Number);
    expect(restored[2]!/restored[3]!).toBeCloseTo(320/396);
    expect(restored[3]).toBeGreaterThanOrEqual(1200);
    viewer.close();
  });
  it('retains a narrow list-and-inspector recovery path without editing snapshot bytes',()=>{
    const {dom,figure,viewer}=setup();
    dom.reconfigure({url:'http://localhost/snapshot?vs-legacy-mobile=1'});
    expect(viewer.supported(figure)).toBe(false);
    vi.stubGlobal('innerWidth',1440);expect(viewer.supported(figure)).toBe(true);
  });
  it('print restores moved figure before printing and Mermaid requires verified mapping',()=>{
    const {figure,viewer}=setup();viewer.open(figure,figure);
    window.dispatchEvent(new window.Event('beforeprint'));
    expect(viewer.active).toBe(false);expect(document.querySelector('main > figure')).toBe(figure);
    figure.className='vs-figure vs-mermaid';expect(viewer.supported(figure)).toBe(false);
    figure.setAttribute('data-vs-viewer-ready','true');expect(viewer.supported(figure)).toBe(true);
  });
});
