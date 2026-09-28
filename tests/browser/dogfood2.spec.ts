// Fixes from the second authoring run (docs/validation/dogfood-2.md): narrow
// transform views are stage cards with one conversion statement each (Q8,
// §9.6), and a compare cell without a value shows its text, with a small link
// only when the inspector holds more (Q5, §9.8, IMPROVEMENTS §4.6).
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

  test('wide screens: a compare cell without a value shows its text, and a one-sentence cell has no details link', async ({ page, offOrigin: _ }, info) => {
    test.skip(!isPrimaryDesktop(info.project.name), 'runs once, on the desktop project');
    await openSnapshot(page, '', 'queue-designs');
    // Each cell with no value holds one sentence, which the table shows in
    // full, so no cell gets the "›" link (docs/IMPROVEMENTS.md §4.6). The
    // cell body is the table instance of the cell (§10.3).
    await expect(page.locator('.vs-compare-table a.vs-cell-link')).toHaveCount(0);
    await expect(page.locator('.vs-compare-table')).not.toContainText('Details');
    const bodies = page.locator('.vs-compare-table .vs-cell-body[data-vs-target]');
    expect(await bodies.count()).toBe(6);
    await expect(bodies.first()).toHaveAttribute('id', /^v-/);
    await expect(bodies.first()).toBeVisible();
  });
});
