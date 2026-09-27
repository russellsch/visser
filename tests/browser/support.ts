// Shared helpers for browser journeys. Tests address the page only through the
// DOM contract (packages/core/src/compiler/dom-contract.ts), so the same tests
// run against the fixture and against the real `explain serve` snapshot.
import { readFileSync } from 'node:fs';
import { expect, type Page, test as base } from '@playwright/test';
import { EXAMPLE_PORTS, type ExampleName } from './examples.ts';

/**
 * The exported static site (§13.5, R10): tests/browser/export-site.mjs writes
 * it, and tests/browser/static-server.mjs serves it under a project prefix, as
 * GitHub Pages does. Projects with `metadata.site === 'export'` read it.
 */
export const EXPORT_PORT = 4340;
export const EXPORT_PREFIX = '/explain-demo/';
export const EXPORT_ORIGIN = `http://127.0.0.1:${EXPORT_PORT}`;
const exportMap = new URL('../../reports/export-site/map.json', import.meta.url);

/** True if the running project reads the exported static site. */
export function isExportSite(): boolean {
  return base.info().project.metadata?.['site'] === 'export';
}

/** The desktop project that runs once-only tests: one for `serve`, one for the export. */
export const isPrimaryDesktop = (name: string) => name === 'chromium-1440' || name === 'export-journeys-1440';

/** Absolute URL of an exported page, by example name or `public`. */
export function exportedUrl(name: ExampleName | 'public'): string {
  const map = JSON.parse(readFileSync(exportMap, 'utf8')) as Record<string, string>;
  const path = map[name];
  if (!path) throw new Error(`reports/export-site/map.json has no page for ${name}`);
  return `${EXPORT_ORIGIN}${EXPORT_PREFIX}${path}`;
}

/** Absolute URL of an example's snapshot page, in the served or the exported site. */
export async function snapshotUrl(page: Page, example: ExampleName): Promise<string> {
  if (isExportSite()) return exportedUrl(example);
  const index = `http://127.0.0.1:${EXAMPLE_PORTS[example]}/`;
  const html = await (await page.request.get(index)).text();
  const href = /href="([^"]+)"/.exec(html)?.[1];
  if (!href) throw new Error(`no snapshot link at ${index}`);
  return new URL(href, index).href;
}

/**
 * Open the snapshot page, optionally with a fragment such as `#x-enqueue`.
 * `example` selects one of the served example bundles (tests/browser/examples.ts).
 */
export async function openSnapshot(page: Page, hash = '', example: ExampleName = 'bounded-queue', waitUntil: 'load' | 'domcontentloaded' = 'load'): Promise<void> {
  if (isExportSite()) {
    await page.goto(exportedUrl(example) + hash, { waitUntil });
    return;
  }
  await page.goto(example === 'bounded-queue' ? '/' : `http://127.0.0.1:${EXAMPLE_PORTS[example]}/`);
  // Every server answers `/` with an index that links to exactly one snapshot.
  const href = await page.locator('a').first().getAttribute('href');
  if (!href) throw new Error('index page has no snapshot link');
  // A held mermaid.js delays the load event, so such tests wait for DOMContentLoaded.
  await page.goto(new URL(href, page.url()).href + hash, { waitUntil });
}

/** Locator for an element by its exact id (IDs contain dots, e.g. `v-handoff.enqueue`). */
export const byId = (page: Page, id: string) => page.locator(`[id="${id}"]`);

/**
 * Abort every request that leaves the page origin and record it (§18.8 network
 * denial, browser part). Tests assert `offOrigin` is empty.
 */
export const test = base.extend<{ offOrigin: string[] }>({
  offOrigin: async ({ page, baseURL }, use) => {
    const origin = new URL(baseURL ?? 'http://127.0.0.1').origin;
    const offOrigin: string[] = [];
    const served = new Set([origin, EXPORT_ORIGIN, ...Object.values(EXAMPLE_PORTS).map((p) => `http://127.0.0.1:${p}`)]);
    const exportSite = isExportSite();
    // On the exported site, every request must stay under the project prefix,
    // and the meta CSP must not block anything the page needs.
    const cspErrors: string[] = [];
    if (exportSite) {
      page.on('console', (message) => {
        if (/Content Security Policy|Refused to/i.test(message.text())) cspErrors.push(message.text());
      });
    }
    await page.route('**/*', (route) => {
      const request = route.request();
      const url = request.url();
      if (url.startsWith('data:')) return route.continue();
      if (exportSite && !(new URL(url).origin === EXPORT_ORIGIN && new URL(url).pathname.startsWith(EXPORT_PREFIX))) {
        offOrigin.push(url);
        return route.abort();
      }
      const target = new URL(url).origin;
      // Navigation may open any served example; every other request must stay
      // on the origin of the page that makes it.
      if (request.isNavigationRequest() && served.has(target)) return route.continue();
      const frameUrl = request.frame().url();
      const pageOrigin = frameUrl.startsWith('http') ? new URL(frameUrl).origin : origin;
      if (target === pageOrigin) return route.continue();
      offOrigin.push(url);
      return route.abort();
    });
    await use(offOrigin);
    expect(offOrigin, 'requests that left the origin (or, on the exported site, the project prefix)').toEqual([]);
    expect(cspErrors, 'CSP errors on the exported site').toEqual([]);
  },
});

/** Replace the clipboard with a spy that records written text (§18.4 success path). */
export async function installClipboardSpy(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __copied: string[] };
    w.__copied = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text: string) => { w.__copied.push(text); } },
    });
  });
}

/** Make clipboard writes fail, or remove the API entirely (§18.4 denial path). */
export async function denyClipboard(page: Page, mode: 'reject' | 'absent'): Promise<void> {
  await page.addInitScript((m) => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: m === 'absent' ? undefined : { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) },
    });
  }, mode);
}

export async function copiedTexts(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __copied: string[] }).__copied);
}

export const isNarrow = (page: Page) => (page.viewportSize()?.width ?? 1440) <= 899;

/**
 * On narrow screens a figure shows its list first (§9.3); tests that use the
 * SVG map switch the figure to its map view first.
 */
export async function showMap(page: Page, figureId: string): Promise<void> {
  const toggle = page.locator(`[id="x-${figureId}"] .ex-view-toggle`);
  if ((await toggle.count()) > 0 && (await toggle.isVisible()) && (await toggle.getAttribute('aria-pressed')) !== 'true') {
    await toggle.click();
  }
}
