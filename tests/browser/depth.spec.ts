// Depth on click (docs/IMPROVEMENTS.md §4.1–§4.3, §13.4): the list toggle on
// wide screens, the neighbourhood on hover and focus, the position of the
// term bubble, and the sections of the inspector for a part.
import { expect, type Locator, type Page } from '@playwright/test';
import { byId, isNarrow, isPrimaryDesktop, openSnapshot, test } from './support.ts';
import { inlineDoc, serveInline } from './inline.ts';
import { normalizedTextSha256 } from '../../packages/core/src/model/hash.ts';

const FIGURE = 'components';

test('adjacent citations and short terms open their own target on narrow screens', async ({ page }, info) => {
  test.skip(info.project.name.includes('nojs') || !isNarrow(page), 'the narrow interactive view');
  const excerpt = 'Evidence.\n';
  const hash = normalizedTextSha256(new TextEncoder().encode(excerpt));
  const sources = ['one', 'two'].map((id) => `{% source id="src_${id}" kind="example" title="Source ${id}" excerptSha256="${hash}" %}\n\`\`\`text\n${excerpt}\`\`\`\n{% /source %}`).join('\n\n');
  const server = await serveInline(inlineDoc('Adjacent references', `<!-- vs:id claim -->\nTwo sources support this claim. {% cite ref="src_one" /%} {% cite ref="src_two" /%}\n\n<!-- vs:id terms -->\n{% term ref="def_id" %}ID{% /term %} {% term ref="def_key" %}key{% /term %}\n\n{% definition id="def_id" term="ID" %}\nAn ID names a target.\n{% /definition %}\n\n{% definition id="def_key" term="key" %}\nA key locates a record.\n{% /definition %}\n\n${sources}`));
  try {
    await page.goto(server.url);
    for (const [block, id] of [['claim', 'src_one'], ['claim', 'src_two'], ['terms', 'def_id'], ['terms', 'def_key']]) {
      const link = page.locator(`[id="x-${block}"] a[href="#x-${id}"]`);
      await link.click();
      await expect(page.locator(`#vs-inspector-dialog details[id="x-${id}"][open]`)).toBeVisible();
      await page.keyboard.press('Escape');
    }
    const first = await page.locator('#x-claim a.vs-cite').first().boundingBox();
    const second = await page.locator('#x-claim a.vs-cite').nth(1).boundingBox();
    expect(first!.width).toBeGreaterThanOrEqual(44);
    expect(first!.height).toBeGreaterThanOrEqual(44);
    const intersects = first!.x < second!.x + second!.width && second!.x < first!.x + first!.width && first!.y < second!.y + second!.height && second!.y < first!.y + first!.height;
    expect(intersects).toBe(false);
  } finally {
    server.close();
  }
});

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error('the element has no box');
  return b;
}

async function classesOf(page: Page, ids: string[]): Promise<Record<string, string[]>> {
  return page.evaluate((list) => Object.fromEntries(list.map((id) => {
    const el = document.getElementById(id);
    return [id, el ? ['vs-near', 'vs-dim'].filter((c) => el.classList.contains(c)) : ['missing']];
  })), ids);
}

test.describe('@R06 lists behind a toggle (IMPROVEMENTS.md §4.1)', () => {
  test('wide screens show the drawing first, and "Show as list" adds the lists', async ({ page, offOrigin: _ }) => {
    test.skip(isNarrow(page), 'the list toggle is the wide-screen view');
    await openSnapshot(page, '', 'order-intake');
    const figure = byId(page, `x-${FIGURE}`);
    const toggle = figure.locator('.vs-view-toggle');
    await expect(toggle).toHaveText('Show as list');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(figure.locator('.vs-viewport')).toBeVisible();
    await expect(figure.locator('.vs-lists')).toBeHidden();
    // The lists stay in the DOM.
    await expect(byId(page, `l-${FIGURE}.e_insert`)).toBeAttached();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(figure.locator('.vs-lists')).toBeVisible();
    await expect(figure.locator('.vs-viewport')).toBeVisible();
    await toggle.click();
    await expect(figure.locator('.vs-lists')).toBeHidden();
  });

  test('narrow screens show the lists first, and print shows both', async ({ page, offOrigin: _ }) => {
    await openSnapshot(page, '', 'order-intake');
    const figure = byId(page, `x-${FIGURE}`);
    if (isNarrow(page)) {
      await expect(figure.locator('.vs-view-toggle')).toHaveText('Show map');
      await expect(figure.locator('.vs-lists')).toBeVisible();
    }
    await page.emulateMedia({ media: 'print' });
    await expect(figure.locator('.vs-lists')).toBeVisible();
    await expect(figure.locator('.vs-viewport')).toBeVisible();
  });

  test('@nojs the lists are visible without JavaScript, and there is no toggle', async ({ page }) => {
    await openSnapshot(page, '', 'order-intake');
    const figure = byId(page, `x-${FIGURE}`);
    await expect(figure.locator('.vs-lists')).toBeVisible();
    await expect(figure.locator('.vs-view-toggle')).toHaveCount(0);
  });
});

test.describe('neighbourhood on hover and focus (IMPROVEMENTS.md §4.3)', () => {
  const ids = ['n_api', 'n_worker', 'n_queue', 'n_provider', 'e_insert', 'e_update', 'e_take'].map((id) => `v-${FIGURE}.${id}`);

  test('hover marks the adjacent parts near and dims the rest; leaving clears it', async ({ page, offOrigin: _ }) => {
    test.skip(isNarrow(page), 'hover is a pointer affordance on the wide-screen drawing');
    await openSnapshot(page, '', 'order-intake');
    await byId(page, `v-${FIGURE}.n_store`).hover();
    expect(await classesOf(page, ids)).toEqual({
      [`v-${FIGURE}.n_api`]: ['vs-near'],
      [`v-${FIGURE}.n_worker`]: ['vs-near'],
      [`v-${FIGURE}.n_queue`]: ['vs-dim'],
      [`v-${FIGURE}.n_provider`]: ['vs-dim'],
      [`v-${FIGURE}.e_insert`]: ['vs-near'],
      [`v-${FIGURE}.e_update`]: ['vs-near'],
      [`v-${FIGURE}.e_take`]: ['vs-dim'],
    });
    expect(await byId(page, `v-${FIGURE}.n_queue`).evaluate((n) => getComputedStyle(n).opacity)).toBe('0.35');
    await page.mouse.move(2, 2);
    await expect(page.locator('.vs-near, .vs-dim')).toHaveCount(0);
  });

  test('keyboard focus marks the neighbourhood, and Tab moves on and clears it', async ({ page, offOrigin: _ }) => {
    test.skip(isNarrow(page), 'the drawing is the wide-screen view');
    await openSnapshot(page, '', 'order-intake');
    const queue = byId(page, `v-${FIGURE}.n_queue`);
    await queue.focus();
    await expect(queue).toBeFocused();
    expect((await classesOf(page, ids))[`v-${FIGURE}.n_api`]).toEqual(['vs-near']);
    expect((await classesOf(page, ids))[`v-${FIGURE}.n_provider`]).toEqual(['vs-dim']);
    await page.keyboard.press('Tab');
    await expect(queue).not.toBeFocused();
    // The next node gets its own neighbourhood; the queue's marks are gone.
    const active = await page.evaluate(() => document.activeElement?.id ?? '');
    if (!active.startsWith(`v-${FIGURE}.n_`)) await expect(page.locator('.vs-near, .vs-dim')).toHaveCount(0);
  });
});

test.describe('term bubble (IMPROVEMENTS.md §13.4)', () => {
  test('the bubble sits above the word when there is room, else below, in the page colours', async ({ page, offOrigin: _ }, info) => {
    test.skip(!isPrimaryDesktop(info.project.name), 'hover is a pointer affordance; runs on the desktop project');
    await openSnapshot(page);
    const term = page.locator('#vs-doc a.vs-term').first();
    await term.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -300));
    await term.hover();
    const tip = page.locator('#vs-tooltip');
    await expect(tip).toHaveClass(/vs-tooltip--above/);
    const [t, w] = [await box(tip), await box(term)];
    expect(t.y + t.height).toBeLessThanOrEqual(w.y);
    expect(w.y - (t.y + t.height)).toBeLessThanOrEqual(12);
    const colours = await tip.evaluate((n) => {
      const s = getComputedStyle(n);
      return [s.backgroundColor, s.color, getComputedStyle(document.body).backgroundColor, getComputedStyle(document.body).color];
    });
    expect(colours[0]).toBe(colours[2]);
    expect(colours[1]).toBe(colours[3]);
    // The term is body ink, with a dotted underline that is not the accent colour.
    const look = await term.evaluate((n) => {
      const s = getComputedStyle(n);
      return { colour: s.color, body: getComputedStyle(n.parentElement!).color };
    });
    expect(look.colour).toBe(look.body);
    await page.mouse.move(2, 2);
    await expect(tip).toHaveCount(0, { timeout: 2000 });
    // Near the top of the window there is no room above: the bubble goes below.
    await term.evaluate((n) => window.scrollTo(0, n.getBoundingClientRect().top + window.scrollY - 70));
    await term.hover();
    await expect(tip).toHaveClass(/vs-tooltip--below/);
    const [t2, w2] = [await box(tip), await box(term)];
    expect(t2.y).toBeGreaterThanOrEqual(w2.y + w2.height);
  });

  test('a tap shows the bubble, and a second tap opens the definition', async ({ page, offOrigin: _ }) => {
    test.skip(!isNarrow(page), 'the tap sequence is the touch-screen behaviour');
    await openSnapshot(page);
    const term = page.locator('#vs-doc a.vs-term').first();
    await term.scrollIntoViewIfNeeded();
    await term.tap();
    await expect(page.locator('#vs-tooltip')).toBeVisible();
    await expect(page.locator('dialog#vs-inspector-dialog[open]')).toHaveCount(0);
    await term.tap();
    await expect(page.locator('dialog#vs-inspector-dialog')).toHaveAttribute('open', '');
    await expect(page.locator('dialog#vs-inspector-dialog details[id="x-def_backpressure"]')).toBeVisible();
  });
});

test.describe('inspector sections for a part (IMPROVEMENTS.md §4.2)', () => {
  test('label and cue word, body, Relationships, Appears in, and Copy reference last', async ({ page, offOrigin: _ }) => {
    await openSnapshot(page, '', 'order-intake');
    if (isNarrow(page)) await byId(page, `l-${FIGURE}.n_api`).click();
    else await byId(page, `v-${FIGURE}.n_api`).click();
    const host = page.locator(isNarrow(page) ? 'dialog#vs-inspector-dialog' : 'aside#vs-inspector');
    await expect(host.locator('#vs-inspector-title')).toHaveText('Order API · interface · Explanation');
    const detail = host.locator('details[id="x-n_api"]');
    const order = await detail.evaluate((d) => ['.vs-detail-text', '.vs-detail-rels', '.vs-detail-appears']
      .map((sel) => d.querySelector(sel)).map((n) => (n ? n.getBoundingClientRect().top : -1)));
    expect(order.every((y) => y >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    await expect(detail.locator('.vs-detail-rels li')).toHaveCount(2);
    await expect(detail.locator('.vs-detail-rels')).toContainText('→ insert order as pending → Order store');
    await expect(detail.locator('.vs-detail-appears')).toContainText('Order API in One order from request to charge');
    // Copy reference comes after the body.
    const copy = host.getByRole('button', { name: 'Copy reference', exact: true });
    expect((await box(copy)).y).toBeGreaterThan((await box(detail.locator('.vs-detail-appears'))).y);
    // A relationship link opens that relationship in the inspector; Back returns.
    await detail.locator('.vs-detail-rels a', { hasText: 'insert order as pending' }).click();
    await expect(host.locator('details[id="x-e_insert"]')).toBeVisible();
    await expect(host.locator('#vs-inspector-title')).toHaveText('insert order as pending · call · Explanation');
    await host.getByRole('button', { name: 'Back to Order API' }).click();
    await expect(host.locator('details[id="x-n_api"]')).toBeVisible();
  });

  test('a click shows explanation first and keeps evidence collapsed last (IMPROVEMENTS.md §4.4)', async ({ page, offOrigin: _ }) => {
    test.skip(isNarrow(page), 'the 900 px rule is for the wide-screen inspector');
    await page.setViewportSize({ width: page.viewportSize()!.width, height: 900 });
    await openSnapshot(page, '', 'order-intake');
    const host = page.locator('aside#vs-inspector');
    // Scroll the inspector of another part first: a new part starts at the top.
    await byId(page, `v-${FIGURE}.n_api`).click();
    await host.evaluate((n) => { n.scrollTop = n.scrollHeight; });
    await byId(page, `v-${FIGURE}.n_worker`).click();
    await expect(host.locator('#vs-inspector-title')).toHaveText('Charge worker · process · Explanation');
    const detail = host.locator('details[id="x-n_worker"]');
    const evidence = detail.locator('.vs-detail-evidence');
    const excerpt = detail.locator('.vs-detail-evidence .vs-evidence-item .vs-code').first();
    await expect(evidence).not.toHaveAttribute('open', /.+/);
    await expect(excerpt).toBeHidden();
    await expect(detail.locator('.vs-detail-text')).toBeVisible();
    await evidence.locator('summary').click();
    await expect(excerpt).toBeVisible();
    await expect(excerpt).toContainText('idempotencyKey: request.orderId');
    expect(await host.evaluate((n) => n.scrollTop)).toBe(0);
    // Evidence comes after explanation and context, and names the source.
    const order = await detail.evaluate((d) => ['.vs-detail-text', '.vs-detail-rels', '.vs-detail-evidence']
      .map((sel) => d.querySelector(sel)?.getBoundingClientRect().top ?? -1));
    expect(order.every((y) => y >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    await expect(detail.locator('.vs-detail-evidence .vs-evidence-open a')).toHaveText('Charge worker loop');
  });

  test('an edge in the drawing shows the first sentence of its body on hover', async ({ page, offOrigin: _ }) => {
    test.skip(isNarrow(page), 'hover is a pointer affordance on the wide-screen drawing');
    await openSnapshot(page, '', 'order-intake');
    await byId(page, `v-${FIGURE}.e_insert`).locator('.vs-edge-label').hover();
    await expect(page.locator('#vs-tooltip .vs-tooltip__text')).toHaveText(/^\S.*[.!?]$/);
    await expect(page.locator('#vs-tooltip a.vs-tooltip__open')).toHaveCount(0);
  });
});

test.describe('phase-2 review fixes (docs/reviews/phase2-depth-review-1.md)', () => {
  test('@nojs a "Parts of" group counts every row, because every row shows (R2)', async ({ page }) => {
    await openSnapshot(page, '', 'order-intake');
    const groups = page.locator('#vs-appendix details.vs-appendix-parts');
    expect(await groups.count()).toBeGreaterThan(0);
    for (const group of await groups.all()) {
      const rows = await group.locator(':scope > details.vs-detail').count();
      await expect(group.locator(':scope > summary .vs-appendix-count')).toHaveText(`(${rows})`);
    }
  });

  test('with the runtime, a "Parts of" group counts the rows that show (R2)', async ({ page, offOrigin: _ }) => {
    await openSnapshot(page, '', 'order-intake');
    for (const group of await page.locator('#vs-appendix details.vs-appendix-parts').all()) {
      const shown = await group.locator(':scope > details.vs-detail:not(.vs-detail-bare)').count();
      await expect(group.locator(':scope > summary .vs-appendix-count')).toHaveText(`(${shown})`);
    }
  });

  test('a focused edge owns the description of its bubble (R4)', async ({ page, offOrigin: _ }) => {
    test.skip(isNarrow(page), 'the drawing is the wide-screen view');
    await openSnapshot(page, '', 'order-intake');
    const edge = byId(page, `v-${FIGURE}.e_insert`);
    await edge.focus();
    await expect(page.locator('#vs-tooltip')).toBeVisible();
    await expect(edge).toHaveAttribute('aria-describedby', 'vs-tooltip-text');
    await expect(edge.locator('.vs-edge-label')).not.toHaveAttribute('aria-describedby', /.+/);
  });

  test('a trace order arrow shows no bubble of the event it points to (R5)', async ({ page, offOrigin: _ }) => {
    test.skip(isNarrow(page), 'the drawing is the wide-screen view');
    await openSnapshot(page, '', 'order-intake');
    const arrow = page.locator('[id="x-one_order"] .vs-viewport a.vs-edge.vs-kind-order').first();
    await arrow.focus();
    await expect(arrow).toBeFocused();
    await expect(page.locator('#vs-tooltip')).toHaveCount(0);
  });

  test('the neighbourhood of the focused node comes back after the pointer leaves another node (R6)', async ({ page, offOrigin: _ }) => {
    test.skip(isNarrow(page), 'hover is a pointer affordance on the wide-screen drawing');
    await openSnapshot(page, '', 'order-intake');
    const api = byId(page, `v-${FIGURE}.n_api`);
    await api.focus();
    const marked = await page.locator(`[id="x-${FIGURE}"] .vs-dim`).count();
    expect(marked).toBeGreaterThan(0);
    await byId(page, `v-${FIGURE}.n_worker`).hover();
    await page.mouse.move(2, 2);
    await expect(api).toBeFocused();
    await expect(page.locator(`[id="x-${FIGURE}"] .vs-dim`)).toHaveCount(marked);
    expect(await api.evaluate((n) => n.classList.contains('vs-dim'))).toBe(false);
  });

  test('the inspector sections are h3 under the h2 title, and the facts do not repeat the cue word (R7, S1)', async ({ page, offOrigin: _ }) => {
    await openSnapshot(page, '', 'order-intake');
    if (isNarrow(page)) await byId(page, `l-${FIGURE}.n_api`).click();
    else await byId(page, `v-${FIGURE}.n_api`).click();
    const host = page.locator(isNarrow(page) ? 'dialog#vs-inspector-dialog' : 'aside#vs-inspector');
    await expect(host.getByRole('heading', { level: 2, name: 'Order API · interface · Explanation' })).toBeVisible();
    await expect(host.getByRole('heading', { level: 3, name: 'Relationships' })).toBeVisible();
    await expect(host.locator('h4')).toHaveCount(0);
    await expect(host.locator('.vs-facts dt', { hasText: 'role' })).toHaveCount(0);
  });

  test('a compare cell whose body is one sentence is bare, and its body is the table instance (R1)', async ({ page, offOrigin: _ }) => {
    test.skip(isNarrow(page), 'the table is the wide-screen view');
    await openSnapshot(page, '', 'order-intake');
    const table = page.locator('[id="x-retry_choice"] .vs-compare-table');
    await expect(table.locator('a.vs-cell-link')).toHaveCount(0);
    await expect(table.locator('.vs-cell-body[data-vs-target]')).toHaveCount(4);
  });
});

test.describe('drill-down depth cues', () => {
  test('two bars mark explanation while a bare SVG part is inert and still markable', async ({ page, offOrigin: _ }) => {
    test.skip(isNarrow(page), 'the drawing is the wide-screen view');
    await openSnapshot(page, '', 'order-intake');
    const explained = byId(page, `v-${FIGURE}.n_api`);
    await expect(explained).toHaveAttribute('data-vs-depth', 'explanation');
    await expect(explained.locator('.vs-depth-bar')).toHaveCount(2);
    const bare = byId(page, `v-${FIGURE}.e_take`);
    await expect(bare).toHaveAttribute('data-vs-depth', 'bare');
    await expect(bare).not.toHaveAttribute('href', /.+/);
    await expect(bare.locator('.vs-depth-bar')).toHaveCount(0);
    await byId(page, `v-${FIGURE}.n_queue`).hover();
    await expect(bare).toHaveClass(/vs-near/);
  });

  test('Locate returns to and highlights every visible instance of the target', async ({ page, offOrigin: _ }) => {
    test.skip(isNarrow(page), 'the persistent inspector is the wide-screen view');
    await openSnapshot(page, '', 'order-intake');
    await byId(page, `v-${FIGURE}.n_api`).click();
    const host = page.locator('aside#vs-inspector');
    await host.getByRole('button', { name: 'Locate in figure' }).click();
    await expect(host).toBeHidden();
    await expect(byId(page, `v-${FIGURE}.n_api`)).toBeFocused();
    const visible = page.locator('[data-vs-target="n_api"].vs-inspected:visible');
    expect(await visible.count()).toBeGreaterThan(0);
  });

  test('print hides the depth key and depth cues', async ({ page, offOrigin: _ }) => {
    await openSnapshot(page, '', 'order-intake');
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.vs-depth-key')).toBeHidden();
    await expect(page.locator('.vs-depth-cue').first()).toBeHidden();
  });
});
