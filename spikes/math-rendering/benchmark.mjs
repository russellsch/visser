// W0 evidence, not a production renderer. Generated markup is trusted fixture output here.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';
import { convert } from './engine.mjs';
const dir = resolve(import.meta.dirname, 'reports');
mkdirSync(dir, { recursive: true });
const out = await build({entryPoints:[join(import.meta.dirname,'browser-entry.mjs')], bundle:true, platform:'browser', format:'iife', minify:true, write:false,
  alias:{'#default-font/svg/default.js':join(import.meta.dirname,'node_modules/@mathjax/mathjax-tex-font/mjs/svg/default.js')}});
const mathjax = out.outputFiles[0].text;
writeFileSync(join(dir,'mathjax.js'),mathjax);
const katexRoot=resolve(import.meta.dirname,'../../node_modules/katex/dist');
const katex=readFileSync(join(katexRoot,'katex.min.js'),'utf8');
let css=readFileSync(join(katexRoot,'katex.min.css'),'utf8');
// Keep one supported WOFF2 source per font face, embed every font named by CSS.
css=css.replace(/src:([^;}]+)/g,(_m,src)=>{
 const match=/url\(([^)]+\.woff2)\) format\("woff2"\)/.exec(src);
 if(!match) throw new Error(`No WOFF2 source: ${src}`);
 return `src:url(data:font/woff2;base64,${readFileSync(join(katexRoot,match[1])).toString('base64')}) format("woff2")`;
});
const escaped=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const dataScript=s=>`<script src="data:text/javascript;base64,${Buffer.from(s).toString('base64')}"></script>`;
const formulas=[String.raw`\frac{a}{b}`,String.raw`x^{a+b}`,String.raw`\begin{matrix}a&b\\c&d\end{matrix}`,String.raw`\sum_{i=1}^{n}i`,String.raw`\int_0^\infty e^{-x}\,dx`];
const corpora={sparse:formulas.slice(0,2),repeated100:Array.from({length:100},(_,i)=>formulas[i%formulas.length]),distinct100:Array.from({length:100},(_,i)=>String.raw`\frac{x_{${i}}+1}{y^{${i+1}}}`)};
const browser=await chromium.launch();
const report={node:process.version,browser:browser.version(),mathjax:'4.1.3',katex:'0.16.47',runs:[],assets:{mathjaxBytes:Buffer.byteLength(mathjax),katexBytes:Buffer.byteLength(katex),katexEmbeddedCssBytes:Buffer.byteLength(css)}};
try{
 for(const [name,texes] of Object.entries(corpora))for(const engine of ['mathjax','katex','prerender']){
  const source=texes.map(tex=>`<span class="math"><code>${escaped(tex)}</code></span>`).join('\n');
  const runtime=`const start=performance.now();const cache=new Map();for(const el of document.querySelectorAll('.math')){const tex=el.textContent;try{let output=cache.get(tex);if(!output){output=${engine==='katex'?"katex.renderToString(tex,{displayMode:false,throwOnError:true,trust:false,output:'htmlAndMathml'})":"visserSpikeConvert(tex).markup"};cache.set(tex,output)}el.innerHTML=output;el.dataset.done='true'}catch(e){el.dataset.error=String(e)}}window.spike={ms:performance.now()-start,count:document.querySelectorAll('[data-done]').length,errors:[...document.querySelectorAll('[data-error]')].map(el=>el.dataset.error)};`;
  const content=engine==='prerender'?texes.map(tex=>`<span class="math">${convert(tex).markup}</span>`).join('\n'):source;
  const html=`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src data:; style-src 'unsafe-inline'; font-src data:; connect-src 'none'; img-src data:"><style>body{font:16px sans-serif}.math{display:inline-block;margin:1em;color:#222}${engine==='katex'?css:''}</style></head><body>${content}${engine==='prerender'?'':dataScript(engine==='mathjax'?mathjax:katex)+dataScript(runtime)}</body></html>`;
  const path=join(dir,`${engine}-${name}.html`);writeFileSync(path,html);
  for(let repeat=0;repeat<3;repeat++){
   const context=await browser.newContext({viewport:{width:1000,height:900}}); const page=await context.newPage();const requests=[];const errors=[];
   await context.route(/https?:/,route=>{requests.push(route.request().url());return route.abort()});
   page.on('pageerror',error=>errors.push(String(error)));
   const start=performance.now(); await page.goto(pathToFileURL(path).href);await page.evaluate(()=>document.fonts.ready);
   const result=await page.evaluate(()=>({spike:window.spike??null,nodes:document.querySelectorAll('*').length,svg:document.querySelectorAll('svg').length,mathml:document.querySelectorAll('math').length}));
   if(requests.length||errors.length||result.spike?.count!==undefined&&result.spike.count!==texes.length)throw new Error(JSON.stringify({requests,errors,result}));
   report.runs.push({engine,corpus:name,repeat,bytes:Buffer.byteLength(html),gzip:gzipSync(html).length,openMs:performance.now()-start,...result,requests,errors});
   if(repeat===0&&name==='sparse')await page.screenshot({path:join(dir,`${engine}-sparse.png`)});
   await context.close();
  }
 }
 writeFileSync(join(dir,'benchmark.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({assets:report.assets,results:report.runs.filter(r=>r.repeat===0).map(({engine,corpus,bytes,gzip,openMs,spike,nodes})=>({engine,corpus,bytes,gzip,openMs,convertMs:spike?.ms,nodes}))},null,2));
}finally{await browser.close()}
