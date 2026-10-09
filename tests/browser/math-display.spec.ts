import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
// @ts-expect-error jsdom is supplied by the test harness without declarations.
import { JSDOM } from 'jsdom';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { compileDocument } from '../../packages/core/src/compiler/compile.ts';

let markup: string;
let inlineMarkup: string;
let runtimeSource: string;
let workerSource: string;
let rows: Array<{ key: string; tex: string; display: boolean }>;
const tex = 'x_{' + 'abcdefghijklmnopqrstuvwxyz'.repeat(6) + '}';
const css = readFileSync('packages/runtime/src/reader.css', 'utf8');

test.beforeAll(async () => {
  const directory = mkdtempSync(join(tmpdir(), 'visser-display-scroll-'));
  try {
    const frontmatter = readFileSync('examples/bounded-queue/index.md', 'utf8').split('---')[1];
    const path = join(directory, 'index.md');
    writeFileSync(path, `---${frontmatter}---\n\n<!-- vs:id long_equation -->\n$$\n${tex}\n$$\n\n<!-- vs:id inline_equation -->\n$\\frac{x}{y}+${tex}$\n`);
    const result = await compileDocument(loadBundle(path), {
      version: '0.0.0', sha256: 'a'.repeat(64), assets: { 'math.js': 'b'.repeat(64) },
    }, { audience: 'private', includeSource: false, layoutFallback: false });
    const html = new TextDecoder().decode(result.files.find(file => file.path.endsWith('/index.html'))!.bytes);
    const document = new JSDOM(html).window.document;
    markup = document.querySelector('#x-long_equation').outerHTML;
    inlineMarkup = document.querySelector('#x-inline_equation .vs-math').outerHTML;
    rows = JSON.parse(document.querySelector('meta[name="vs-math-expressions"]').getAttribute('content'));
  } finally { rmSync(directory, { recursive: true, force: true }); }
  const [runtime, worker] = await Promise.all([
    build({ entryPoints: ['packages/runtime/src/math.ts'], bundle: true, platform: 'browser', format: 'iife', globalName: 'VSDisplay', write: false }),
    build({ entryPoints: ['packages/runtime/src/math-worker.ts'], bundle: true, platform: 'browser', format: 'iife', write: false }),
  ]);
  runtimeSource = runtime.outputFiles[0]!.text;
  workerSource = worker.outputFiles[0]!.text;
});

test('wide inline math scrolls locally without changing scale or baseline @M02 @M04', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.setContent(`<meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><p><span id="baseline" style="display:inline-block;width:0;height:0"></span>${inlineMarkup}</p><p><a id="linked" href="#baseline">${inlineMarkup} ${inlineMarkup}</a></p><div id="negative" tabindex="-1">${inlineMarkup}</div>`);
  await page.addScriptTag({ content: runtimeSource });
  await page.evaluate(async ({ worker, expressions }) =>
    (window as any).VSDisplay.initializeMath(document, worker, expressions), { worker: workerSource, expressions: rows });
  const visual = page.locator('.vs-math-visual').first();
  await expect(visual).toHaveAttribute('tabindex', '0');
  await expect(visual).not.toHaveAttribute('aria-hidden', 'true');
  const geometry = () => visual.evaluate(node => {
    const svg = node.querySelector('svg')!;
    const baseline = document.querySelector('#baseline')!.getBoundingClientRect().top;
    return { width: svg.getBoundingClientRect().width, overflow: node.scrollWidth - node.clientWidth,
      error: Math.abs(svg.getBoundingClientRect().bottom + parseFloat(getComputedStyle(svg).verticalAlign) - baseline),
      page: document.documentElement.scrollWidth };
  });
  const before = await geometry();
  expect(before.page).toBeLessThanOrEqual(320);
  expect(before.overflow).toBeGreaterThan(0);
  expect(before.error).toBeLessThan(1);
  await visual.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => visual.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
  const linked = page.locator('#linked');
  for (const item of await linked.locator('.vs-math-visual').all()) await expect(item).not.toHaveAttribute('tabindex', '0');
  await expect(page.locator('#negative .vs-math-visual')).toHaveAttribute('tabindex', '0');
  await linked.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => linked.locator('.vs-math-visual').first().evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
  for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowRight');
  expect(await linked.locator('.vs-math-visual').last().evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
  for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowLeft');
  expect(await linked.locator('.vs-math-visual').evaluateAll(nodes => nodes.map(node => node.scrollLeft))).toEqual([0, 0]);
  for (const state of ['ready', 'copied', 'unavailable']) {
    await page.locator('[data-vs-math-copy]').evaluateAll((buttons, value) => buttons.forEach(button => button.setAttribute('data-vs-copy-state', value)), state);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  }
  await visual.focus();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(async () => (await geometry()).width).toBeCloseTo(before.width, 1);
  expect((await geometry()).error).toBeLessThan(1);
  await expect(visual).toBeFocused();
  await expect(visual).not.toHaveAttribute('aria-hidden', 'true');
  await linked.focus();
  await expect(visual).not.toHaveAttribute('tabindex', '0');
});

test('long display equations retain scale and allow keyboard scrolling @M04', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.setContent(`<meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><main>${markup}</main>`);
  await page.addScriptTag({ content: runtimeSource });
  const result = await page.evaluate(async ({ worker, expressions }) =>
    (window as any).VSDisplay.initializeMath(document, worker, expressions), { worker: workerSource, expressions: rows });
  expect(result).toEqual({ rendered: 1, failed: 0, skipped: 0 });
  const display = page.locator('.vs-math-display');
  await expect(display).toHaveAttribute('tabindex', '0');
  await expect(display).toHaveAttribute('aria-label', /scroll horizontally/);
  const before = await display.evaluate(node => {
    const svg = node.querySelector('.vs-math-visual svg')!;
    return { width: svg.getBoundingClientRect().width, client: node.clientWidth, scroll: node.scrollWidth,
      bodyWidth: document.documentElement.scrollWidth, viewport: innerWidth };
  });
  expect(before.scroll).toBeGreaterThan(before.client);
  expect(before.width).toBeGreaterThan(before.client);
  expect(before.bodyWidth).toBeLessThanOrEqual(before.viewport);
  await display.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => display.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
  expect(await display.locator('.vs-math-source').textContent()).toBe(`$$\n${tex}\n$$`);
  await page.setViewportSize({ width: 1024, height: 720 });
  const afterWidth = await display.locator('.vs-math-visual svg').evaluate(node => node.getBoundingClientRect().width);
  expect(afterWidth).toBeCloseTo(before.width, 1);
});

// Native overflow must respond to a finger gesture, not only scrollLeft writes.
test('wide equations scroll in both directions with touch dragging @M04', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.setContent(`<meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><main>${markup}</main>`);
  await page.addScriptTag({ content: runtimeSource });
  await page.evaluate(async ({ worker, expressions }) =>
    (window as any).VSDisplay.initializeMath(document, worker, expressions), { worker: workerSource, expressions: rows });
  const display = page.locator('.vs-math-display');
  const box = (await display.boundingBox())!;
  const session = await page.context().newCDPSession(page);
  const drag = async (from: number, to: number) => {
    const point = (x: number) => ({ x, y: box.y + box.height / 2, id: 1 });
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(from)] });
    for (let step = 1; step <= 10; step++) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(from + (to - from) * step / 10)] });
      await page.waitForTimeout(20);
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  try {
    await drag(box.x + box.width * 0.8, box.x + box.width * 0.2);
    await expect.poll(() => display.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
    const afterLeftDrag = await display.evaluate(node => node.scrollLeft);
    await drag(box.x + box.width * 0.2, box.x + box.width * 0.8);
    await expect.poll(() => display.evaluate(node => node.scrollLeft)).toBeLessThan(afterLeftDrag);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  } finally { await session.detach(); }
});
