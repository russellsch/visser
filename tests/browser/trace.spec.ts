// Trace figure (§9.4; P2 and P9 of docs/validation/dogfood-1.md): lifelines and
// event rows on wide screens; the actor-grouped list on narrow screens and
// without JavaScript; relationship list numbers stay on their line.
import { expect } from '@playwright/test';
import { parsePacket } from '../../packages/core/src/references/packet.ts';
import { byId, copiedTexts, installClipboardSpy, isNarrow, isPrimaryDesktop, openSnapshot, showMap, test } from './support.ts';

const TRACE = 'full_queue_trace';

async function eventIds(page: import('@playwright/test').Page): Promise<string[]> {
  return page.locator(`[id="x-${TRACE}"] .vs-trace-events [data-vs-target][id^="l-${TRACE}."]`).evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-vs-target')!))]);
}

test.describe('@R06 trace figure', () => {
  test('wide screens: an SVG instance for every event; clicking one opens its inspector', async ({ page, offOrigin: _ }) => {
    test.skip(isNarrow(page), 'the lifeline figure is the wide-screen view');
    await openSnapshot(page);
    const svg = page.locator(`[id="x-${TRACE}"] .vs-viewport svg`);
    await expect(svg).toBeVisible();
    const ids = await eventIds(page);
    expect(ids.length).toBeGreaterThan(1);
    for (const id of ids) await expect(byId(page, `v-${TRACE}.${id}`)).toHaveCount(1);
    const first = byId(page, `v-${TRACE}.${ids[0]}`);
    await first.scrollIntoViewIfNeeded();
    await first.locator('text').click();
    const aside = page.locator('aside#vs-inspector');
    await expect(aside).toBeVisible();
    await expect(aside.locator(`[id="x-${ids[0]}"]`)).toBeVisible();
    // Exactly one generated scale statement.
    await expect(page.locator(`[id="x-${TRACE}"] .vs-trace-scale`)).toHaveCount(1);
  });

  test('wide screens: reference mode on an SVG event copies a packet for that event', async ({ page, offOrigin: _ }, info) => {
    test.skip(!isPrimaryDesktop(info.project.name), 'runs once, on the desktop project');
    await installClipboardSpy(page);
    await openSnapshot(page);
    const [id] = await eventIds(page);
    await page.locator('#vs-btn-refmode').click();
    const box = byId(page, `v-${TRACE}.${id}`);
    await box.scrollIntoViewIfNeeded();
    await box.locator('text').click();
    const panel = page.locator('#vs-refpanel');
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: 'Copy reference', exact: true }).click();
    const [yaml] = await copiedTexts(page);
    expect(parsePacket(yaml!).targetId).toBe(id);
  });

  test('narrow screens: the actor cards show first, and the page never scrolls sideways', async ({ page, offOrigin: _ }) => {
    test.skip(!isNarrow(page), 'the list-first view is the narrow-screen default');
    await openSnapshot(page);
    const figure = byId(page, `x-${TRACE}`);
    await figure.scrollIntoViewIfNeeded();
    await expect(figure.locator('.vs-trace-by-actor')).toBeVisible();
    await expect(figure.locator('.vs-viewport')).toBeHidden();
    const sideways = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await sideways()).toBe(0);
    await showMap(page, TRACE);
    await expect(figure.locator('.vs-viewport svg')).toBeVisible();
    expect(await sideways()).toBe(0);
  });

  test('narrow screens: a relationship list number and its kind label stay on the link line', async ({ page, offOrigin: _ }) => {
    test.skip(!isNarrow(page), 'the wrapping problem occurs on narrow screens');
    await openSnapshot(page);
    const items = page.locator('[id="x-handoff"] .vs-rel-list li');
    await items.first().scrollIntoViewIfNeeded();
    const gaps = await items.evaluateAll((lis) => lis.map((li) => {
      const link = li.querySelector('a')!;
      const kind = li.querySelector('.vs-rel-kind')!;
      const lines = [...link.getClientRects()];
      const first = lines[0]!;
      const last = lines[lines.length - 1]!;
      const liTop = li.getBoundingClientRect().top;
      const k = kind.getBoundingClientRect();
      return {
        // The list number is drawn on the li's first line box; the link's first line must start there.
        firstLine: Math.abs((first.top + first.bottom) / 2 - (liTop + parseFloat(getComputedStyle(li).lineHeight) / 2)),
        // The kind label follows the link's last line, on the same line.
        kindLine: Math.abs((k.top + k.bottom) / 2 - (last.top + last.bottom) / 2),
      };
    }));
    for (const g of gaps) {
      expect(g.firstLine).toBeLessThan(6);
      expect(g.kindLine).toBeLessThan(6);
    }
  });

  test('@nojs without JavaScript the figure and the event list are readable', async ({ page, offOrigin: _ }) => {
    await openSnapshot(page);
    const figure = byId(page, `x-${TRACE}`);
    await expect(figure.locator('.vs-viewport svg')).toBeVisible();
    await expect(figure.locator('.vs-trace-events')).toBeVisible();
  });
});
