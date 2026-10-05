// R03 per-kind references (§18.4): for every target kind in the examples,
// select one target in reference mode, copy its packet, and resolve it exact
// with the CLI. The nearest-target rule must return that kind, not its parent.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { parsePacket } from '../../packages/core/src/references/packet.ts';
import { EXAMPLES, type ExampleName } from './examples.ts';
import { copiedTexts, installClipboardSpy, openSnapshot, showList, test } from './support.ts';

const root = new URL('../..', import.meta.url).pathname;
const cli = join(root, 'dist/release/bin/visser.cjs');
const FIGURES = new Set(['graph', 'trace', 'transform', 'compare', 'annotated', 'domain', 'measure', 'tree']);

type Pick = { example: ExampleName; id: string; kind: string; parentId: string | undefined };

// One target per kind, from the first example that has it.
const picks = new Map<string, Pick>();
for (const example of EXAMPLES) {
  const bundle = loadBundle(join(root, 'examples', example, 'index.md'));
  for (const t of bundle.model.targets.values()) {
    if (!picks.has(t.kind)) picks.set(t.kind, { example, id: t.id, kind: t.kind, parentId: t.parentId });
  }
}

/** The element a reader clicks to select this target. */
async function clickable(page: Page, pick: Pick): Promise<Locator> {
  const canonicalEl = page.locator(`[id="x-${pick.id}"]`);
  if (FIGURES.has(pick.kind)) {
    // Click the figure's own caption or interpretation, not a child instance.
    const own = canonicalEl.locator(':scope > figcaption, :scope > p:not([data-vs-generated])').first();
    if (await own.count()) return own;
    return canonicalEl;
  }
  // A walkthrough and its steps are canonical in their figure, not in the
  // appendix (docs/IMPROVEMENTS.md §14.1): select the visible list heading or step label.
  if (pick.kind === 'steps') return canonicalEl.locator(':scope > .vs-steps-heading').first();
  if (pick.kind === 'step') return canonicalEl.locator('.vs-step-label');
  if (!pick.parentId && !['definition', 'source', 'detail'].includes(pick.kind)) return canonicalEl;
  // An entity: prefer a visible instance in a figure or list; fall back to its detail summary.
  const instances = page.locator(`[data-vs-target="${pick.id}"]:not([id="x-${pick.id}"])`);
  const visible = async (): Promise<Locator | undefined> => {
    for (let i = 0; i < (await instances.count()); i++) {
      const inst = instances.nth(i);
      if (await inst.isVisible()) {
        const label = inst.locator('text').first();
        return (await label.count()) && (await label.isVisible()) ? label : inst;
      }
    }
    return undefined;
  };
  const shown = await visible();
  if (shown) return shown;
  // A target with no drawing instance, such as a trace branch, is in the
  // document-level Text view.
  if ((await instances.count()) > 0) {
    const figure = await instances.first().evaluate((n) => n.closest('figure[data-vs-views]')?.id ?? '');
    if (figure) {
      await showList(page, figure.replace(/^x-/, ''));
      const listed = await visible();
      if (listed) return listed;
    }
  }
  return canonicalEl.locator(':scope > summary');
}

function resolveInRepo(example: ExampleName, packetYaml: string): { status: number | null; stdout: string; stderr: string } {
  const repo = mkdtempSync(join(tmpdir(), 'visser-kind-'));
  mkdirSync(join(repo, '.git'));
  const docDir = join(repo, 'docs/explanations', example);
  mkdirSync(docDir, { recursive: true });
  // Copy the whole bundle: declared assets are part of the source revision.
  cpSync(join(root, 'examples', example), docDir, { recursive: true });
  const packetPath = join(repo, 'request.yaml');
  writeFileSync(packetPath, packetYaml);
  const r = spawnSync(process.execPath, [cli, 'refs', 'resolve', '--packet', packetPath, '--json'], { cwd: repo, encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

test.describe('@R03 reference for every target kind', () => {
  for (const pick of [...picks.values()].sort((a, b) => a.kind.localeCompare(b.kind))) {
    test(`@R03 ${pick.kind} (${pick.example}#${pick.id}) copies an exact packet`, async ({ page, offOrigin: _ }, info) => {
      test.skip(info.project.name !== 'chromium-1440', 'per-kind references run once, on the desktop project');
      await installClipboardSpy(page);
      await openSnapshot(page, '', pick.example);
      await page.locator('#vs-btn-refmode').click();
      const target = await clickable(page, pick);
      await target.scrollIntoViewIfNeeded();
      await target.click();
      const panel = page.locator('#vs-refpanel');
      await expect(panel).toBeVisible();
      await panel.getByRole('button', { name: 'Copy reference', exact: true }).click();
      const [yaml] = await copiedTexts(page);
      expect(yaml, 'a packet was copied').toBeTruthy();
      const packet = parsePacket(yaml!);
      // Nearest-target rule: the selected kind, not its parent.
      expect(packet.targetId).toBe(pick.id);
      expect(packet.kind).toBe(pick.kind);
      const resolved = resolveInRepo(pick.example, yaml!);
      expect(resolved.status, resolved.stderr).toBe(0);
      expect(JSON.parse(resolved.stdout).status).toBe('exact');
    });
  }
});
