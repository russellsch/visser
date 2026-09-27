import { spawn } from 'node:child_process';
import { chromium } from '/home/r/Documents/MyStuff/random_ts/visser/node_modules/playwright/index.mjs';
const server = spawn(process.execPath, ['serve.mjs', '4703'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 400));
const b = await chromium.launch();
const page = await b.newPage();
const reqs = [];
page.on('request', (r) => reqs.push(r.url()));
await page.goto('http://127.0.0.1:4703/');
await page.waitForFunction(() => window.__ready === true);
// Leftover elements after a failed render.
const leftover = await page.evaluate(async () => {
  const before = document.body.children.length;
  try { await window.mermaid.render('bad1', 'flowchart LR\n a[A] --> {{{'); } catch {}
  return { before, after: document.body.children.length, ids: [...document.body.children].map((e) => e.id || e.tagName).slice(-3) };
});
console.log('leftover after failed render:', JSON.stringify(leftover));
const base = 'flowchart LR\n  a[A] --> b[B]';
const variants = {
  none: base,
  init: '%%{init: {"theme":"dark"}}%%\n' + base,
  initSpaces: '%%{ init : {"theme":"dark"} }%%\n' + base,
  initCase: '%%{INIT: {"theme":"dark"}}%%\n' + base,
  initialize: '%%{initialize: {"theme":"dark"}}%%\n' + base,
  initAfterHeader: 'flowchart LR\n%%{init: {"theme":"dark"}}%%\n  a[A] --> b[B]',
  initLastLine: base + '\n%%{init: {"theme":"dark"}}%%',
  initIndented: '   %%{init: {"theme":"dark"}}%%\n' + base,
  initAfterComment: '%% a comment\n%%{init: {"theme":"dark"}}%%\n' + base,
  initInLabel: 'flowchart LR\n  a["%%{init: {\\"theme\\":\\"dark\\"}}%%"] --> b[B]',
  wrapDirective: '%%{wrap}%%\n' + base,
  front: '---\nconfig:\n  theme: dark\n---\n' + base,
  frontLeadingBlank: '\n---\nconfig:\n  theme: dark\n---\n' + base,
  frontLeadingSpaces: '  ---\nconfig:\n  theme: dark\n---\n' + base,
  frontTitleOnly: '---\ntitle: Hello\n---\n' + base,
  frontCRLF: '---\r\nconfig:\r\n  theme: dark\r\n---\r\n' + base,
  clickHrefExt: base + '\n  click a href "https://evil.example/x" "tip"',
  clickCallbackCall: base + '\n  click a call alert(1)',
  clickEntityJs: base + '\n  click a "javascript&#58;alert(1)"',
  labelAnchor: 'flowchart LR\n  a["<a href=\\"https://evil.example/\\">link</a>"] --> b[B]',
  labelAnchorJs: 'flowchart LR\n  a["<a href=\\"jav&#x61;script:alert(1)\\">x</a>"] --> b[B]',
  accTitle: 'flowchart LR\n  accTitle: Queue flow\n  accDescr: Producer waits\n  a[A] --> b[B]',
};
const out = {};
for (const [k, text] of Object.entries(variants)) {
  out[k] = await page.evaluate(async (t) => {
    const host = document.getElementById('host'); host.innerHTML = '';
    try {
      const { svg } = await window.mermaid.render('v' + Math.random().toString(36).slice(2, 7), t);
      host.innerHTML = svg;
      const rect = host.querySelector('g.node rect, g.node polygon, g.node path');
      const fill = rect ? getComputedStyle(rect).fill : null;
      const anchors = [...host.querySelectorAll('a')].map((a) => a.getAttribute('href') || a.getAttribute('xlink:href'));
      const svgEl = host.querySelector('svg');
      return { fill, anchors, title: svgEl?.querySelector('title')?.textContent ?? null, desc: svgEl?.querySelector('desc')?.textContent ?? null,
        role: svgEl?.getAttribute('role'), aria: svgEl?.getAttribute('aria-roledescription'), labelledby: svgEl?.getAttribute('aria-labelledby') };
    } catch (e) { return { err: String(e).slice(0, 90) }; }
  }, text);
}
console.log(JSON.stringify(out, null, 0).replace(/\},"/g, '},\n"'));
console.log('requests:', reqs.filter((u) => !u.startsWith('http://127.0.0.1:4703')));
await b.close(); server.kill();
