// Phase 2b Mermaid journeys (§9.12, §17.5a). The page is addressed through the
// DOM contract (dom-contract.ts, Mermaid section) and the render keys of
// packages/core/src/mermaid/types.ts.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { parsePacket } from '../../packages/core/src/references/packet.ts';
import { EXAMPLE_PORTS, MERMAID_EXAMPLES, type ExampleName } from './examples.ts';
import { byId, copiedTexts, installClipboardSpy, isNarrow, openSnapshot, showMap, test } from './support.ts';

const root = new URL('../..', import.meta.url).pathname;
const cli = join(root, 'dist/release/bin/explain.cjs');

// The Mermaid figure of each example.
const FIGURE: Record<(typeof MERMAID_EXAMPLES)[number], string> = {
  'mermaid-flowchart': 'cdn_path',
  'mermaid-state': 'pay_lifecycle',
  'mermaid-sequence': 'tok_refresh',
  'mermaid-er': 'bill_schema',
  'mermaid-class': 'queue_classes',
};

const renderArea = (page: Page, figure: string) => page.locator(`[id="m-${figure}"]`);

/** Wait until the runtime has drawn the figure. */
async function waitForDrawing(page: Page, figure: string): Promise<void> {
  await expect(renderArea(page, figure).locator('svg').first()).toBeAttached({ timeout: 20_000 });
}

/** Absolute URL of an example's snapshot page. */
async function snapshotUrl(page: Page, example: ExampleName): Promise<string> {
  const index = `http://127.0.0.1:${EXAMPLE_PORTS[example]}/`;
  const html = await (await page.request.get(index)).text();
  const href = /href="([^"]+)"/.exec(html)?.[1];
  if (!href) throw new Error(`no snapshot link at ${index}`);
  return new URL(href, index).href;
}

function resolveInRepo(example: ExampleName, packetYaml: string) {
  const repo = mkdtempSync(join(tmpdir(), 'explain-mermaid-'));
  mkdirSync(join(repo, '.git'));
  const docDir = join(repo, 'docs/explanations', example);
  mkdirSync(docDir, { recursive: true });
  cpSync(join(root, 'examples', example), docDir, { recursive: true });
  const packetPath = join(repo, 'request.yaml');
  writeFileSync(packetPath, packetYaml);
  return spawnSync(process.execPath, [cli, 'refs', 'resolve', '--packet', packetPath, '--json'], { cwd: repo, encoding: 'utf8' });
}

const desktopOnly = (name: string) => test.skip(name !== 'chromium-1440', 'runs once, on the desktop project');

test.describe('Mermaid rendering and mapping', () => {
  test('@R03 @R04 drawn nodes carry data-ex-target and open their detail', async ({ page, offOrigin: _ }, info) => {
    desktopOnly(info.project.name);
    await openSnapshot(page, '', 'mermaid-flowchart');
    await waitForDrawing(page, 'cdn_path');
    for (const id of ['browser', 'edgecache', 'originapi', 'articledb']) {
      await expect(renderArea(page, 'cdn_path').locator(`[data-ex-target="${id}"]`).first(), id).toBeAttached();
    }
    await renderArea(page, 'cdn_path').locator('[data-ex-target="edgecache"]').first().click();
    await expect(page.locator('aside#ex-inspector details[id="x-edgecache"][open]')).toBeVisible();
  });

  for (const [example, figure, targetId, kind] of [
    ['mermaid-flowchart', 'cdn_path', 'edgecache', 'mermaid-node'],
    ['mermaid-state', 'pay_lifecycle', 'authorized', 'mermaid-state'],
    ['mermaid-sequence', 'tok_refresh', 'tokenservice', 'mermaid-participant'],
  ] as const) {
    test(`@R03 a drawn ${kind} copies a packet that resolves exact`, async ({ page, offOrigin: _ }, info) => {
      desktopOnly(info.project.name);
      await installClipboardSpy(page);
      await openSnapshot(page, '', example);
      await waitForDrawing(page, figure);
      await page.locator('#ex-btn-refmode').click();
      await renderArea(page, figure).locator(`[data-ex-target="${targetId}"]`).first().click();
      const panel = page.locator('#ex-refpanel');
      await expect(panel).toBeVisible();
      await panel.getByRole('button', { name: 'Copy reference', exact: true }).click();
      const [yaml] = await copiedTexts(page);
      const packet = parsePacket(yaml!);
      expect(packet).toMatchObject({ targetId, kind });
      const resolved = resolveInRepo(example, yaml!);
      expect(resolved.status, resolved.stderr).toBe(0);
      expect(JSON.parse(resolved.stdout).status).toBe('exact');
    });
  }

  test('sequence messages map to their own relationships, skipping notes and blocks', async ({ page, offOrigin: _ }, info) => {
    desktopOnly(info.project.name);
    await openSnapshot(page, '', 'mermaid-sequence');
    await waitForDrawing(page, 'tok_refresh');
    const pairs = await page.evaluate(() => {
      const figure = document.getElementById('x-tok_refresh')!;
      const lists = [...figure.querySelectorAll('[data-ex-mermaid-key^="message:"]')];
      const render = document.getElementById('m-tok_refresh')!;
      return lists.map((el) => {
        const key = el.getAttribute('data-ex-mermaid-key')!;
        const k = key.slice('message:'.length);
        const drawn = render.querySelector(`[data-et="message"][data-id="i${k}"]`);
        const drawnRel = drawn?.getAttribute('data-ex-rel') ?? drawn?.closest('[data-ex-rel]')?.getAttribute('data-ex-rel') ?? null;
        return { key, expected: el.getAttribute('data-ex-rel'), drawnRel };
      });
    });
    // getMessages() raw indexes of the six real messages (notes and blocks take the others).
    expect(pairs.map((p) => p.key).sort()).toEqual(['message:1', 'message:12', 'message:2', 'message:5', 'message:7', 'message:9']);
    for (const p of pairs) expect(p.drawnRel, p.key).toBe(p.expected);
  });

  test('the effective label size inside a rendered drawing is at least 14 px @R06', async ({ page, offOrigin: _ }) => {
    for (const example of MERMAID_EXAMPLES) {
      const figure = FIGURE[example];
      await openSnapshot(page, '', example);
      await showMap(page, figure);
      await waitForDrawing(page, figure);
      const min = await page.evaluate((fig) => {
        const svg = document.querySelector(`[id="m-${fig}"] svg`) as SVGSVGElement;
        const vb = svg.viewBox.baseVal.width || svg.getBBox().width;
        const scale = svg.getBoundingClientRect().width / vb;
        const sizes = [...svg.querySelectorAll('text, .nodeLabel, .edgeLabel, .messageText, .actor')]
          .filter((t) => (t.textContent ?? '').trim() !== '')
          .map((t) => parseFloat(getComputedStyle(t).fontSize) * scale)
          .filter((n) => Number.isFinite(n) && n > 0);
        return { count: sizes.length, min: Math.min(...sizes) };
      }, figure);
      // Math.min of nothing is Infinity: require labels to exist first.
      expect(min.count, `${example} has measured labels`).toBeGreaterThan(0);
      expect(min.min, `${example} smallest effective label`).toBeGreaterThanOrEqual(13.95);
    }
  });

  test('sequence message text has a background halo so lifelines do not cross it', async ({ page, offOrigin: _ }) => {
    await openSnapshot(page, '', 'mermaid-sequence');
    await showMap(page, 'tok_refresh');
    await waitForDrawing(page, 'tok_refresh');
    const strokes = await page.locator('[id="m-tok_refresh"] svg .messageText').evaluateAll((els) => els.map((e) => getComputedStyle(e).stroke));
    expect(strokes.length).toBeGreaterThan(0);
    for (const stroke of strokes) expect(stroke).not.toBe('none');
  });

  test('reflow holds at every width for Mermaid pages', async ({ page, offOrigin: _ }, info) => {
    for (const example of MERMAID_EXAMPLES) {
      await openSnapshot(page, '', example);
      // Require a settled figure: drawn, or a visible failure notice. Never skip silently.
      const figure = byId(page, `x-${FIGURE[example]}`);
      await expect(figure.locator('.ex-mermaid-notice:visible, [data-ex-mermaid-render] svg').first()).toBeAttached({ timeout: 20_000 });
      const outcome = (await figure.evaluate((f) => f.classList.contains('ex-mermaid-rendered'))) ? 'rendered' : 'notice';
      info.annotations.push({ type: 'mermaid-outcome', description: `${example}: ${outcome}` });
      const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      expect(scroll, example).toBeLessThanOrEqual(inner);
    }
  });

  test('deep links open a Mermaid node detail before and after rendering', async ({ page, offOrigin: _ }, info) => {
    desktopOnly(info.project.name);
    // Hold mermaid.js until the "before rendering" assertion has run.
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    await page.route('**/mermaid.js', async (route) => { await held; await route.continue(); });
    await openSnapshot(page, '#x-edgecache', 'mermaid-flowchart', 'domcontentloaded');
    await expect(byId(page, 'x-edgecache')).toHaveAttribute('open', '');
    expect(await byId(page, 'x-cdn_path').evaluate((f) => f.classList.contains('ex-mermaid-rendered')), 'not rendered yet').toBe(false);
    release();
    await waitForDrawing(page, 'cdn_path');
    await page.evaluate(() => { location.hash = '#x-articledb'; });
    await expect(byId(page, 'x-articledb')).toHaveAttribute('open', '');
  });

  test('print right after load shows the drawing or the source, never an empty figure', async ({ page, offOrigin: _ }) => {
    await openSnapshot(page, '', 'mermaid-flowchart');
    await page.evaluate(() => dispatchEvent(new Event('beforeprint')));
    await page.emulateMedia({ media: 'print' });
    const figure = byId(page, 'x-cdn_path');
    const drawing = figure.locator('[id="m-cdn_path"] svg');
    const source = figure.locator('pre.ex-mermaid-source');
    const visible = (await drawing.count() > 0 && await drawing.first().isVisible()) || await source.isVisible();
    expect(visible).toBe(true);
  });

  test('axe: no serious or critical violations on a rendered Mermaid page', async ({ page, offOrigin: _ }) => {
    const SERIOUS = new Set(['serious', 'critical']);
    for (const example of ['mermaid-flowchart', 'mermaid-er'] as const) {
      await openSnapshot(page, '', example);
      await showMap(page, FIGURE[example]);
      await waitForDrawing(page, FIGURE[example]);
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      expect(result.violations.filter((v) => SERIOUS.has(v.impact ?? '')).map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`), example).toEqual([]);
    }
  });

  test('the rendered drawing has an accessible name', async ({ page, offOrigin: _ }) => {
    await openSnapshot(page, '', 'mermaid-er');
    await showMap(page, 'bill_schema');
    await waitForDrawing(page, 'bill_schema');
    const name = await page.evaluate(() => {
      const svg = document.querySelector('[id="m-bill_schema"] svg')!;
      const ids = (svg.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean);
      return ids.map((id) => document.getElementById(id)?.textContent?.trim() ?? '').join(' ') || svg.getAttribute('aria-label') || '';
    });
    expect(name).toContain('Lines connect invoices to products');
  });
});

test.describe('Mermaid asset loading and CSP', () => {
  test('mermaid.js loads only on Mermaid pages, same-origin, with integrity', async ({ page, offOrigin: _ }, info) => {
    desktopOnly(info.project.name);
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    await openSnapshot(page, '', 'bounded-queue');
    await page.waitForLoadState('networkidle');
    expect(requests.filter((u) => u.endsWith('/mermaid.js')), 'no Mermaid asset on a page without Mermaid').toEqual([]);
    await expect(page.locator('meta[name="ex-mermaid"]')).toHaveCount(0);

    requests.length = 0;
    await openSnapshot(page, '', 'mermaid-flowchart');
    await waitForDrawing(page, 'cdn_path');
    const loaded = requests.filter((u) => u.endsWith('/mermaid.js'));
    expect(loaded).toHaveLength(1);
    expect(new URL(loaded[0]!).origin).toBe(new URL(page.url()).origin);
    const integrity = await page.locator('script[src$="/mermaid.js"]').getAttribute('integrity');
    expect(integrity ?? '').toMatch(/^sha(256|384|512)-/);
  });

  test('a wrong digest blocks rendering and shows the notice without stray elements', async ({ page, offOrigin: _ }, info) => {
    desktopOnly(info.project.name);
    await page.route('**/mermaid.js', async (route) => {
      const response = await route.fetch();
      const body = (await response.text()) + '\n;/* tampered */\n';
      await route.fulfill({ response, body });
    });
    await openSnapshot(page, '', 'mermaid-flowchart');
    await expect(byId(page, 'x-cdn_path').locator('.ex-mermaid-notice')).toBeVisible({ timeout: 20_000 });
    await expect(renderArea(page, 'cdn_path').locator('svg')).toHaveCount(0);
    await expect(page.locator('svg[aria-roledescription="error"]')).toHaveCount(0);
    // The source stays readable.
    await expect(byId(page, 'x-cdn_path').locator('pre.ex-mermaid-source')).toContainText('flowchart LR');
  });

  test('only Mermaid pages relax style-src; scripts stay self-only', async ({ page, offOrigin: _ }, info) => {
    desktopOnly(info.project.name);
    const styleSrc = (csp: string) => /style-src ([^;]*)/.exec(csp)?.[1] ?? '';
    const scriptSrc = (csp: string) => /script-src ([^;]*)/.exec(csp)?.[1] ?? '';
    for (const [example, relaxed] of [['mermaid-flowchart', true], ['mermaid-er', true], ['bounded-queue', false]] as const) {
      const response = await page.goto(await snapshotUrl(page, example));
      const header = response!.headers()['content-security-policy'] ?? '';
      expect(styleSrc(header).includes("'unsafe-inline'"), `${example} header style-src`).toBe(relaxed);
      expect(scriptSrc(header).trim(), `${example} header script-src`).toBe("'self'");
      const meta = (await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')) ?? '';
      expect(styleSrc(meta).includes("'unsafe-inline'"), `${example} meta style-src`).toBe(relaxed);
    }
  });
});

test.describe('Mermaid without JavaScript', () => {
  test('@nojs the Mermaid source and lists are readable without JavaScript', async ({ page }) => {
    await openSnapshot(page, '', 'mermaid-flowchart');
    await expect(byId(page, 'x-cdn_path').locator('pre.ex-mermaid-source')).toBeVisible();
    await expect(byId(page, 'x-cdn_path').locator('pre.ex-mermaid-source')).toContainText('miss_fetch@-->');
    await expect(renderArea(page, 'cdn_path').locator('svg')).toHaveCount(0);
    // Parsed types keep a list instance for each element.
    await expect(byId(page, 'x-cdn_path').locator('[data-ex-target="edgecache"]').first()).toBeVisible();
  });
});

test('narrow screens show the list first for parsed Mermaid figures @R06', async ({ page, offOrigin: _ }) => {
  test.skip(!isNarrow(page), 'list-first view is the narrow-screen default');
  await openSnapshot(page, '', 'mermaid-state');
  await expect(byId(page, 'x-pay_lifecycle').locator('[data-ex-target="authorized"]:visible').first()).toBeVisible();
});
