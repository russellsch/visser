// The `domain` figure (docs/IMPROVEMENTS.md §5.4): on a wide window the
// glossary sits beside the map; on a narrow screen the glossary comes first
// and the map is behind "Show map"; a click on a term whose definition a
// concept owns opens the concept in the inspector, and the bubble is the
// definition's first sentence.
import { expect, type Locator, type Page } from '@playwright/test';
import { byId, openSnapshot, test } from './support.ts';

const FIGURE = 'x-billing_terms';

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error('the element has no box');
  return b;
}

async function open(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await openSnapshot(page, '', 'domain-orders');
  return byId(page, FIGURE);
}

/**
 * The row of map and glossary is centred on the text column, is never wider
 * than the window minus 4rem, and the view bar stays in the column (phase 4
 * review D1, D13). The column is the box of the first paragraph.
 */
async function expectRowOnColumn(page: Page, figure: Locator, width: number) {
  const col = await box(page.locator('#x-claim'));
  const m = await box(figure.locator('.vs-viewport'));
  const g = await box(figure.locator('.vs-glossary-wrap'));
  const left = Math.min(m.x, g.x);
  const right = Math.max(m.x + m.width, g.x + g.width);
  expect(Math.abs((left + right) / 2 - (col.x + col.width / 2))).toBeLessThanOrEqual(2);
  expect(right - left).toBeLessThanOrEqual(width - 64);
  const bar = await box(figure.locator('.vs-view-bar'));
  expect(bar.x).toBeGreaterThanOrEqual(col.x);
  return { m, g };
}

test.describe('@R06 domain glossary layout (IMPROVEMENTS.md §5.4)', () => {
  test('1600 px: the glossary sits beside the map, and "Show as list" adds the relations', async ({ page, offOrigin: _ }, info) => {
    test.skip(info.project.name.includes('nojs') || Boolean(info.project.use.isMobile), 'the wide layout runs on the desktop projects');
    const figure = await open(page, 1600, 1000);
    const map = figure.locator('.vs-viewport');
    const glossary = figure.locator('.vs-glossary');
    await expect(map).toBeVisible();
    await expect(glossary).toBeVisible();
    const { m, g } = await expectRowOnColumn(page, figure, 1600);
    // Beside: the glossary starts right of the map, and the two overlap vertically.
    expect(g.x).toBeGreaterThanOrEqual(m.x + m.width);
    expect(g.y).toBeLessThan(m.y + m.height);
    // The map is left to right: wider than tall (phase 4 review D2).
    expect(m.width).toBeGreaterThan(m.height);
    // Beside the map, the glossary is 30 to 40rem wide.
    expect(g.width).toBeGreaterThanOrEqual(480 - 1);
    expect(g.width).toBeLessThanOrEqual(640 + 1);
    // The term cell names the category (phase 4 review D5).
    await expect(glossary.locator('tbody tr').first().locator('th .vs-role')).toHaveText(' (actor)');
    await expect(glossary.locator('tbody tr')).toHaveCount(4);
    await expect(glossary.locator('tbody tr').first()).toContainText('A customer is a person or a company that places orders and pays invoices.');
    const toggle = figure.locator('.vs-view-toggle');
    await expect(toggle).toHaveText('Show as list');
    await expect(figure.locator('.vs-lists')).toBeHidden();
    await toggle.click();
    await expect(figure.locator('.vs-lists .vs-rel-list li')).toHaveCount(3);
    await expect(figure.locator('.vs-lists')).toBeVisible();
  });

  for (const width of [1440, 1300, 1200]) {
    test(`${width} px: the row is centred on the text column, and the glossary goes under a wide map`, async ({ page, offOrigin: _ }, info) => {
      test.skip(info.project.name.includes('nojs') || Boolean(info.project.use.isMobile), 'the wide layout runs on the desktop projects');
      const figure = await open(page, width, 900);
      const { m, g } = await expectRowOnColumn(page, figure, width);
      expect(g.y).toBeGreaterThanOrEqual(m.y + m.height);
      expect(Math.abs((m.x + m.width / 2) - (g.x + g.width / 2))).toBeLessThanOrEqual(2);
      // Under the map, the glossary is 40rem wide.
      expect(Math.abs(g.width - 640)).toBeLessThanOrEqual(1);
    });
  }

  test('1000 px: the glossary goes under the map', async ({ page, offOrigin: _ }, info) => {
    test.skip(info.project.name.includes('nojs') || Boolean(info.project.use.isMobile), 'the wide layout runs on the desktop projects');
    const figure = await open(page, 1000, 900);
    const { m, g } = await expectRowOnColumn(page, figure, 1000);
    expect(g.y).toBeGreaterThanOrEqual(m.y + m.height);
  });

  test('390 px: the glossary comes first, and "Show map" shows the map', async ({ page, offOrigin: _ }, info) => {
    test.skip(info.project.name.includes('nojs'), 'the view toggle needs JavaScript');
    const figure = await open(page, 390, 844);
    const toggle = figure.locator('.vs-view-toggle');
    await expect(toggle).toHaveText('Show map');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(figure.locator('.vs-viewport')).toBeHidden();
    await expect(figure.locator('.vs-glossary')).toBeVisible();
    await expect(figure.locator('.vs-lists')).toBeVisible();
    // The glossary fits the screen: no sideways scroll of the page.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(figure.locator('.vs-viewport')).toBeVisible();
    const m = await box(figure.locator('.vs-viewport'));
    const g = await box(figure.locator('.vs-glossary'));
    expect(g.y).toBeGreaterThanOrEqual(m.y + m.height);
  });

  test('@nojs without JavaScript the map, the glossary, and the relations all show', async ({ page }) => {
    await openSnapshot(page, '', 'domain-orders');
    const figure = byId(page, FIGURE);
    await expect(figure.locator('.vs-viewport')).toBeVisible();
    await expect(figure.locator('.vs-glossary')).toBeVisible();
    await expect(figure.locator('.vs-lists')).toBeVisible();
    await expect(figure.locator('.vs-view-toggle')).toHaveCount(0);
  });
});

test.describe('terms open their concept (IMPROVEMENTS.md §5.4, §13.4)', () => {
  test('hover shows the definition; a click opens the concept with its relations and where it appears', async ({ page, offOrigin: _ }, info) => {
    test.skip(info.project.name.includes('nojs') || (page.viewportSize()?.width ?? 1440) <= 899, 'hover and the side inspector are the wide-screen view');
    await openSnapshot(page, '', 'domain-orders');
    const term = page.locator('#x-claim a.vs-term[data-vs-term="def_order"]');
    await term.evaluate((n) => n.scrollIntoView({ block: 'center' }));
    await term.hover();
    await expect(page.locator('#vs-tooltip')).toContainText('An order is one request from a customer to buy one or more products.');
    // The bubble shows the glossary sentence, computed once in the build (phase 4 review D6).
    const cell = (await byId(page, FIGURE).locator('tr:has(a[href="#x-c_order"]) td').first().textContent())?.trim();
    await expect(page.locator('#vs-tooltip .vs-tooltip__text')).toHaveText(cell!);
    // The bubble link opens the concept, as a click on the term does (phase 4 review D8).
    await expect(page.locator('#vs-tooltip .vs-tooltip__open')).toHaveText('Open concept');
    await expect(page.locator('#vs-tooltip .vs-tooltip__open')).toHaveAttribute('href', '#x-c_order');
    await term.click();
    const inspector = page.locator('#vs-inspector');
    await expect(inspector).toBeVisible();
    const detail = inspector.locator('details[data-vs-target="c_order"]');
    await expect(detail).toHaveCount(1);
    await expect(detail.locator('.vs-detail-text')).toContainText('An order is open until billing closes it.');
    await expect(detail.locator('.vs-detail-rels li')).toHaveCount(2);
    await expect(detail.locator('.vs-detail-appears')).toContainText('Checkout owns each record');
  });

  test('the bubble link and Enter on a focused term open the concept', async ({ page, offOrigin: _ }, info) => {
    test.skip(info.project.name.includes('nojs') || (page.viewportSize()?.width ?? 1440) <= 899, 'hover and the side inspector are the wide-screen view');
    await openSnapshot(page, '', 'domain-orders');
    const term = page.locator('#x-claim a.vs-term[data-vs-term="def_order"]');
    await term.evaluate((n) => n.scrollIntoView({ block: 'center' }));
    await term.hover();
    const link = page.locator('#vs-tooltip .vs-tooltip__open');
    await expect(link).toBeVisible();
    await link.click();
    const inspector = page.locator('#vs-inspector');
    await expect(inspector.locator('details[data-vs-target="c_order"]')).toHaveCount(1);
    await page.keyboard.press('Escape');
    const other = page.locator('#x-claim a.vs-term[data-vs-term="def_line"]').first();
    await other.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#vs-inspector details[data-vs-target="c_line"]')).toHaveCount(1);
  });

  test('"Read more" in the glossary opens the concept', async ({ page, offOrigin: _ }, info) => {
    test.skip(info.project.name.includes('nojs'), 'the inspector needs JavaScript');
    await openSnapshot(page, '', 'domain-orders');
    const more = byId(page, FIGURE).locator('.vs-glossary-more a[href="#x-c_line"]');
    await more.scrollIntoViewIfNeeded();
    await more.click();
    const host = (page.viewportSize()?.width ?? 1440) <= 899 ? page.locator('#vs-inspector-dialog') : page.locator('#vs-inspector');
    await expect(host.locator('details[data-vs-target="c_line"]')).toHaveCount(1);
  });
});
