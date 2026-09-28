// Fixes from the second authoring run (docs/validation/dogfood-2.md): narrow
// transform views are stage cards with one conversion statement each (Q8,
// §9.6), and a compare cell without a value shows its text before a small link
// (Q5, §9.8).
import { expect } from '@playwright/test';
import { isNarrow, isPrimaryDesktop, openSnapshot, test } from './support.ts';

test.describe('@R06 dogfood-2 reading fixes', () => {
  test('narrow screens: transform stages are cards, and each conversion is one statement', async ({ page, offOrigin: _ }) => {
    test.skip(!isNarrow(page), 'the card view is the narrow-screen view');
    await openSnapshot(page, '', 'image-pipeline');
    const figure = page.locator('[id="x-to_batch"]');
    const stage = figure.locator('.vs-node-list > li').first();
    await expect(stage).toBeVisible();
    const border = await stage.evaluate((n) => parseFloat(getComputedStyle(n).borderTopWidth));
    expect(border).toBeGreaterThan(0);
    const conversion = figure.locator('.vs-rel-list > li').first();
    await expect(conversion).toBeVisible();
    expect(await conversion.evaluate((n) => parseFloat(getComputedStyle(n).borderTopWidth))).toBeGreaterThan(0);
  });

  test('wide screens: a compare cell without a value shows its text first and a small details link', async ({ page, offOrigin: _ }, info) => {
    test.skip(!isPrimaryDesktop(info.project.name), 'runs once, on the desktop project');
    await openSnapshot(page, '', 'queue-designs');
    const links = page.locator('.vs-compare-table a.vs-cell-link');
    expect(await links.count()).toBe(6);
    await expect(page.locator('.vs-compare-table')).not.toContainText('Details');
    const first = links.first();
    await expect(first).toHaveAttribute('aria-label', /.+: .+/);
    const cell = first.locator('xpath=ancestor::td');
    const [linkTop, bodyTop] = await Promise.all([first.evaluate((n) => n.getBoundingClientRect().top), cell.locator('.vs-cell-body').evaluate((n) => n.getBoundingClientRect().top)]);
    expect(linkTop).toBeGreaterThan(bodyTop);
  });
});
