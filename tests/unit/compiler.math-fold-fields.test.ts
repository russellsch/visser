import { afterAll, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error jsdom is supplied by the test harness.
import { JSDOM } from 'jsdom';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { compileDocument } from '../../packages/core/src/compiler/compile.ts';
const directory = mkdtempSync(join(tmpdir(), 'visser-fold-fields-'));
afterAll(() => rmSync(directory, { recursive: true, force: true }));
it('retains folded graph labels and original endpoints in HTML and semantic Markdown @M02 @M10 @M13', async () => {
  const frontmatter = readFileSync('examples/bounded-queue/index.md', 'utf8').split('---')[1];
  const path = join(directory, 'index.md');
  writeFileSync(path, `---${frontmatter}---
{% graph id="graph" mode="architecture" title="Folded graph" question="What crosses the boundary?" %}
{% group id="group" label="Group $f_g$" collapsed=true /%}
{% node id="inside" group="group" role="process" label="Inside $f_i$" /%}
{% node id="outside" role="process" label="Outside $f_o$" /%}
{% edge id="edge" from="inside" to="outside" kind="call" label="Flow $f_e$" /%}
{% /graph %}
`);
  const bundle = loadBundle(path);
  expect(bundle.diagnostics.filter(item => item.severity === 'error')).toEqual([]);
  const compiled = await compileDocument(bundle, { version: '0.0.0', sha256: 'a'.repeat(64), assets: { 'math.js': 'b'.repeat(64) } }, { audience: 'private', includeSource: false, layoutFallback: false });
  const document: Document = new JSDOM(new TextDecoder().decode(compiled.files.find(file => file.path.endsWith('/index.html'))!.bytes)).window.document;
  const markdown = new TextDecoder().decode(compiled.files.find(file => file.path.endsWith('/document.md'))!.bytes);
  for (const [id, tex] of [['group', 'f_g'], ['inside', 'f_i'], ['outside', 'f_o'], ['edge', 'f_e']]) {
    const sources = [...document.querySelectorAll(`[id="l-graph.${id}"] .vs-math-source`)];
    expect(sources.map(node => node.textContent)).toContain(`$${tex}$`);
  }
  const edge = document.querySelector('[id="l-graph.edge"]')!.parentElement!;
  for (const tex of ['f_i', 'f_o']) expect([...edge.querySelectorAll('.vs-math-source')].map(node => node.textContent)).toContain(`$${tex}$`);
  const hasNative = (selector: string, tex: string) => expect([...document.querySelectorAll(`${selector} [data-vs-math-native]`)].map(node => node.getAttribute('data-vs-math-key'))).toContain(JSON.stringify([false, tex]));
  hasNative('[data-vs-fold="group"]', 'f_g');
  hasNative('[data-vs-proxy-for="edge"]', 'f_e');
  expect(markdown).toContain('Group Group $f_g$');
  expect(markdown).toContain('Node Inside $f_i$');
  expect(markdown).toContain('Node Outside $f_o$');
  expect(markdown).toContain('Inside $f_i$ --[call; Flow $f_e$]--> Outside $f_o$');
});
