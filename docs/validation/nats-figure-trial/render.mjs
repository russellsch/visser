import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, extname, sep } from 'node:path';

const [buildArg, outputArg] = process.argv.slice(2);
if (!buildArg || !outputArg) throw new Error('Usage: node render.mjs BUILD_DIRECTORY OUTPUT_DIRECTORY');
const root = resolve(buildArg), output = resolve(outputArg);
mkdirSync(output, { recursive: true });
const files = p => readdirSync(p, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(p,e.name)) : [join(p,e.name)]);
const html = files(root).find(p => p.includes(`${sep}d${sep}`) && p.endsWith('/index.html'));
if (!html) throw new Error('No snapshot found');
const server = createServer((req,res) => {
  try {
    const p = resolve(root, '.' + decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if (!p.startsWith(root + sep)) throw new Error('Outside root');
    res.setHeader('Content-Type', ({'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json'})[extname(p)] ?? 'application/octet-stream');
    res.end(readFileSync(p));
  } catch { res.statusCode=404; res.end(); }
});
await new Promise(r => server.listen(0,'127.0.0.1',r));
let browser;
const report=[];
try {
  browser=await chromium.launch({headless:true});
  const origin=`http://127.0.0.1:${server.address().port}`;
  for (const [name,width,colorScheme,forcedColors] of [['desktop',1440,'light','none'],['mobile390',390,'light','none'],['mobile320',320,'light','none'],['dark',1440,'dark','none'],['forced',1440,'light','active']]) {
    const context=await browser.newContext({viewport:{width,height:1000},isMobile:width<900,hasTouch:width<900,colorScheme,forcedColors});
    const page=await context.newPage(); const errors=[]; const interactions=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    await page.goto(origin+html.slice(root.length)); await page.waitForSelector('.vs-js');
    await page.screenshot({path:join(output,`${name}-top.png`)});
    await page.screenshot({path:join(output,`${name}-article.png`),fullPage:true});
    const figures=await page.locator('main .vs-figure').evaluateAll(els=>els.map(e=>({id:e.id,title:e.getAttribute('aria-label'),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})));
    if(name==='desktop') {
      const extract=await page.locator('#vs-doc').evaluate(main=>Array.from(main.children).filter(e=>e.id!=='vs-appendix'&&!e.matches('.vs-snapshot')).map(e=>`[${e.id || e.tagName}]\n${e.innerText || ''}${e.querySelector('svg')?'\n[Visible drawing labels; use the screenshot for relationships]\n'+Array.from(e.querySelectorAll('svg text')).map(t=>t.textContent).join('\n'):''}`).join('\n\n'));
      writeFileSync(join(output,'main-path.txt'),extract+'\n');
      writeFileSync(join(output,'depth.json'),JSON.stringify(await page.locator('#vs-appendix .vs-detail:not(.vs-kind-source)').evaluateAll(els=>els.map(e=>({id:e.id,label:e.getAttribute('data-vs-label'),text:e.querySelector('.vs-detail-text')?.textContent ?? (e.classList.contains('vs-kind-detail')?e.querySelector('.vs-detail-body')?.textContent:undefined)})).filter(e=>e.text?.trim())),null,2));
    }
    for(const heading of await page.locator('#vs-doc > .vs-block:has(h2)').all()) {
      const id=await heading.getAttribute('id');
      await heading.evaluate(el=>window.scrollTo(0,el.getBoundingClientRect().top+window.scrollY-60));
      await page.screenshot({path:join(output,`${name}-${id}-section.png`)});
    }
    for(const f of figures) {
      const figure=page.locator(`[id="${f.id}"]`);
      // Desktop drawing viewports intentionally extend beyond the prose column.
      // Capture that viewport; the section screenshots retain adjacent context.
      const drawing=figure.locator('.vs-viewport');
      await (await drawing.count()?drawing:figure).screenshot({path:join(output,`${name}-${f.id}.png`)});
      if(name!=='desktop' && name!=='mobile320') continue;
      if(width<900 && await figure.locator('.vs-viewer-open').count()) {
        const articleBox=await figure.locator('.vs-viewport svg').getAttribute('viewBox');
        await figure.locator('.vs-viewport').tap({position:{x:60,y:40}});
        const dialog=page.locator('.vs-figure-viewer');
        await dialog.waitFor({state:'visible'});
        if(await dialog.locator('.vs-inspector').count()) throw new Error('First viewer open unexpectedly selected a part');
        const hint=await dialog.locator('.vs-viewer-hint').boundingBox();
        if(!hint || hint.y<0 || hint.y+hint.height>1000)throw new Error('Gesture hint is outside initial viewport');
        await page.screenshot({path:join(output,`${name}-${f.id}-viewer.png`)});
        const svg=dialog.locator('.vs-viewport svg');
        const initial=await svg.getAttribute('viewBox');
        const bounds=await svg.boundingBox();
        if(!bounds)throw new Error('Missing viewer SVG bounds');
        const cx=bounds.x+bounds.width/2, cy=bounds.y+bounds.height/2;
        const cdp=await context.newCDPSession(page);
        const touch=(id,x,y)=>({id,x,y,radiusX:2,radiusY:2,force:1});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch(0,cx,cy)]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[touch(0,cx+35,cy+25)]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        const panned=await svg.getAttribute('viewBox');
        if(panned===initial)throw new Error('Touch pan did not change view');
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch(0,cx-30,cy),touch(1,cx+30,cy)]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[touch(0,cx-60,cy),touch(1,cx+60,cy)]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
        if(Number((await svg.getAttribute('viewBox')).split(' ')[2])>=Number(panned.split(' ')[2]))throw new Error('Pinch did not zoom');
        if(await dialog.locator('.vs-inspector').count())throw new Error('Gesture selected a part');
        await cdp.detach();
        interactions.push({figure:f.id,host:'mobile viewer',firstTapUnselected:true,pan:true,pinch:true});
        // Let the viewer's intentional post-gesture ghost-click guard expire.
        await page.waitForTimeout(600);
        await dialog.locator('.vs-viewer-parts > summary').click();
        const targets=await dialog.locator('.vs-viewer-parts a[data-vs-depth="explanation"]').evaluateAll(els=>[...new Set(els.map(e=>e.getAttribute('data-vs-target')))]);
        for(const [i,target] of targets.entries()) {
          const link=dialog.locator(`.vs-viewer-parts a[data-vs-target="${target}"]`).first();
          if(!await link.isVisible()) {
            await page.screenshot({path:join(output,`${name}-${f.id}-hidden-link.png`)});
            writeFileSync(join(output,'hidden-link.json'),JSON.stringify(await link.evaluate(el=>{const a=[];for(let n=el;n;n=n.parentElement)a.push({tag:n.tagName,cls:n.className,open:n.open,hidden:n.hidden,display:getComputedStyle(n).display,visibility:getComputedStyle(n).visibility});return a}),null,2));
            throw new Error(`Viewer text link hidden: ${target}`);
          }
          await link.click();
          await dialog.locator('.vs-inspector--sheet').waitFor({state:'visible'});
          await page.screenshot({path:join(output,`${name}-${f.id}-detail-${target}.png`)});
          if(i===0)await page.screenshot({path:join(output,`${name}-${f.id}-detail.png`)});
          await dialog.locator('.vs-inspector__close').click();
          interactions.push({figure:f.id,target,host:'mobile sheet',opened:true,closed:true});
        }
        await dialog.getByRole('button',{name:'Back to article',exact:true}).click();
        await page.locator('.vs-figure-viewer').waitFor({state:'detached'});
        if(await figure.locator('.vs-viewport svg').getAttribute('viewBox')!==articleBox)throw new Error('Article viewBox changed after viewer close');
      } else if(width>=900) {
        const targets=await figure.locator('[data-vs-depth="explanation"][data-vs-interactive]').filter({visible:true}).evaluateAll(els=>[...new Set(els.map(e=>e.getAttribute('data-vs-target')))]);
        for(const [i,target] of targets.entries()) {
          const part=figure.locator(`[data-vs-target="${target}"][data-vs-interactive]`).filter({visible:true}).first(); await part.click();
          await page.locator('.vs-inspector--local').waitFor({state:'visible'});
          await page.locator('.vs-inspector--local').screenshot({path:join(output,`${name}-${f.id}-detail-${target}.png`)});
          if(i===0)await page.locator('.vs-inspector--local').screenshot({path:join(output,`${name}-${f.id}-detail.png`)});
          await page.locator('.vs-inspector__close').click();
          interactions.push({figure:f.id,target,host:'desktop local',opened:true,closed:true});
        }
      }
    }
    report.push({name,width,figures,errors,interactions,documentWidth:await page.evaluate(()=>document.documentElement.scrollWidth)});
    await context.close();
  }
  writeFileSync(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({output,contexts:report.length,errors:report.flatMap(r=>r.errors)}));
} finally { if(browser)await browser.close(); await new Promise(r=>server.close(r)); }
