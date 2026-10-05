import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const url = process.argv[2];
if (!url) throw new Error('Pass the local Visser URL');
const out = resolve('docs/validation/sqlite-current');
const browser = await chromium.launch({headless:true});
const results=[];
for (const width of [1440,390]) {
  const context=await browser.newContext({viewport:{width,height:1000}});
  const page=await context.newPage();
  const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  await page.goto(url); await page.waitForSelector('.vs-js');
  await page.screenshot({path:`${out}/page-${width}.png`,fullPage:true});
  const geometry=await page.evaluate(()=>({
    viewport:innerWidth, width:document.documentElement.scrollWidth, height:document.documentElement.scrollHeight,
    figures:[...document.querySelectorAll('figure')].map(f=>({id:f.id,height:f.getBoundingClientRect().height,
      svg:f.querySelector('.vs-viewport svg')?{width:f.querySelector('.vs-viewport svg').getBoundingClientRect().width,height:f.querySelector('.vs-viewport svg').getBoundingClientRect().height}:null,
      viewport:f.querySelector('.vs-viewport')?{client:f.querySelector('.vs-viewport').clientWidth,scroll:f.querySelector('.vs-viewport').scrollWidth}:null})),
    controls:[...document.querySelectorAll('button')].map(e=>({text:e.textContent,label:e.getAttribute('aria-label')})),
  }));
  for (const id of ['x-read_paths','x-two_answers']) {
    const f=page.locator('#'+id); await f.scrollIntoViewIfNeeded();
    await page.screenshot({path:`${out}/${id}-${width}.png`});
  }
  const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
  results.push({width,errors,geometry,axe:axe.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}))});
  await context.close();
}
await writeFile(`${out}/browser-results.json`,JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));
await browser.close();
