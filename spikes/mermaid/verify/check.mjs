import { readFileSync } from 'node:fs';
import { chromium } from '/home/r/Documents/MyStuff/random_ts/visser/node_modules/playwright/index.mjs';
const lib = readFileSync(new URL('../node_modules/mermaid/dist/mermaid.min.js', import.meta.url), 'utf8');
const b = await chromium.launch();
async function run(width, useMaxWidth, src) {
  const p = await b.newPage({ viewport: { width, height: 800 } });
  await p.route('http://t.test/**', (r) => r.request().url().endsWith('/m.js')
    ? r.fulfill({ body: lib, contentType: 'text/javascript' })
    : r.fulfill({ body: '<!doctype html><body><div id="o" style="width:100%"></div><script src="/m.js"></script></body>', contentType: 'text/html' }));
  await p.route('https://**', (r) => r.abort());
  await p.goto('http://t.test/');
  const out = await p.evaluate(async ([src, useMaxWidth]) => {
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', flowchart: { useMaxWidth } });
    const { svg } = await mermaid.render('d1', src);
    const o = document.getElementById('o'); o.innerHTML = svg;
    const el = o.querySelector('svg');
    const vb = el.viewBox.baseVal.width, w = el.getBoundingClientRect().width;
    const fs = Math.min(...[...o.querySelectorAll('.nodeLabel, text')].map((t) => parseFloat(getComputedStyle(t).fontSize)).filter(Boolean));
    return { anchors: [...o.querySelectorAll('a')].map((a) => a.getAttribute('href') || a.getAttribute('xlink:href')), imgs: [...o.querySelectorAll('img')].map((i) => i.getAttribute('src')), effectiveMinPx: +(fs * w / vb).toFixed(1) };
  }, [src, useMaxWidth]);
  await p.close();
  return out;
}
const wide = 'flowchart LR\n' + Array.from({ length: 8 }, (_, i) => `  n${i}[Stage ${i} label] --> n${i + 1}[Stage ${i + 1} label]`).join('\n');
console.log('label anchor:', JSON.stringify(await run(1000, true, "flowchart LR\n  a[\"<a href='https://evil.example/'>link</a>\"] --> b[B]")));
console.log('label img:', JSON.stringify(await run(1000, true, "flowchart LR\n  a[\"<img src='https://evil.example/t.png'>\"] --> b[B]")));
console.log('wide @320 useMaxWidth=true:', JSON.stringify(await run(320, true, wide)));
console.log('wide @320 useMaxWidth=false:', JSON.stringify(await run(320, false, wide)));
await b.close();
