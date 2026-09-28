// Components of docs/IMPROVEMENTS.md §14 in the browser: the step bar of a
// `steps` walkthrough (order-intake), the before-and-after view of an
// `annotated` figure (deadline-retry), and the self-check answer toggle
// (bounded-queue). Without JavaScript each one is complete static HTML.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { byId, isNarrow, openSnapshot, test } from './support.ts';
import { serveFixture, type InlineServer } from './inline.ts';

const FIGURE = 'x-components';

async function nearAndDim(page: Page): Promise<{ near: string[]; dim: string[] }> {
  return page.evaluate((id) => {
    const figure = document.getElementById(id)!;
    const ids = (cls: string) => Array.from(figure.querySelectorAll(`.vs-viewport svg a.${cls}`)).map((a) => a.getAttribute('data-vs-target') ?? '').sort();
    return { near: ids('vs-near'), dim: ids('vs-dim') };
  }, FIGURE);
}

test.describe('@R06 steps walkthrough (IMPROVEMENTS.md §14.1)', () => {
  test('wide: the bar walks the steps, marks the parts of each step, and answers the arrow keys', async ({ page, offOrigin: _ }, info) => {
    test.skip(info.project.name.includes('nojs') || isNarrow(page), 'the step bar runs on wide screens with JavaScript');
    await openSnapshot(page, '', 'order-intake');
    const figure = byId(page, FIGURE);
    const bar = figure.locator('.vs-step-bar');
    await expect(bar).toBeVisible();
    await expect(figure.locator('.vs-steps-note')).toHaveText('Reading order, not execution order.');
    await expect(bar.locator('.vs-step-status')).toHaveText('3 steps. Select Next to start.');
    // The overview marks nothing and lists every step.
    expect(await nearAndDim(page)).toEqual({ near: [], dim: [] });
    await expect(figure.locator('li.vs-step')).toHaveCount(3);
    await bar.locator('.vs-step-next').click();
    await expect(bar.locator('.vs-step-status')).toHaveText('1 of 3 · Acceptance is atomic');
    const first = await nearAndDim(page);
    expect(first.near).toEqual(['e_enqueue', 'e_insert', 'n_api', 'n_queue', 'n_store']);
    expect(first.dim).toContain('n_worker');
    expect(first.dim).toContain('e_charge');
    // Only the active step shows, beside the bar.
    await expect(byId(page, 'x-wk_accept')).toBeVisible();
    await expect(byId(page, 'x-wk_charge')).toBeHidden();
    const b = (await bar.boundingBox())!;
    const s = (await byId(page, 'x-wk_accept').boundingBox())!;
    expect(s.x).toBeGreaterThanOrEqual(b.x + b.width);
    // The arrow keys move between the steps when the bar has focus.
    await bar.locator('.vs-step-next').focus();
    await page.keyboard.press('ArrowRight');
    await expect(bar.locator('.vs-step-status')).toHaveText('2 of 3 · Charging is retry-safe');
    expect((await nearAndDim(page)).near).toEqual(['e_charge', 'e_take', 'n_provider', 'n_worker']);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(bar.locator('.vs-step-status')).toHaveText('3 steps. Select Next to start.');
    expect(await nearAndDim(page)).toEqual({ near: [], dim: [] });
  });

  test('print shows the "Walkthrough in N steps" heading with JavaScript on a wide screen (phase 6a review C15)', async ({ page, offOrigin: _ }, info) => {
    test.skip(info.project.name.includes('nojs') || isNarrow(page), 'the step bar hides the heading on wide screens with JavaScript');
    await openSnapshot(page, '', 'order-intake');
    const heading = byId(page, FIGURE).locator('.vs-steps-heading');
    await expect(heading).toBeHidden();
    await page.emulateMedia({ media: 'print' });
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText('Walkthrough in 3 steps');
    await expect(byId(page, FIGURE).locator('.vs-step-bar')).toBeHidden();
  });

  test('narrow: a numbered list with part links, and no bar', async ({ page, offOrigin: _ }, info) => {
    test.skip(info.project.name.includes('nojs') || !isNarrow(page), 'the narrow projects');
    await openSnapshot(page, '', 'order-intake');
    const figure = byId(page, FIGURE);
    await expect(figure.locator('.vs-step-bar')).toBeHidden();
    await expect(figure.locator('li.vs-step')).toHaveCount(3);
    for (const id of ['x-wk_accept', 'x-wk_charge', 'x-wk_record']) await expect(byId(page, id)).toBeVisible();
    await expect(byId(page, 'l-components.wk_charge.n_provider')).toHaveText('Payment provider');
  });

  test('@nojs without JavaScript the walkthrough is a numbered list under the figure', async ({ page }) => {
    await openSnapshot(page, '', 'order-intake');
    const figure = byId(page, FIGURE);
    await expect(figure.locator('.vs-step-bar')).toHaveCount(0);
    await expect(figure.locator('ol.vs-step-list > li.vs-step')).toHaveCount(3);
    await expect(figure.locator('.vs-steps-note')).toBeVisible();
    await expect(byId(page, 'x-wk_record')).toContainText('Only this write changes the payment state of the order.');
  });
});

test.describe('@R06 annotated before and after (IMPROVEMENTS.md §14.7)', () => {
  test('side by side at 900 px or more, stacked below; removed and added lines have signs', async ({ page, offOrigin: _ }, info) => {
    test.skip(info.project.name.includes('nojs'), 'the layout check runs with JavaScript on each width');
    await openSnapshot(page, '', 'deadline-retry');
    const figure = byId(page, 'x-count_to_deadline');
    const before = figure.locator('.vs-diff-before');
    const after = figure.locator('.vs-diff-after');
    await expect(before).toBeVisible();
    await expect(after).toBeVisible();
    const a = (await before.boundingBox())!;
    const b = (await after.boundingBox())!;
    if (isNarrow(page)) expect(b.y).toBeGreaterThanOrEqual(a.y + a.height);
    else expect(b.x).toBeGreaterThanOrEqual(a.x + a.width);
    await expect(before.locator('.vs-line-removed .vs-diff-sign').first()).toHaveText('−');
    await expect(after.locator('.vs-line-added .vs-diff-sign').first()).toHaveText('+');
    // The gap rows keep the two sides in line only when they sit side by side.
    await expect(figure.locator('.vs-line-gap').first()).toHaveCSS('display', isNarrow(page) ? 'none' : 'inline');
  });
});

test.describe('@R06 self-check (IMPROVEMENTS.md §14.3)', () => {
  test('@nojs the answer is behind a native "Show answer" toggle', async ({ page }) => {
    await openSnapshot(page, '', 'bounded-queue');
    const check = byId(page, 'x-ck_second_producer');
    await expect(check).toContainText('Two producers wait on a full queue');
    const answer = check.locator('details.vs-self-check-answer');
    await expect(answer.locator('.vs-self-check-body')).toBeHidden();
    await answer.locator('summary').click();
    await expect(answer.locator('.vs-self-check-body')).toContainText('The other producer finds the queue full and waits again.');
  });
});

// A page with a nested tree (phase 6a review C4): the positive fixture of the
// §14 components, served by this spec.
const TREE_FIXTURE = 'fixtures/positive/family-components.md';
let server: InlineServer | undefined;
let treeOrigin = '';

test.describe('@R06 tree (IMPROVEMENTS.md §14.5, phase 6a review C4)', () => {
  test.beforeAll(async () => {
    server = await serveFixture(TREE_FIXTURE);
    treeOrigin = new URL(server.url).origin;
  });

  test.afterAll(() => {
    server?.close();
  });

  async function openTree(page: Page): Promise<void> {
    await page.goto(`${treeOrigin}/`);
    const href = await page.locator('a').first().getAttribute('href');
    if (!href) throw new Error('the fixture index has no snapshot link');
    await page.goto(new URL(href, page.url()).href);
  }

  test('axe: no serious or critical violations on a page with a nested tree; no link is inside a summary', async ({ page }) => {
    await openTree(page);
    await expect(page.locator('.vs-tree-list')).toBeVisible();
    await expect(page.locator('summary a, summary button')).toHaveCount(0);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
    expect(result.violations.filter((v) => v.id === 'nested-interactive' || ['serious', 'critical'].includes(v.impact ?? '')).map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });

  test('the keyboard reaches each entry link once, and the toggle of its children', async ({ page }, info) => {
    test.skip(info.project.name.includes('nojs'), 'the keyboard check runs with JavaScript');
    await openTree(page);
    const entry = page.locator('a.vs-tree-entry').first();
    await entry.focus();
    await expect(entry).toBeFocused();
    await page.keyboard.press('Tab');
    const next = await page.evaluate(() => ({ tag: document.activeElement?.tagName, cls: document.activeElement?.className ?? '' }));
    expect(next).toEqual({ tag: 'SUMMARY', cls: 'vs-tree-toggle' });
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.className)).toBe('vs-tree-entry');
  });
});
