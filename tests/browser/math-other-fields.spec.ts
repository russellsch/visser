import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
// @ts-expect-error jsdom is supplied by the browser-test harness.
import { JSDOM } from 'jsdom';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { compileDocument } from '../../packages/core/src/compiler/compile.ts';
import { normalizedTextSha256 } from '../../packages/core/src/model/hash.ts';

type Fixture = { html: string; rows: unknown[]; fields: readonly string[]; figure: string; native?: readonly string[]; literal?: string };
const longTex = (tex: string) => `${tex}+x_{${'a'.repeat(120)}}`;
let runtime: string;
let worker: string;
const fixtures = new Map<string, Map<boolean, Fixture>>();

function captured(id: string, content: string): string {
  const text = `${content}\n`;
  return `{% source id="${id}" kind="example" title="${id}" language="text" excerptSha256="${normalizedTextSha256(new TextEncoder().encode(text))}" %}\n\`\`\`text\n${text}\`\`\`\n{% /source %}`;
}

function sourceFor(name: string, math: (tex: string) => string): { body: string; fields: readonly string[]; figure: string; native?: readonly string[]; literal?: string } {
  if (name === 'measure') return { figure: 'measure', fields: ['m_t', 'm_q', 'm_b', 'm_u', 'm_l', 'm_d', 'm_e'], native: ['m_u', 'm_l', 'm_d', 'm_e'], body: `{% measure id="measure" title="Measure ${math('m_t')}" question="Question ${math('m_q')}?" unit="${math('m_u')}" %}
Body ${math('m_b')}.
{% reading id="reading" label="Reading ${math('m_l')}" value=7 valueStatus="measured" display="${math('m_d')}" /%}
{% reading id="reading_two" label="Reference" value=14 valueStatus="measured" display="${math('m_e')}" /%}
{% /measure %}` };
  if (name === 'tree') return { figure: 'tree', fields: ['t_t', 't_q', 't_b', 't_l'], literal: `src/${math('t_p')}`, body: `{% tree id="tree" title="Tree ${math('t_t')}" question="Question ${math('t_q')}?" %}
Body ${math('t_b')}.
{% entry id="root" path="src" label="Root" %}
{% entry id="middle" path="src/middle" label="Middle" %}
{% entry id="closed" path="src/middle/closed" label="Closed" %}
{% entry id="entry" path="src/${math('t_p')}" label="Entry ${math('t_l')}" /%}
{% /entry %}
{% /entry %}
{% /entry %}
{% /tree %}` };
  if (name === 'compare') return { figure: 'compare', fields: ['c_t', 'c_q', 'c_b', 'c_o', 'c_c', 'c_u', 'c_i', 'c_v', 'c_x'], body: `{% compare id="compare" title="Compare ${math('c_t')}" question="Question ${math('c_q')}?" %}
Body ${math('c_b')}.
{% option id="option" label="Option ${math('c_o')}" /%}
{% criterion id="criterion" label="Criterion ${math('c_c')}" units="${math('c_u')}" /%}
{% criterion id="body_criterion" label="Body ${math('c_i')}" /%}
{% cell id="cell" option="option" criterion="criterion" value="${math('c_v')}" /%}
{% cell id="body_cell" option="option" criterion="body_criterion" %}
Body ${math('c_x')}.
{% /cell %}
{% /compare %}` };
  const literal = `const literal = "${math('code')}";`;
  return { figure: 'annotated', fields: ['a_t', 'a_q', 'a_b', 'a_l', 'a_x'], literal, body: `{% annotated id="annotated" title="Annotated ${math('a_t')}" question="Question ${math('a_q')}?" source="after" before="before" %}
Body ${math('a_b')}.
{% annotation id="annotation" label="Annotation ${math('a_l')}" lines=[1, 1] %}
Body ${math('a_x')}.
{% /annotation %}
{% /annotated %}

${captured('before', literal)}
${captured('after', `${literal} // changed`)}` };
}

test.beforeAll(async () => {
  const directory = mkdtempSync(join(tmpdir(), 'visser-other-field-math-'));
  try {
    const frontmatter = readFileSync('examples/bounded-queue/index.md', 'utf8').split('---')[1];
    for (const name of ['measure', 'tree', 'compare', 'annotated']) {
      const variants = new Map<boolean, Fixture>();
      for (const long of [false, true]) {
        const spec = sourceFor(name, tex => `$${long ? longTex(tex) : tex}$`);
        const path = join(directory, `${name}-${long}.md`);
        writeFileSync(path, `---${frontmatter}---\n\n${spec.body}`);
        const bundle = loadBundle(path);
        expect(bundle.diagnostics.filter(diagnostic => diagnostic.severity === 'error')).toEqual([]);
        const compiled = await compileDocument(bundle, { version: '0.0.0', sha256: 'a'.repeat(64), assets: { 'math.js': 'b'.repeat(64) } }, { audience: 'private', includeSource: false, layoutFallback: false });
        const document = new JSDOM(new TextDecoder().decode(compiled.files.find(file => file.path.endsWith('/index.html'))!.bytes)).window.document;
        const rows = JSON.parse(document.querySelector('meta[name="vs-math-expressions"]')!.getAttribute('content')!);
        document.querySelectorAll('script, link, meta[http-equiv]').forEach((node: Element) => node.remove());
        document.querySelectorAll('details:not(.vs-tree-node)').forEach((node: Element) => node.setAttribute('open', ''));
        const style = document.createElement('style');
        style.textContent = readFileSync('packages/runtime/src/reader.css', 'utf8');
        document.head.append(style);
        variants.set(long, { html: document.documentElement.outerHTML, rows, fields: spec.fields, figure: spec.figure, native: spec.native, literal: spec.literal });
      }
      fixtures.set(name, variants);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
  const built = await Promise.all([
    build({ entryPoints: ['packages/runtime/src/math.ts'], bundle: true, platform: 'browser', format: 'iife', globalName: 'VSOtherFields', write: false }),
    build({ entryPoints: ['packages/runtime/src/math-worker.ts'], bundle: true, platform: 'browser', format: 'iife', write: false }),
  ]);
  runtime = built[0]!.outputFiles[0]!.text;
  worker = built[1]!.outputFiles[0]!.text;
});

for (const name of ['measure', 'tree', 'compare', 'annotated']) {
  for (const variant of ['success', 'nojs', 'failure', 'long', 'print'] as const) {
    test(`${name} retains COV20–23 fields in ${variant} @M02 @M03 @M10 @M13${variant === 'nojs' ? ' @nojs' : ''}`, async ({ page }) => {
      const fixture = fixtures.get(name)!.get(variant === 'long')!;
      await page.setContent(fixture.html);
      if (variant !== 'nojs') {
        await page.addScriptTag({ content: runtime });
        const status = await page.evaluate(async ({ source, rows }) => (window as any).VSOtherFields.initializeMath(document, source, rows), {
          source: variant === 'failure' ? 'throw new Error("deliberate worker failure")' : worker, rows: fixture.rows,
        });
        if (variant === 'failure') expect(status.failed).toBeGreaterThan(0);
        else expect(status.failed).toBe(0);
      }
      const figure = page.locator(`#x-${fixture.figure}`);
      if (name === 'tree') {
        const closed = figure.locator('.vs-tree-node:not([open])');
        await expect(closed).toHaveCount(1);
        const deep = closed.locator('.vs-tree-entry');
        await expect(deep.locator('.vs-tree-path')).toHaveText(fixture.literal!);
        await expect(deep.locator('.vs-math-source')).toHaveText(`$${variant === 'long' ? longTex('t_l') : 't_l'}$`);
        await expect(deep).toBeHidden();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
        await closed.locator(':scope > summary').click();
        await expect(figure.locator('.vs-tree-node:not([open])')).toHaveCount(0);
        await expect(figure.locator('.vs-tree-path').filter({ hasText: fixture.literal! })).toBeVisible();
      }
      if (variant === 'print') await page.emulateMedia({ media: 'print' });
      for (const raw of fixture.fields) {
        const tex = variant === 'long' ? longTex(raw) : raw;
        const source = page.locator('.vs-math-source:visible').filter({ hasText: `$${tex}$` }).first();
        await expect(source).toHaveText(`$${tex}$`);
        if (variant === 'success' || variant === 'long') {
          await expect(source.locator('..')).toHaveAttribute('data-vs-math-rendered', '');
          await expect(source.locator('..').locator('.vs-math-visual svg')).toBeVisible();
        } else {
          await expect(source).toBeVisible();
          expect(await source.evaluate(node => getComputedStyle(node).clipPath)).toBe('none');
          await expect(source.locator('..').locator('.vs-math-visual')).toBeHidden();
        }
      }
      if (fixture.literal) {
        await expect(figure.locator('code').filter({ hasText: fixture.literal }).first()).toContainText(fixture.literal);
        await expect(figure.locator('code .vs-math')).toHaveCount(0);
      }
      if (name === 'tree') {
        await expect(figure.locator('.vs-tree-path').filter({ hasText: fixture.literal! })).toHaveText(fixture.literal!);
      }
      if (name === 'compare') {
        const table = figure.locator('.vs-compare-table');
        const cards = figure.locator('.vs-compare-cards');
        for (const raw of ['c_o', 'c_c', 'c_u', 'c_i', 'c_v', 'c_x']) {
          const tex = `$${variant === 'long' ? longTex(raw) : raw}$`;
          await expect(table.locator('.vs-math-source').filter({ hasText: tex }).first()).toHaveText(tex);
          await expect(cards.locator('.vs-math-source').filter({ hasText: tex }).first()).toHaveText(tex);
          if (variant === 'success' || variant === 'long') for (const view of [table, cards]) {
            const math = view.locator('.vs-math').filter({ has: page.locator('.vs-math-source').filter({ hasText: tex }) }).first();
            await expect(math).toHaveAttribute('data-vs-math-rendered', '');
            await expect(math.locator('.vs-math-visual svg')).toHaveCount(1);
          }
        }
        expect((await table.isVisible()) || (await cards.isVisible())).toBe(true);
      }
      if (name === 'measure') {
        const slots = figure.locator('[data-vs-math-native]');
        if (variant === 'success' || variant === 'long') {
          await expect(figure).toHaveAttribute('data-vs-math-ready', '');
          for (const raw of fixture.native!) {
            const key = JSON.stringify([false, variant === 'long' ? longTex(raw) : raw]);
            expect(await slots.evaluateAll((nodes, expected) => nodes.filter(node => node.getAttribute('data-vs-math-key') === expected && node.hasAttribute('data-vs-math-rendered') && node.querySelector(':scope > svg')).length, key)).toBeGreaterThan(0);
            for (const slot of await slots.all()) if (await slot.getAttribute('data-vs-math-key') === key) {
              await expect(slot.locator(':scope > svg')).toBeVisible();
            }
          }
          await expect(figure.locator('.vs-viewport')).toBeVisible();
          await expect(figure.locator('[data-vs-math-native] > svg').first()).toBeVisible();
        } else {
          await expect(figure.locator('.vs-viewport')).toBeHidden();
        }
      }
    });
  }
}
