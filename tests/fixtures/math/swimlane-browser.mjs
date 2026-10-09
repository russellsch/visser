import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {mermaidMathPlugin} from '../../../scripts/mermaid-build.mjs';

const root=resolve('.');
const compiled=await build({stdin:{
 contents:`import mermaid from 'mermaid';import {stampFlowchartMathLabels} from './packages/runtime/src/mermaid-flowchart-source.ts';window.swimlaneProbe={mermaid,stampFlowchartMathLabels};`,
 resolveDir:root,
},bundle:true,platform:'browser',format:'iife',write:false,minify:true,logLevel:'warning',plugins:[mermaidMathPlugin(root)]});
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage(),requests=[];
 await page.route('**/*',route=>{requests.push(route.request().url());return route.abort();});
 await page.setContent('<!doctype html><style>html,body{margin:0;max-width:100%;overflow:hidden}main{max-width:100vw;overflow:auto}svg{display:block}</style><main></main>');
 await page.addScriptTag({content:compiled.outputFiles[0].text});
 const runs=[];
 for(const width of [320,1440]) {
  await page.setViewportSize({width,height:900});
  runs.push(...await page.evaluate(async width=>{
   const {mermaid,stampFlowchartMathLabels}=window.swimlaneProbe;
   const tall=String.raw`$$\frac{1+\frac{a}{b}}{1+\frac{c}{d}}$$`;
   const wide=String.raw`$$x_1+x_2+x_3+x_4+x_5+x_6+x_7+x_8+x_9$$`;
   const rect=element=>{const box=element.getBoundingClientRect();return {left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:box.width,height:box.height};};
   const contains=(outer,inner)=>inner.left>=outer.left-1&&inner.right<=outer.right+1&&inner.top>=outer.top-1&&inner.bottom<=outer.bottom+1;
   const runs=[];
   for(const direction of ['TB','LR']) {
    // The native swimlane detector scopes and promotes its layout itself.
    // Leave root layout at the production default to catch a leaked override.
    mermaid.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels:true,logLevel:'fatal',flowchart:{useMaxWidth:false}});
    const source=`swimlane-beta ${direction}\nsubgraph lane["Lane ${tall}"]\n A["Node ${wide}"]\nend\nA foo@-->|"Foo ${tall}"| B["Other ${wide}"]\nA bar-foo@-->|"Bar ${wide}"| B\n`;
    const renderId=`swim-math-${width}-${direction}`,rendered=await mermaid.render(renderId,source);
    const main=document.querySelector('main');main.innerHTML=rendered.svg;
    const svg=main.querySelector('svg');
    const slots=[
     {key:'subgraph:lane',kind:'subgraph',id:'lane'},
     {key:'node:A',kind:'node',id:'A'}, {key:'node:B',kind:'node',id:'B'},
     {key:'edge:foo',kind:'edge',id:'foo'},
     {key:'edge:bar-foo',kind:'edge',id:'bar-foo'},
    ];
    const lane=svg.querySelector('g.cluster.swimlane#lane'),clone=lane?.cloneNode(true);
    lane?.parentElement?.append(clone);
    let ambiguity='';
    try {stampFlowchartMathLabels(svg,renderId,slots);}catch(error){ambiguity=String(error);}
    const afterFailure=svg.querySelectorAll('[data-vs-mermaid-label]').length;
    clone?.remove();stampFlowchartMathLabels(svg,renderId,slots);
    const failures=[];
    const formulas=[...svg.querySelectorAll('math[data-vs-mermaid-formula]')];
    if(formulas.length!==5)failures.push(`formula count ${formulas.length}`);
    for(const formula of formulas) {
     const foreign=formula.closest('foreignObject');
     if(!foreign||!contains(rect(foreign),rect(formula)))failures.push('math ink exceeds reserved foreignObject');
     if(!contains(rect(svg),rect(formula)))failures.push('math ink exceeds SVG viewBox');
    }
    const laneTitle=lane?.querySelector(':scope > .cluster-label.swimlane-label foreignObject');
    const laneRect=lane?.querySelector(':scope > rect.swimlane-title');
    if(!laneTitle||!laneRect||!contains(rect(laneRect),rect(laneTitle)))failures.push('measured lane title exceeds title band');
    for(const node of svg.querySelectorAll('g.node')) {
     const foreign=node.querySelector(':scope > g.label foreignObject'),outline=node.querySelector(':scope > rect');
     if(!foreign||!outline||!contains(rect(outline),rect(foreign)))failures.push(`node label exceeds outline ${node.id}`);
    }
    if(document.documentElement.scrollWidth>width)failures.push('document overflows viewport');
    const owners=[...svg.querySelectorAll('[data-vs-mermaid-label]')].map(element=>element.getAttribute('data-vs-mermaid-label')).sort();
    const nativeEdges=[...svg.querySelectorAll('[data-vs-native-edge-id]')].map(element=>({
     id:element.getAttribute('data-vs-native-edge-id'),
     owner:element.querySelector('[data-vs-mermaid-label]')?.getAttribute('data-vs-mermaid-label'),
    })).sort((left,right)=>left.id.localeCompare(right.id));
    const ordinary=await mermaid.render(`ordinary-after-${width}-${direction}`,'flowchart LR\nA["$$x$$"] --> B');
    main.innerHTML=ordinary.svg;
    const ordinarySvg=main.querySelector('svg');
    stampFlowchartMathLabels(ordinarySvg,`ordinary-after-${width}-${direction}`,[{key:'node:A',kind:'node',id:'A'}]);
    const ordinaryFormula=ordinarySvg.querySelector('math[data-vs-mermaid-formula]');
    const ordinaryOwner=ordinaryFormula?.closest('[data-vs-mermaid-label]')?.getAttribute('data-vs-mermaid-label');
    const ordinaryLane=ordinarySvg.querySelector('g.cluster.swimlane');
    runs.push({width,direction,ambiguity,afterFailure,formulas:formulas.map(formula=>formula.getAttribute('data-vs-mermaid-formula')).sort(),owners,nativeEdges,ordinaryOwner,ordinaryLane:Boolean(ordinaryLane),failures});
   }
   return runs;
  },width));
 }
 for(const run of runs) {
  assert.match(run.ambiguity,/missing or ambiguous/);assert.equal(run.afterFailure,0);
  assert.deepEqual(run.owners,['edge:bar-foo','edge:foo','node:A','node:B','subgraph:lane']);
  assert.deepEqual(run.nativeEdges,[{id:'bar-foo',owner:'edge:bar-foo'},{id:'foo',owner:'edge:foo'}]);
  assert.equal(run.ordinaryOwner,'node:A');assert.equal(run.ordinaryLane,false);
  assert.deepEqual(run.formulas.sort(),['\\frac{1+\\frac{a}{b}}{1+\\frac{c}{d}}','\\frac{1+\\frac{a}{b}}{1+\\frac{c}{d}}','x_1+x_2+x_3+x_4+x_5+x_6+x_7+x_8+x_9','x_1+x_2+x_3+x_4+x_5+x_6+x_7+x_8+x_9','x_1+x_2+x_3+x_4+x_5+x_6+x_7+x_8+x_9'].sort());
  assert.deepEqual(run.failures,[],JSON.stringify(run));
 }
 assert.deepEqual(requests,[]);
 console.log('ok: browser reserves tall and wide swimlane math, distinguishes colliding edge IDs, rejects ambiguity, and stays offline in TB/LR narrow/wide');
} finally {await browser.close();}
