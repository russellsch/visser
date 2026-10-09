import { build } from 'esbuild';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
// @ts-expect-error jsdom is supplied by the test harness without declarations.
import { JSDOM } from 'jsdom';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { compileDocument } from '../../packages/core/src/compiler/compile.ts';
import { normalizedTextSha256 } from '../../packages/core/src/model/hash.ts';
import type { ExtensionBinding } from '../../packages/core/src/extensions/registry.ts';

// Distinct source per field prevents a formula elsewhere from satisfying an assertion.
const fields = [
  ['h1', 'm_t'],
  ['#x-prose', 'p_x'],
  ['#x-prose em', 'e_x'],
  ['#x-prose strong', 's_x'],
  ['#x-prose .vs-strike', 'k_x'],
  ['#x-prose', 'b_x'],
  ['#x-heading', 'h_x'],
  ['#x-prose a[href="https://example.invalid/"]', 'l_x'],
  ['#x-references .vs-term', 'r_t'],
  ['#x-references .vs-detail-link', 'r_d'],
  ['#x-references [data-vs-focus="node"]', 'f_x'],
  ['#x-list li', 'i_x'],
  ['#x-quote blockquote', 'q_x'],
  ['#x-table th', 't_h'],
  ['#x-table td', 't_c'],
  ['#x-note', 'n_b'],
  ['#x-check .vs-self-check-question', 'q_c'],
  ['#x-check .vs-self-check-answer', 'a_c'],
  ['#x-detail summary', 'l_d'],
  ['#x-detail', 'b_d'],
  ['#x-step .vs-step-label', 'l_s'],
  ['#x-step .vs-step-body', 'b_s'],
  ['#x-definition', 't_d'],
  ['#x-definition', 'b_f'],
  ['#x-source', 's_t'],
  ['#x-extension > figcaption', 'x_t'],
  ['#x-extension > .vs-figure-question', 'x_q'],
  ['#x-extension > p:not(.vs-figure-question)', 'x_b'],
  ['#x-part > summary', 'x_l'],
  ['#x-part .vs-facts dt:text-is("custom") + dd', 'x_f'],
  ['#x-part .vs-facts dt:text-is("summary") + dd', 'x_s'],
  ['#x-part .vs-facts dt:text-is("note") + dd', 'x_n'],
  ['#x-part .vs-detail-text', 'x_d'],
] as const;
let runtime: string;
let worker: string;
const fixtures = new Map<boolean, { html: string; rows: unknown[] }>();
const longTex = (tex: string) => `${tex}+x_{${'a'.repeat(120)}}`;
const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const extension: ExtensionBinding = {
  name: 'sample', version: '0.0.0', sha256: 'c'.repeat(64), ready: true,
  run: () => ({ schema: 'visser-component-output/1',
    svg: { tag: 'svg', attrs: { viewBox: '0 0 100 40' }, children: [
      { tag: 'g', target: 'part', children: [{ tag: 'text', attrs: { x: 5, y: 20 }, children: ['Extension drawing'] }] },
    ] }, parts: { part: { text: 'Generated description' } },
  }),
};

test.beforeAll(async () => {
  const directory = mkdtempSync(join(tmpdir(), 'visser-component-math-'));
  try {
    mkdirSync(join(directory, 'assets'));
    writeFileSync(join(directory, 'assets', 'tiny.png'), imageBytes);
    const frontmatter = readFileSync('examples/bounded-queue/index.md', 'utf8').split('---')[1];
    for (const long of [false, true]) {
      const math = (tex: string) => `$${long ? longTex(tex) : tex}$`;
      const excerpt = `const literal = "${math('code')}";\n`;
      const excerptHash = normalizedTextSha256(new TextEncoder().encode(excerpt));
      const body = `
<!-- vs:id heading -->
## Heading ${math('h_x')}

<!-- vs:id prose -->
Paragraph ${math('p_x')} *emphasis ${math('e_x')}* **strong ${math('s_x')}** ~~strike ${math('k_x')}~~  
After break ${math('b_x')} [link ${math('l_x')}](https://example.invalid/).

<!-- vs:id references -->
{% term ref="definition" %}Authored term ${math('r_t')}{% /term %}, {% detail-link ref="detail" %}Authored detail ${math('r_d')}{% /detail-link %}, {% focus targets=["node"] %}focus ${math('f_x')}{% /focus %}.

<!-- vs:id alias -->
The terms are matching input.

<!-- vs:id list -->
- Item ${math('i_x')}

<!-- vs:id quote -->
> Quote ${math('q_x')}

<!-- vs:id table -->
| Header ${math('t_h')} | Other |
| --- | --- |
| Cell ${math('t_c')} | Plain |

<!-- vs:id image -->
![Image ${math('image_alt')}](assets/tiny.png)

<!-- vs:id code -->
Literal \`${math('inline')}\` and {% eqref ref="equation" /%}.

<!-- vs:id fence -->
\`\`\`text
${math('fenced')}
\`\`\`

{% equation id="equation" %}
${long ? longTex('E_k') : 'E_k'}
{% /equation %}

{% source id="source" kind="example" title="Source ${math('s_t')}" language="text" excerptSha256="${excerptHash}" %}
\`\`\`text
${excerpt}\`\`\`
{% /source %}

{% note id="note" kind="limit" %}
Note ${math('n_b')} .
{% /note %}
{% self-check id="check" question="Question ${math('q_c')}?" %}
Answer ${math('a_c')} .
{% /self-check %}
{% detail id="detail" label="Label ${math('l_d')}" %}
Body ${math('b_d')} .
{% /detail %}
{% graph id="graph" mode="architecture" title="Graph" question="Why?" %}
{% node id="node" role="process" label="Node" /%}
{% steps id="steps" %}
{% step id="step" label="Step ${math('l_s')}" targets=["node"] %}
Body ${math('b_s')} .
{% /step %}
{% step id="second" label="Second" targets=["node"] %}
Second .
{% /step %}
{% /steps %}
{% /graph %}
{% definition id="definition" term="Term ${math('t_d')}" aliases=["terms"] %}
Body ${math('b_f')}. Another sentence .
{% /definition %}

{% extension id="extension" use="sample" title="Extension ${math('x_t')}" question="Question ${math('x_q')}?" %}
Figure body ${math('x_b')}.
{% part id="part" label="Label ${math('x_l')}" custom="${math('x_f')}" summary="${math('x_s')}" note="${math('x_n')}" %}
Authored description ${math('x_d')}.
{% /part %}
{% /extension %}
`;
      const path = join(directory, 'index.md');
      writeFileSync(path, `---${frontmatter!.replace(/^title:.*$/m, `title: "Math ${math('m_t')}"`)}---\n\n${body}`);
      const bundle = loadBundle(path);
      expect(bundle.diagnostics.filter(item => item.severity === 'error')).toEqual([]);
      const result = await compileDocument(bundle, {
        version: '0.0.0', sha256: 'a'.repeat(64), assets: { 'math.js': 'b'.repeat(64) },
      }, { audience: 'private', includeSource: false, layoutFallback: false, extensions: new Map([['sample', extension]]) });
      const document = new JSDOM(new TextDecoder().decode(result.files.find(file => file.path.endsWith('/index.html'))!.bytes)).window.document;
      const rows = JSON.parse(document.querySelector('meta[name="vs-math-expressions"]').getAttribute('content'));
      const picture = document.querySelector('#x-image img');
      expect(picture.getAttribute('src')).toMatch(/^assets\/[a-f0-9]{64}\.png$/);
      // Keep this field fixture independent of the export server while using
      // the exact compiled alt text and the authored image bytes.
      picture.setAttribute('src', `data:image/png;base64,${imageBytes.toString('base64')}`);
      document.querySelectorAll('script, link, meta[http-equiv]').forEach((node: Element) => node.remove());
      // Isolate field rendering; reader-driven disclosure interactions have separate tests.
      document.querySelectorAll('details').forEach((node: Element) => node.setAttribute('open', ''));
      const style = document.createElement('style');
      style.textContent = readFileSync('packages/runtime/src/reader.css', 'utf8');
      document.head.append(style);
      fixtures.set(long, { html: document.documentElement.outerHTML, rows });
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
  const results = await Promise.all([
    build({ entryPoints: ['packages/runtime/src/math.ts'], bundle: true, platform: 'browser', format: 'iife', globalName: 'VSComponents', write: false }),
    build({ entryPoints: ['packages/runtime/src/math-worker.ts'], bundle: true, platform: 'browser', format: 'iife', write: false }),
  ]);
  runtime = results[0]!.outputFiles[0]!.text;
  worker = results[1]!.outputFiles[0]!.text;
});

for (const variant of ['success', 'nojs', 'failure', 'long', 'print'] as const) {
  test(`component and definition fields preserve math in ${variant} mode @M02 @M03${variant === 'nojs' ? ' @nojs' : ''}`, async ({ page }) => {
    const fixture = fixtures.get(variant === 'long')!;
    await page.setContent(fixture.html);
    if (variant !== 'nojs') {
      await page.addScriptTag({ content: runtime });
      const status = await page.evaluate(async ({ source, rows }) =>
        (window as any).VSComponents.initializeMath(document, source, rows), {
        source: variant === 'failure' ? 'throw new Error("deliberate worker failure")' : worker,
        rows: fixture.rows,
      });
      if (variant === 'failure') expect(status.failed).toBeGreaterThanOrEqual(fields.length);
      else { expect(status.failed).toBe(0); expect(status.rendered).toBeGreaterThanOrEqual(fields.length); }
    }
    if (variant === 'print') await page.emulateMedia({ media: 'print' });
    expect(await page.title()).toBe(`Math $${variant === 'long' ? longTex('m_t') : 'm_t'}$`);
    const literal = (tex: string) => `$${variant === 'long' ? longTex(tex) : tex}$`;
    await expect(page.locator('#x-image img')).toHaveAttribute('alt', `Image ${literal('image_alt')}`);
    await expect(page.getByRole('img', { name: `Image ${literal('image_alt')}`, exact: true })).toBeVisible();
    await expect.poll(() => page.locator('#x-image img').evaluate(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)).toBe(true);
    await expect(page.locator('#x-image .vs-math')).toHaveCount(0);
    await expect(page.locator('#x-extension')).toHaveAttribute('aria-label', `Figure: Extension ${literal('x_t')}`);
    await expect(page.locator('#x-extension')).toHaveAttribute('aria-describedby', 'vs-q-extension');
    await expect(page.locator('[id="v-extension.part"]')).toHaveText('Extension drawing');
    await expect(page.locator('[id="v-extension.part"] [data-vs-math-native]')).toHaveCount(0);
    await expect(page.locator('#x-code code')).toHaveText(literal('inline'));
    await expect(page.locator('#x-code code .vs-math')).toHaveCount(0);
    await expect(page.locator('#x-fence .vs-fence code')).toHaveText(literal('fenced') + '\n');
    await expect(page.locator('#x-fence .vs-math')).toHaveCount(0);
    await expect(page.locator('#x-source .vs-code')).toContainText(`const literal = "${literal('code')}";`);
    await expect(page.locator('#x-source .vs-code .vs-math')).toHaveCount(0);
    await expect(page.locator('#x-code .vs-eqref')).toHaveAttribute('href', '#x-equation');
    await expect(page.locator('#x-code .vs-eqref')).toHaveText('Equation (1)');
    await expect(page.locator('#x-equation')).toHaveCount(1);
    await expect(page.locator('#x-equation .vs-equation-number')).toHaveText('Equation (1)');
    const equation = page.locator('#x-equation .vs-math');
    await expect(equation.locator('.vs-math-source')).toHaveText(`$$\n${variant === 'long' ? longTex('E_k') : 'E_k'}\n$$`);
    if (variant === 'success' || variant === 'long') {
      await expect(equation.locator('.vs-math-visual svg')).toBeVisible();
    } else {
      await expect(equation.locator('.vs-math-source')).toBeVisible();
      expect(await equation.locator('.vs-math-source').evaluate(node => getComputedStyle(node).clipPath)).toBe('none');
      await expect(equation.locator('.vs-math-visual')).toBeHidden();
    }
    await expect(page.locator('#x-alias .vs-term')).toHaveText('terms');
    await expect(page.locator('#x-alias .vs-term')).toHaveAttribute('href', '#x-definition');
    await expect(page.locator('#x-alias .vs-term .vs-math')).toHaveCount(0);
    await expect(page.locator('#x-prose br')).toHaveCount(1);
    await expect(page.locator('#x-prose br ~ .vs-math').first().locator('.vs-math-source'))
      .toHaveText(`$${variant === 'long' ? longTex('b_x') : 'b_x'}$`);
    for (const [scope, tex] of fields) {
      const source = `$${variant === 'long' ? longTex(tex) : tex}$`;
      const field = page.locator(scope).locator('.vs-math').filter({ has: page.locator('.vs-math-source').filter({ hasText: source }) }).first();
      await expect(field.locator('.vs-math-source')).toHaveText(source);
      if (variant === 'nojs' || variant === 'failure' || variant === 'print') {
        await expect(field.locator('.vs-math-source')).toBeVisible();
        expect(await field.locator('.vs-math-source').evaluate(node => getComputedStyle(node).clipPath)).toBe('none');
        await expect(field.locator('.vs-math-visual')).toBeHidden();
      } else {
        await expect(field).toHaveAttribute('data-vs-math-rendered', '');
        await expect(field.locator('.vs-math-visual svg')).toBeVisible();
      }
    }
  });
}
