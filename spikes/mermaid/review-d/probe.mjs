// Review D probe: serve each Mermaid example and check mapping, CSP, SRI,
// label size, reflow, timing, toggles, print, no-JS, reference mode, inspector.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '/home/r/Documents/MyStuff/random_ts/visser/node_modules/playwright/index.mjs';

const ROOT = '/home/r/Documents/MyStuff/random_ts/visser';
const examples = (process.argv[2] ?? 'mermaid-flowchart,mermaid-state,mermaid-sequence,mermaid-er').split(',');
const basePort = Number(process.argv[3] ?? 4501);

function serve(doc, port) {
  const out = mkdtempSync(join(tmpdir(), 'rd-out-'));
  const child = spawn(process.execPath, [join(ROOT, 'dist/release/bin/explain.cjs'), 'serve', doc, '--port', String(port), '--dev-toolkit', join(ROOT, 'dist/release'), '--out', out], { cwd: ROOT });
  return new Promise((resolve, reject) => {
    let text = '';
    const timer = setTimeout(() => reject(new Error('serve timeout ' + text)), 60000);
    child.stdout.on('data', (d) => {
      text += d;
      const m = text.match(/serving (\S+)/);
      if (m) { clearTimeout(timer); resolve({ child, url: m[1], out }); }
    });
    child.stderr.on('data', (d) => { text += d; });
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`serve exited ${code}: ${text}`)); });
  });
}

const b = await chromium.launch();
const results = {};
let port = basePort;
for (const ex of examples) {
  const doc = ex.includes('/') ? ex : join(ROOT, 'examples', ex, 'index.md');
  const { child, url } = await serve(doc, port++);
  const r = { url };
  try {
    // Headers per route.
    const origin = new URL(url).origin;
    const page = await fetch(url);
    const html = await page.text();
    r.pageCsp = page.headers.get('content-security-policy');
    const metaCsp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1]?.replace(/&#39;|&apos;/g, "'");
    r.metaCsp = metaCsp;
    const base = url.slice(0, url.lastIndexOf('/') + 1);
    for (const name of ['document.md', 'build.json']) {
      const res = await fetch(base + name);
      r[`csp:${name}`] = res.headers.get('content-security-policy');
    }
    const idx = await fetch(origin + '/');
    r['csp:/'] = idx.headers.get('content-security-policy');
    const assetMatch = html.match(/href="([^"]+)\/reader\.css"/);
    if (assetMatch) {
      const assetBase = new URL(assetMatch[1] + '/', url).href;
      const mj = await fetch(assetBase + 'mermaid.js');
      r.mermaidJs = { status: mj.status, type: mj.headers.get('content-type'), cache: mj.headers.get('cache-control'), csp: mj.headers.get('content-security-policy') };
      if (mj.status === 200) {
        const bytes = Buffer.from(await mj.arrayBuffer());
        const sri = 'sha384-' + createHash('sha384').update(bytes).digest('base64');
        const metaSri = html.match(/name="ex-mermaid" content="([^"]+)"/)?.[1];
        r.sriMatches = sri === metaSri;
      }
    }

    for (const [w, h] of [[1440, 1000], [390, 844], [320, 720]]) {
      const p = await b.newPage({ viewport: { width: w, height: h }, isMobile: w < 900, hasTouch: w < 900 });
      const errors = [];
      p.on('console', (m) => { if (m.type() === 'error' || /Content Security Policy|Refused/.test(m.text())) errors.push(m.text().slice(0, 140)); });
      p.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 140)));
      const off = [];
      await p.route('**/*', (route) => { const u = route.request().url(); if (!u.startsWith(origin)) { off.push(u); return route.abort(); } return route.continue(); });
      const t0 = Date.now();
      await p.goto(url);
      await p.waitForSelector('.ex-mermaid-rendered, .ex-mermaid-notice:not([hidden])', { timeout: 20000 });
      const renderMs = Date.now() - t0;
      // Show the map where the list is first.
      for (const btn of await p.locator('.ex-mermaid button', { hasText: 'Show map' }).all()) if (await btn.isVisible()) await btn.click();
      const m = await p.evaluate(() => {
        const out = { figures: [] };
        for (const fig of document.querySelectorAll('figure.ex-mermaid')) {
          const svg = fig.querySelector('.ex-viewport svg');
          const inst = [...fig.querySelectorAll('[data-ex-mermaid-key]')];
          const missing = inst.filter((i) => {
            const rel = i.getAttribute('data-ex-rel');
            const t = i.getAttribute('data-ex-target');
            const sel = rel ? `[data-ex-mermaid-drawn][data-ex-rel="${CSS.escape(rel)}"]` : `[data-ex-mermaid-drawn][data-ex-target="${CSS.escape(t)}"]`;
            return !svg || !svg.querySelector(sel);
          }).map((i) => i.getAttribute('data-ex-mermaid-key'));
          let minPx = null;
          if (svg) {
            const vb = svg.viewBox.baseVal;
            const rect = svg.getBoundingClientRect();
            const scale = vb && vb.width ? rect.width / vb.width : 1;
            for (const t of svg.querySelectorAll('text, .nodeLabel, .edgeLabel span, foreignObject div, foreignObject span')) {
              if (!t.textContent.trim() || t.getClientRects().length === 0) continue;
              const fs = parseFloat(getComputedStyle(t).fontSize) * scale;
              if (minPx === null || fs < minPx) minPx = +fs.toFixed(1);
            }
          }
          const vp = fig.querySelector('.ex-viewport');
          out.figures.push({
            id: fig.id, type: fig.getAttribute('data-ex-mermaid'), instances: inst.length, missing,
            drawn: svg ? svg.querySelectorAll('[data-ex-mermaid-drawn]').length : 0, minPx,
            vpTabindex: vp?.getAttribute('tabindex'), vpRole: vp?.getAttribute('role'),
            svgLabelledby: svg?.getAttribute('aria-labelledby'),
            sourceVisible: getComputedStyle(fig.querySelector('.ex-mermaid-source')).display !== 'none',
            notice: fig.querySelector('.ex-mermaid-notice')?.hidden === false ? fig.querySelector('.ex-mermaid-notice').textContent : null,
          });
        }
        out.reflow = document.documentElement.scrollWidth <= innerWidth;
        out.scrollWidth = document.documentElement.scrollWidth;
        out.bodyChildren = [...document.body.children].map((c) => c.tagName.toLowerCase() + (c.id ? '#' + c.id : ''));
        return out;
      });
      // Source toggle.
      const toggle = p.locator('.ex-source-toggle').first();
      let toggleInfo = null;
      if (await toggle.count()) {
        await toggle.click();
        toggleInfo = await p.evaluate(() => {
          const t = document.querySelector('.ex-source-toggle');
          const fig = t.closest('figure');
          return { pressed: t.getAttribute('aria-pressed'), text: t.textContent, focus: document.activeElement === t, srcVisible: getComputedStyle(fig.querySelector('.ex-mermaid-source')).display !== 'none' };
        });
        await toggle.click();
      }
      // Print.
      await p.emulateMedia({ media: 'print' });
      const print = await p.evaluate(() => [...document.querySelectorAll('figure.ex-mermaid')].map((f) => ({
        svgVisible: !!f.querySelector('.ex-viewport svg') && getComputedStyle(f.querySelector('.ex-viewport')).display !== 'none',
        srcVisible: getComputedStyle(f.querySelector('.ex-mermaid-source')).display !== 'none',
        listsVisible: f.querySelector('.ex-lists') ? getComputedStyle(f.querySelector('.ex-lists')).display !== 'none' : null,
      })));
      await p.emulateMedia({ media: 'screen' });
      r[`w${w}`] = { renderMs, ...m, toggleInfo, print, errors, off };
      await p.close();
    }

    // Reference mode and inspector on a drawn element (desktop).
    const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
    await p.addInitScript(() => { window.__copied = []; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { window.__copied.push(t); } } }); });
    await p.goto(url);
    await p.waitForSelector('.ex-mermaid-rendered, .ex-mermaid-notice:not([hidden])', { timeout: 20000 });
    const drawnNode = p.locator('[data-ex-mermaid-drawn]').first();
    if (await drawnNode.count()) {
      const expected = await drawnNode.getAttribute('data-ex-target');
      await drawnNode.click({ force: true });
      await p.waitForTimeout(200);
      r.inspector = await p.evaluate(() => ({ asideOpen: !!document.querySelector('aside#ex-inspector:not([hidden]) details[open]'), openId: document.querySelector('aside#ex-inspector details')?.id ?? null }));
      r.inspector.expected = expected;
      await p.keyboard.press('Escape');
      await p.locator('#ex-btn-refmode').click();
      await drawnNode.click({ force: true });
      await p.waitForTimeout(200);
      r.refmode = await p.evaluate(() => ({ panel: document.querySelector('#ex-refpanel')?.textContent?.slice(0, 120) ?? null, selected: document.querySelector('.ex-selected')?.getAttribute('data-ex-target') ?? null }));
      const copyBtn = p.locator('#ex-refpanel').getByRole('button', { name: 'Copy reference', exact: true });
      if (await copyBtn.count()) {
        await copyBtn.click();
        r.refmode.copied = (await p.evaluate(() => window.__copied))[0]?.match(/targetId: "([^"]+)"/)?.[1] ?? null;
      }
      r.refmode.expected = expected;
    }
    await p.close();

    // No-JS.
    const ctx = await b.newContext({ javaScriptEnabled: false });
    const q = await ctx.newPage();
    await q.goto(url);
    r.nojs = await q.evaluate(() => [...document.querySelectorAll('figure.ex-mermaid')].map((f) => ({
      srcVisible: getComputedStyle(f.querySelector('.ex-mermaid-source')).display !== 'none',
      lists: f.querySelectorAll('[data-ex-mermaid-key]').length,
      emptyViewportHidden: getComputedStyle(f.querySelector('.ex-viewport')).display === 'none',
    })));
    await ctx.close();
  } catch (e) {
    r.error = String(e).slice(0, 400);
  } finally {
    child.kill('SIGTERM');
  }
  results[ex] = r;
}
await b.close();
console.log(JSON.stringify(results, null, 1));
