import { readFileSync } from 'node:fs';
import { chromium } from '/home/r/Documents/MyStuff/random_ts/visser/node_modules/playwright/index.mjs';
const ROOT = '/home/r/Documents/MyStuff/random_ts/visser';
const lib = readFileSync(`${ROOT}/node_modules/mermaid/dist/mermaid.min.js`, 'utf8');
const source = readFileSync(`${ROOT}/examples/mermaid-sequence/index.md`, 'utf8').match(/```mermaid\n([\s\S]*?)```/)[1];
const css = readFileSync(`${ROOT}/dist/release/browser/reader.css`, 'utf8');
const halos = {
  plainHalo: '.ex-mermaid svg .messageText { paint-order: stroke fill; stroke: #fff; stroke-width: 6px; stroke-linejoin: round; }',
  importantHalo: '.ex-mermaid svg .messageText { paint-order: stroke fill !important; stroke: #fff !important; stroke-width: 6px !important; stroke-linejoin: round !important; }',
  none: '',
};
const b = await chromium.launch();
const out = {};
for (const [name, extra] of Object.entries(halos)) {
  const p = await b.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 3 });
  await p.route('http://t.test/**', (r) => { const u = r.request().url();
    if (u.endsWith('/m.js')) return r.fulfill({ body: lib, contentType: 'text/javascript' });
    if (u.endsWith('/r.css')) return r.fulfill({ body: css + '\n' + extra, contentType: 'text/css' });
    return r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><link rel="stylesheet" href="/r.css"></head><body><figure class="ex-figure ex-mermaid"><div id="o"></div></figure><script src="/m.js"></script></body></html>' }); });
  await p.goto('http://t.test/');
  const info = await p.evaluate(async (src) => {
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'default', sequence: { useMaxWidth: false } });
    const { svg } = await mermaid.render('s1', src);
    document.getElementById('o').innerHTML = svg;
    const t = [...document.querySelectorAll('#o .messageText')].find((e) => e.textContent.includes('GET /reports with access token'));
    const cs = getComputedStyle(t);
    const r = t.getBoundingClientRect();
    return { stroke: cs.stroke, strokeWidth: cs.strokeWidth, paintOrder: cs.paintOrder, box: { x: r.x, y: r.y, w: r.width, h: r.height } };
  }, source);
  out[name] = info;
  const bx = info.box;
  await p.screenshot({ path: `seq-zoom-${name}.png`, clip: { x: bx.x + bx.w * 0.55, y: bx.y - 6, width: 90, height: bx.h + 12 } });
  await p.close();
}
await b.close();
console.log(JSON.stringify(out, null, 1));
