// @BUDGETS timing for §2.3 (reported, never gated). Runs only with
// VISSER_BROWSER_BUDGETS=1, which scripts/check-budgets.mjs sets together
// with VISSER_BUDGET_URL (the served reference fixture) and
// VISSER_BUDGET_RESULT (where this spec writes its numbers).
//
// Initial usable page: a fresh context at 390 by 844 with the cache disabled,
// CDP network throttling (150 ms latency, 1.6 Mbit/s down, 750 kbit/s up) and
// CPU throttling 4x. "Usable" is the first moment when the main prose has
// text, the first figure has an SVG, and reader.js has run (the `vs-js` class
// on <html>). Time is performance.now() in the page, from navigation start.
// The Mermaid render time is reported too; it depends on the 1.6 MB gzip
// mermaid.js asset, which §2.3 keeps outside the core budget.
//
// Interaction latency: at 1440 by 1000 with the page loaded and no
// throttling, the time from a click on an SVG instance to the next animation
// frame in which the inspector shows that target's open details element.
import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const url = process.env['VISSER_BUDGET_URL'] ?? '';
const resultPath = process.env['VISSER_BUDGET_RESULT'] ?? '';
const RUNS = Number(process.env['VISSER_BUDGET_RUNS'] ?? 5);
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const round = (x: number) => Math.round(x * 10) / 10;

test.describe.configure({ mode: 'serial' });
test.setTimeout(600_000);

const results: Record<string, unknown> = {};

test.afterAll(() => {
  if (resultPath) writeFileSync(resultPath, JSON.stringify(results, null, 2) + '\n');
});

test('@BUDGETS initial usable page under a throttled mobile profile (median of 5)', async ({ browser }) => {
  expect(url, 'VISSER_BUDGET_URL is set').not.toBe('');
  results['chromium'] = browser.version();
  const usable: number[] = [];
  const mermaid: (number | null)[] = [];
  let encoding: string | undefined;
  for (let i = 0; i < RUNS; i++) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    page.on('response', (r) => { if (r.url().endsWith('/reader.js')) encoding = r.headers()['content-encoding'] ?? 'identity'; });
    await page.goto(url, { waitUntil: 'commit' });
    const ready = await page.waitForFunction(() => {
      const prose = document.querySelector('main p');
      const svg = document.querySelector('figure svg');
      return document.documentElement.classList.contains('vs-js') && prose && (prose.textContent ?? '').trim().length > 0 && svg ? performance.now() : false;
    }, undefined, { polling: 'raf', timeout: 120_000 });
    usable.push(Number(await ready.jsonValue()));
    let rendered: number | null = null;
    try {
      const done = await page.waitForFunction(() => (document.querySelector('.vs-mermaid-rendered') ? performance.now() : false), undefined, { polling: 100, timeout: 120_000 });
      rendered = Number(await done.jsonValue());
    } catch {
      rendered = null;
    }
    mermaid.push(rendered);
    await context.close();
  }
  results['initialUsable'] = { runs: usable.map(round), median: round(median(usable)), profile: '390x844 mobile, 150 ms latency, 1.6 Mbit/s down, 750 kbit/s up, CPU 4x, cache disabled', readerJsEncoding: encoding };
  const done = mermaid.filter((m): m is number => m !== null);
  results['mermaidRendered'] = { runs: mermaid.map((m) => (m === null ? null : round(m))), median: done.length ? round(median(done)) : null, note: 'same runs; the first Mermaid figure has class vs-mermaid-rendered' };
});

test('@BUDGETS inspector latency after a click (median of 5 per target)', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.classList.contains('vs-js'));
  const targets = ['fig_arch.n_0', 'fig_arch.e_5', 'fig_state.tr_3', 'fig_cause.f_4', 'fig_plan.tk_6'];
  const perTarget: Record<string, number[]> = {};
  const all: number[] = [];
  for (const target of targets) {
    const [figure, id] = target.split('.') as [string, string];
    perTarget[target] = [];
    for (let i = 0; i < RUNS; i++) {
      const ms = await page.evaluate(async ([fig, tid]) => {
        const el = document.getElementById(`v-${fig}.${tid}`);
        if (!el) throw new Error(`no SVG instance v-${fig}.${tid}`);
        el.scrollIntoView({ block: 'center' });
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        const t0 = performance.now();
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        return await new Promise<number>((resolve, reject) => {
          const deadline = t0 + 5000;
          const check = () => {
            const d = document.querySelector<HTMLElement>(`aside#vs-inspector details[id="x-${tid}"][open]`);
            if (d && d.getClientRects().length > 0) resolve(performance.now() - t0);
            else if (performance.now() > deadline) reject(new Error(`inspector did not show x-${tid}`));
            else requestAnimationFrame(check);
          };
          requestAnimationFrame(check);
        });
      }, [figure, id] as const);
      perTarget[target]!.push(round(ms));
      all.push(ms);
      await page.keyboard.press('Escape');
      await expect(page.locator(`aside#vs-inspector details[id="x-${id}"][open]`)).toHaveCount(0);
    }
  }
  results['inspectorLatency'] = { perTarget, median: round(median(all)), note: '1440x1000, no throttling, click to the next animation frame with the details element shown' };
  await context.close();
});
