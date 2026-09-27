// Render Mermaid sources in Chromium with the toolkit config and report what came out.
import { readFileSync } from 'node:fs';
import { chromium } from '/home/r/Documents/MyStuff/random_ts/visser/node_modules/playwright/index.mjs';
import { checkMermaidSource } from '/home/r/Documents/MyStuff/random_ts/visser/packages/core/src/mermaid/rules.ts';
import { mermaidConfig } from '/home/r/Documents/MyStuff/random_ts/visser/packages/runtime/src/mermaid.ts';

const lib = readFileSync('/home/r/Documents/MyStuff/random_ts/visser/node_modules/mermaid/dist/mermaid.min.js', 'utf8');

export async function runCases(cases) {
  const b = await chromium.launch();
  const out = [];
  for (const [name, src] of Object.entries(cases)) {
    const issues = checkMermaidSource(src);
    const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
    const off = [];
    const dialogs = [];
    p.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
    await p.route('**/*', (r) => {
      const u = r.request().url();
      if (u === 'http://t.test/m.js') return r.fulfill({ body: lib, contentType: 'text/javascript' });
      if (u === 'http://t.test/') return r.fulfill({ contentType: 'text/html', body: '<!doctype html><body><p id="caveat" style="color:rgb(1,2,3)">CAVEAT</p><div id="o"></div><script src="/m.js"></script></body>' });
      off.push(u);
      return r.abort();
    });
    await p.goto('http://t.test/');
    const res = await p.evaluate(async ([src, cfg]) => {
      mermaid.initialize(cfg);
      const o = document.getElementById('o');
      let err = null;
      try { const { svg } = await mermaid.render('d1', src); o.innerHTML = svg; } catch (e) { err = String(e).slice(0, 120); }
      await new Promise((r) => setTimeout(r, 150));
      const svg = o.querySelector('svg');
      const all = svg ? [...svg.querySelectorAll('*')] : [];
      const anchors = all.filter((e) => e.localName === 'a').map((a) => a.getAttribute('href') || a.getAttribute('xlink:href') || '(no href)');
      const imgs = all.filter((e) => e.localName === 'img' || e.localName === 'image').map((i) => i.getAttribute('src') || i.getAttribute('href') || i.getAttribute('xlink:href'));
      const onAttrs = all.flatMap((e) => [...e.attributes].filter((a) => /^on/i.test(a.name)).map((a) => `${e.localName}.${a.name}`));
      const scripts = all.filter((e) => e.localName === 'script').length;
      const cav = getComputedStyle(document.getElementById('caveat'));
      const caveat = `${cav.display}/${cav.visibility}/${cav.color}`;
      const labels = all.filter((e) => /nodeLabel|label|messageText|noteText/.test(e.getAttribute('class') || '')).map((e) => e.textContent).filter(Boolean).slice(0, 4);
      const fill = svg?.querySelector('.node rect, .node polygon, rect.actor, .basic.label-container')?.getAttribute('style') || '';
      const styleText = [...(svg?.querySelectorAll('style') ?? [])].map((s) => s.textContent).join('').slice(0, 0);
      return { err, anchors, imgs, onAttrs, scripts, caveat, labels, fill: fill.slice(0, 60) };
    }, [src, cfg()]);
    out.push({ name, accepted: issues.length === 0, issues: issues.map((i) => i.message.slice(0, 50)), ...res, off, dialogs });
    await p.close();
  }
  await b.close();
  return out;
}
function cfg() { return mermaidConfig(); }
