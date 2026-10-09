// W0 probe: the exact Mermaid 12 browser bundle shipped by Visser.
// Run from the repository root: node spikes/math-mermaid/browser-probe.mjs
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { chromium } from '../../node_modules/playwright/index.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const bundle = readFileSync(join(here, '../../node_modules/mermaid/dist/mermaid.min.js'));
const cases = {
  flow_node: 'flowchart LR\n A["$$x^2$$"] --> B[Plain]',
  flow_edge: 'flowchart LR\n A[Plain] -->|"$$x^2$$"| B[Plain]',
  flow_group: 'flowchart LR\n subgraph G["$$x^2$$"]\n A[Plain]\n end',
  flow_fraction: 'flowchart LR\n A["$$\\frac{a}{b}$$"] --> B',
  state_name: 'stateDiagram-v2\n [*] --> A\n A: $$x^2$$',
  state_edge: 'stateDiagram-v2\n A --> B: $$x^2$$',
  sequence_actor: 'sequenceDiagram\n participant A as $$x^2$$\n A->>B: Hi',
  sequence_message: 'sequenceDiagram\n A->>B: $$x^2$$',
  sequence_note: 'sequenceDiagram\n A->>B: Hi\n Note over A,B: $$x^2$$',
  sequence_fraction: 'sequenceDiagram\n A->>B: $$\\frac{a}{b}$$',
  er_label: 'erDiagram\n A ||--o{ B : "$$x^2$$"',
  class_label: 'classDiagram\n class A {\n +$$x^2$$\n }',
  pie_label: 'pie\n "$$x^2$$" : 1\n "Other" : 2',
  mindmap_label: 'mindmap\n root((Root))\n   Child["$$x^2$$"]',
  gantt_section: 'gantt\n dateFormat YYYY-MM-DD\n section $$x^2$$\n Task : 2024-01-01, 1d',
  timeline_event: 'timeline\n title $$x^2$$\n 2020 : $$y^2$$',
  journey_title: 'journey\n title $$x^2$$\n section Phase\n Task: 5: Alice',
  quadrant_title: 'quadrantChart\n title $$x^2$$\n x-axis Left --> Right\n y-axis Low --> High\n A: [0.2, 0.3]',
  xychart_title: 'xychart-beta\n title "$$x^2$$"\n x-axis [a, b]\n y-axis "Y" 0 --> 10\n bar [1, 2]',
  flow_bad: 'flowchart LR\n A["$$\\notacommand{x}$$"] --> B',
  er_bad: 'erDiagram\n A ||--o{ B : "$$\\notacommand{x}$$"',
};

const CSP = "default-src 'none'; script-src 'self' data:; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'";
const pageHtml = '<!doctype html><meta charset="utf-8"><div id="host"></div><script src="/mermaid.js"></script>';
const requests = [];
const server = createServer((req, res) => {
  requests.push(req.url);
  if (req.url === '/') { res.writeHead(200, {'content-type':'text/html', 'content-security-policy':CSP}); res.end(pageHtml); }
  else if (req.url === '/mermaid.js') { res.writeHead(200, {'content-type':'text/javascript', 'content-security-policy':CSP}); res.end(bundle); }
  else { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({headless:true});
const results = { bundleBytes: bundle.length, bundleGzipBytes: gzipSync(bundle).length, bundleSha256: createHash('sha256').update(bundle).digest('hex'), chromiumVersion: browser.version(), origin, cases: {}, requests, offOrigin: [], pageErrors: [] };
try {
  const page = await browser.newPage({viewport:{width:320,height:720}});
  page.on('pageerror', e => results.pageErrors.push(e.message));
  await page.route('**/*', route => {
    if (!route.request().url().startsWith(origin)) { results.offOrigin.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  await page.goto(origin);
  results.mathMLElement = await page.evaluate(() => typeof window.MathMLElement);
  await page.evaluate(() => window.mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'base',flowchart:{useMaxWidth:false},sequence:{useMaxWidth:false},state:{useMaxWidth:false},er:{useMaxWidth:false},class:{useMaxWidth:false},pie:{useMaxWidth:false},mindmap:{useMaxWidth:false}}));
  let index = 0;
  for (const [name, source] of Object.entries(cases)) {
    results.cases[name] = await page.evaluate(async ({source,index}) => {
      const host = document.getElementById('host'); host.replaceChildren();
      try {
        const {svg} = await window.mermaid.render('m' + index, source);
        host.innerHTML = svg;
        const root = host.querySelector('svg');
        const text = host.textContent ?? '';
        return {ok:!!root, math:host.querySelectorAll('math').length, katex:host.querySelectorAll('.katex').length,
          error:host.querySelectorAll('.katex-error').length, foreignObject:host.querySelectorAll('foreignObject').length,
          hasSource:text.includes('$$'), unsupported:text.includes('MathML is unsupported'),
          hasNotacommand:text.includes('notacommand'), text:text.slice(0,200), svgBytes:svg.length,
          width:root?.getAttribute('width'), viewBox:root?.getAttribute('viewBox')};
      } catch(e) { return {ok:false, error:String(e).slice(0,300)}; }
    }, {source,index:index++});
  }
  results.noMathMLElement=await page.evaluate(async () => {
    Object.defineProperty(window,'MathMLElement',{configurable:true,value:undefined});
    const host=document.getElementById('host');host.replaceChildren();
    try { const {svg}=await window.mermaid.render('no-mathml','flowchart LR\n A["$$x^2$$"] --> B'); host.innerHTML=svg;
      return {math:host.querySelectorAll('math').length,unsupported:host.textContent?.includes('MathML is unsupported'),source:host.textContent?.includes('$$x^2$$')};
    } catch(e) {return {error:String(e).slice(0,200)};}
  });
  await page.close();
  // The standalone exporter embeds Mermaid as a data: script. Exercise it
  // under file:// in a folder containing exactly one HTML file.
  mkdirSync(join(here,'results'),{recursive:true});
  const onlyFileDir=mkdtempSync(join(here,'results','single-file-'));
  try {
    const htmlPath=join(onlyFileDir,'index.html');
    const dataUrl='data:text/javascript;charset=utf-8;base64,'+bundle.toString('base64');
    writeFileSync(htmlPath,`<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}"><div id="host"></div><script src="${dataUrl}"></script>`);
    const filePage=await browser.newPage();
    const fileRequests=[];
    const attemptedExternal=[];
    filePage.on('request',r=>fileRequests.push(r.url().split(',')[0]));
    await filePage.route('**/*',route=>{
      const url=route.request().url();
      if (/^https?:/.test(url)) {attemptedExternal.push(url);return route.abort();}
      return route.continue();
    });
    await filePage.goto(pathToFileURL(htmlPath).href);
    results.singleFile=await filePage.evaluate(async () => {
      window.mermaid?.initialize({startOnLoad:false,securityLevel:'strict',flowchart:{useMaxWidth:false}});
      try {
        const {svg}=await window.mermaid.render('standalone','flowchart LR\n A["$$x^2$$"] --> B');
        document.getElementById('host').innerHTML=svg;
        return {loaded:true,rendered:!!document.querySelector('#host svg'),math:document.querySelectorAll('#host math').length};
      } catch(e) {return {loaded:!!window.mermaid,error:String(e).slice(0,250)};}
    });
    results.singleFile.requests=fileRequests;
    results.singleFile.attemptedExternal=attemptedExternal;
    await filePage.close();
  } finally {rmSync(onlyFileDir,{recursive:true,force:true});}
} finally { await browser.close(); server.close(); }
mkdirSync(join(here,'results'),{recursive:true});
writeFileSync(join(here,'results/browser.json'),JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify({bundleBytes:results.bundleBytes, mathMLElement:results.mathMLElement, requests:requests.length, offOrigin:results.offOrigin.length, cases:Object.fromEntries(Object.entries(results.cases).map(([k,v])=>[k,{ok:v.ok,math:v.math,error:v.error,unsupported:v.unsupported}]))},null,2));
