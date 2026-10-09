// W0 evidence: one relocated file:// HTML, classic data: Worker, strict CSP.
import { build } from '../../node_modules/esbuild/lib/main.js';
import { chromium } from '../../node_modules/playwright/index.mjs';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const here = import.meta.dirname;
const results = join(here, 'results');
mkdirSync(results, { recursive: true });
const built = await build({ entryPoints: [join(here, 'worker-entry.mjs')], bundle: true,
  platform: 'browser', format: 'iife', minify: true, write: false,
  alias: { '#default-font/svg/default.js': join(here, '../math-rendering/node_modules/@mathjax/mathjax-tex-font/mjs/svg/default.js') } });
const workerBytes = built.outputFiles[0].contents;
const workerSource = `try {\n${Buffer.from(workerBytes).toString('utf8')}\n} catch (error) { self.postMessage({id:'startup',ok:false,error:String(error),stack:String(error?.stack ?? '').slice(0,1000)}); }`;
const workerUrl = `data:text/javascript;base64,${Buffer.from(workerSource).toString('base64')}`;
const scheme = process.env.WORKER_SCHEME === 'blob' ? 'blob' : 'data';
const boot = scheme === 'blob'
  ? `window.workerUrl=URL.createObjectURL(new Blob([${JSON.stringify(workerSource)}],{type:'text/javascript'}));window.booted=true;`
  : `window.workerUrl=${JSON.stringify(workerUrl)};window.booted=true;`;
const bootUrl = `data:text/javascript;base64,${Buffer.from(boot).toString('base64')}`;
const temp = mkdtempSync(join(results, 'single-file-'));
const htmlPath = join(temp, 'index.html');
const csp = `default-src 'none'; script-src data:; worker-src ${scheme}:; connect-src 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'`;
const html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><script src="${bootUrl}"></script></head><body><code id="source">\\frac{a}{b}</code><div id="rendered"></div><code id="cancel-source">\\frac{x}{y}</code><div id="cancel-rendered"></div></body></html>`;
writeFileSync(htmlPath, html);
const browser = await chromium.launch({ headless: true });
const report = { node: process.version, browser: browser.version(), scheme, csp,
  workerBytes: workerBytes.length, workerSha256: createHash('sha256').update(workerBytes).digest('hex'),
  htmlBytes: Buffer.byteLength(html), htmlSha256: createHash('sha256').update(html).digest('hex'),
  requestUrls: [], offOrigin: [], pageErrors: [], cspViolations: [], cspViolationCount: 0 };
try {
  const page = await browser.newPage();
  page.on('request', request => report.requestUrls.push(request.url().split(',')[0]));
  page.on('pageerror', error => report.pageErrors.push(error.message));
  await page.route(/https?:/, route => { report.offOrigin.push(route.request().url()); return route.abort(); });
  await page.goto(pathToFileURL(htmlPath).href);
  page.on('console', message => { if (message.type() === 'error') { report.cspViolationCount++;
    if (report.cspViolations.length < 4) report.cspViolations.push(message.text()); } });
  report.booted = await page.evaluate(() => window.booted === true);
  if (scheme === 'data') report.minimalWorker = await page.evaluate(async () => {
    const url = 'data:text/javascript;base64,' + btoa('self.onmessage=()=>self.postMessage("ok")');
    try {
      const worker = new Worker(url);
      const result = await Promise.race([
        new Promise(resolve => { worker.onmessage = e => resolve({ ok: e.data === 'ok' }); worker.onerror = e => resolve({ ok: false, eventType: e.type, error: e.message ?? '' }); worker.postMessage(1); }),
        new Promise(resolve => setTimeout(() => resolve({ ok: false, error: 'timeout' }), 3000)),
      ]);
      worker.terminate(); return result;
    } catch (error) { return { ok: false, error: String(error) }; }
  });
  if (scheme === 'data') report.sizeControls = await page.evaluate(async () => {
    const sizes = [100_000, 1_000_000, 1_550_000, 1_600_000, 1_800_000];
    const outcomes = [];
    for (const size of sizes) {
      const source = '/*' + 'x'.repeat(size) + '*/ self.onmessage=()=>self.postMessage("ok")';
      const url = 'data:text/javascript;base64,' + btoa(source);
      try {
        const worker = new Worker(url);
        const result = await Promise.race([
          new Promise(resolve => { worker.onmessage = e => resolve({ ok: e.data === 'ok' }); worker.onerror = e => resolve({ ok: false, error: e.message ?? '' }); worker.postMessage(1); }),
          new Promise(resolve => setTimeout(() => resolve({ ok: false, error: 'timeout' }), 3000)),
        ]);
        worker.terminate(); outcomes.push({ sourceBytes: source.length, urlBytes: url.length, ...result });
      } catch (error) { outcomes.push({ sourceBytes: source.length, urlBytes: url.length, ok: false, error: String(error) }); }
    }
    return outcomes;
  });
  report.valid = await page.evaluate(async () => {
    const source = document.getElementById('source');
    const rendered = document.getElementById('rendered');
    const worker = new Worker(window.workerUrl); // default classic worker
    const result = await Promise.race([
      new Promise(resolve => { worker.onmessage = e => resolve(e.data); worker.onerror = e => resolve({ ok: false, error: e.message ?? '', eventType: e.type, filename: e.filename ?? '', line: e.lineno ?? 0 });
        worker.postMessage({ id: 'valid', texes: [String.raw`\frac{a}{b}`] }); }),
      new Promise(resolve => setTimeout(() => resolve({ ok: false, error: 'timeout' }), 10000)),
    ]);
    if (result.ok) { rendered.innerHTML = result.outputs[0]; source.hidden = true; }
    worker.terminate();
    return { ok: result.ok, error: result.error, eventType: result.eventType, filename: result.filename, line: result.line, workerMs: result.ms,
      svg: rendered.querySelectorAll('svg').length, sourceHidden: source.hidden,
      sourceText: source.textContent, markupBytes: result.outputs?.[0]?.length,
      renderedNodes: rendered.querySelectorAll('*').length };
  });
  report.cancel = await page.evaluate(async () => {
    const source = document.getElementById('cancel-source');
    const rendered = document.getElementById('cancel-rendered');
    const worker = new Worker(window.workerUrl);
    let started = false, completed = false;
    let startSignal;
    const startPromise = new Promise(resolve => { startSignal = resolve; });
    worker.onmessage = e => { if (e.data.started) { started = true; startSignal(); } else completed = true; };
    worker.postMessage({ id: 'cancel', loop: 1000 });
    await Promise.race([startPromise, new Promise(resolve => setTimeout(resolve, 3000))]);
    await new Promise(resolve => setTimeout(resolve, 50));
    worker.terminate();
    await new Promise(resolve => setTimeout(resolve, 150));
    return { started, completed, sourceVisible: !source.hidden, sourceText: source.textContent,
      renderedNodes: rendered.querySelectorAll('*').length };
  });
  const formulas = [String.raw`\frac{a}{b}`, String.raw`x^{a+b}`, String.raw`\sum_{i=1}^n i`, String.raw`\sqrt{x}`, String.raw`\begin{matrix}a&b\\c&d\end{matrix}`];
  const workloads = { repeated100: Array.from({ length: 100 }, (_, i) => formulas[i % formulas.length]),
    distinct100: Array.from({ length: 100 }, (_, i) => String.raw`\frac{x_{${i}}+1}{y^{${i + 1}}}`) };
  if (scheme === 'blob') {
    workloads.repeated1000 = Array.from({ length: 1000 }, (_, i) => formulas[i % formulas.length]);
    workloads.distinct1000 = Array.from({ length: 1000 }, (_, i) => String.raw`\frac{x_{${i}}+1}{y^{${i + 1}}}`);
  }
  for (const [name, texes] of Object.entries(workloads)) {
    const runs = name.endsWith('1000') ? 3 : 1;
    report[name] = [];
    for (let run = 0; run < runs; run++) report[name].push(await page.evaluate(async texes => {
      const worker = new Worker(window.workerUrl);
      const unique = [...new Set(texes)];
      const start = performance.now();
      const response = await Promise.race([
        new Promise(resolve => { worker.onmessage = e => resolve(e.data); worker.onerror = e => resolve({ ok: false, error: e.message ?? '', eventType: e.type, filename: e.filename ?? '', line: e.lineno ?? 0 });
          worker.postMessage({ id: 'batch', texes: unique }); }),
        new Promise(resolve => setTimeout(() => resolve({ ok: false, error: 'timeout' }), 10000)),
      ]);
      worker.terminate();
      if (!response.ok) return { ok: false, error: response.error, eventType: response.eventType, filename: response.filename, line: response.line, unique: unique.length };
      const byTex = new Map(unique.map((tex, i) => [tex, response.outputs[i]]));
      const conversionMs = performance.now() - start;
      const host = document.createElement('div');
      const insertStart = performance.now();
      for (const tex of texes) { const slot = document.createElement('span'); slot.innerHTML = byTex.get(tex); host.append(slot); }
      const insertionMs = performance.now() - insertStart;
      const encoder = new TextEncoder();
      const bytesByTex = new Map(unique.map(tex => [tex, encoder.encode(byTex.get(tex)).length]));
      const out = { ok: true, occurrences: texes.length, unique: unique.length, conversionMs, workerMs: response.ms,
        insertionMs, expandedBytes: texes.reduce((n, tex) => n + bytesByTex.get(tex), 0),
        expandedNodes: host.querySelectorAll('*').length };
      return out;
    }, texes));
  }
  await page.close();
} finally { await browser.close(); rmSync(temp, { recursive: true, force: true }); }
writeFileSync(join(results, `browser-${scheme}.json`), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
