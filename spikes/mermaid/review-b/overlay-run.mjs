import { spawn } from 'node:child_process';
import { chromium } from '/home/r/Documents/MyStuff/random_ts/visser/node_modules/playwright/index.mjs';
const server = spawn(process.execPath, ['serve.mjs', '4702'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 400));
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 800, height: 500 } });
await page.goto('http://127.0.0.1:4702/');
await page.waitForFunction(() => window.__ready === true);
const cases = {
  classDefFixed: 'flowchart LR\n  a["SAFE: this design never loses data"] --> b[B]\n  classDef x position:fixed,top:0,left:0,font-size:34px,background:#fff,width:100vw,height:80px,z-index:9\n  class a x',
  classDefTransform: 'flowchart LR\n  a["NO DATA LOSS"] --> b[B]\n  classDef x transform:translate(0px\\,-400px),font-size:40px\n  class a x',
  styleOpacityPage: 'flowchart LR\n  a[A] --> b[B]\n  classDef x position:fixed,inset:0,background:#fff,z-index:99\n  class a x',
};
for (const [k, v] of Object.entries(cases)) {
  const r = await page.evaluate((t) => window.runCase(t), v);
  await page.screenshot({ path: `overlay-${k}.png` });
  const covered = await page.evaluate(() => {
    const c = document.getElementById('caveat').getBoundingClientRect();
    const el = document.elementFromPoint(c.left + 5, c.top + c.height / 2);
    return el ? (el.id || el.tagName + '.' + (el.getAttribute('class') || '')) : null;
  });
  console.log(k, 'err=', r.err && r.err.slice(0, 80), 'fixedEls=', r.fixedEls, 'topElementAtCaveat=', covered);
}
await b.close(); server.kill();
