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
      await figure.screenshot({path:join(output,`${name}-${f.id}.png`)});
      if(name!=='desktop' && name!=='mobile320') continue;
      if(width<900 && await figure.locator('.vs-viewer-open').count()) {
        await figure.locator('.vs-viewer-open').click();
        const dialog=page.locator('.vs-figure-viewer');
        await dialog.waitFor({state:'visible'});
        if(await dialog.locator('.vs-inspector').count()) throw new Error('First viewer open unexpectedly selected a part');
        await page.screenshot({path:join(output,`${name}-${f.id}-viewer.png`)});
        await dialog.locator('.vs-viewer-parts > summary').click();
        const targets=await dialog.locator('.vs-viewer-parts a[data-vs-depth="explanation"]').evaluateAll(els=>[...new Set(els.map(e=>e.getAttribute('data-vs-target')))]);
        for(const [i,target] of targets.entries()) {
          const link=dialog.locator(`.vs-viewer-parts a[data-vs-target="${target}"]`).first(); await link.click();
          await dialog.locator('.vs-inspector--sheet').waitFor({state:'visible'});
          await page.screenshot({path:join(output,`${name}-${f.id}-detail-${target}.png`)});
          if(i===0)await page.screenshot({path:join(output,`${name}-${f.id}-detail.png`)});
          await dialog.locator('.vs-inspector__close').click();
          interactions.push({figure:f.id,target,host:'mobile sheet',opened:true,closed:true});
        }
        await dialog.getByRole('button',{name:'Back to article',exact:true}).click();
        await page.locator('.vs-figure-viewer').waitFor({state:'detached'});
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
