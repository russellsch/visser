// Phase 1 critical journeys (§17.4, §18.4) with the §18.8 oracles.
import { AxeBuilder } from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { parsePacket } from '../../packages/core/src/references/packet.ts';
import { byId, copiedTexts, denyClipboard, installClipboardSpy, isNarrow, openSnapshot, showMap, test } from './support.ts';

const APPENDIX = 'ex-appendix';

async function expectInspectorOpen(page: import('@playwright/test').Page, targetId: string) {
  if (isNarrow(page)) {
    const dialog = page.locator('dialog#ex-inspector-dialog');
    await expect(dialog).toHaveAttribute('open', '');
    expect(await dialog.evaluate((d) => d.matches(':modal'))).toBe(true);
    await expect(dialog.locator(`details[id="x-${targetId}"][open]`)).toBeVisible();
  } else {
    const aside = page.locator('aside#ex-inspector');
    await expect(aside).toBeVisible();
    await expect(aside.locator(`details[id="x-${targetId}"][open]`)).toBeVisible();
  }
  await expect(page.locator(`template[data-ex-placeholder="${targetId}"]`)).toHaveCount(1);
}

async function expectDetailHome(page: import('@playwright/test').Page, targetId: string) {
  const parent = await byId(page, `x-${targetId}`).evaluate((d) => d.parentElement?.id);
  expect(parent).toBe(APPENDIX);
  await expect(page.locator('template[data-ex-placeholder]')).toHaveCount(0);
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
    if (!isNarrow(page)) await expect(page.locator('aside#ex-inspector')).toBeHidden();
    else await expect(page.locator('dialog#ex-inspector-dialog')).not.toHaveAttribute('open', '');
  });

  test('@R04 inspect edge from the relationship list; close returns it to the appendix', async ({ page, offOrigin: _ }) => {
    await openSnapshot(page);
    const item = byId(page, 'l-handoff.enqueue');
    await item.click();
    await expectInspectorOpen(page, 'enqueue');
    // Nested inspection: the citation inside the edge detail replaces the view; Back returns.
    const host = isNarrow(page) ? page.locator('dialog#ex-inspector-dialog') : page.locator('aside#ex-inspector');
    await host.locator('a.ex-cite').click();
    await expect(host.locator('details[id="x-src_queue"][open]')).toBeVisible();
    expect(await byId(page, 'x-enqueue').evaluate((d) => d.parentElement?.id)).toBe(APPENDIX);
    await host.getByRole('button', { name: 'Back' }).click();
    await expect(host.locator('details[id="x-enqueue"][open]')).toBeVisible();
    await host.getByRole('button', { name: 'Close' }).click();
    await expectDetailHome(page, 'enqueue');
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('l-handoff.enqueue');
  });

  test('@R05 definition tooltip shows the first sentence and Escape dismisses it', async ({ page, offOrigin: _ }) => {
    test.skip(isNarrow(page), 'hover tooltip is a pointer affordance; tap opens the definition');
    await openSnapshot(page);
    await page.locator('a.ex-term').hover();
    const tip = page.locator('#ex-tooltip');
    await expect(tip).toHaveText('A mechanism that makes upstream work wait or slow down when a downstream resource cannot accept more work.');
    await page.keyboard.press('Escape');
    await expect(tip).toHaveCount(0);
  });

  test('@R05 tapping or clicking a term opens the persistent definition', async ({ page, offOrigin: _ }) => {
    await openSnapshot(page);
    await page.locator('a.ex-term').click();
    await expectInspectorOpen(page, 'def_backpressure');
  });
});

test.describe('reference mode', () => {
  test('@R03 @R12 select the graph relationship and copy a parseable packet', async ({ page, offOrigin: _ }) => {
    await installClipboardSpy(page);
    await openSnapshot(page);
    await page.locator('#ex-btn-refmode').click();
    await expect(page.locator('#ex-btn-refmode')).toHaveAttribute('aria-pressed', 'true');
    await showMap(page, 'handoff');
    // Click the edge label: the centre of an edge's bounding box can be empty canvas.
    await byId(page, 'v-handoff.enqueue').locator('text').click();
    const panel = page.locator('#ex-refpanel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('edge');
    // The nearest target is the edge, not the whole figure.
    await expect(byId(page, 'x-handoff')).not.toHaveClass(/ex-selected/);
    await panel.getByRole('button', { name: 'Copy reference', exact: true }).click();
    await expect(panel.locator('.ex-status')).toHaveText('Copied reference to the clipboard.');
    const [yaml] = await copiedTexts(page);
    const packet = parsePacket(yaml!);
    const root = page.locator('#ex-doc');
    expect(packet).toMatchObject({
      schema: 'explain-ref/1',
      targetId: 'enqueue',
      kind: 'edge',
      issuedBy: 'reader',
      docId: await root.getAttribute('data-ex-doc'),
      sourceRevision: await root.getAttribute('data-ex-rev'),
      bodySha256: await byId(page, 'x-enqueue').getAttribute('data-ex-body'),
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
    await byId(page, 'x-p_takeaway').locator('.ex-refbtn').click();
    const panel = page.locator('#ex-refpanel');
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
    await byId(page, 'x-p_takeaway').locator('.ex-refbtn').click();
    const panel = page.locator('#ex-refpanel');
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
      await page.locator('#ex-btn-refmode').click();
      await byId(page, 'l-handoff.enqueue').click();
      await page.locator('#ex-refpanel').getByRole('button', { name: 'Copy reference', exact: true }).click();
      const area = page.locator('textarea#ex-copy-fallback');
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
    await page.locator('a.ex-focus').click();
    // On narrow screens the map is hidden; a highlighted list instance must be visible.
    await expect(page.locator('.ex-focused').filter({ visible: true }).first()).toBeVisible();
    await expect(page.locator('#ex-refpanel')).toHaveCount(0);
  });
});

test.describe('layout and print', () => {
  test('reflow: no page-wide horizontal scroll; text at least 14px', async ({ page, offOrigin: _ }) => {
    await openSnapshot(page);
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
    const small = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#ex-doc p, #ex-doc li, #ex-doc summary, svg text'))
        .filter((n) => (n as HTMLElement).getClientRects().length > 0)
        .map((n) => parseFloat(getComputedStyle(n).fontSize))
        .filter((size) => size < 14),
    );
    expect(small).toEqual([]);
  });

  test('narrow screens: interactive list links and toolbar buttons are at least 44x44', async ({ page, offOrigin: _ }) => {
    test.skip(!isNarrow(page), 'target-size oracle applies to mobile viewports');
    await openSnapshot(page);
    const sizes = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.ex-rel-list a, .ex-toolbar button')).map((n) => {
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
    expect(await page.locator('.ex-toolbar').evaluate((n) => getComputedStyle(n).display)).toBe('none');
    await expect(byId(page, 'x-producer').locator('p:not([data-ex-generated])')).toBeVisible();
  });

  test('Expand details opens every detail', async ({ page, offOrigin: _ }) => {
    await openSnapshot(page);
    await page.locator('#ex-btn-expand').click();
    const closed = await page.locator('details:not([open])').count();
    expect(closed).toBe(0);
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
    await byId(page, 'l-handoff.enqueue').click();
    await expectInspectorOpen(page, 'enqueue');
    const result = await new AxeBuilder({ page }).withTags(tags).analyze();
    expect(result.violations.filter((v) => SERIOUS.has(v.impact ?? '')).map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
});

test.describe('without JavaScript', () => {
  test('@nojs toolbar stays hidden and details are reachable by link', async ({ page, offOrigin: _ }) => {
    await openSnapshot(page);
    await expect(page.locator('.ex-toolbar')).toBeHidden();
    await expect(byId(page, 'l-handoff.enqueue')).toBeVisible();
    await expect(byId(page, 'x-enqueue')).toBeAttached();
  });

  test('@nojs deep link brings the detail summary into view', async ({ page, offOrigin: _ }) => {
    await openSnapshot(page, '#x-enqueue');
    await expect(byId(page, 'x-enqueue').locator('summary')).toBeInViewport();
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
