import { afterAll, describe, expect, it } from 'vitest';
// @ts-expect-error jsdom is supplied by the test harness without declarations.
import { JSDOM } from 'jsdom';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { compileDocument } from '../../packages/core/src/compiler/compile.ts';
import type { ExtensionBinding } from '../../packages/core/src/extensions/registry.ts';

const dir = mkdtempSync(join(tmpdir(), 'visser-extension-math-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const frontmatter = readFileSync('examples/bounded-queue/index.md', 'utf8').split('---')[1];
const extension: ExtensionBinding = {
  name: 'sample', version: '0.0.0', sha256: 'c'.repeat(64), ready: true,
  run: () => ({ schema: 'visser-component-output/1',
    svg: { tag: 'svg', attrs: { viewBox: '0 0 100 40' }, children: [
      { tag: 'g', target: 'part', children: [{ tag: 'text', attrs: { x: 5, y: 20 }, children: ['Extension drawing'] }] },
    ] }, parts: { part: { text: 'Generated description' } },
  }),
};

describe('host-owned extension math @M02 @M03 @M13', () => {
  it('COV-24 preserves part labels, authored descriptions and custom facts in host HTML and Markdown', async () => {
    writeFileSync(join(dir, 'index.md'), `---${frontmatter}---\n
{% extension id="ext" use="sample" title="Title $e_1$" question="Question $e_2$" %}
Figure body $e_3$.

{% part id="part" label="Label $e_4$" custom="$e_5$" summary="$e_6$" note="$e_7$" %}
Authored description $e_8$.
{% /part %}
{% /extension %}
`);
    const bundle = loadBundle(join(dir, 'index.md'));
    expect(bundle.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    const result = await compileDocument(bundle, { version: '0.0.0', sha256: 'a'.repeat(64), assets: { 'math.js': 'b'.repeat(64) } },
      { audience: 'private', includeSource: false, layoutFallback: false, extensions: new Map([['sample', extension]]) });
    const read = (suffix: string) => new TextDecoder().decode(result.files.find(f => f.path.endsWith(suffix))!.bytes);
    const doc: Document = new JSDOM(read('/index.html')).window.document;
    const source = [...doc.querySelectorAll('.vs-math-source')].map(el => el.textContent);
    const markdown = read('/document.md');
    for (let field = 1; field <= 8; field++) {
      expect(source, `HTML field ${field}`).toContain(`$e_${field}$`);
      expect(markdown, `Markdown field ${field}`).toContain(`$e_${field}$`);
    }
    const part = doc.querySelector('#x-part')!;
    for (const tex of ['$e_4$', '$e_5$', '$e_6$', '$e_7$', '$e_8$']) expect(part.textContent).toContain(tex);
    expect(doc.querySelector('[id="v-ext.part"]')?.textContent).toBe('Extension drawing');
    expect(doc.querySelector('[id="v-ext.part"] [data-vs-math-native]')).toBeNull();
  });
});
