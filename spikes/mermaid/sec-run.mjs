// State node ids, and security behavior under securityLevel 'strict'.
import { spawn } from 'node:child_process';
import { chromium } from '/home/r/Documents/MyStuff/random_ts/visser/node_modules/playwright/index.mjs';
const server = spawn(process.execPath, ['serve.mjs', '4603'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 400));
const b = await chromium.launch();
const page = await b.newPage();
const dialogs = [];
page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
await page.goto('http://127.0.0.1:4603/inline/');
await page.waitForFunction(() => window.__done === true);
const res = await page.evaluate(async () => {
  const r = {};
  const state = (await window.mermaid.render('s1', window.DIAGRAMS.state)).svg;
  r.stateNodeIds = [...state.matchAll(/<g[^>]*class="node[^"]*"[^>]*id="([^"]+)"/g)].map((m) => m[1]);
  window.__called = false;
  window.pwn = () => { window.__called = true; };
  const cases = {
    clickCallback: 'flowchart LR\n  a[A] --> b[B]\n  click a pwn "tip"',
    clickJsLink: 'flowchart LR\n  a[A] --> b[B]\n  click a "javascript:alert(1)"',
    htmlLabel: 'flowchart LR\n  a["<img src=x onerror=alert(2)><b>bold</b>"] --> b[B]',
    scriptLabel: 'flowchart LR\n  a["<script>alert(3)</script>x"] --> b[B]',
    initDirective: '%%{init: {"securityLevel": "loose", "theme": "dark", "flowchart": {"htmlLabels": true}}}%%\nflowchart LR\n  a[A] --> b[B]\n  click a pwn "tip"',
    frontmatter: '---\nconfig:\n  securityLevel: loose\n  theme: forest\n---\nflowchart LR\n  a[A] --> b[B]\n  click a pwn "tip"',
  };
  for (const [name, text] of Object.entries(cases)) {
    try {
      const { svg, bindFunctions } = await window.mermaid.render(`sec-${name}`, text);
      const host = document.createElement('div');
      host.innerHTML = svg;
      document.body.append(host);
      bindFunctions?.(host);
      const node = host.querySelector('g.node');
      node?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      r[name] = {
        hasOnerror: /onerror/i.test(svg), hasScript: /<script/i.test(svg), hasJsHref: /javascript:/i.test(svg),
        hasBold: /<b>bold<\/b>/.test(svg), anchors: (svg.match(/<a /g) || []).length,
        themeDark: /#1f2020|#333|dark/.test(svg.slice(0, 4000)), themeForest: /#cde498|forest/i.test(svg.slice(0, 4000)),
        calledCallback: window.__called,
      };
      window.__called = false;
    } catch (e) {
      r[name] = { error: String(e).slice(0, 140) };
    }
  }
  return r;
});
res.dialogs = dialogs;
console.log(JSON.stringify(res, null, 1));
await b.close(); server.kill();
