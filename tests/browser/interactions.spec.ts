// Figure interactions (docs/IMPROVEMENTS.md §14.9): collapsible groups, the
// cross-figure highlight, and the filter chips. The fold and filter tests
// read tests/fixtures/interactions, which this spec serves itself: two
// collapsed groups and one edge between them. The cross-figure highlight
// reads the map and the trace of the order-intake example.
import { expect, type Page } from '@playwright/test';
import { byId, isNarrow, openSnapshot, test } from './support.ts';
import { serveFixture, type InlineServer } from './inline.ts';

const FIXTURE = 'tests/fixtures/interactions/index.md';
const MAP = 'map';

let server: InlineServer | undefined;
let origin = '';

test.beforeAll(async () => {
  server = await serveFixture(FIXTURE);
  origin = new URL(server.url).origin;
});

test.afterAll(() => {
  server?.close();
});

/** Open the fixture snapshot, with the map in view. */
async function openFixture(page: Page): Promise<void> {
  await page.goto(`${origin}/`);
  const href = await page.locator('a').first().getAttribute('href');
  if (!href) throw new Error('the fixture index has no snapshot link');
  await page.goto(new URL(href, page.url()).href);
}

const svgId = (id: string) => `v-${MAP}.${id}`;
const fold = (page: Page, group: string) => page.locator(`[id="x-${MAP}"] [data-vs-fold="${group}"]`);
const foldToggle = (page: Page, group: string) => page.locator(`[id="x-${MAP}"] [data-vs-fold-toggle="${group}"]`);

test.describe('collapsible groups (IMPROVEMENTS.md §14.9)', () => {
  test('a collapsed group starts folded, and edges attach to the fold box', async ({ page }) => {
    test.skip(isNarrow(page), 'touch entry opens the viewer; viewer group interaction is covered by its focused spec');
    await openFixture(page);
    await expect(fold(page, 'g_orders')).toBeVisible();
    await expect(fold(page, 'g_orders')).toHaveText('Order service · 2');
    await expect(fold(page, 'g_billing')).toBeVisible();
    for (const id of ['n_api', 'n_store', 'n_bill', 'n_ledger', 'e_save', 'e_post', 'e_invoice', 'e_submit']) {
      await expect(byId(page, svgId(id)), id).toBeHidden();
    }
    // A folded group keeps its boundary, dashed and with no label; the fold
    // box is at its centre (phase 6b review F14).
    for (const g of ['g_orders', 'g_billing']) {
      const boundary = byId(page, svgId(g));
      await expect(boundary, g).toBeVisible();
      await expect(boundary).toHaveClass(/vs-folded/);
      await expect(boundary).toHaveAttribute('aria-hidden', 'true');
      await expect(boundary).toHaveAttribute('tabindex', '-1');
      expect(await boundary.locator('rect:not(.vs-selection-outline):not(.vs-focus-outline)').evaluate((r) => getComputedStyle(r).strokeDasharray)).not.toBe('none');
      await expect(boundary.locator('.vs-group-label')).toBeHidden();
      const area = (await boundary.boundingBox())!;
      const box = (await fold(page, g).locator('.vs-fold-shape').boundingBox())!;
      expect(Math.abs(area.x + area.width / 2 - (box.x + box.width / 2))).toBeLessThan(2);
      expect(Math.abs(area.y + area.height / 2 - (box.y + box.height / 2))).toBeLessThan(2);
    }
    await expect(byId(page, svgId('n_client'))).toBeVisible();
    await expect(byId(page, svgId('e_invoice~g_orders~g_billing'))).toBeVisible();
    await expect(byId(page, svgId('e_submit~-~g_orders'))).toBeVisible();
    await expect(page.locator(`[id="x-${MAP}"] [data-vs-proxy-for]:visible`)).toHaveCount(2);
  });

  test('Locate remains available for an inspected target hidden by a fold', async ({ page }, info) => {
    test.skip(info.project.name.includes('nojs') || isNarrow(page), 'the persistent inspector and hidden list instance are the wide interactive path');
    await openFixture(page);
    await byId(page, 'l-map.n_api').evaluate((node) => (node as HTMLElement).click());
    const inspector = page.locator('aside#vs-inspector');
    const locate = inspector.getByRole('button', { name: 'Locate in figure' });
    await expect(locate).toBeVisible();
    await locate.click();
    await expect(fold(page, 'g_orders')).toBeHidden();
    await expect(byId(page, svgId('n_api'))).toBeVisible();
    await expect(byId(page, svgId('n_api'))).toBeFocused();
  });

  test('a click unfolds a group in place, and "Fold" folds it again', async ({ page }) => {
    test.skip(isNarrow(page), 'touch entry opens the viewer; viewer group interaction is covered by its focused spec');
    await openFixture(page);
    await fold(page, 'g_orders').click();
    await expect(fold(page, 'g_orders')).toBeHidden();
    for (const id of ['n_api', 'n_store', 'g_orders', 'e_save', 'e_submit']) await expect(byId(page, svgId(id)), id).toBeVisible();
    // The edge to the other folded group now runs from Order API to the billing fold box.
    await expect(byId(page, svgId('e_invoice~-~g_billing'))).toBeVisible();
    await expect(byId(page, svgId('e_invoice~g_orders~g_billing'))).toBeHidden();
    await expect(foldToggle(page, 'g_orders')).toBeVisible();
    await expect(foldToggle(page, 'g_orders')).toBeFocused();
    // The unfolded group has its label and a solid boundary again.
    await expect(byId(page, svgId('g_orders'))).not.toHaveClass(/vs-folded/);
    await expect(byId(page, svgId('g_orders')).locator('.vs-group-label')).toBeVisible();
    // After a mouse click the Fold control has no focus ring (phase 6b review F8).
    expect(await foldToggle(page, 'g_orders').evaluate((n) => getComputedStyle(n).outlineStyle)).toBe('none');
    await foldToggle(page, 'g_orders').click();
    await expect(fold(page, 'g_orders')).toBeVisible();
    await expect(fold(page, 'g_orders')).toBeFocused();
    await expect(byId(page, svgId('n_api'))).toBeHidden();
    await expect(byId(page, svgId('e_invoice~g_orders~g_billing'))).toBeVisible();
  });

  test('the fold box and the Fold control are buttons for the keyboard', async ({ page }) => {
    test.skip(isNarrow(page), 'touch entry opens the viewer; viewer group interaction is covered by its focused spec');
    await openFixture(page);
    const box = fold(page, 'g_billing');
    await expect(box).toHaveAttribute('role', 'button');
    await box.focus();
    await page.keyboard.press('Enter');
    await expect(byId(page, svgId('n_bill'))).toBeVisible();
    await expect(foldToggle(page, 'g_billing')).toBeFocused();
    // A keyboard move shows the focus ring.
    expect(await foldToggle(page, 'g_billing').evaluate((n) => getComputedStyle(n).outlineStyle)).not.toBe('none');
    await page.keyboard.press(' ');
    await expect(byId(page, svgId('n_bill'))).toBeHidden();
    await expect(box).toBeFocused();
    // With both groups unfolded, the authored route shows and no proxy does.
    await page.keyboard.press('Enter');
    await fold(page, 'g_orders').focus();
    await page.keyboard.press('Enter');
    await expect(byId(page, svgId('e_invoice'))).toBeVisible();
    await expect(page.locator(`[id="x-${MAP}"] [data-vs-proxy-for]:visible`)).toHaveCount(0);
  });

  test('the text lists do not change', async ({ page }) => {
    await openFixture(page);
    const lists = page.locator(`[id="x-${MAP}"] .vs-lists`);
    await expect(lists.locator('.vs-node-list > li')).toHaveCount(7);
    await expect(lists.locator('.vs-rel-list > li')).toHaveCount(4);
    await expect(lists.locator('.vs-rel-quantity')).toHaveText(' (40 req/s)');
  });

  test('@nojs without JavaScript every group is unfolded, and no fold box shows', async ({ page }) => {
    await openFixture(page);
    await expect(page.locator(`[id="x-${MAP}"] .vs-fold`)).toHaveCount(2);
    await expect(page.locator(`[id="x-${MAP}"] .vs-fold:visible, [id="x-${MAP}"] .vs-fold-toggle:visible, [id="x-${MAP}"] [data-vs-proxy-for]:visible`)).toHaveCount(0);
    for (const id of ['n_api', 'n_store', 'n_bill', 'n_ledger', 'e_invoice', 'e_save']) await expect(byId(page, svgId(id)), id).toBeVisible();
  });
});

test.describe('filter chips (IMPROVEMENTS.md §14.9)', () => {
  const dimmed = (page: Page, ids: string[]) => page.evaluate((list) => list.filter((id) => document.getElementById(id)?.classList.contains('vs-dim')), ids);

  test('a pressed chip dims each part with another value; two chips mean either; Clear resets', async ({ page }) => {
    test.skip(isNarrow(page), 'touch entry opens the viewer; viewer interaction is covered by its focused spec');
    await openFixture(page);
    await fold(page, 'g_orders').click();
    const legend = page.locator(`[id="x-${MAP}"] .vs-legend`);
    const storage = legend.getByRole('button', { name: 'storage' });
    const iface = legend.getByRole('button', { name: 'interface' });
    const clear = legend.getByRole('button', { name: /^Clear/ });
    await expect(storage).toHaveAttribute('aria-pressed', 'false');
    await expect(clear).toBeHidden();
    const ids = ['n_client', 'n_api', 'n_store', 'e_save', 'e_submit'].map(svgId);
    await storage.click();
    await expect(storage).toHaveAttribute('aria-pressed', 'true');
    await expect(clear).toBeVisible();
    expect(await dimmed(page, ids)).toEqual(['n_client', 'n_api', 'e_save', 'e_submit'].map(svgId));
    await iface.click();
    expect(await dimmed(page, ids)).toEqual(['n_client', 'e_save', 'e_submit'].map(svgId));
    await storage.click();
    await expect(storage).toHaveAttribute('aria-pressed', 'false');
    expect(await dimmed(page, ids)).toEqual(['n_client', 'n_store', 'e_save', 'e_submit'].map(svgId));
    await clear.click();
    await expect(clear).toBeHidden();
    await expect(iface).toHaveAttribute('aria-pressed', 'false');
    expect(await dimmed(page, ids)).toEqual([]);
  });

  test('a filter remains active while an ordinary hover does not dim its neighbours', async ({ page }) => {
    test.skip(isNarrow(page), 'hover is a pointer affordance on the wide-screen drawing');
    await openFixture(page);
    await page.locator(`[id="x-${MAP}"] .vs-legend`).getByRole('button', { name: 'external' }).click();
    await expect(byId(page, svgId('e_submit~-~g_orders'))).toHaveClass(/vs-dim/);
    await byId(page, svgId('n_client')).hover();
    await expect(byId(page, svgId('e_submit~-~g_orders'))).toHaveClass(/vs-dim/);
    await page.mouse.move(2, 2);
    await expect(byId(page, svgId('e_submit~-~g_orders'))).toHaveClass(/vs-dim/);
    await expect(byId(page, svgId('n_client'))).not.toHaveClass(/vs-dim/);
  });

  test('@nojs without JavaScript the legend is static', async ({ page }) => {
    await openFixture(page);
    const legend = page.locator(`[id="x-${MAP}"] .vs-legend`);
    await expect(legend.locator('.vs-legend-chip')).toHaveCount(5);
    await expect(legend.locator('button')).toHaveCount(0);
  });
});

test.describe('cross-figure highlight (IMPROVEMENTS.md §14.9)', () => {
  const near = (page: Page, id: string) => page.evaluate((x) => document.getElementById(x)?.classList.contains('vs-near') ?? false, id);

  test('a node in the map lights its actor in the trace, and the actor lights the node', async ({ page, offOrigin: _ }) => {
    test.skip(isNarrow(page), 'hover is a pointer affordance on the wide-screen drawing');
    await openSnapshot(page, '', 'order-intake');
    await byId(page, 'v-components.n_api').hover();
    expect(await near(page, 'v-one_order.a_api')).toBe(true);
    expect(await near(page, 'v-one_order.a_worker')).toBe(false);
    await page.mouse.move(2, 2);
    expect(await near(page, 'v-one_order.a_api')).toBe(false);
    await byId(page, 'v-one_order.a_worker').locator('rect').first().hover();
    expect(await near(page, 'v-components.n_worker')).toBe(true);
    expect(await near(page, 'v-components.n_api')).toBe(false);
    await page.mouse.move(2, 2);
    await expect(page.locator('.vs-near, .vs-dim')).toHaveCount(0);
  });

  test('keyboard focus lights the parts in other figures, and blur clears them', async ({ page, offOrigin: _ }) => {
    test.skip(isNarrow(page), 'the drawing is the wide-screen view');
    await openSnapshot(page, '', 'order-intake');
    const provider = byId(page, 'v-components.n_provider');
    await provider.focus();
    expect(await near(page, 'v-one_order.a_provider')).toBe(true);
    await provider.blur();
    expect(await near(page, 'v-one_order.a_provider')).toBe(false);
  });

  test('a part inside a folded group lights the fold box', async ({ page }) => {
    test.skip(isNarrow(page), 'hover is a pointer affordance on the wide-screen drawing');
    await openFixture(page);
    await byId(page, 'v-flow.a_bill').locator('rect').first().hover();
    await expect(fold(page, 'g_billing')).toHaveClass(/vs-near/);
    await page.mouse.move(2, 2);
    await expect(fold(page, 'g_billing')).not.toHaveClass(/vs-near/);
  });
});

test.describe('Tab order after a keyboard unfold (phase 6b review F9)', () => {
  test('the next Tab after the Fold control stays in the figure', async ({ page }) => {
    test.skip(isNarrow(page), 'the drawing is the wide-screen view');
    await openFixture(page);
    await fold(page, 'g_orders').focus();
    await page.keyboard.press('Enter');
    await expect(foldToggle(page, 'g_orders')).toBeFocused();
    await page.keyboard.press('Tab');
    const inFigure = await page.evaluate((id) => document.getElementById(id)?.contains(document.activeElement) ?? false, `x-${MAP}`);
    expect(inFigure).toBe(true);
    // Tab reaches the revealed parts.
    const reached: string[] = [];
    for (let i = 0; i < 12; i++) {
      reached.push(await page.evaluate(() => document.activeElement?.getAttribute('data-vs-target') ?? ''));
      await page.keyboard.press('Tab');
    }
    expect(reached).toContain('n_api');
    expect(reached).toContain('n_store');
  });

  test('the Fold control is at least 44 by 24 px (phase 6b review F10)', async ({ page }) => {
    test.skip(isNarrow(page), 'the drawing is the wide-screen view');
    await openFixture(page);
    await fold(page, 'g_orders').click();
    const size = (await foldToggle(page, 'g_orders').boundingBox())!;
    expect(size.width).toBeGreaterThanOrEqual(44);
    expect(size.height).toBeGreaterThanOrEqual(24);
  });
});

test.describe('authored walkthroughs (clearer figures CF01)', () => {
  test('steps remain a readable list without a generated Previous or Next bar', async ({ page }) => {
    await openFixture(page);
    const steps = page.locator(`[id="x-${MAP}"] .vs-steps`);
    await expect(steps.locator('li.vs-step')).toHaveCount(2);
    await expect(steps.locator('.vs-step-bar, .vs-step-next, .vs-step-prev')).toHaveCount(0);
    await expect(steps).toContainText('Saving stays inside the order boundary');
    await expect(steps).toContainText('Submission crosses the boundary once');
  });
});

test.describe('a link to a hidden part (phase 6b review F7)', () => {
  test('a focus link to a part inside a folded group unfolds the group, marks the part, and scrolls to it', async ({ page }) => {
    test.skip(isNarrow(page), 'the drawing is the wide-screen view');
    await openFixture(page);
    await expect(byId(page, svgId('n_store'))).toBeHidden();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.locator('a.vs-focus').click();
    await expect(byId(page, svgId('n_store'))).toBeVisible();
    await expect(fold(page, 'g_orders')).toBeHidden();
    await expect(byId(page, svgId('n_store'))).toHaveClass(/vs-focused/);
    await expect(byId(page, svgId('n_store'))).toBeInViewport();
  });
});

test.describe('the legend and the quantity (phase 6b review F11, F12)', () => {
  test('pressing the first chip does not move the drawing', async ({ page }) => {
    test.skip(isNarrow(page), 'the drawing is the wide-screen view');
    await openFixture(page);
    const top = async () => (await page.locator(`[id="x-${MAP}"] .vs-viewport svg`).boundingBox())!.y;
    const before = await top();
    await page.locator(`[id="x-${MAP}"] .vs-legend`).getByRole('button', { name: 'storage', exact: true }).click();
    expect(await top()).toBe(before);
  });

  test('the edge quantity has the muted ink colour at full opacity', async ({ page }) => {
    test.skip(isNarrow(page), 'the drawing is the wide-screen view');
    await openFixture(page);
    await fold(page, 'g_orders').click();
    await fold(page, 'g_billing').click();
    const q = page.locator(`[id="x-${MAP}"] [id="${svgId('e_invoice')}"] .vs-edge-quantity`).first();
    const style = await q.evaluate((n) => ({ fill: getComputedStyle(n).fill, opacity: getComputedStyle(n).fillOpacity, muted: getComputedStyle(document.documentElement).getPropertyValue('--vs-muted').trim() }));
    expect(style.opacity).toBe('1');
    const probe = await page.evaluate((c) => { const d = document.createElement('div'); d.style.color = c; document.body.append(d); const v = getComputedStyle(d).color; d.remove(); return v; }, style.muted);
    expect(style.fill).toBe(probe);
  });
});

test.describe('print (phase 6b review F1, F13)', () => {
  test('print shows every group unfolded, no fold box, no proxy, and no pressed chip', async ({ page }) => {
    test.skip(isNarrow(page), 'one width is enough for print');
    await openFixture(page);
    await page.locator(`[id="x-${MAP}"] .vs-legend`).getByRole('button', { name: 'storage', exact: true }).click();
    await page.emulateMedia({ media: 'print' });
    for (const id of ['n_api', 'n_store', 'n_bill', 'n_ledger', 'e_save', 'e_invoice', 'e_submit', 'e_post', 'g_orders']) {
      expect(await byId(page, svgId(id)).evaluate((n) => getComputedStyle(n).display), id).not.toBe('none');
    }
    for (const g of ['g_orders', 'g_billing']) {
      expect(await fold(page, g).evaluate((n) => getComputedStyle(n).display)).toBe('none');
      expect(await byId(page, svgId(g)).locator('.vs-group-label').evaluate((n) => getComputedStyle(n).display)).not.toBe('none');
      expect(await byId(page, svgId(g)).locator('rect:not(.vs-selection-outline):not(.vs-focus-outline)').evaluate((n) => getComputedStyle(n).strokeDasharray)).toBe('none');
    }
    for (const proxy of await page.locator(`[id="x-${MAP}"] [data-vs-proxy-for]`).all()) {
      expect(await proxy.evaluate((n) => getComputedStyle(n).display)).toBe('none');
    }
    const pressed = page.locator(`[id="x-${MAP}"] .vs-legend-toggle[aria-pressed="true"]`);
    expect(await pressed.evaluate((n) => getComputedStyle(n).fontWeight)).toBe(await page.locator(`[id="x-${MAP}"] .vs-legend-toggle[aria-pressed="false"]`).first().evaluate((n) => getComputedStyle(n).fontWeight));
    expect(await byId(page, svgId('n_client')).evaluate((n) => getComputedStyle(n).opacity)).toBe('1');
  });
});
