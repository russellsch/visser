import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
// @ts-expect-error jsdom is supplied by the browser-test harness.
import { JSDOM } from 'jsdom';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { compileDocument } from '../../packages/core/src/compiler/compile.ts';

type Family = { id: string; family: string; fields: readonly string[]; native: readonly string[]; body: string };
const families: readonly Family[] = [
  { id: 'COV-11', family: 'architecture', fields: ['a_1', 'a_2', 'a_3', 'a_4'], native: ['a_1', 'a_2', 'a_3', 'a_4'], body: '{% group id="g_arch" label="$a_1$" /%}\n{% node id="a_arch" group="g_arch" role="process" label="$a_2$" /%}\n{% node id="b_arch" role="storage" label="Store" /%}\n{% edge id="r_arch" from="a_arch" to="b_arch" kind="data" label="$a_3$" quantity="$a_4$" /%}' },
  { id: 'COV-12', family: 'state', fields: ['s_1', 's_2', 's_3', 's_4', 's_5'], native: ['s_1', 's_2', 's_4'], body: '{% state id="a_state" label="$s_1$" initial=true /%}\n{% state id="b_state" label="End" terminal=true /%}\n{% transition id="r_state" from="a_state" to="b_state" label="$s_2$" event="$s_3$" guard="$s_4$" action="$s_5$" /%}' },
  { id: 'COV-13', family: 'cause', fields: ['c_1', 'c_2'], native: ['c_1', 'c_2'], body: '{% factor id="a_cause" label="$c_1$" basis="observed" /%}\n{% factor id="b_cause" label="Effect" basis="observed" /%}\n{% causal-link id="r_cause" from="a_cause" to="b_cause" label="$c_2$" basis="inferred" /%}' },
  { id: 'COV-14', family: 'plan', fields: ['p_1', 'p_2', 'p_3', 'p_4', 'p_5', 'p_6', 'p_7'], native: ['p_1', 'p_6', 'p_7'], body: '{% task id="a_plan" label="$p_1$" owner="$p_2$" output="$p_3$" acceptance="$p_4$" risk="$p_5$" /%}\n{% task id="b_plan" label="Next" /%}\n{% dependency id="r_plan" from="a_plan" to="b_plan" label="$p_6$" quantity="$p_7$" /%}' },
  { id: 'COV-15', family: 'transform', fields: ['t_1', 't_2', 't_3', 't_4', 't_5', 't_6', 't_7', 't_8', 't_9', 't_{10}'], native: ['t_1', 't_2', 't_5', 't_7', 't_8', 't_{10}'], body: '{% stage id="a_transform" label="$t_1$" representation="$t_2$" shape=["$t_3$"] units="$t_4$" location="$t_5$" ownership="$t_6$" /%}\n{% stage id="b_transform" label="Result" representation="result" /%}\n{% conversion id="r_transform" from="a_transform" to="b_transform" label="$t_7$" loss="$t_8$" condition="$t_9$" quantity="$t_{10}$" /%}' },
  { id: 'COV-16', family: 'domain', fields: ['d_1', 'd_2', 'd_3', 'd_4'], native: ['d_1', 'd_2', 'd_3', 'd_4'], body: '{% concept id="a_domain" definition="da" label="$d_1$" attributes=["$d_2$"] /%}\n{% concept id="b_domain" definition="db" label="Other" /%}\n{% relation id="r_domain" from="a_domain" to="b_domain" kind="has" label="$d_3$" cardinality="$d_4$" /%}' },
];
const longTex = (tex: string) => `${tex}+x_{${'a'.repeat(120)}}`;
let runtime: string;
let worker: string;
const fixtures = new Map<string, { html: string; rows: unknown[] }>();

test.beforeAll(async () => {
  const directory = mkdtempSync(join(tmpdir(), 'visser-native-field-math-'));
  try {
    const frontmatter = readFileSync('examples/bounded-queue/index.md', 'utf8').split('---')[1];
    for (const family of families) for (const long of [false, true]) {
      const math = (tex: string) => `$${long ? longTex(tex) : tex}$`;
      const figures = (() => {
        const tag = family.family === 'transform' || family.family === 'domain' ? family.family : 'graph';
        const mode = tag === 'graph' ? ` mode="${family.family}"` : '';
        const definitions = family.family === 'domain' ? '{% definition id="da" term="Alpha" %}\nAlpha.\n{% /definition %}\n{% definition id="db" term="Beta" %}\nBeta.\n{% /definition %}\n' : '';
        const body = family.body.replace(/\$([^$]+)\$/g, (_, tex: string) => math(tex));
        return `${definitions}{% ${tag} id="${family.family}"${mode} title="Title ${math('f_1')}" question="Question ${math('f_2')}?" %}\nBody ${math('f_3')}.\n${body}\n{% /${tag} %}`;
      })();
      const path = join(directory, 'index.md');
      writeFileSync(path, `---${frontmatter}---\n\n${figures}`);
      const bundle = loadBundle(path);
      expect(bundle.diagnostics.filter(diagnostic => diagnostic.severity === 'error')).toEqual([]);
      const compiled = await compileDocument(bundle, { version: '0.0.0', sha256: 'a'.repeat(64), assets: { 'math.js': 'b'.repeat(64) } }, { audience: 'private', includeSource: false, layoutFallback: false });
      const document = new JSDOM(new TextDecoder().decode(compiled.files.find(file => file.path.endsWith('/index.html'))!.bytes)).window.document;
      const rows = JSON.parse(document.querySelector('meta[name="vs-math-expressions"]')!.getAttribute('content')!);
      document.querySelectorAll('script, link, meta[http-equiv]').forEach((node: Element) => node.remove());
      // Open source-bearing disclosures so assertions do not mistake hidden inspector text for loss.
      document.querySelectorAll('details').forEach((node: Element) => node.setAttribute('open', ''));
      const style = document.createElement('style');
      style.textContent = readFileSync('packages/runtime/src/reader.css', 'utf8');
      document.head.append(style);
      fixtures.set(`${family.family}/${long}`, { html: document.documentElement.outerHTML, rows });
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
  const built = await Promise.all([
    build({ entryPoints: ['packages/runtime/src/math.ts'], bundle: true, platform: 'browser', format: 'iife', globalName: 'VSNativeFields', write: false }),
    build({ entryPoints: ['packages/runtime/src/math-worker.ts'], bundle: true, platform: 'browser', format: 'iife', write: false }),
  ]);
  runtime = built[0]!.outputFiles[0]!.text;
  worker = built[1]!.outputFiles[0]!.text;
});

for (const variant of ['success', 'nojs', 'failure', 'long', 'print'] as const) {
  test(`COV11–16 native fields preserve source in ${variant} @M02 @M03 @M10 @M13${variant === 'nojs' ? ' @nojs' : ''}`, async ({ page }) => {
    for (const family of families) {
    const fixture = fixtures.get(`${family.family}/${variant === 'long'}`)!;
    await page.setContent(fixture.html);
    if (variant !== 'nojs') {
      await page.addScriptTag({ content: runtime });
      const status = await page.evaluate(async ({ source, rows }) => (window as any).VSNativeFields.initializeMath(document, source, rows), {
        source: variant === 'failure' ? 'throw new Error("deliberate worker failure")' : worker, rows: fixture.rows,
      });
      if (variant === 'failure') expect(status.failed).toBeGreaterThan(0);
      else expect(status.failed).toBe(0);
    }
    if (variant === 'print') await page.emulateMedia({ media: 'print' });
      const figure = page.locator(`#x-${family.family}`);
      const long = variant === 'long';
      for (const tex of ['f_1', 'f_2', 'f_3'].map(value => long ? longTex(value) : value)) {
        const source = figure.locator('.vs-math-source').filter({ hasText: `$${tex}$` }).first();
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
      for (const tex of family.fields.map(value => long ? longTex(value) : value)) {
        const source = page.locator('.vs-math-source').filter({ hasText: `$${tex}$` }).first();
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
      await expect(figure.locator('.vs-lists, .vs-glossary, .vs-annotation-list').first()).toBeVisible();
      const slots = figure.locator('[data-vs-math-native]');
      if (variant === 'success' || variant === 'long' || variant === 'print') {
        await expect(figure).toHaveAttribute('data-vs-math-ready', '');
        for (const tex of family.native) {
          const key = JSON.stringify([false, variant === 'long' ? longTex(tex) : tex]);
          const rendered = await slots.evaluateAll((nodes, expected) => nodes.filter(node => node.getAttribute('data-vs-math-key') === expected && node.hasAttribute('data-vs-math-rendered') && node.querySelector(':scope > svg')).length, key);
          expect(rendered, `${family.id} native ${tex}`).toBeGreaterThan(0);
          if (variant !== 'print') for (const slot of await slots.all()) {
            if (await slot.getAttribute('data-vs-math-key') === key) await expect(slot.locator(':scope > svg')).toBeVisible();
          }
        }
        if (variant === 'print') await expect(figure.locator('.vs-viewport')).toBeHidden();
      } else {
        await expect(figure).not.toHaveAttribute('data-vs-math-ready', '');
        await expect(figure.locator('.vs-viewport')).toBeHidden();
        await expect(slots.locator(':scope > *')).toHaveCount(0);
      }
    }
  });
}
