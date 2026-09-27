// Two Mermaid figures on one page, prefix and digit names, one figure that
// passes the build but fails at render time; plus check/build determinism.
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '/home/r/Documents/MyStuff/random_ts/visser/node_modules/playwright/index.mjs';

const ROOT = '/home/r/Documents/MyStuff/random_ts/visser';
const CLI = join(ROOT, 'dist/release/bin/explain.cjs');
const dir = mkdtempSync(join(tmpdir(), 'rd-doc-'));
mkdirSync(join(dir, '.git'));
const docDir = join(dir, 'docs/explanations/multi');
mkdirSync(docDir, { recursive: true });
const docPath = join(docDir, 'index.md');
const fence = '```';
writeFileSync(docPath, `---
format: explain/1
docId: 1b1b1b1b-2c2c-4d3d-8e4e-5f5f5f5f5f5f
title: Two diagrams on one page
kind: reference
capturedAt: 2026-09-27T00:00:00Z
visibility: private
---

<!-- ex:id intro -->
# Two diagrams on one page

{% mermaid id="first" title="First" question="Does a prefix name map to the right node?" %}
${fence}mermaid
flowchart LR
  Api[Api] --> ApiGateway[Api gateway]
  ApiGateway --> Node2[Node 2]
  Node2 --> node_3[Node three]
${fence}
{% /mermaid %}

{% mermaid id="second" title="Second" question="Do both figures render with their own IDs?" %}
${fence}mermaid
sequenceDiagram
  participant Client
  participant Server
  Client->>Server: ping
  Server-->>Client: pong
${fence}
{% /mermaid %}

{% mermaid id="broken" title="Broken at render" question="Does one failure stay inside its figure?" %}
${fence}mermaid
erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER }|..|{ ??? : broken
${fence}
{% /mermaid %}
`);

const out = {};
function run(args) {
  try {
    return { code: 0, text: execFileSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (e) {
    return { code: e.status, text: String(e.stdout) + String(e.stderr) };
  }
}
out.check = run(['check', docPath, '--json']);
out.check.text = out.check.text.slice(0, 600);

// Determinism: build twice into two output dirs and compare snapshot bytes.
const o1 = mkdtempSync(join(tmpdir(), 'rd-o1-'));
const o2 = mkdtempSync(join(tmpdir(), 'rd-o2-'));
const b1 = run(['build', docPath, '--dev-toolkit', join(ROOT, 'dist/release'), '--out', o1]);
const b2 = run(['build', docPath, '--dev-toolkit', join(ROOT, 'dist/release'), '--out', o2]);
out.builds = [b1.code, b2.code];
function files(root) {
  const acc = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const f = join(d, n); if (statSync(f).isDirectory()) walk(f); else acc.push(f.slice(root.length)); } };
  walk(root);
  return acc.sort();
}
const f1 = files(o1), f2 = files(o2);
out.sameFileList = JSON.stringify(f1) === JSON.stringify(f2);
out.differing = f1.filter((f) => !readFileSync(join(o1, f)).equals(readFileSync(join(o2, f))));

// Serve and inspect.
const port = Number(process.argv[2] ?? 4520);
const child = spawn(process.execPath, [CLI, 'serve', docPath, '--port', String(port), '--dev-toolkit', join(ROOT, 'dist/release'), '--out', mkdtempSync(join(tmpdir(), 'rd-o3-'))], { cwd: dir });
const url = await new Promise((resolve, reject) => {
  let t = '';
  child.stdout.on('data', (d) => { t += d; const m = t.match(/serving (\S+)/); if (m) resolve(m[1]); });
  child.stderr.on('data', (d) => { t += d; });
  child.on('exit', (c) => reject(new Error('serve exit ' + c + t)));
});
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
await p.goto(url);
await p.waitForFunction(() => document.querySelectorAll('.ex-mermaid-rendered, .ex-mermaid-notice:not([hidden])').length >= 3, null, { timeout: 30000 }).catch(() => {});
out.page = await p.evaluate(() => ({
  figures: [...document.querySelectorAll('figure.ex-mermaid')].map((f) => ({
    id: f.id, rendered: f.classList.contains('ex-mermaid-rendered'),
    notice: f.querySelector('.ex-mermaid-notice')?.hidden ? null : f.querySelector('.ex-mermaid-notice')?.textContent,
    svgId: f.querySelector('.ex-viewport svg')?.id ?? null,
    drawnTargets: [...new Set([...f.querySelectorAll('[data-ex-mermaid-drawn]')].map((e) => e.getAttribute('data-ex-target') + (e.getAttribute('data-ex-rel') ? '|' + e.getAttribute('data-ex-rel') : '')))],
    missing: [...f.querySelectorAll('[data-ex-mermaid-key]')].filter((i) => {
      const rel = i.getAttribute('data-ex-rel'); const t = i.getAttribute('data-ex-target');
      const svg = f.querySelector('.ex-viewport svg');
      return !svg || !svg.querySelector(rel ? `[data-ex-mermaid-drawn][data-ex-rel="${CSS.escape(rel)}"]` : `[data-ex-mermaid-drawn][data-ex-target="${CSS.escape(t)}"]`);
    }).map((i) => i.getAttribute('data-ex-mermaid-key')),
  })),
  duplicateIds: (() => { const seen = new Map(); for (const e of document.querySelectorAll('[id]')) seen.set(e.id, (seen.get(e.id) ?? 0) + 1); return [...seen].filter(([, n]) => n > 1).map(([k]) => k); })(),
  bodyChildren: [...document.body.children].map((c) => c.tagName.toLowerCase() + (c.id ? '#' + c.id : '')),
  apiDrawn: [...document.querySelectorAll('[data-ex-target="api"][data-ex-mermaid-drawn]')].map((e) => e.id),
}));
// Long tasks during load.
const q = await b.newPage({ viewport: { width: 1440, height: 1000 } });
await q.addInitScript(() => { window.__long = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true }); });
const t0 = Date.now();
await q.goto(url);
await q.waitForFunction(() => document.querySelectorAll('.ex-mermaid-rendered, .ex-mermaid-notice:not([hidden])').length >= 3, null, { timeout: 30000 }).catch(() => {});
out.loadToRenderedMs = Date.now() - t0;
out.longTasks = await q.evaluate(() => window.__long);
await b.close();
child.kill('SIGTERM');
console.log(JSON.stringify(out, null, 1));
