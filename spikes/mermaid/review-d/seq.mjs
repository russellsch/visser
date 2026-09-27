// Sequence label/lifeline overlap: render the example source with config and CSS variants.
import { readFileSync } from 'node:fs';
import { chromium } from '/home/r/Documents/MyStuff/random_ts/visser/node_modules/playwright/index.mjs';

const ROOT = '/home/r/Documents/MyStuff/random_ts/visser';
const lib = readFileSync(`${ROOT}/node_modules/mermaid/dist/mermaid.min.js`, 'utf8');
const doc = readFileSync(`${ROOT}/examples/mermaid-sequence/index.md`, 'utf8');
const source = doc.match(/```mermaid\n([\s\S]*?)```/)[1];
const css = readFileSync(`${ROOT}/dist/release/browser/reader.css`, 'utf8');

const base = { startOnLoad: false, securityLevel: 'strict', theme: 'default', sequence: { useMaxWidth: false } };
const variants = {
  default: { config: base },
  messageAlignLeft: { config: { ...base, sequence: { useMaxWidth: false, messageAlign: 'left' } } },
  wrap: { config: { ...base, sequence: { useMaxWidth: false, wrap: true } } },
  actorMargin120: { config: { ...base, sequence: { useMaxWidth: false, actorMargin: 120 } } },
  halo: { config: base, extraCss: '.ex-mermaid svg .messageText, .ex-mermaid svg .loopText, .ex-mermaid svg .labelText { paint-order: stroke fill; stroke: #fff; stroke-width: 6px; stroke-linejoin: round; }' },
  haloAlignLeft: { config: { ...base, sequence: { useMaxWidth: false, messageAlign: 'left' } }, extraCss: '.ex-mermaid svg .messageText { paint-order: stroke fill; stroke: #fff; stroke-width: 6px; stroke-linejoin: round; }' },
};

const b = await chromium.launch();
const out = {};
for (const [name, v] of Object.entries(variants)) {
  const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
  await p.route('http://t.test/**', (r) => {
    const u = r.request().url();
    if (u.endsWith('/m.js')) return r.fulfill({ body: lib, contentType: 'text/javascript' });
    if (u.endsWith('/r.css')) return r.fulfill({ body: css + '\n' + (v.extraCss ?? ''), contentType: 'text/css' });
    return r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><link rel="stylesheet" href="/r.css"></head><body><figure class="ex-figure ex-mermaid"><div id="o"></div></figure><script src="/m.js"></script></body></html>' });
  });
  await p.goto('http://t.test/');
  const res = await p.evaluate(async ([src, config]) => {
    mermaid.initialize(config);
    const { svg } = await mermaid.render('s1', src);
    document.getElementById('o').innerHTML = svg;
    const el = document.querySelector('#o svg');
    // Overlap: message text boxes intersecting any lifeline x within the text's vertical span.
    const lines = [...el.querySelectorAll('line.actor-line, line[class*="actor-line"]')].map((l) => l.getBoundingClientRect());
    const texts = [...el.querySelectorAll('.messageText')];
    let overlaps = 0; const hit = [];
    for (const t of texts) {
      const r = t.getBoundingClientRect();
      for (const l of lines) {
        if (l.left > r.left + 2 && l.left < r.right - 2 && l.top < r.bottom && l.bottom > r.top) { overlaps++; hit.push(t.textContent.trim()); }
      }
    }
    const order = [...el.querySelectorAll('line.actor-line, .messageText')].map((n) => n.tagName);
    const firstText = order.indexOf('text');
    const lastLine = order.lastIndexOf('line');
    return { overlaps, hit: [...new Set(hit)], textAfterLines: firstText > lastLine, width: Math.round(el.getBoundingClientRect().width), minFont: Math.min(...texts.map((t) => parseFloat(getComputedStyle(t).fontSize))) };
  }, [source, v.config]);
  await p.locator('#o svg').screenshot({ path: `${ROOT}/spikes/mermaid/review-d/seq-${name}.png` });
  out[name] = res;
  await p.close();
}
await b.close();
console.log(JSON.stringify(out, null, 1));
