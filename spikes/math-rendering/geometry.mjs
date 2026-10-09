// W0: prove build-time MathJax metrics match explicit SVG geometry in the browser.
import { convert } from './engine.mjs';
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const dir=join(import.meta.dirname,'reports');mkdirSync(dir,{recursive:true});
const texes=[String.raw`x_i`,String.raw`\frac{a}{b}`,String.raw`\begin{matrix}a&b\\c&d\end{matrix}`,String.raw`\int_0^\infty e^{-x}\,dx`,String.raw`\begin{aligned}a&=b\\c&=d\end{aligned}`];
const records=[];const cells=[];
for(const [i,tex] of texes.entries()){
 const {markup,attrs}=convert(tex);const size=14;const width=parseFloat(attrs.width)*size/2;const height=parseFloat(attrs.height)*size/2;const depth=-parseFloat(/vertical-align:\s*([^;]+)/.exec(attrs.style)[1])*size/2;
 // Change no glyph geometry. Only replace relative ex sizing with the fixed measured pixel box.
 const svg=markup.slice(markup.indexOf('<svg'),markup.lastIndexOf('</svg>')+6).replace(/ style="[^"]*"/,'').replace(/ width="[^"]*"/,` x="12" y="12" width="${width}"`).replace(/ height="[^"]*"/,` height="${height}"`);
 records.push({tex,width,height,depth});cells.push(`<g id="box${i}" transform="translate(20,${i*110+15})"><rect x="0" y="0" width="${width+24}" height="${height+24}" fill="#eee" stroke="#666"/><path d="M 0 ${12+height-depth} H ${width+24}" stroke="#bd7777"/>${svg}</g>`);
}
const html=`<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><svg xmlns="http://www.w3.org/2000/svg" width="500" height="650">${cells.join('')}</svg>`;
const file=join(dir,'geometry.html');writeFileSync(file,html);
const browser=await chromium.launch();
try{
 const page=await browser.newPage();await page.goto(pathToFileURL(file).href);
 const actual=await page.evaluate(()=>[...document.querySelectorAll('g[id]')].map(box=>{
  const svg=box.querySelector('svg');const border=box.querySelector('rect').getBoundingClientRect();const ink=svg.querySelector('g').getBoundingClientRect();
  // A nested SVG's client rect may bound glyph ink, not its full viewport.
  const left=border.left+12,top=border.top+12;
  return {width:svg.width.baseVal.value,height:svg.height.baseVal.value,ink:{left:ink.left-left,top:ink.top-top,right:ink.right-left,bottom:ink.bottom-top}};
 }));
 const result=records.map((r,i)=>({...r,actual:actual[i],widthError:Math.abs(r.width-actual[i].width),heightError:Math.abs(r.height-actual[i].height)}));
 for(const r of result){const b=r.actual.ink;if(r.widthError>0.02||r.heightError>0.02||b.left<-.02||b.top<-.02||b.right>r.width+.02||b.bottom>r.height+.02)throw new Error(`metric mismatch ${JSON.stringify(r)}`)}
 await page.screenshot({path:join(dir,'geometry.png')});writeFileSync(join(dir,'geometry.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{await browser.close()}
