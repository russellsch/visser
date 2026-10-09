import {build} from 'esbuild';
import {expect,test} from '@playwright/test';
import {resolve} from 'node:path';
// @ts-expect-error Checked build helper has no declaration file.
import {mermaidMathPlugin} from '../../scripts/mermaid-build.mjs';

let bundle:string,upstream:string;
test.beforeAll(async()=>{const options={bundle:true,platform:'browser' as const,format:'iife' as const,minify:true,write:false as const};bundle=(await build({...options,entryPoints:[resolve('packages/runtime/src/mermaid-bundle.ts')],plugins:[mermaidMathPlugin(resolve('.'))]})).outputFiles[0]!.text;upstream=(await build({...options,stdin:{contents:"import mermaid from 'mermaid';globalThis.mermaidOriginal=mermaid;",resolveDir:resolve('.'),sourcefile:'requirement-original.js'}})).outputFiles[0]!.text;});

const plain=`requirementDiagram
requirement req {
 id: "plain-id"
 text: plain body
 risk: low
 verifyMethod: test
}
element impl {
 type: service
 docRef: document
}
impl - satisfies -> req
`;
const matrix=String.raw`$$\begin{matrix}a\\b\end{matrix}$$`;
const math=String.raw`requirementDiagram
requirement req:::label {
 id: "$$id$$"
 text: "$$\rlap{\rule{12em}{1em}}x$$ ${matrix}"
 risk: high
 verifyMethod: inspection
}
element impl:::vsfoo {
 type: "$$\frac{type}{kind}$$"
 docRef: "$$doc$$"
}
requirement same {
 text: "$$first$$"
}
element same {
 type: "$$second$$"
}
impl - satisfies -> same
classDef label fill:#ddecff,stroke:#123456
classDef vsfoo fill:#eeeeee,stroke:#654321
`;
const config={startOnLoad:false,securityLevel:'strict',theme:'base',deterministicIds:true,themeVariables:{fontFamily:'Arial, sans-serif',fontSize:'14px'},requirement:{useMaxWidth:false}};

test('plain Requirement rendering preserves upstream viewport, native geometry, and text',async({page})=>{
 await page.setContent('<!doctype html><main id="host"></main>');await page.addScriptTag({content:bundle});await page.addScriptTag({content:upstream});
 const result=await page.evaluate(async({plain,config})=>{const host=document.querySelector('#host')!,shape=(svg:SVGSVGElement)=>({viewBox:svg.getAttribute('viewBox'),text:[...svg.querySelectorAll('text')].map(node=>node.textContent),geometry:[...svg.querySelectorAll('rect,path,line,polygon')].map(node=>[node.localName,...['class','x','y','width','height','points','x1','x2','y1','y2'].map(name=>node.getAttribute(name)), ...(() => {const b=(node as SVGGraphicsElement).getBBox();return [b.x,b.y,b.width,b.height];})()]),stages:svg.querySelectorAll('[data-vs-requirement-stage]').length});const patched=(window as any).mermaid,native=(window as any).mermaidOriginal;patched.initialize(config);native.initialize(config);host.innerHTML=(await patched.render('requirement-plain',plain)).svg;const mine=shape(host.querySelector('svg')!);host.innerHTML=(await native.render('requirement-plain-native',plain)).svg;return {mine,native:shape(host.querySelector('svg')!)};},{plain,config});
 expect(result.mine).toEqual(result.native);expect(result.mine.stages).toBe(0);
});

test('Requirement math stamps every native row, isolates identities/classes and contains measured row ink',async({page})=>{
 test.setTimeout(120_000);await page.setContent('<!doctype html><main id="host"></main>');await page.addScriptTag({content:bundle});await page.addScriptTag({content:upstream});
 for(const width of [320,1440])await test.step(`${width}px`,async()=>{
  await page.setViewportSize({width,height:1000});const result=await page.evaluate(async({math,config,id})=>{const host=document.querySelector('#host')!,patched=(window as any).mermaid,box=(node:Element)=>{const b=node.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom};};patched.initialize(config);host.innerHTML=(await patched.render(id,math)).svg;const svg=host.querySelector<SVGSVGElement>('svg')!,nodes=[...svg.querySelectorAll<SVGGElement>('g.node')].map(node=>({id:node.getAttribute('data-id')??node.id,box:box(node),classes:node.getAttribute('class')})),labels=[...svg.querySelectorAll<SVGGElement>('g[data-vs-mermaid-label]')].map(node=>({key:node.getAttribute('data-vs-mermaid-label'),box:box(node),owner:node.closest('g.node')?.getAttribute('data-id')??node.closest('g.node')?.id,math:node.querySelectorAll('math').length,ink:[...node.querySelectorAll('math,math *')].map(box).filter(b=>b.right>b.left&&b.bottom>b.top)})),outer=box(svg),matrixTex=[...svg.querySelectorAll('[data-vs-mermaid-formula]')].map(node=>node.getAttribute('data-vs-mermaid-formula')),relationshipPaths=[...svg.querySelectorAll<SVGPathElement>('.relationshipLine')].map(node=>node.getAttribute('d'));return {outer,nodes,labels,matrixTex,relationshipPaths,stages:svg.querySelectorAll('[data-vs-requirement-stage]').length,leaks:document.querySelectorAll('[data-vs-requirement-stage]').length};},{math,config,id:`requirement-math-${width}`});
  expect(result.nodes).toHaveLength(4);expect(result.stages).toBe(0);expect(result.leaks).toBe(0);expect(result.relationshipPaths).toHaveLength(1);
  expect(result.labels.map(label=>label.key).sort()).toEqual(['element:0:docRef','element:0:name','element:0:type','element:1:name','element:1:type','requirement:0:id','requirement:0:name','requirement:0:risk','requirement:0:text','requirement:0:verifyMethod','requirement:1:name','requirement:1:text'].sort());
  expect(result.labels.filter(label=>label.math>0).length).toBeGreaterThanOrEqual(6);expect(result.matrixTex).toContain(String.raw`\begin{matrix}a\\b\end{matrix}`);expect(result.nodes.every(node=>!/(^|\s)(label|vsfoo)(\s|$)/.test(node.classes??''))).toBe(true);
  for(const label of result.labels){const owner=result.nodes.find(node=>node.id===label.owner);expect(owner).toBeDefined();expect(label.box.left).toBeGreaterThanOrEqual(owner!.box.left-1);expect(label.box.right).toBeLessThanOrEqual(owner!.box.right+1);expect(label.box.top).toBeGreaterThanOrEqual(owner!.box.top-1);expect(label.box.bottom).toBeLessThanOrEqual(owner!.box.bottom+1);expect(label.box.left).toBeGreaterThanOrEqual(result.outer.left-1);expect(label.box.right).toBeLessThanOrEqual(result.outer.right+1);expect(label.box.top).toBeGreaterThanOrEqual(result.outer.top-1);expect(label.box.bottom).toBeLessThanOrEqual(result.outer.bottom+1);for(const ink of label.ink){expect(ink.left).toBeGreaterThanOrEqual(label.box.left-1);expect(ink.right).toBeLessThanOrEqual(label.box.right+1);expect(ink.top).toBeGreaterThanOrEqual(label.box.top-1);expect(ink.bottom).toBeLessThanOrEqual(label.box.bottom+1);}}
  for(let first=0;first<result.labels.length;first++)for(let second=first+1;second<result.labels.length;second++){const a=result.labels[first]!.box,b=result.labels[second]!.box;expect(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top).toBe(true);}
 });
});

test('Requirement renderer rejects invalid math and unavailable MathML without leaking a stage, then recovers',async({page})=>{
 await page.setContent('<!doctype html><main id="host"></main>');await page.addScriptTag({content:bundle});
 const result=await page.evaluate(async({config})=>{const mermaid=(window as any).mermaid,host=document.querySelector('#host')!;mermaid.initialize(config);const failures:boolean[]=[];for(const source of [String.raw`requirementDiagram
requirement bad {
 text: "$$\unknownRequirement$$"
}
`]){try{await mermaid.render('requirement-invalid',source);failures.push(false);}catch{failures.push(true);}}const descriptor=Object.getOwnPropertyDescriptor(window,'MathMLElement');try{Object.defineProperty(window,'MathMLElement',{value:undefined,configurable:true});await mermaid.render('requirement-no-mathml','requirementDiagram\nrequirement plain {\n text: "$$x$$"\n}\n');failures.push(false);}catch{failures.push(true);}finally{if(descriptor)Object.defineProperty(window,'MathMLElement',descriptor);else Reflect.deleteProperty(window,'MathMLElement');}host.innerHTML=(await mermaid.render('requirement-recovery','requirementDiagram\nrequirement good {\n text: "$$x$$"\n}\n')).svg;return {failures,math:host.querySelectorAll('math').length,stages:host.querySelectorAll('[data-vs-requirement-stage]').length,leaks:document.querySelectorAll('[data-vs-requirement-stage]').length};},{config});
 expect(result).toEqual({failures:[true,true],math:1,stages:0,leaks:0});
});

test('Requirement measured rows retain native label styles and keep tall, short, and final-only rows clear of dividers',async({page})=>{
 const styled=String.raw`requirementDiagram
requirement req:::vivid {
 text: "$$\begin{matrix}a\\b\\c\\d\end{matrix}$$ $$\rlap{\rule{12em}{1em}}x$$"
 verifyMethod: test
}
element impl:::vivid {
 type: "$$x$$"
 docRef: "$$\frac{long}{short}$$"
}
requirement "final $$v$$":::vivid {
 verifyMethod: test
}
element finalDoc:::vivid {
 docRef: "$$d$$"
}
classDef vivid fill:#eeeeee,stroke:#112233,color:red,font-size:22px,font-style:italic,letter-spacing:4px,line-height:2,word-spacing:3px
`;
 await page.setContent('<!doctype html><main id="host"></main>');await page.addScriptTag({content:bundle});
 const result=await page.evaluate(async({styled,config})=>{const host=document.querySelector('#host')!,mermaid=(window as any).mermaid,box=(node:Element)=>{const b=node.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom};};mermaid.initialize(config);host.innerHTML=(await mermaid.render('requirement-styled',styled)).svg;const svg=host.querySelector('svg')!,rows=[...svg.querySelectorAll<SVGGElement>('g[data-vs-mermaid-label]')].map(node=>{const foreign=node.querySelector<HTMLElement>('foreignObject div, foreignObject span, foreignObject')!;const style=getComputedStyle(foreign);return {key:node.getAttribute('data-vs-mermaid-label'),box:box(node),owner:node.closest('g.node')?.getAttribute('data-id')??node.closest('g.node')?.id,mathStyle:[...node.querySelectorAll('math')].map(math=>({color:getComputedStyle(math).color,fontSize:getComputedStyle(math).fontSize})),style:{color:style.color,fontSize:style.fontSize,fontStyle:style.fontStyle,letterSpacing:style.letterSpacing,lineHeight:style.lineHeight,wordSpacing:style.wordSpacing}};}),nodes=[...svg.querySelectorAll<SVGGElement>('g.node')].map(node=>({id:node.getAttribute('data-id')??node.id,box:box(node),dividers:[...node.querySelectorAll<SVGGraphicsElement>('.divider,path.divider')].map(box)}));return {rows,nodes};},{styled,config});
 expect(result.rows.map(row=>row.key).sort()).toEqual(['element:0:docRef','element:0:name','element:0:type','element:1:name','element:1:docRef','requirement:0:name','requirement:0:text','requirement:0:verifyMethod','requirement:1:name','requirement:1:verifyMethod'].sort());
 for(const row of result.rows){for(const math of row.mathStyle)expect(math).toMatchObject({color:'rgb(255, 0, 0)',fontSize:'22px'});expect(row.style).toMatchObject({color:'rgb(255, 0, 0)',fontSize:'22px',fontStyle:'italic',letterSpacing:'4px',wordSpacing:'3px'});expect(Number.parseFloat(row.style.lineHeight)).toBeGreaterThanOrEqual(40);const owner=result.nodes.find(node=>node.id===row.owner)!;for(const divider of owner.dividers)expect(divider.right<=row.box.left||row.box.right<=divider.left||divider.bottom<=row.box.top||row.box.bottom<=divider.top).toBe(true);}
 for(let first=0;first<result.rows.length;first++)for(let second=first+1;second<result.rows.length;second++){const a=result.rows[first]!.box,b=result.rows[second]!.box;expect(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top).toBe(true);}
 expect(result.nodes.every(node=>node.dividers.length>0)).toBe(true);
});

test('Requirement accepts quoted names in nodes and relationship endpoints while retaining row ownership',async({page})=>{
 const quoted='requirementDiagram\nrequirement "need $$n$$" {\n text: "$$need$$"\n}\nelement "impl $$i$$" {\n type: "$$impl$$"\n}\n"impl $$i$$" - satisfies -> "need $$n$$"\n';
 await page.setContent('<!doctype html><main id="host"></main>');await page.addScriptTag({content:bundle});
 const result=await page.evaluate(async({quoted,config})=>{const host=document.querySelector('#host')!,mermaid=(window as any).mermaid;mermaid.initialize(config);host.innerHTML=(await mermaid.render('requirement-quoted',quoted)).svg;const svg=host.querySelector('svg')!;return {nodes:svg.querySelectorAll('g.node').length,edges:svg.querySelectorAll('.relationshipLine').length,keys:[...svg.querySelectorAll('[data-vs-mermaid-label]')].map(node=>node.getAttribute('data-vs-mermaid-label')).sort()};},{quoted,config});
 expect(result).toEqual({nodes:2,edges:1,keys:['element:0:name','element:0:type','requirement:0:name','requirement:0:text']});
});
