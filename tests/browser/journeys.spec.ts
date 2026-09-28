// Phase 1 critical journeys (§17.4, §18.4) with the §18.8 oracles.
import { AxeBuilder } from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { parsePacket } from '../../packages/core/src/references/packet.ts';
import { byId, copiedTexts, denyClipboard, installClipboardSpy, isNarrow, isPrimaryDesktop, openSnapshot, showList, showMap, test } from './support.ts';

const APPENDIX = 'vs-appendix';

async function expectInspectorOpen(page: import('@playwright/test').Page, targetId: string) {
  if (isNarrow(page)) {
    const dialog = page.locator('dialog#vs-inspector-dialog');
    await expect(dialog).toHaveAttribute('open', '');
    expect(await dialog.evaluate((d) => d.matches(':modal'))).toBe(true);
    await expect(dialog.locator(`details[id="x-${targetId}"][open]`)).toBeVisible();
  } else {
    const aside = page.locator('aside#vs-inspector');
    await expect(aside).toBeVisible();
    await expect(aside.locator(`details[id="x-${targetId}"][open]`)).toBeVisible();
  }
  await expect(page.locator(`template[data-vs-placeholder="${targetId}"]`)).toHaveCount(1);
}

// The detail's direct parent is now its "Figure: ..."/kind group (F3a), not
// the appendix section itself; check it came home to the appendix, not the
// exact grandparent.
async function expectDetailHome(page: import('@playwright/test').Page, targetId: string) {
  const home = await byId(page, `x-${targetId}`).evaluate((d, id) => d.closest(`#${id}`)?.id, APPENDIX);
  expect(home).toBe(APPENDIX);
  await expect(page.locator('template[data-vs-placeholder]')).toHaveCount(0);
}

test.describe('inspection', () => {
  test('@R04 inspect edge from the SVG instance with the keyboard; Escape returns focus', async ({ page, offOrigin: _ }) => {
    await openSnapshot(page);
    await showMap(page, 'handoff');
    const instance = byId(page, 'v-handoff.enqueue');
    await instance.focus();
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await page.keyboard.press('Enter');
    await expectInspectorOpen(page, 'enqueue');
    await page.keyboard.press('Escape');
    await expectDetailHome(page, 'enqueue');
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('v-handoff.enqueue');
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - scrollBefore)).toBeLessThanOrEqual(2);
    if (!isNarrow(page)) await expect(page.locator('aside#vs-inspector')).toBeHidden();
    else await expect(page.locator('dialog#vs-inspector-dialog')).not.toHaveAttribute('open', '');
  });

  test('@R04 inspect edge from the relationship list; close returns it to the appendix', async ({ page, offOrigin: _ }) => {
    await openSnapshot(page);
    await showList(page, 'handoff');
    const item = byId(page, 'l-handoff.enqueue');
    await item.click();
    await expectInspectorOpen(page, 'enqueue');
    // Nested inspection: the citation inside the edge detail replaces the view; Back returns.
    const host = isNarrow(page) ? page.locator('dialog#vs-inspector-dialog') : page.locator('aside#vs-inspector');
    await host.locator('a.vs-cite').click();
    await expect(host.locator('details[id="x-src_queue"][open]')).toBeVisible();
    expect(await byId(page, 'x-enqueue').evaluate((d, id) => d.closest(`#${id}`)?.id, APPENDIX)).toBe(APPENDIX);
    await host.getByRole('button', { name: 'Back' }).click();
    await expect(host.locator('details[id="x-enqueue"][open]')).toBeVisible();
    await host.getByRole('button', { name: 'Close' }).click();
    await expectDetailHome(page, 'enqueue');
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('l-handoff.enqueue');
  });

  test('@R05 definition tooltip shows the first sentence and Escape dismisses it', async ({ page, offOrigin: _ }) => {
    test.skip(isNarrow(page), 'hover tooltip is a pointer affordance; tap opens the definition');
    await openSnapshot(page);
    await page.locator('#vs-doc a.vs-term').first().hover();
    const tip = page.locator('#vs-tooltip');
    // The bubble holds the first sentence and an "Open definition" link (IMPROVEMENTS.md §13.4).
    await expect(tip.locator('.vs-tooltip__text')).toHaveText('A mechanism that makes upstream work wait or slow down when a downstream resource cannot accept more work.');
    await expect(tip.locator('a.vs-tooltip__open')).toHaveText('Open definition');
    await page.keyboard.press('Escape');
    await expect(tip).toHaveCount(0);
  });

  test('@R05 tapping or clicking a term opens the persistent definition', async ({ page, offOrigin: _ }) => {
    await openSnapshot(page);
    await page.locator('#vs-doc a.vs-term').first().click();
    await expectInspectorOpen(page, 'def_backpressure');
  });
});

test.describe('appendix and inspector (dogfood-3 F3, F4)', () => {
  test('the appendix is grouped with Sources first, and each source row shows its origin', async ({ page, offOrigin: _ }) => {
    await openSnapshot(page);
    // IMPROVEMENTS.md §4.5: Sources and Definitions first and open, then one
    // collapsed "Parts of 'TITLE' (N)" group per figure.
    const headings = await page.locator(`#${APPENDIX} .vs-appendix-group > summary > h3`).allTextContents();
    expect(headings[0]).toBe('Sources');
    expect(headings[1]).toBe('Definitions');
    expect(headings.some((t) => /^Parts of '.+' \(\d+\)$/.test(t))).toBe(true);
    await expect(page.locator(`#${APPENDIX} details.vs-appendix-open`).first()).toHaveAttribute('open', '');
    await expect(page.locator(`#${APPENDIX} details.vs-appendix-parts`).first()).not.toHaveAttribute('open', '');
    const source = byId(page, 'x-src_queue');
    expect(await source.evaluate((d) => d.closest('.vs-appendix-group')?.querySelector('h3')?.textContent)).toBe('Sources');
    await expect(source.locator(':scope > summary .vs-source-origin-summary')).toHaveCount(1);
  });

  test('the filter hides rows and empty groups, announces the count, and Escape clears it', async ({ page, offOrigin: _ }) => {
    await openSnapshot(page);
    const input = page.getByLabel('Filter details and evidence');
    const status = page.locator('#vs-appendix-filter-status');
    // A part with no body and no evidence has no row (IMPROVEMENTS.md §4.5).
    const rows = page.locator(`#${APPENDIX} .vs-appendix-group > details.vs-detail:not(.vs-detail-bare)`);
    const total = await rows.count();
    await expect(status).toHaveText(`${total} of ${total} shown`);
    await input.fill('zzzz-no-such-row');
    await expect(status).toHaveText(`0 of ${total} shown`);
    await expect(page.locator(`#${APPENDIX} .vs-appendix-group:not([hidden])`)).toHaveCount(0);
    await input.fill('queue');
    const shown = await rows.evaluateAll((els) => els.filter((e) => !(e as HTMLElement).hidden).length);
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(total);
    await expect(status).toHaveText(`${shown} of ${total} shown`);
    await input.press('Escape');
    await expect(input).toHaveValue('');
    await expect(status).toHaveText(`${total} of ${total} shown`);
  });

  test('a source opened in the inspector shows the excerpt first, then the origin, then Provenance, with no repeated summary', async ({ page, offOrigin: _ }) => {
    await openSnapshot(page, '', 'bounded-queue');
    await page.locator('#vs-doc a.vs-cite[href="#x-src_queue"]').first().click();
    const host = isNarrow(page) ? page.locator('dialog#vs-inspector-dialog') : page.locator('aside#vs-inspector');
    const detail = host.locator('details[id="x-src_queue"][open]');
    await expect(detail).toBeVisible();
    await expect(detail.locator(':scope > summary')).toBeHidden();
    const order = await detail.evaluate((d) => {
      const at = (sel: string) => {
        const e = d.querySelector(sel);
        return e ? Array.from(d.querySelectorAll('*')).indexOf(e) : -1;
      };
      return { code: at('pre'), origin: at('.vs-source-origin'), provenance: at('details.vs-provenance') };
    });
    expect(order.code).toBeGreaterThanOrEqual(0);
    expect(order.code).toBeLessThan(order.origin);
    expect(order.origin).toBeLessThan(order.provenance);
    await expect(detail.locator('details.vs-provenance')).not.toHaveAttribute('open', '');
  });

  test('the document uses more horizontal space only when the window is large', async ({ page, offOrigin: _ }, info) => {
    test.skip(!isPrimaryDesktop(info.project.name), 'one desktop serve and export project cover the responsive width');
    await page.setViewportSize({ width: 1600, height: 900 });
    await openSnapshot(page);
    const widths = await page.locator('#vs-doc').evaluate((doc) => {
      const legacy = document.createElement('div');
      legacy.style.cssText = 'position:fixed;width:74ch;visibility:hidden';
      document.body.append(legacy);
      const measured = { document: doc.getBoundingClientRect().width, legacy: legacy.getBoundingClientRect().width };
      legacy.remove();
      return measured;
    });
    expect(widths.document).toBeGreaterThan(widths.legacy + 100);

    await page.setViewportSize({ width: 1000, height: 900 });
    const medium = await page.locator('#vs-doc').evaluate((doc) => doc.getBoundingClientRect().width);
    expect(Math.abs(medium - widths.legacy)).toBeLessThanOrEqual(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1000);
  });

  test('on a wide screen the open inspector does not cover the text column', async ({ page, offOrigin: _ }) => {
    test.skip(isNarrow(page), 'narrow screens use a full-screen dialog');
    await openSnapshot(page);
    await page.locator('#vs-doc a.vs-cite[href="#x-src_queue"]').first().click();
    const aside = page.locator('aside#vs-inspector');
    await expect(aside).toBeVisible();
    const docRight = await page.locator('#vs-doc').evaluate((d) => d.getBoundingClientRect().right);
    const asideLeft = await aside.evaluate((a) => a.getBoundingClientRect().left);
    const docLeft = await page.locator('#vs-doc').evaluate((d) => d.getBoundingClientRect().left);
    expect(docLeft).toBeGreaterThanOrEqual(0);
    // The text column may be narrower than its responsive cap when the window is small; then
    // it only has to start inside the window.
    if (docLeft > 16) expect(docRight).toBeLessThanOrEqual(asideLeft);
  });
});

test.describe('reference mode', () => {
  test('@R03 @R12 select the graph relationship and copy a parseable packet', async ({ page, offOrigin: _ }) => {
    await installClipboardSpy(page);
    await openSnapshot(page);
    await page.locator('#vs-btn-refmode').click();
    await expect(page.locator('#vs-btn-refmode')).toHaveAttribute('aria-pressed', 'true');
    await showMap(page, 'handoff');
    // Click the edge label: the centre of an edge's bounding box can be empty canvas.
    await byId(page, 'v-handoff.enqueue').locator('text').click();
    const panel = page.locator('#vs-refpanel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('edge');
    // The nearest target is the edge, not the whole figure.
    await expect(byId(page, 'x-handoff')).not.toHaveClass(/vs-selected/);
    await panel.getByRole('button', { name: 'Copy reference', exact: true }).click();
    await expect(panel.locator('.vs-status')).toHaveText('Copied reference to the clipboard.');
    const [yaml] = await copiedTexts(page);
    const packet = parsePacket(yaml!);
    const root = page.locator('#vs-doc');
    expect(packet).toMatchObject({
      schema: 'visser-ref/1',
      targetId: 'enqueue',
      kind: 'edge',
      issuedBy: 'reader',
      docId: await root.getAttribute('data-vs-doc'),
      sourceRevision: await root.getAttribute('data-vs-rev'),
      bodySha256: await byId(page, 'x-enqueue').getAttribute('data-vs-body'),
    });
  });

  test('@R03 a deselected quote does not reach a later packet', async ({ page, offOrigin: _ }) => {
    test.skip(isNarrow(page), 'per-block reference buttons are a desktop affordance');
    await openSnapshot(page);
    const paragraph = byId(page, 'x-p_takeaway').locator('p');
    await paragraph.evaluate((p) => {
      const range = document.createRange();
      range.selectNodeContents(p);
      window.getSelection()!.removeAllRanges();
      window.getSelection()!.addRange(range);
    });
    // Deselect outside reference mode, as a reader who changed their mind.
    await page.evaluate(() => window.getSelection()!.removeAllRanges());
    await byId(page, 'x-p_takeaway').hover();
    await byId(page, 'x-p_takeaway').locator('.vs-refbtn').click();
    const panel = page.locator('#vs-refpanel');
    await expect(panel.getByRole('button', { name: 'Copy reference with selected text' })).toBeDisabled();
  });

  test('@R03 copy reference with selected text excludes generated citation text', async ({ page, offOrigin: _ }) => {
    test.skip(isNarrow(page), 'per-block reference buttons are a desktop affordance');
    await installClipboardSpy(page);
    await openSnapshot(page);
    // Select the whole paragraph text, including its generated [source] marker.
    await byId(page, 'x-p_takeaway').locator('p').evaluate((p) => {
      const range = document.createRange();
      range.selectNodeContents(p);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
    });
    await byId(page, 'x-p_takeaway').hover();
    await byId(page, 'x-p_takeaway').locator('.vs-refbtn').click();
    const panel = page.locator('#vs-refpanel');
    await panel.getByRole('button', { name: 'Copy reference with selected text' }).click();
    const packet = parsePacket((await copiedTexts(page))[0]!);
    expect(packet.targetId).toBe('p_takeaway');
    expect(packet.quote?.exact.startsWith('The queue bounds the number of stored items')).toBe(true);
    expect(packet.quote?.exact).not.toContain('[source]');
  });

  for (const mode of ['reject', 'absent'] as const) {
    test(`clipboard ${mode === 'reject' ? 'denial' : 'absence'} shows a focused, fully selected fallback`, async ({ page, offOrigin: _ }) => {
      await denyClipboard(page, mode);
      await openSnapshot(page);
      await page.locator('#vs-btn-refmode').click();
      await showList(page, 'handoff');
      await byId(page, 'l-handoff.enqueue').click();
      await page.locator('#vs-refpanel').getByRole('button', { name: 'Copy reference', exact: true }).click();
      const area = page.locator('textarea#vs-copy-fallback');
      await expect(area).toBeVisible();
      await expect(area).toBeFocused();
      const selection = await area.evaluate((t: HTMLTextAreaElement) => [t.selectionStart, t.selectionEnd, t.value.length]);
      expect(selection[0]).toBe(0);
      expect(selection[1]).toBe(selection[2]);
      expect(parsePacket(await area.inputValue()).targetId).toBe('enqueue');
      await expect(page.locator('body')).not.toContainText('Copied');
    });
  }

  test('ordinary links still work outside reference mode', async ({ page, offOrigin: _ }) => {
    await openSnapshot(page);
    await page.locator('a.vs-focus').click();
    // On narrow screens the map is hidden; a highlighted list instance must be visible.
    await expect(page.locator('.vs-focused').filter({ visible: true }).first()).toBeVisible();
    await expect(page.locator('#vs-refpanel')).toHaveCount(0);
  });
});

test.describe('layout and print', () => {
  test('reflow: no page-wide horizontal scroll; text at least 14px', async ({ page, offOrigin: _ }) => {
    await openSnapshot(page);
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
    const small = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#vs-doc p, #vs-doc li, #vs-doc summary, svg text'))
        .filter((n) => (n as HTMLElement).getClientRects().length > 0)
        .map((n) => parseFloat(getComputedStyle(n).fontSize))
        .filter((size) => size < 14),
    );
    expect(small).toEqual([]);
  });

  test('narrow screens: the sticky toolbar is one row and scrolls sideways, not the page (dogfood-2 Q7)', async ({ page, offOrigin: _ }) => {
    test.skip(!isNarrow(page), 'the one-row toolbar rule applies to narrow viewports');
    await openSnapshot(page);
    const bar = page.locator('.vs-toolbar');
    await expect(bar).toBeVisible();
    const box = await bar.boundingBox();
    expect(box!.height).toBeLessThan(60);
    const tops = await page.evaluate(() => Array.from(document.querySelectorAll('.vs-toolbar button')).map((b) => Math.round(b.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    // The last button is reachable by scrolling the toolbar.
    const about = page.locator('.vs-toolbar button').last();
    await about.scrollIntoViewIfNeeded();
    await expect(about).toBeInViewport();
  });

  test('narrow screens: interactive list links and toolbar buttons are at least 44x44', async ({ page, offOrigin: _ }) => {
    test.skip(!isNarrow(page), 'target-size oracle applies to mobile viewports');
    await openSnapshot(page);
    const sizes = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.vs-rel-list a, .vs-toolbar button')).map((n) => {
        const r = n.getBoundingClientRect();
        return { id: n.id || n.textContent, w: r.width, h: r.height };
      }),
    );
    expect(sizes.filter((s) => s.w < 44 || s.h < 44)).toEqual([]);
  });

  test('deep link opens the collapsed detail', async ({ page, offOrigin: _ }) => {
    await openSnapshot(page, '#x-enqueue');
    await expect(byId(page, 'x-enqueue')).toHaveAttribute('open', '');
    await page.evaluate(() => { location.hash = '#x-dequeue'; });
    await expect(byId(page, 'x-dequeue')).toHaveAttribute('open', '');
  });

  test('beforeprint returns a moved detail to its placeholder', async ({ page, offOrigin: _ }) => {
    await openSnapshot(page);
    const idsBefore = await page.evaluate(() => Array.from(document.querySelectorAll('[id^="x-"]')).map((n) => n.id).sort());
    await showList(page, 'handoff');
    await byId(page, 'l-handoff.enqueue').click();
    await expectInspectorOpen(page, 'enqueue');
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await expectDetailHome(page, 'enqueue');
    const idsAfter = await page.evaluate(() => Array.from(document.querySelectorAll('[id^="x-"]')).map((n) => n.id).sort());
    expect(idsAfter).toEqual(idsBefore);
  });

  test('print media hides chrome and shows detail content', async ({ page, offOrigin: _ }) => {
    await openSnapshot(page);
    await page.emulateMedia({ media: 'print' });
    expect(await page.locator('.vs-toolbar').evaluate((n) => getComputedStyle(n).display)).toBe('none');
    await expect(byId(page, 'x-producer').locator('p:not([data-vs-generated])')).toBeVisible();
  });

  test('Expand details opens every detail but a self-check answer (phase 6a review C11)', async ({ page, offOrigin: _ }) => {
    await openSnapshot(page);
    await page.locator('#vs-btn-expand').click();
    // The reader answers a self-check first; print still opens the answer.
    expect(await page.locator('details:not([open]):not(.vs-self-check-answer)').count()).toBe(0);
    await expect(page.locator('details.vs-self-check-answer')).toHaveCount(1);
    await expect(page.locator('details.vs-self-check-answer')).not.toHaveAttribute('open', '');
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await expect(page.locator('details.vs-self-check-answer')).toHaveAttribute('open', '');
  });
});

test.describe('accessibility', () => {
  const SERIOUS = new Set(['serious', 'critical']);
  const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

  test('axe: no serious or critical violations on the initial page', async ({ page, offOrigin: _ }) => {
    await openSnapshot(page);
    const result = await new AxeBuilder({ page }).withTags(tags).analyze();
    expect(result.violations.filter((v) => SERIOUS.has(v.impact ?? '')).map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });

  test('axe: no serious or critical violations with the inspector open', async ({ page, offOrigin: _ }) => {
    await openSnapshot(page);
    await showList(page, 'handoff');
    await byId(page, 'l-handoff.enqueue').click();
    await expectInspectorOpen(page, 'enqueue');
    const result = await new AxeBuilder({ page }).withTags(tags).analyze();
    expect(result.violations.filter((v) => SERIOUS.has(v.impact ?? '')).map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
});

test.describe('without JavaScript', () => {
  test('@nojs toolbar stays hidden and details are reachable by link', async ({ page, offOrigin: _ }) => {
    await openSnapshot(page);
    await expect(page.locator('.vs-toolbar')).toBeHidden();
    await expect(byId(page, 'l-handoff.enqueue')).toBeVisible();
    await expect(byId(page, 'x-enqueue')).toBeAttached();
  });

  test('@nojs deep link brings the detail summary into view', async ({ page, offOrigin: _ }) => {
    await openSnapshot(page, '#x-enqueue');
    await expect(byId(page, 'x-enqueue').locator(':scope > summary')).toBeInViewport();
  });

  test('@nojs static HTML has unique ids and labelled summaries', async ({ page, offOrigin: _ }) => {
    await openSnapshot(page);
    const report = await page.evaluate(() => {
      const ids = Array.from(document.querySelectorAll('[id]')).map((n) => n.id);
      const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
      const unlabeled = Array.from(document.querySelectorAll('summary')).filter((s) => !(s.textContent ?? '').trim()).length;
      const brokenLinks = Array.from(document.querySelectorAll('a[href^="#"]'))
        .map((a) => a.getAttribute('href')!.slice(1))
        .filter((id) => id && !document.getElementById(decodeURIComponent(id)));
      return { duplicates, unlabeled, brokenLinks };
    });
    expect(report).toEqual({ duplicates: [], unlabeled: 0, brokenLinks: [] });
  });
});
