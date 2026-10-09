// COV-27/28 exercise the release reader, not an isolated initializeMath call.
import { expect, test as base, type Locator } from '@playwright/test';
import { normalizedTextSha256 } from '../../packages/core/src/model/hash.ts';
import { inlineDoc, serveInline, type InlineServer } from './inline.ts';

const test = base.extend<{ offOrigin: string[] }>({
  offOrigin: async ({ page }, use) => {
    const requests: string[] = [];
    await page.route('**/*', route => {
      const url = route.request().url();
      if (url.startsWith('data:') || (server && new URL(url).origin === new URL(server.url).origin)) return route.fallback();
      requests.push(url); return route.abort();
    });
    await use(requests);
    expect(requests).toEqual([]);
  },
});

let server: InlineServer | undefined;
const longTex = (raw: string) => `${raw}+x_{${'a'.repeat(120)}}`;
const tex = (raw: string, long: boolean) => `$${long ? longTex(raw) : raw}$`;

function fixture(long: boolean): string {
  const m = (raw: string) => tex(raw, long);
  const excerpt = `Quote ${m('r_quote')}.\n`;
  const hash = normalizedTextSha256(new TextEncoder().encode(excerpt));
  return inlineDoc(`Reader ${m('doc_title')}`, `<!-- vs:id use -->
Use {% term ref="definition" %}term ${m('term_use')}{% /term %}. {% cite ref="source" /%}

{% graph id="viewer" mode="architecture" title="Viewer ${m('v_title')}" question="Question ${m('v_question')}?" %}
Body ${m('v_body')}.
{% node id="node" role="process" label="Node ${m('v_node')}" %}
Node detail ${m('v_detail')}.
{% /node %}
{% node id="sink" role="storage" label="Sink" /%}
{% edge id="edge" from="node" to="sink" kind="data" label="Edge ${m('i_title')}" %}
Edge detail ${m('detail_body')}.
{% /edge %}
{% /graph %}

{% graph id="state" mode="state" title="State" question="What changes?" %}
{% state id="idle" label="Idle" initial=true /%}
{% state id="done" label="Done" terminal=true /%}
{% transition id="qualified" from="idle" to="done" label="Advance ${m('qualified_title')}" event="go" guard="Guard ${m('i_qual')}" action="act" %}
Qualified detail ${m('i_detail')}.
{% /transition %}
{% /graph %}

{% definition id="definition" term="Definition ${m('term_def')}" %}
Definition body ${m('term_body')}. Another sentence.
{% /definition %}

{% detail id="appendix_detail" label="Appendix ${m('appendix_label')}" %}
Appendix body ${m('appendix_body')}.
{% /detail %}

{% source id="source" kind="example" title="Reference ${m('r_label')}" language="text" excerptSha256="${hash}" %}
\`\`\`text
${excerpt}\`\`\`
{% /source %}`);
}

test.afterEach(() => { server?.close(); server = undefined; });

for (const mode of ['success', 'nojs', 'failure', 'long', 'print'] as const) {
  test(`reader and viewer retain COV27–28 fields in ${mode} @M02 @M03 @M04 @M13${mode === 'nojs' ? ' @nojs' : ''}`, async ({ page, offOrigin: _ }, info) => {
    const nojs = info.project.name.includes('nojs');
    test.skip(nojs !== (mode === 'nojs'), 'one delivery mode per browser project');
    const long = mode === 'long';
    if (mode === 'failure') await page.route('**/math.js', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: 'throw new Error("deliberate math asset failure")' }));
    if (mode !== 'nojs') await page.addInitScript(() => {
      (window as unknown as { __copied: string[] }).__copied = [];
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value: string) => { (window as unknown as { __copied: string[] }).__copied.push(value); } } });
    });
    server = await serveInline(fixture(long));
    await page.goto(server.url);
    const viewer = page.locator('#x-viewer');
    const source = (scope: Locator, raw: string) => scope.locator('.vs-math-source').filter({ hasText: tex(raw, long) });
    const rendered = mode !== 'failure' && mode !== 'nojs';
    const assertMath = async (scope: Locator, raw: string, printing = false) => {
      const item = source(scope, raw);
      await expect(item).toHaveCount(1);
      await expect(item).toHaveText(tex(raw, long));
      if (rendered && !printing) {
        await expect(item.locator('..')).toHaveAttribute('data-vs-math-rendered', '');
        await expect(item.locator('..').locator('.vs-math-visual > svg')).toBeVisible();
      } else {
        await expect(item).toBeVisible();
        expect(await item.evaluate(node => getComputedStyle(node).clipPath)).toBe('none');
        await expect(item.locator('..').locator('.vs-math-visual')).toBeHidden();
      }
    };
    for (const raw of ['v_title', 'v_question', 'v_body', 'v_node', 'i_title'] as const) {
      const copies = source(viewer, raw);
      expect(await copies.count()).toBeGreaterThan(0);
      if (rendered) {
        for (const item of await copies.all()) await expect(item.locator('..')).toHaveAttribute('data-vs-math-rendered', '');
      } else {
        for (const item of await copies.all()) expect(await item.evaluate(node => getComputedStyle(node).clipPath)).toBe('none');
      }
    }
    for (const [id, raw] of [['node', 'v_detail'], ['edge', 'detail_body']] as const) {
      const copies = source(page.locator(`#x-${id}`), raw);
      await expect(copies).toHaveCount(1);
      if (rendered) await expect(copies.locator('..')).toHaveAttribute('data-vs-math-rendered', '');
      else expect(await copies.evaluate(node => getComputedStyle(node).clipPath)).toBe('none');
    }
    await expect(source(page.locator('#x-definition'), 'term_body')).toHaveCount(1);
    await expect(source(page.locator('#x-appendix_detail'), 'appendix_body')).toHaveCount(1);
    await expect(source(page.locator('#x-source'), 'r_label')).toHaveCount(1);
    await expect(page.locator('#x-source')).toContainText(tex('r_quote', long));

    if (mode === 'nojs') {
      await expect(viewer.getByRole('button', { name: 'Explore full diagram' })).toHaveCount(0);
      await expect(viewer.locator('.vs-lists')).toBeVisible();
      for (const [id, raw] of [['qualified', 'i_qual'], ['definition', 'term_body'], ['source', 'r_label'], ['appendix_detail', 'appendix_body'], ['edge', 'detail_body']] as const) {
        const detail = page.locator(`#x-${id}`);
        for (const ancestor of await detail.locator('xpath=ancestor::details').all()) if (await ancestor.getAttribute('open') === null) await ancestor.locator(':scope > summary').click();
        if (await detail.getAttribute('open') === null) await detail.locator(':scope > summary').click();
        await assertMath(detail, raw);
      }
      await assertMath(page.locator('#x-qualified > summary'), 'qualified_title');
      await assertMath(page.locator('#x-appendix_detail > summary'), 'appendix_label');
      await assertMath(viewer.locator('figcaption'), 'v_title');
      await assertMath(viewer.locator('[id="l-viewer.edge"]'), 'i_title');
      return;
    }

    // Use the canonical list path, never a potentially hidden SVG instance.
    await page.getByRole('button', { name: 'Text view', exact: true }).click();
    await page.locator('#x-state .vs-lists [data-vs-target="qualified"]').first().click();
    const narrow = (page.viewportSize()?.width ?? 0) <= 899;
    const inspector = page.locator('.vs-inspector').filter({ has: page.locator('#x-qualified') });
    await expect(inspector).toBeVisible();
    await assertMath(inspector.locator('.vs-inspector__title'), 'qualified_title');
    await expect(inspector.locator('.vs-sheet-qualifications, .vs-inspector__body')).toContainText(tex('i_qual', long));
    await assertMath(inspector, 'i_qual');
    await inspector.getByRole('button', { name: 'Close', exact: true }).click();

    await page.locator('a.vs-term').hover();
    const termTip = page.locator('#vs-tooltip');
    await assertMath(termTip, 'term_body');
    await expect(termTip.locator('.vs-tooltip__text')).toContainText(tex('term_body', long));
    await page.keyboard.press('Escape');
    await page.locator('a.vs-cite').hover();
    const citeTip = page.locator('#vs-tooltip');
    await assertMath(citeTip, 'r_label');
    await expect(citeTip.locator('.vs-tooltip__text')).toContainText(tex('r_label', long));
    await page.keyboard.press('Escape');

    const filter = page.getByLabel('Filter details and evidence');
    await filter.fill('Appendix');
    await expect(page.locator('#x-appendix_detail')).toBeVisible();
    await assertMath(page.locator('#x-appendix_detail > summary'), 'appendix_label');
    await expect(page.locator('#x-source')).toBeHidden();
    await filter.fill('');

    await page.locator('#vs-btn-refmode').click();
    await page.locator('#x-viewer .vs-lists [data-vs-target="edge"]').first().click();
    const panel = page.locator('#vs-refpanel');
    await expect(panel).toBeVisible();
    await assertMath(panel, 'i_title');
    await page.evaluate(() => {
      const node = document.querySelector('[id="l-viewer.edge"] .vs-math-source')!;
      const range = document.createRange(); range.selectNodeContents(node);
      const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await page.locator('#x-viewer .vs-lists [data-vs-target="edge"]').first().click();
    await panel.getByRole('button', { name: 'Copy reference with selected text', exact: true }).click();
    const packet = await page.evaluate(() => (window as unknown as { __copied: string[] }).__copied.at(-1));
    expect(packet).toContain(`label: "Edge ${tex('i_title', long)}"`);
    expect(packet).toContain(`exact: "${tex('i_title', long)}"`);
    await panel.getByRole('button', { name: 'Close', exact: true }).click();
    await page.locator('#vs-btn-refmode').click();

    // Native graphs have no authored source pane. The viewer moves its drawing and
    // list; Mermaid source is deferred, so this deliberately does not claim it.
    if (mode === 'failure') {
      await assertMath(viewer.locator('figcaption'), 'v_title');
      await expect(viewer.locator('.vs-lists')).toBeVisible();
      return;
    }
    await page.getByRole('button', { name: 'Text view', exact: true }).click();
    if (!narrow) {
      await expect(viewer.locator('.vs-viewport > svg')).toBeVisible();
      return;
    }
    // This field is copied into the viewer sheet rather than only moved as a fact.
    await page.locator('#x-state').getByRole('button', { name: 'Explore full diagram' }).click();
    const qualifiedViewer = page.locator('.vs-figure-viewer');
    await qualifiedViewer.locator('.vs-viewer-parts > summary').click();
    await qualifiedViewer.locator('.vs-viewer-parts [data-vs-target="qualified"]').first().click();
    await assertMath(qualifiedViewer.locator('.vs-sheet-qualifications'), 'i_qual');
    await qualifiedViewer.getByRole('button', { name: 'Back to article' }).click();
    await expect(viewer.getByRole('button', { name: 'Explore full diagram' })).toBeVisible();
    await page.evaluate(() => {
      const figure = document.querySelector('#x-viewer')!;
      const list = figure.querySelector('.vs-lists')!;
      const drawing = figure.querySelector('.vs-viewport > svg')!;
      (window as any).__mathViewNodes = { figure, list, drawing, slots: [...drawing.querySelectorAll('[data-vs-math-native]')], ids: [...figure.querySelectorAll('[id]'), figure, document.querySelector('#x-edge')!].map(node => [node.id, node]) };
    });
    const assertIdentity = async () => expect(await page.evaluate(() => {
      const { figure, list, drawing, slots, ids } = (window as any).__mathViewNodes;
      const activeList = document.querySelector('.vs-figure-viewer .vs-viewer-parts .vs-lists') ?? figure.querySelector('.vs-lists');
      const same = document.querySelector('#x-viewer') === figure && activeList === list && figure.querySelector('.vs-viewport > svg') === drawing && slots.every((node: Element) => node.isConnected && drawing.contains(node));
      const unique = ids.every(([id, node]: [string, Element]) => document.querySelectorAll(`[id="${CSS.escape(id)}"]`).length === 1 && document.getElementById(id) === node);
      const references = [drawing, ...drawing.querySelectorAll('*')].every((node: Element) => [...node.attributes].every(attribute => [...attribute.value.matchAll(/url\(#([^)]+)\)/g)].every(match => document.querySelectorAll(`[id="${CSS.escape(match[1]!)}"]`).length === 1)));
      return same && unique && references;
    })).toBe(true);
    await viewer.getByRole('button', { name: 'Explore full diagram' }).click();
    await assertIdentity();
    const dialog = page.locator('.vs-figure-viewer');
    await expect(dialog).toBeVisible();
    await assertMath(dialog.locator('.vs-viewer-title'), 'v_title');
    await expect(dialog.locator('.vs-viewport > svg')).toBeVisible();
    for (const raw of ['v_node', 'i_title']) {
      const key = JSON.stringify([false, long ? longTex(raw) : raw]);
      const slots = dialog.locator('[data-vs-math-native]');
      const matches = [];
      for (const slot of await slots.all()) if (await slot.getAttribute('data-vs-math-key') === key) matches.push(slot);
      expect(matches.length).toBe(1);
      await expect(matches[0]!).toHaveAttribute('data-vs-math-rendered', '');
      await expect(matches[0]!.locator(':scope > svg')).toBeVisible();
    }
    await dialog.locator('.vs-viewer-parts > summary').click();
    await expect(dialog.locator('.vs-viewer-parts .vs-lists')).toBeVisible();
    await assertMath(dialog.locator('.vs-viewer-parts [id="l-viewer.node"]'), 'v_node');
    const part = dialog.locator('.vs-viewer-parts [data-vs-target="edge"]').first();
    await part.click();
    await expect(dialog.locator('.vs-inspector--sheet #x-edge')).toBeVisible();
    await expect(page.locator('#x-edge')).toHaveCount(1);
    await assertMath(dialog.locator('.vs-inspector--sheet #x-edge'), 'detail_body');
    await assertMath(dialog.locator('.vs-viewer-parts [id="l-viewer.edge"]'), 'i_title');

    if (mode === 'print') {
      await page.emulateMedia({ media: 'print' });
      await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
      await expect(dialog).toHaveCount(0);
      await expect(page.locator('#x-edge')).toBeVisible();
      await expect(viewer.locator('.vs-lists')).toBeVisible();
      await expect(viewer.locator('.vs-viewport')).toBeHidden();
      await expect(viewer.locator('.vs-node-list > li')).toHaveCount(2);
      await expect(viewer.locator('.vs-rel-list > li')).toHaveCount(1);
      await assertMath(viewer.locator('[id="l-viewer.node"]'), 'v_node', true);
      await assertMath(viewer.locator('[id="l-viewer.edge"]'), 'i_title', true);
      const endpoints = viewer.locator('[id="l-viewer.edge"]').locator('..').locator('.vs-rel-endpoint');
      await expect(endpoints).toHaveCount(2);
      await assertMath(endpoints.nth(0), 'v_node', true);
      await expect(endpoints.nth(1)).toHaveText('Sink');
      await expect(endpoints.nth(1)).toBeVisible();
      const printSource = source(viewer, 'v_title');
      await expect(printSource).toBeVisible();
      expect(await printSource.evaluate(node => getComputedStyle(node).clipPath)).toBe('none');
      await expect(printSource.locator('..').locator('.vs-math-visual')).toBeHidden();
      for (const [id, raw] of [['qualified', 'i_qual'], ['definition', 'term_body'], ['source', 'r_label'], ['appendix_detail', 'appendix_body'], ['edge', 'detail_body']] as const) await assertMath(page.locator(`#x-${id}`), raw, true);
      await assertMath(page.locator('#x-qualified > summary'), 'qualified_title', true);
      await assertMath(page.locator('#x-appendix_detail > summary'), 'appendix_label', true);
      await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
      await page.emulateMedia({ media: 'screen' });
      await expect(page.locator('#x-edge')).not.toHaveAttribute('open', '');
      await expect(page.locator('#x-edge')).toHaveCount(1);
    } else {
      await dialog.getByRole('button', { name: 'Back to article' }).click();
      await expect(page.locator('.vs-figure-viewer')).toHaveCount(0);
      await expect(viewer.locator('.vs-viewport > svg')).toBeVisible();
    }
    await assertIdentity();
    await expect(viewer).toBeVisible();
    await expect(viewer.locator('.vs-viewport > svg')).toBeVisible();
    for (const slot of await viewer.locator('[data-vs-math-native]').all()) {
      await expect(slot).toHaveAttribute('data-vs-math-rendered', '');
      await expect(slot.locator(':scope > svg')).toBeVisible();
    }
    await page.getByRole('button', { name: 'Text view', exact: true }).click();
    await expect(viewer.locator('.vs-lists')).toHaveCount(1);
    await expect(viewer.locator('.vs-lists')).toBeVisible();
    await assertMath(viewer.locator('[id="l-viewer.edge"]'), 'i_title');
    await assertMath(viewer.locator('[id="l-viewer.node"]'), 'v_node');
    await assertIdentity();
  });
}
