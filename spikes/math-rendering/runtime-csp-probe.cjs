// Run with Node 24 from the repository root. Browser launch may require the
// local host's normal unsandboxed Chromium permission.
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const esbuild = require('esbuild');
const { chromium } = require('playwright');

const expressions = [
  { key: 'fraction', tex: '\\frac{a}{b}', display: false },
  { key: 'text-space', tex: '\\left|x\\right| + \\text{cost \\$5}', display: false },
];
const source = '<span id="fraction" data-vs-math-key="fraction"><span class="vs-math-source">$\\frac{a}{b}$</span></span>' +
  '<span id="text-space" data-vs-math-key="text-space"><span class="vs-math-source">$\\left|x\\right| + \\text{cost \\$5}$</span></span>' +
  '<span id="baseline"></span>';

async function bundle(entryPoint, globalName) {
  const output = await esbuild.build({ entryPoints: [entryPoint], bundle: true, platform: 'browser',
    format: 'iife', globalName, write: false, minify: true });
  return output.outputFiles[0].text;
}

async function scenario(browser, runtime, worker, blocked) {
  const csp = `default-src 'none'; script-src 'self'; worker-src ${blocked ? "'none'" : 'blob:'}; style-src 'self'; img-src 'none'; connect-src 'none'; font-src 'none'`;
  const app = `VSProbe.initializeMath(document, ${JSON.stringify(worker)}, ${JSON.stringify(expressions)}).then(result => window.__result = result);`;
  const html = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${csp}"><link rel="stylesheet" href="/style.css"></head><body>${source}<script src="/runtime.js"></script><script src="/app.js"></script></body></html>`;
  const css = 'body{font-size:16px}[data-vs-math-rendered] .vs-math-source{display:none}#baseline{display:inline-block;width:0;height:0;vertical-align:baseline}';
  const server = createServer((request, response) => {
    const pathname = request.url;
    const content = pathname === '/' ? html : pathname === '/runtime.js' ? runtime : pathname === '/app.js' ? app : pathname === '/style.css' ? css : '';
    const type = pathname?.endsWith('.js') ? 'text/javascript' : pathname?.endsWith('.css') ? 'text/css' : 'text/html';
    response.writeHead(200, { 'Content-Type': type, 'Content-Security-Policy': csp });
    response.end(content);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 400 } });
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.addInitScript(() => document.addEventListener('securitypolicyviolation', event => {
      window.__violations = [...(window.__violations ?? []), `${event.violatedDirective}:${event.blockedURI}`];
    }));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.__result !== undefined, { timeout: 10000 });
    const observation = await page.evaluate(() => {
      const fraction = document.querySelector('#fraction');
      const svg = fraction?.querySelector('svg');
      const bounds = svg?.getBoundingClientRect();
      const marker = document.querySelector('#baseline')?.getBoundingClientRect();
      const em = Number.parseFloat(getComputedStyle(document.body).fontSize);
      const depth = svg ? -Number.parseFloat(svg.style.verticalAlign) : null;
      return {
        result: window.__result,
        source: fraction?.querySelector('.vs-math-source')?.textContent,
        sourceDisplay: fraction ? getComputedStyle(fraction.querySelector('.vs-math-source')).display : null,
        hasEmptyPath: !!document.querySelector('#text-space path[d=""]'),
        svgWidthPx: bounds?.width,
        svgHeightPx: bounds?.height,
        widthEm: svg ? Number.parseFloat(svg.getAttribute('width')) : null,
        heightEm: svg ? Number.parseFloat(svg.getAttribute('height')) : null,
        depthEm: depth,
        emPx: em,
        baselineErrorPx: bounds && marker && depth !== null ? Math.abs(bounds.bottom - marker.bottom - depth * em) : null,
        violations: window.__violations ?? [],
      };
    });
    await page.close();
    assert.equal(observation.source, '$\\frac{a}{b}$');
    if (blocked) {
      assert.deepEqual(observation.result, { rendered: 0, failed: 2, skipped: 0 });
      assert.equal(observation.sourceDisplay, 'inline');
      assert.equal(observation.baselineErrorPx, null);
    } else {
      assert.deepEqual(observation.result, { rendered: 2, failed: 0, skipped: 0 });
      assert.equal(observation.sourceDisplay, 'none');
      assert.equal(observation.hasEmptyPath, true);
      assert.equal(observation.violations.length, 0);
      assert.ok(Math.abs(observation.svgWidthPx - observation.widthEm * observation.emPx) < 0.05);
      assert.ok(Math.abs(observation.svgHeightPx - observation.heightEm * observation.emPx) < 0.05);
      assert.ok(observation.baselineErrorPx < 0.05);
      assert.deepEqual(errors, []);
    }
    return { blocked, csp, observation, errors };
  } finally {
    server.close();
  }
}

(async () => {
  const runtime = await bundle('packages/runtime/src/math.ts', 'VSProbe');
  const worker = await bundle('packages/runtime/src/math-worker.ts');
  const browser = await chromium.launch({ headless: true });
  try {
    const results = [await scenario(browser, runtime, worker, false), await scenario(browser, runtime, worker, true)];
    const report = { browser: browser.version(), runtimeBytes: Buffer.byteLength(runtime),
      workerBytes: Buffer.byteLength(worker), results };
    mkdirSync('reports/math', { recursive: true });
    writeFileSync(join('reports/math', 'runtime-csp.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
