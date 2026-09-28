// R10 project-subpath export (§13.5, §17.7 4b): the exported site served by a
// generic static server under /visser-demo/, with no CSP header and no
// rewrite rules. The `offOrigin` fixture fails a test if any request leaves the
// prefix or if the console reports a CSP violation.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect } from '@playwright/test';
import { parsePacket } from '../../packages/core/src/references/packet.ts';
import { EXAMPLES } from './examples.ts';
import { byId, copiedTexts, EXPORT_ORIGIN, EXPORT_PREFIX, exportedUrl, installClipboardSpy, isNarrow, showMap, test } from './support.ts';

const root = new URL('../..', import.meta.url).pathname;
const cli = join(root, 'dist/release/bin/visser.cjs');
const release = join(root, 'dist/release');
const siteIndex = `${EXPORT_ORIGIN}${EXPORT_PREFIX}`;

test.describe('@R10 exported site under a project prefix', () => {
  test('standalone HTML opens from file:// with its runtime and Mermaid diagram', async ({ page }, info) => {
    test.skip(info.project.name.includes('nojs'), 'the standalone runtime check needs JavaScript');
    const repo = mkdtempSync(join(tmpdir(), 'visser-standalone-'));
    mkdirSync(join(repo, '.git'));
    const doc = join(repo, 'docs/mermaid-flowchart');
    cpSync(join(root, 'examples/mermaid-flowchart'), doc, { recursive: true });
    const out = join(repo, 'diagram.html');
    const exported = spawnSync(process.execPath, [cli, 'export', join(doc, 'index.md'), '--out', out, '--dev-toolkit', release], { cwd: repo, encoding: 'utf8' });
    expect(exported.status, exported.stderr).toBe(0);

    const requests: string[] = [];
    const cspErrors: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    page.on('console', (message) => {
      if (/Content Security Policy|Refused to/i.test(message.text())) cspErrors.push(message.text());
    });
    await page.goto(pathToFileURL(out).href);
    await expect(page.locator('.vs-toolbar')).toBeVisible();
    await showMap(page, 'cdn_path');
    await expect(page.locator('[id="m-cdn_path"] svg').first()).toBeAttached({ timeout: 20_000 });
    await expect(byId(page, 'x-cdn_path').locator('.vs-mermaid-notice')).toBeHidden();
    expect(requests.every((url) => url.startsWith('file:') || url.startsWith('data:')), requests.join('\n')).toBe(true);
    expect(cspErrors).toEqual([]);
  });

  test('@R10 the collection index links to every exported document, and each link opens its page', async ({ page, offOrigin: _ }) => {
    await page.goto(siteIndex);
    const links = page.locator('main a');
    await expect(links).toHaveCount(EXAMPLES.length);
    const hrefs = await links.evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href')!));
    for (const href of hrefs) expect(href, 'relative link').not.toMatch(/^(\/|[a-z]+:)/i);
    // Follow the first link by a click, and fetch every target through the static server.
    await links.first().click();
    await expect(page.locator('#vs-doc')).toBeVisible();
    expect(new URL(page.url()).pathname.startsWith(EXPORT_PREFIX)).toBe(true);
    for (const href of hrefs) {
      const response = await page.request.get(new URL(href, siteIndex).href);
      expect(response.status(), href).toBe(200);
    }
  });

  test('@R10 the static host serves nothing outside the prefix and sends no CSP header', async ({ page }) => {
    expect((await page.request.get(`${EXPORT_ORIGIN}/`)).status()).toBe(404);
    const response = await page.request.get(exportedUrl('bounded-queue'));
    expect(response.headers()['content-security-policy']).toBeUndefined();
  });

  test('@R10 a Mermaid page loads mermaid.js from the shared pack with SRI and draws the figure', async ({ page, offOrigin: _ }) => {
    const scripts: string[] = [];
    page.on('response', (response) => {
      if (response.url().endsWith('.js')) scripts.push(`${response.status()} ${new URL(response.url()).pathname}`);
    });
    await page.goto(exportedUrl('mermaid-flowchart'));
    await showMap(page, 'cdn_path');
    await expect(page.locator('[id="m-cdn_path"] svg').first()).toBeAttached({ timeout: 20_000 });
    await expect(byId(page, 'x-cdn_path').locator('.vs-mermaid-notice')).toBeHidden();
    const pack = new RegExp(`^200 ${EXPORT_PREFIX}_visser/assets/[0-9a-f]{64}/(reader|mermaid)\\.js$`);
    expect(scripts.length).toBeGreaterThanOrEqual(2);
    for (const s of scripts) expect(s).toMatch(pack);
    expect(scripts.some((s) => s.endsWith('/mermaid.js'))).toBe(true);
  });

  test('@R10 a reference copied on an exported page resolves exact against the source', async ({ page, offOrigin: _ }) => {
    test.skip(isNarrow(page), 'the reference mode on a drawn node is a pointer affordance at desktop width');
    await installClipboardSpy(page);
    await page.goto(exportedUrl('mermaid-flowchart'));
    await expect(page.locator('[id="m-cdn_path"] svg').first()).toBeAttached({ timeout: 20_000 });
    await page.locator('#vs-btn-refmode').click();
    await page.locator('[id="m-cdn_path"] [data-vs-target="edgecache"]').first().click();
    const panel = page.locator('#vs-refpanel');
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: 'Copy reference', exact: true }).click();
    const [yaml] = await copiedTexts(page);
    expect(parsePacket(yaml!)).toMatchObject({ targetId: 'edgecache', kind: 'mermaid-node' });

    const repo = mkdtempSync(join(tmpdir(), 'visser-export-ref-'));
    mkdirSync(join(repo, '.git'));
    cpSync(join(root, 'examples/mermaid-flowchart'), join(repo, 'docs/explanations/mermaid-flowchart'), { recursive: true });
    writeFileSync(join(repo, 'request.yaml'), yaml!);
    const resolved = spawnSync(process.execPath, [cli, 'refs', 'resolve', '--packet', join(repo, 'request.yaml'), '--json'], { cwd: repo, encoding: 'utf8' });
    expect(resolved.status, resolved.stderr).toBe(0);
    expect(JSON.parse(resolved.stdout).status).toBe('exact');
  });

  test('@R10 @R20 the public export reads under the prefix from its own asset pack', async ({ page, offOrigin: _ }) => {
    await page.goto(exportedUrl('public'));
    await expect(page.locator('#vs-doc')).toContainText('A public page that the static host serves under a project prefix.');
    const reader = await page.locator('script[src$="reader.js"]').getAttribute('src');
    expect(new URL(reader!, page.url()).pathname).toMatch(new RegExp(`^${EXPORT_PREFIX}public/_visser/assets/[0-9a-f]{64}/reader\\.js$`));
  });
});

test.describe('@R10 exported site without JavaScript', () => {
  test('@nojs @R10 the collection index and an exported page read without JavaScript', async ({ page }) => {
    await page.goto(siteIndex);
    await expect(page.locator('main a')).toHaveCount(EXAMPLES.length);
    await page.goto(exportedUrl('mermaid-flowchart'));
    await expect(byId(page, 'x-cdn_path').locator('pre.vs-mermaid-source')).toBeVisible();
    await expect(page.locator('[id="m-cdn_path"] svg')).toHaveCount(0);
    await page.goto(exportedUrl('bounded-queue'));
    await expect(page.locator('#vs-doc h1').first()).toBeVisible();
  });
});
