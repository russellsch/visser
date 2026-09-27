// Shared helpers for browser journeys. Tests address the page only through the
// DOM contract (packages/core/src/compiler/dom-contract.ts), so the same tests
// run against the fixture and against the real `explain serve` snapshot.
import { expect, type Page, test as base } from '@playwright/test';
import { EXAMPLE_PORTS, type ExampleName } from './examples.ts';

/**
 * Open the snapshot page, optionally with a fragment such as `#x-enqueue`.
 * `example` selects one of the served example bundles (tests/browser/examples.ts).
 */
export async function openSnapshot(page: Page, hash = '', example: ExampleName = 'bounded-queue'): Promise<void> {
  await page.goto(example === 'bounded-queue' ? '/' : `http://127.0.0.1:${EXAMPLE_PORTS[example]}/`);
  // Every server answers `/` with an index that links to exactly one snapshot.
  const href = await page.locator('a').first().getAttribute('href');
  if (!href) throw new Error('index page has no snapshot link');
  await page.goto(new URL(href, page.url()).href + hash);
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
    const served = new Set([origin, ...Object.values(EXAMPLE_PORTS).map((p) => `http://127.0.0.1:${p}`)]);
    await page.route('**/*', (route) => {
      const request = route.request();
      const url = request.url();
      if (url.startsWith('data:')) return route.continue();
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
    expect(offOrigin, 'requests that left the origin').toEqual([]);
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
