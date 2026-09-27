// Mermaid behaviour on documents written by the tests (Phase 2b review fixes):
// transitions with notes, derived arrows, two figures on one page, a render
// failure in one figure, and prefix node names.
import { expect } from '@playwright/test';
import { test as base } from '@playwright/test';
import { byId } from './support.ts';
import { inlineDoc, serveInline, type InlineServer } from './inline.ts';

const figure = (id: string, title: string, source: string) => `{% mermaid id="${id}" title="${title}" question="What does ${title.toLowerCase()} show?" %}
\`\`\`mermaid
${source}
\`\`\`
{% /mermaid %}`;

const STATE_WITH_NOTES = 'stateDiagram-v2\n  [*] --> Idle\n  Idle --> Busy : start\n  note right of Idle : waits here\n  Busy --> Idle : done\n  note left of Busy : works\n  Busy --> [*]';

let server: InlineServer | undefined;

// Network guard for inline documents: only the inline server's own origin (§18.8).
const test = base.extend<{ offOrigin: string[] }>({
  offOrigin: async ({ page }, use) => {
    const offOrigin: string[] = [];
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (url.startsWith('data:') || (server && new URL(url).origin === new URL(server.url).origin)) return route.fallback();
      offOrigin.push(url);
      return route.abort();
    });
    await use(offOrigin);
    expect(offOrigin, 'requests that left the origin').toEqual([]);
  },
});
test.afterEach(() => { server?.close(); server = undefined; });

const drawn = (id: string) => `[id="m-${id}"] svg`;

test.describe('Mermaid review fixes on inline documents', () => {
  test.beforeEach(({ }, info) => {
    test.skip(info.project.name !== 'chromium-1440', 'inline documents run once, at desktop width');
  });

  test('state transitions map to the drawn edges when the diagram has notes', async ({ page, offOrigin: _ }) => {
    server = await serveInline(inlineDoc('Worker states', figure('worker', 'Worker states', STATE_WITH_NOTES)));
    await page.goto(server.url);
    await expect(page.locator(drawn('worker'))).toBeAttached({ timeout: 20_000 });
    const rows = await page.evaluate(() => Array.from(document.querySelectorAll('[data-vs-mermaid-key^="transition:"]')).map((el) => {
      const rel = el.getAttribute('data-vs-rel')!;
      const matches = Array.from(document.querySelectorAll(`[id="m-worker"] svg [data-vs-rel="${rel}"]`));
      return { key: el.getAttribute('data-vs-mermaid-key'), rel, drawn: matches.length, labels: matches.map((m) => (m.textContent ?? '').trim()).filter(Boolean), listText: (el.textContent ?? '').trim() };
    }));
    expect(rows.map((r) => r.key).sort()).toEqual(['transition:1', 'transition:3']);
    for (const r of rows) {
      expect(r.drawn, `${r.key} has drawn elements`).toBeGreaterThan(0);
      // The drawn label of the mapped edge is this transition's own label.
      const own = r.rel.includes('~idle~busy~') ? 'start' : 'done';
      expect(r.labels, r.key ?? "?").toContain(own);
    }
    // Initial and terminal markers show in the list.
    await expect(page.locator('[id="x-worker"]')).toContainText('(state, initial)');
    await expect(page.locator('[id="x-worker"]')).toContainText('(state, terminal)');
  });

  test('a drawn derived arrow is not interactive, and reference mode explains why it selects the diagram', async ({ page, offOrigin: _ }) => {
    server = await serveInline(inlineDoc('Worker states', figure('worker', 'Worker states', STATE_WITH_NOTES)));
    await page.goto(server.url);
    await expect(page.locator(drawn('worker'))).toBeAttached({ timeout: 20_000 });
    const arrow = page.locator(`${drawn('worker')} [data-vs-mermaid-derived]`).first();
    await expect(arrow).toBeAttached();
    expect(await arrow.getAttribute('data-vs-interactive')).toBeNull();
    expect(await arrow.evaluate((e) => getComputedStyle(e).cursor)).not.toBe('pointer');
    await arrow.dispatchEvent('click');
    await expect(page.locator('aside#vs-inspector')).toBeHidden();
    await page.locator('#vs-btn-refmode').click();
    await arrow.dispatchEvent('click');
    await expect(page.locator('#vs-refpanel')).toContainText('This arrow has no ID of its own; the reference is to the diagram.');
  });

  test('two Mermaid figures on one page both render with distinct render IDs', async ({ page, offOrigin: _ }) => {
    server = await serveInline(inlineDoc('Two figures', `${figure('first', 'First flow', 'flowchart LR\n  Api --> ApiGateway')}\n\n${figure('second', 'Second flow', 'flowchart LR\n  Client --> Server')}`));
    await page.goto(server.url);
    await expect(page.locator(drawn('first'))).toBeAttached({ timeout: 20_000 });
    await expect(page.locator(drawn('second'))).toBeAttached({ timeout: 20_000 });
    const ids = await page.evaluate(() => Array.from(document.querySelectorAll('[id]')).map((e) => e.id));
    expect(new Set(ids).size).toBe(ids.length);
    // Prefix names map to their own drawn node only.
    const api = await page.locator(`${drawn('first')} [data-vs-target="api"]`).evaluateAll((els) => els.map((e) => e.id));
    const gateway = await page.locator(`${drawn('first')} [data-vs-target="apigateway"]`).evaluateAll((els) => els.map((e) => e.id));
    expect(api.length).toBeGreaterThan(0);
    expect(gateway.length).toBeGreaterThan(0);
    expect(api.some((id) => gateway.includes(id))).toBe(false);
    expect(api.every((id) => /-flowchart-Api-\d+$/.test(id))).toBe(true);
  });

  test('a render failure in one figure leaves the other figure drawn and nothing stray', async ({ page, offOrigin: _ }) => {
    // Figure-level types are not parsed at build time, so an invalid ER diagram
    // passes the build and fails only in the browser.
    server = await serveInline(inlineDoc('One broken figure', `${figure('good', 'Good flow', 'flowchart LR\n  Client --> Server')}\n\n${figure('bad', 'Broken schema', 'erDiagram\n  CUSTOMER ||--|{ :')}`));
    await page.goto(server.url);
    await expect(page.locator(drawn('good'))).toBeAttached({ timeout: 20_000 });
    const notice = byId(page, 'x-bad').locator('.vs-mermaid-notice');
    await expect(notice).toBeVisible({ timeout: 20_000 });
    await expect(notice).toHaveText('This diagram could not be drawn. Its source is shown instead.');
    await expect(byId(page, 'x-bad').locator('pre.vs-mermaid-source')).toBeVisible();
    const bodyChildren = await page.evaluate(() => Array.from(document.body.children).map((e) => e.localName + (e.id ? `#${e.id}` : '')));
    expect(bodyChildren.filter((c) => !['nav', 'main#vs-doc', 'script', 'aside#vs-inspector', 'dialog#vs-inspector-dialog'].includes(c))).toEqual([]);
  });

  test('a Mermaid page without a valid integrity value makes no mermaid.js request and shows the notice', async ({ page, offOrigin: _ }) => {
    server = await serveInline(inlineDoc('No digest', figure('flow', 'Flow', 'flowchart LR\n  Client --> Server')));
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    await page.route('**/index.html', async (route) => {
      const response = await route.fetch();
      const html = (await response.text()).replace(/<meta name="vs-mermaid" content="[^"]*">/, '<meta name="vs-mermaid" content="">');
      await route.fulfill({ response, body: html });
    });
    await page.goto(server.url);
    await expect(byId(page, 'x-flow').locator('.vs-mermaid-notice')).toBeVisible({ timeout: 20_000 });
    expect(requests.filter((u) => u.endsWith('/mermaid.js'))).toEqual([]);
  });
});
