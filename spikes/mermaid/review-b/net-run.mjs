import { spawn } from 'node:child_process';
import { chromium } from '/home/r/Documents/MyStuff/random_ts/visser/node_modules/playwright/index.mjs';
const server = spawn(process.execPath, ['serve.mjs', '4704'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 400));
const b = await chromium.launch();
const page = await b.newPage();
const off = [];
await page.route('**/*', (r) => { const u = r.request().url(); if (!u.startsWith('http://127.0.0.1:4704')) { off.push(u); return r.abort(); } return r.continue(); });
const csp = [];
page.on('console', (m) => { if (/Content Security Policy|Refused/.test(m.text())) csp.push(m.text().slice(0, 120)); });
await page.goto('http://127.0.0.1:4704/');
await page.waitForFunction(() => window.__ready === true);
const cases = {
  labelAnchorSingle: "flowchart LR\n  a[\"<a href='https://evil.example/'>link</a>\"] --> b[B]",
  labelMarkdownLink: 'flowchart LR\n  a["`[docs](https://evil.example/)`"] --> b[B]',
  labelImg: "flowchart LR\n  a[\"<img src='https://evil.example/t.png'>\"] --> b[B]",
  mindmapIcon: 'mindmap\n  root((Root))\n    A\n    ::icon(fa fa-book)\n    B',
  architectureIcons: 'architecture-beta\n  group api(cloud)[API]\n  service db(database)[Database] in api\n  service server(logos:aws-ec2)[Server] in api\n  db:L -- R:server',
  imageNode: 'flowchart TD\n  A@{ img: "https://evil.example/i.png", label: "x", pos: "t", h: 60, constraint: "on" }',
  iconShape: 'flowchart TD\n  A@{ icon: "fa:user", form: "square", label: "User" }',
  katex: 'flowchart LR\n  a["$$x^2$$"] --> b[B]',
};
for (const [k, t] of Object.entries(cases)) {
  const r = await page.evaluate(async (text) => {
    const host = document.getElementById('host'); host.innerHTML = '';
    try { const { svg } = await window.mermaid.render('n' + Math.random().toString(36).slice(2, 7), text); host.innerHTML = svg;
      await new Promise((res) => setTimeout(res, 300));
      return { anchors: [...host.querySelectorAll('a')].map((a) => a.getAttribute('href') || a.getAttribute('xlink:href')), imgs: [...host.querySelectorAll('img,image')].map((i) => i.getAttribute('src') || i.getAttribute('href') || i.getAttribute('xlink:href')) };
    } catch (e) { return { err: String(e).slice(0, 80) }; }
  }, t);
  console.log(k, JSON.stringify(r));
}
console.log('offOrigin requests:', off);
console.log('csp console:', csp.slice(0, 5));
await b.close(); server.kill();
