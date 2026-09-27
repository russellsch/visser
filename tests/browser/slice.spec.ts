// Phase 1 vertical slice (§17.4): a packet copied in the browser resolves to
// exact source bytes; after the edge moves it resolves stale with an unchanged
// body; a deliberate refresh then allows a guarded replace.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import { byId, copiedTexts, installClipboardSpy, openSnapshot, test } from './support.ts';

const root = new URL('../..', import.meta.url).pathname;
const cli = join(root, 'dist/release/bin/visser.cjs');

function visser(cwd: string, ...args: string[]) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test('@T03 @T09 @R12 @R13 browser packet resolves, goes stale after a move, refreshes, and guards a replace', async ({ page, offOrigin: _ }, info) => {
  test.skip(info.project.name !== 'chromium-1440', 'the CLI half of the slice does not depend on the viewport');

  // 1. Copy the edge reference in the browser.
  await installClipboardSpy(page);
  await openSnapshot(page);
  await page.locator('#vs-btn-refmode').click();
  await byId(page, 'v-handoff.enqueue').locator('text').click();
  await page.locator('#vs-refpanel').getByRole('button', { name: 'Copy reference', exact: true }).click();
  const [yaml] = await copiedTexts(page);
  expect(yaml).toContain('targetId: "enqueue"');

  // 2. A repository that holds the same source under the default document root.
  const repo = mkdtempSync(join(tmpdir(), 'visser-slice-'));
  mkdirSync(join(repo, '.git'));
  const docDir = join(repo, 'docs/explanations/queue');
  mkdirSync(docDir, { recursive: true });
  const doc = join(docDir, 'index.md');
  copyFileSync(join(root, 'examples/bounded-queue/index.md'), doc);
  const packetPath = join(repo, 'request.yaml');
  writeFileSync(packetPath, yaml!);

  const exact = visser(repo, 'refs', 'resolve', '--packet', packetPath, '--json');
  expect(exact.status, exact.stderr).toBe(0);
  const exactResult = JSON.parse(exact.stdout);
  expect(exactResult.status).toBe('exact');
  const originalSpan = exactResult.current.sourceText as string;
  expect(originalSpan).toContain('{% edge id="enqueue"');

  // 3. Move the edge below its sibling without changing its bytes.
  const source = readFileSync(doc, 'utf8');
  const enqueueBlock = source.slice(source.indexOf('{% edge id="enqueue"'), source.indexOf('{% edge id="dequeue"'));
  const dequeueEnd = source.indexOf('{% /edge %}', source.indexOf('{% edge id="dequeue"')) + '{% /edge %}\n'.length;
  const dequeueBlock = source.slice(source.indexOf('{% edge id="dequeue"'), dequeueEnd);
  writeFileSync(doc, source.replace(enqueueBlock + dequeueBlock, dequeueBlock + '\n' + enqueueBlock.trimEnd() + '\n'));

  const stale = visser(repo, 'refs', 'resolve', '--packet', packetPath, '--json');
  expect(stale.status).toBe(5);
  const staleResult = JSON.parse(stale.stdout);
  expect(staleResult).toMatchObject({ status: 'stale', targetBodyUnchanged: true });
  expect(staleResult.current.sourceText).toBe(originalSpan);

  // 4. A stale packet cannot drive a write.
  const replacementPath = join(repo, 'replacement.md');
  writeFileSync(replacementPath, originalSpan.replace('label="put waits while full"', 'label="put blocks while the queue is full"'));
  const refused = visser(repo, 'refs', 'replace', '--packet', packetPath, '--replacement', replacementPath, '--expected-revision', staleResult.currentRevision);
  expect(refused.status).toBe(5);

  // 5. Deliberate refresh, then the guarded replace.
  const refreshed = visser(repo, 'refs', 'refresh', '--packet', packetPath, '--expected-current', staleResult.currentRevision, '--acknowledge-stale');
  expect(refreshed.status, refreshed.stderr).toBe(0);
  const freshPath = join(repo, 'fresh.yaml');
  writeFileSync(freshPath, refreshed.stdout);
  const replaced = visser(repo, 'refs', 'replace', '--packet', freshPath, '--replacement', replacementPath, '--expected-revision', staleResult.currentRevision, '--json');
  expect(replaced.status, replaced.stderr).toBe(0);
  const edit = JSON.parse(replaced.stdout);
  expect(edit.changedTargets).toContain('enqueue');
  expect(readFileSync(doc, 'utf8')).toContain('label="put blocks while the queue is full"');

  // 6. The evidence is intact: the document still checks cleanly.
  const check = visser(repo, 'check', doc);
  expect(check.status, check.stderr).toBe(0);
});
