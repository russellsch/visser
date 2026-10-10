import { spawnSync } from 'node:child_process';
import { mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';

const root = new URL('../..', import.meta.url).pathname;
const cli = join(root, 'dist/release/bin/visser.cjs');
const release = join(root, 'dist/release');
let directory = '';
let standalone = '';
const source = `---
format: visser/1
docId: 7d2b9c1e-3f4a-4b5c-8d6e-9f0a1b2c3d4f
title: Offline flowchart
kind: reference
capturedAt: 2026-10-10T00:00:00Z
visibility: private
---

{% flowchart id="process" title="Review $x$" question="Can $x$ proceed?" %}
{% group id="review" label="Review $x$" color="teal" collapsed=true /%}
{% start id="received" label="Received" /%}
{% action id="check" label="Check $x$" group="review" /%}
{% decision id="valid" label="Valid $x$?" group="review" /%}
{% action id="repair" label="Repair" group="review" /%}
{% end id="ready" label="Ready" /%}
{% flow id="receive" from="received" to="check" /%}
{% flow id="decide" from="check" to="valid" /%}
{% flow id="yes" from="valid" to="ready" label="Yes" /%}
{% flow id="retry" from="valid" to="repair" label="No" /%}
{% flow id="again" from="repair" to="check" label="Corrected" /%}
{% /flowchart %}`;

test.beforeAll(() => {
  const exportDirectory = mkdtempSync(join(tmpdir(), 'visser-flowchart-export-'));
  directory = mkdtempSync(join(tmpdir(), 'visser-flowchart-relocated-'));
  const index = join(exportDirectory, 'index.md');
  const exported = join(exportDirectory, 'flowchart.html');
  writeFileSync(index, source);
  const result = spawnSync(process.execPath, [cli, 'export', index, '--out', exported, '--dev-toolkit', release], { cwd: exportDirectory, encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  standalone = join(directory, 'flowchart.html');
  renameSync(exported, standalone);
  rmSync(exportDirectory, { recursive: true, force: true });
});
test.afterAll(() => { if (directory) rmSync(directory, { recursive: true, force: true }); });

async function openOffline(page: import('@playwright/test').Page): Promise<string[]> {
  const blocked: string[] = [];
  await page.route(/^https?:/, route => { blocked.push(route.request().url()); return route.abort(); });
  await page.goto(pathToFileURL(standalone).href);
  return blocked;
}

test('standalone flowchart is offline, renders math, and reuses folding and inspection across viewports @FC13 @FC16 @FC26', async ({ page }) => {
  const blocked = await openOffline(page);
  await expect(page.locator('#x-process')).toBeVisible();
  await expect(page.locator('#x-process [data-vs-math-rendered]').first()).toBeVisible();
  expect(blocked).toEqual([]);
  const narrow = (page.viewportSize()?.width ?? 1440) <= 899;
  if (narrow) {
    await page.locator('#x-process .vs-viewport').tap();
    await expect(page.locator('.vs-figure-viewer')).toBeVisible();
    await page.locator('[data-vs-fold="review"]').tap();
    await page.locator('[data-vs-fold-expand="review"]').tap();
    await page.locator('#v-process\\.valid').tap();
    await expect(page.locator('.vs-inspector details[data-vs-target="valid"]')).toBeVisible();
  } else {
    const inspector = page.locator('#vs-inspector');
    await page.locator('[data-vs-fold="review"]').click();
    await expect(inspector.locator('details[data-vs-target="review"]')).toBeVisible();
    await page.locator('[data-vs-fold-expand="review"]').click();
    await page.locator('#v-process\\.check').click();
    await expect(inspector.locator('details[data-vs-target="check"]')).toBeVisible();
    await page.locator('#v-process\\.valid').click();
    await expect(inspector.locator('details[data-vs-target="valid"]')).toBeVisible();
  }
});

test('@nojs standalone flowchart retains complete text, literal math, and print content @FC14', async ({ page }) => {
  const blocked = await openOffline(page);
  expect(blocked).toEqual([]);
  for (const id of ['received', 'check', 'valid', 'repair', 'ready', 'receive', 'decide', 'yes', 'retry', 'again']) await expect(page.locator(`#l-process\\.${id}`)).toBeVisible();
  await expect(page.locator('#x-process .vs-math-source').first()).toContainText('$x$');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#l-process\\.valid')).toBeVisible();
  await expect(page.locator('#l-process\\.again')).toContainText('Corrected');
});
