import { expect, test, type Locator } from '@playwright/test';
import { graphSvg } from '../../packages/core/src/compiler/svg.ts';
import { render } from '../../packages/core/src/compiler/html.ts';
import { measureRichText, mathMetricKey } from '../../packages/core/src/compiler/math-text.ts';
import { convertMath } from '../../packages/core/src/math/engine.ts';
// @ts-expect-error jsdom is supplied by the browser harness.
import { JSDOM } from 'jsdom';
import { inlineDoc, serveInline, type InlineServer } from './inline.ts';

const tex = (name: string, long: boolean) => long ? `${name}+x_{${'a'.repeat(120)}}` : name;
const math = (name: string, long: boolean) => `$${tex(name, long)}$`;
const servers = new Map<boolean, InlineServer>();

test.beforeAll(async () => {
  for (const long of [false, true]) servers.set(long, await serveInline(inlineDoc('Fold math', `
{% graph id="graph" mode="architecture" title="Folded graph" question="What crosses the boundary?" %}
{% group id="group" label="Group ${math('f_g', long)}" collapsed=true %}
Group details.
{% /group %}
{% node id="inside" group="group" role="process" label="Inside ${math('f_i', long)}" %}
Inside details.
{% /node %}
{% node id="outside" role="process" label="Outside ${math('f_o', long)}" %}
Outside details.
{% /node %}
{% edge id="edge" from="inside" to="outside" kind="call" label="Flow ${math('f_e', long)}" %}
Edge details.
{% /edge %}
{% /graph %}
`)));
});
test.afterAll(() => { for (const server of servers.values()) server.close(); });

// Force the documented crowded-route fallback at the layout/renderer seam.
// Labels, source lists and expression records still come from the real compiler.
function crowdedSvg(long: boolean): string {
  const labels: Record<string, string> = { group: `Group ${math('f_g', long)}`, inside: `Inside ${math('f_i', long)}`, outside: `Outside ${math('f_o', long)}`, edge: `Flow ${math('f_e', long)}` };
  const metrics = Object.fromEntries(['f_g', 'f_i', 'f_o', 'f_e'].map(name => [mathMetricKey(tex(name, long)), convertMath(tex(name, long), false).metrics]));
  const rich = (id: string) => measureRichText(labels[id]!, 10000, metrics, text => text.length * 7)!.lines;
  return render(graphSvg({
    figureId: 'graph', title: 'Crowded fold graph', collapsed: ['group'],
    parentOf: id => id === 'inside' ? 'group' : undefined,
    labelOf: id => labels[id] ?? id, roleOf: () => undefined, kindOf: () => 'call',
    relationship: id => id === 'edge' ? { from: 'inside', to: 'outside' } : undefined,
    layout: { width: 600, height: 300,
      groups: [{ id: 'group', label: labels['group']!, x: 0, y: 0, width: 200, height: 160, richLines: rich('group') }],
      nodes: [
        { id: 'inside', x: 50, y: 30, width: 80, height: 80, lines: [labels['inside']!], richLines: rich('inside') },
        { id: 'outside', x: 450, y: 200, width: 80, height: 40, lines: [labels['outside']!], richLines: rich('outside') },
        { id: 'crowded', x: 0, y: 0, width: 600, height: 300, lines: ['crowded'] },
      ],
      edges: [{ id: 'edge', points: [{ x: 100, y: 53 }, { x: 490, y: 53 }, { x: 490, y: 200 }], label: { x: 70, y: 75, width: 90, height: 24, lines: [labels['edge']!], richLines: rich('edge') } }],
    },
  }));
}

async function expectNative(scope: Locator, name: string, long: boolean) {
  const slots = scope.locator('[data-vs-math-native]');
  const matching = [];
  for (const slot of await slots.all()) if (await slot.getAttribute('data-vs-math-key') === JSON.stringify([false, tex(name, long)])) matching.push(slot);
  expect(matching.length, name).toBeGreaterThan(0);
  for (const slot of matching) {
    await expect(slot).toHaveAttribute('data-vs-math-rendered', '');
    await expect(slot.locator(':scope > svg')).toBeVisible();
    const dimensions = await slot.evaluate(element => ({ width: Number(element.getAttribute('width')), height: Number(element.getAttribute('height')) }));
    expect(dimensions.width).toBeGreaterThan(0);
    expect(dimensions.height).toBeGreaterThan(0);
  }
}

for (const crowded of [false, true]) for (const mode of ['success', 'nojs', 'failure', 'long', 'print'] as const) {
  test(`${crowded ? 'crowded proxy callout' : 'fold labels and graph endpoints'} survive ${mode} @M02 @M03 @M10 @M13${mode === 'nojs' ? ' @nojs' : ''}`, async ({ page }) => {
    const long = mode === 'long';
    if (mode === 'failure') await page.addInitScript(() => { window.Worker = class { constructor() { throw new Error('deliberate worker failure'); } } as unknown as typeof Worker; });
    const server = servers.get(long)!;
    if (crowded) await page.route(server.url, async route => {
      const response = await route.fetch();
      const document: Document = new JSDOM(await response.text()).window.document;
      document.querySelector('#x-graph .vs-viewport')!.innerHTML = crowdedSvg(long);
      expect(document.querySelectorAll('.vs-proxy-callout')).toHaveLength(1);
      await route.fulfill({ response, body: `<!doctype html>${document.documentElement.outerHTML}` });
    });
    await page.goto(server.url);
    const figure = page.locator('#x-graph');
    const lists = figure.locator('.vs-lists');
    if (mode === 'success' || mode === 'long' || mode === 'print') await expect(figure).toHaveAttribute('data-vs-math-ready', '');
    if (mode === 'success' || mode === 'long') {
      // At narrow widths the real viewer owns diagram interaction.
      const explore = figure.getByRole('button', { name: 'Explore full diagram' });
      if (await explore.isVisible()) await explore.click();
      const fold = figure.locator('[data-vs-fold="group"]');
      const toggle = figure.locator('[data-vs-fold-toggle="group"]');
      await expect(fold).toBeVisible();
      await expect(fold).toHaveAttribute('role', 'button');
      await expect(fold).toHaveAttribute('aria-label', new RegExp('Group.*f_g'));
      await expectNative(fold, 'f_g', long);
      const proxy = figure.locator(crowded ? '.vs-proxy-callout[data-vs-proxy-for="edge"]:visible' : '[data-vs-proxy-for="edge"]:visible');
      if (crowded) {
        for (const name of ['f_i', 'f_e', 'f_o']) await expectNative(proxy.locator('.vs-proxy-callout-context'), name, long);
        await expectNative(proxy.locator('.vs-edge-label'), 'f_e', long);
        const contained = await proxy.evaluate(element => {
          const panel = element.querySelector('.vs-proxy-callout-bg')!.getBoundingClientRect();
          return [...element.querySelectorAll('[data-vs-math-native]')].every(slot => {
            const box = slot.getBoundingClientRect();
            return box.left >= panel.left - 1 && box.right <= panel.right + 1 && box.top >= panel.top - 1 && box.bottom <= panel.bottom + 1;
          });
        });
        expect(contained).toBe(true);
      }
      await expectNative(proxy, 'f_e', long);
      await fold.focus();
      await page.keyboard.press('Enter');
      await expect(fold).toBeHidden();
      await expect(toggle).toBeFocused();
      await expectNative(figure.locator('[id="v-graph.inside"]'), 'f_i', long);
      await expectNative(figure.locator('[id="v-graph.edge"]'), 'f_e', long);
      await page.keyboard.press('Space');
      await expect(fold).toBeVisible();
      await expect(fold).toBeFocused();
      await expectNative(proxy, 'f_e', long);
      const back = page.getByRole('button', { name: 'Back to article' });
      if (await back.isVisible()) await back.click();
      await page.getByRole('button', { name: 'Text view', exact: true }).click();
    } else if (mode === 'print') {
      await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
      await page.emulateMedia({ media: 'print' });
    }
    await expect(lists).toBeVisible();
    for (const [id, name] of [['group', 'f_g'], ['inside', 'f_i'], ['outside', 'f_o'], ['edge', 'f_e']]) {
      const source = lists.locator(`[id="l-graph.${id}"] .vs-math-source`).filter({ hasText: math(name!, long) });
      await expect(source).toHaveText(math(name!, long));
      if (mode === 'success' || mode === 'long') await expect(source.locator('..').locator('.vs-math-visual > svg')).toBeVisible();
      else {
        await expect(source).toBeVisible();
        expect(await source.evaluate(element => getComputedStyle(element).clipPath)).toBe('none');
        await expect(source.locator('..').locator('.vs-math-visual')).toBeHidden();
      }
    }
    const edgeRow = lists.locator('[id="l-graph.edge"]').locator('..');
    for (const name of ['f_i', 'f_o']) {
      const endpoint = edgeRow.locator('.vs-math-source').filter({ hasText: math(name, long) });
      await expect(endpoint).toHaveText(math(name, long));
      if (mode === 'success' || mode === 'long') await expect(endpoint.locator('..').locator('.vs-math-visual > svg')).toBeVisible();
      else {
        await expect(endpoint).toBeVisible();
        expect(await endpoint.evaluate(element => getComputedStyle(element).clipPath)).toBe('none');
        await expect(endpoint.locator('..').locator('.vs-math-visual')).toBeHidden();
      }
    }
    if (mode === 'nojs' || mode === 'failure' || mode === 'print') await expect(figure.locator('.vs-viewport')).toBeHidden();
  });
}
