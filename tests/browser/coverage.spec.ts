// R06/R14 semantic equivalence (§18.2) and T12/T13 (§18.1): every view of every
// example exposes the model's targets and relationships through data-vs-target
// and data-vs-rel; narrow and no-JavaScript views keep each relationship
// visible; HTML ids never repeat; a cross-block selection is never truncated
// silently.
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { parsePacket } from '../../packages/core/src/references/packet.ts';
import { EXAMPLES } from './examples.ts';
import { byId, copiedTexts, installClipboardSpy, isPrimaryDesktop, openSnapshot, test } from './support.ts';

const root = new URL('../..', import.meta.url).pathname;

type ViewFacts = { targets: string[]; rels: string[]; visibleRels: string[]; duplicateIds: string[] };

async function viewFacts(page: Page): Promise<ViewFacts> {
  return page.evaluate(() => {
    const doc = document.getElementById('vs-doc') ?? document.body;
    const all = Array.from(doc.querySelectorAll<HTMLElement | SVGElement>('[data-vs-target], [data-vs-rel]'));
    const targets = new Set<string>();
    const rels = new Set<string>();
    const visibleRels = new Set<string>();
    const visible = (el: Element) => {
      // Content inside a closed <details> is not rendered; checkVisibility reports that.
      const check = (el as Element & { checkVisibility?: (o?: object) => boolean }).checkVisibility;
      if (check) return check.call(el, { visibilityProperty: true });
      const box = el.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    };
    for (const el of all) {
      const t = el.getAttribute('data-vs-target');
      if (t) targets.add(t);
      const r = el.getAttribute('data-vs-rel');
      if (r) {
        rels.add(r);
        if (visible(el)) visibleRels.add(r);
      }
    }
    const seen = new Map<string, number>();
    for (const el of Array.from(document.querySelectorAll('[id]'))) seen.set(el.id, (seen.get(el.id) ?? 0) + 1);
    const duplicateIds = [...seen].filter(([, n]) => n > 1).map(([id]) => id);
    return { targets: [...targets].sort(), rels: [...rels].sort(), visibleRels: [...visibleRels].sort(), duplicateIds };
  });
}

for (const example of EXAMPLES) {
  const model = loadBundle(join(root, 'examples', example, 'index.md')).model;
  const expectedTargets = [...model.targets.keys()].sort();
  const expectedRels = model.relationships.map((r) => r.id).sort();

  const check = async (page: Page, narrowOrNoJs: boolean) => {
    await openSnapshot(page, '', example);
    const facts = await viewFacts(page);
    expect(facts.duplicateIds, 'duplicate HTML ids').toEqual([]);
    expect(facts.targets, 'targets in the view').toEqual(expectedTargets);
    expect(facts.rels, 'relationships in the view').toEqual(expectedRels);
    if (narrowOrNoJs) {
      const hidden = expectedRels.filter((r) => !facts.visibleRels.includes(r));
      expect(hidden, 'relationships with no visible instance').toEqual([]);
    }
  };

  test(`@R06 @R14 @T12 ${example}: rendered view matches the model`, async ({ page, offOrigin: _ }, info) => {
    await check(page, (page.viewportSize()?.width ?? 1440) <= 899 || info.project.name.includes('nojs'));
  });

  test(`@R06 @R14 @T12 @nojs ${example}: no-JavaScript view matches the model`, async ({ page }) => {
    await check(page, true);
  });
}

test('@T13 a cross-block selection is explicit, never silently truncated', async ({ page, offOrigin: _ }, info) => {
  test.skip(!isPrimaryDesktop(info.project.name), 'the per-block reference button is a desktop affordance');
  await installClipboardSpy(page);
  await openSnapshot(page);
  // Select from inside the first paragraph into the second one.
  await page.evaluate(() => {
    const a = document.querySelector('[id="x-p_takeaway"]')!;
    const b = document.querySelector('[id="x-p_limits"]')!;
    // First author text node (skip generated text such as the reference button).
    const authorText = (el: Element): Text => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.parentElement?.closest('[data-vs-generated]') && (n.textContent ?? '').length > 12) return n as Text;
      }
      throw new Error(`no author text in ${el.id}`);
    };
    const first = authorText(a);
    const second = authorText(b);
    const range = document.createRange();
    range.setStart(first, 4);
    range.setEnd(second, 10);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  const block = byId(page, 'x-p_takeaway');
  await block.hover();
  await block.locator('.vs-refbtn').click();
  const panel = page.locator('#vs-refpanel');
  await expect(panel).toBeVisible();
  const withText = panel.getByRole('button', { name: 'Copy reference with selected text' });
  if (await withText.isEnabled()) await withText.click();
  const copied = await copiedTexts(page);
  const restriction = await panel.textContent();
  // Either explicit multiple targets, or a visible single-target restriction
  // (a disabled button counts only when the panel says why).
  const explicitMulti = copied.some((text) => /\ntargets:/.test(text));
  const visibleRestriction = /one block|single block|within one|one target/i.test(restriction ?? '');
  expect(explicitMulti || visibleRestriction, `multi-block selection is explicit; panel text: ${restriction}`).toBe(true);
  // No silent truncation: a single-target packet never carries text from another block.
  for (const text of copied) {
    const packet = parsePacket(text);
    expect(packet.quote?.exact ?? '').not.toContain('This is a teaching');
  }
});
