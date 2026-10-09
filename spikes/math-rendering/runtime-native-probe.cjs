// Reproduce with Node 24: node --experimental-strip-types spikes/math-rendering/runtime-native-probe.cjs
// Chromium may need the host's ordinary unsandboxed browser permission.
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const esbuild = require('esbuild');
const { chromium } = require('playwright');

const records = [
  { key: 'fraction', tex: '\\frac{a}{b}', display: false },
  { key: 'matrix', tex: '\\begin{matrix}a&b\\\\c&d\\end{matrix}', display: false },
];
const rounded = value => String(Math.round(value * 1000) / 1000);

(async () => {
  const { convertMath } = await import(pathToFileURL(join(__dirname, '../../packages/core/src/math/engine.ts')).href);
  const [runtime, worker] = await Promise.all([
    esbuild.build({ entryPoints: ['packages/runtime/src/math.ts'], bundle: true, platform: 'browser',
      format: 'iife', globalName: 'VSNative', minify: true, write: false }),
    esbuild.build({ entryPoints: ['packages/runtime/src/math-worker.ts'], bundle: true, platform: 'browser',
      format: 'iife', minify: true, write: false }),
  ]);
  const runtimeSource = runtime.outputFiles[0].text;
  const workerSource = worker.outputFiles[0].text;
  const slots = records.map((record, index) => {
    const metric = convertMath(record.tex, false).metrics;
    const baseline = index ? 130 : 80;
    const y = baseline - metric.ascentEm * 14;
    return `<svg data-vs-math-native data-vs-math-key="${record.key}" x="${index ? 90 : 12}" y="${rounded(y)}" width="${rounded(metric.widthEm * 14)}" height="${rounded(metric.heightEm * 14)}" data-baseline="${baseline}" data-depth="${metric.depthEm}"></svg>`;
  });
  const css = 'figure[data-vs-math-figure]:not([data-vs-math-ready]) > svg{display:none}';
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 720 } });
    await page.setContent(`<style>${css}</style><figure data-vs-math-figure><svg width="400" height="220"><g data-vs-target="graph-node">${slots.join('')}</g></svg><ul><li>fraction source</li><li>matrix source</li></ul></figure>`);
    await page.addScriptTag({ content: runtimeSource });
    const status = await page.evaluate(async ({ worker, rows }) => window.VSNative.initializeMath(document, worker, rows),
      { worker: workerSource, rows: records });
    const positive = await page.evaluate(() => {
      const figure = document.querySelector('figure');
      const parent = figure.querySelector('svg');
      const parentTop = parent.getBoundingClientRect().top;
      return {
        ready: figure.hasAttribute('data-vs-math-ready'),
        list: figure.querySelector('ul').textContent,
        slots: Array.from(figure.querySelectorAll('[data-vs-math-native]')).map(slot => {
          const glyph = slot.firstElementChild;
          const origin = slot.getScreenCTM().f;
          const viewportBottom = origin + Number(slot.getAttribute('height'));
          const ink = slot.getBoundingClientRect();
          return {
            key: slot.getAttribute('data-vs-math-key'), glyph: glyph?.localName,
            glyphWidth: glyph?.getAttribute('width'), slotWidth: slot.getAttribute('width'),
            glyphHeight: glyph?.getAttribute('height'), slotHeight: slot.getAttribute('height'),
            baselineErrorPx: Math.abs(viewportBottom - parentTop - Number(slot.getAttribute('data-baseline')) - Number(slot.getAttribute('data-depth')) * 14),
            inkInside: ink.top >= origin - 0.1 && ink.bottom <= viewportBottom + 0.1,
            target: slot.closest('[data-vs-target]')?.getAttribute('data-vs-target'),
            ids: slot.querySelectorAll('[id]').length,
            htmlChildren: slot.querySelectorAll('span,button,foreignObject').length,
          };
        }),
      };
    });
    assert.deepEqual(status, { rendered: 2, failed: 0, skipped: 0 });
    assert.equal(positive.ready, true);
    assert.ok(positive.list.includes('matrix source'));
    for (const slot of positive.slots) {
      assert.equal(slot.glyph, 'svg');
      assert.equal(slot.glyphWidth, slot.slotWidth);
      assert.equal(slot.glyphHeight, slot.slotHeight);
      assert.ok(slot.baselineErrorPx < 0.05);
      assert.equal(slot.inkInside, true);
      assert.equal(slot.target, 'graph-node');
      assert.equal(slot.ids, 0);
      assert.equal(slot.htmlChildren, 0);
    }
    const repeat = await page.evaluate(async ({ worker, rows }) => window.VSNative.initializeMath(document, worker, rows),
      { worker: workerSource, rows: records });
    assert.deepEqual(repeat, { rendered: 0, failed: 0, skipped: 2 });
    await page.setContent(`<style>${css}</style><figure data-vs-math-figure><svg width="400" height="220">${slots[0]}<svg data-vs-math-native data-vs-math-key="bad" width="30" height="20"></svg></svg><ul><li>complete source list</li></ul></figure>`);
    await page.addScriptTag({ content: runtimeSource });
    const failed = await page.evaluate(async ({ worker, rows }) => window.VSNative.initializeMath(document, worker, rows),
      { worker: workerSource, rows: [records[0], { key: 'bad', tex: '\\notacommand{x}', display: false }] });
    const failure = await page.evaluate(() => ({
      ready: document.querySelector('figure').hasAttribute('data-vs-math-ready'),
      drawingDisplay: getComputedStyle(document.querySelector('figure > svg')).display,
      listDisplay: getComputedStyle(document.querySelector('ul')).display,
      list: document.querySelector('ul').textContent,
    }));
    assert.deepEqual(failed, { rendered: 1, failed: 1, skipped: 0 });
    assert.equal(failure.ready, false);
    assert.equal(failure.drawingDisplay, 'none');
    assert.notEqual(failure.listDisplay, 'none');
    assert.equal(failure.list, 'complete source list');
    const report = { browser: browser.version(), runtimeBytes: Buffer.byteLength(runtimeSource),
      workerBytes: Buffer.byteLength(workerSource), status, positive, repeat, failed, failure };
    mkdirSync('reports/math', { recursive: true });
    writeFileSync('reports/math/runtime-native.json', JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
    await page.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
