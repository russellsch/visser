import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
if (!process.argv[2]) throw new Error('Usage: node render.mjs BUILT_OUTPUT_DIRECTORY');
const root=resolve(process.argv[2]);
function files(p){return readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(p,e.name)):[join(p,e.name)]);}
const html=files(root).find(p=>p.endsWith('/index.html'));
const server=createServer((req,res)=>{try{const p=join(root,decodeURIComponent(req.url.split('?')[0]));res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'})[extname(p)]??'application/octet-stream');res.end(readFileSync(p));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true});
const output=join(dirname(fileURLToPath(import.meta.url)), 'renders');mkdirSync(output,{recursive:true});
for(const [name,width,colorScheme,forcedColors] of [['desktop',1440,'light','none'],['dark',1440,'dark','none'],['forced',1440,'light','active'],['mobile',320,'light','none']]){
 const context=await browser.newContext({viewport:{width,height:1000},isMobile:width===320,hasTouch:width===320,colorScheme,forcedColors});const page=await context.newPage();
 await page.goto(`http://127.0.0.1:${server.address().port}${html.slice(root.length)}`);await page.waitForSelector('.vs-js');
 await page.screenshot({path:join(output,`${name}-article.png`),fullPage:true});
 await page.locator('#x-boundary').scrollIntoViewIfNeeded();
 await page.screenshot({path:join(output,`${name}-boundary.png`)});
 if(width===320){await page.locator('#x-resize .vs-viewer-open').click();await page.screenshot({path:join(output,'mobile-viewer.png')});await page.locator('.vs-viewer-parts > summary').click();await page.locator('[id="l-resize.cv_resize"]').click();await page.screenshot({path:join(output,'mobile-sheet.png')});}
 await context.close();
}
await browser.close();await new Promise(r=>server.close(r));console.log(output);
