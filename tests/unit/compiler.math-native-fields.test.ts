import { afterAll, describe, expect, it } from 'vitest';
// @ts-expect-error jsdom is supplied by the test harness without declarations.
import { JSDOM } from 'jsdom';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { compileDocument } from '../../packages/core/src/compiler/compile.ts';
import { convertMath } from '../../packages/core/src/math/engine.ts';

const dir = mkdtempSync(join(tmpdir(), 'visser-native-fields-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const frontmatter = readFileSync('examples/bounded-queue/index.md', 'utf8').split('---')[1];
const cases = [
  { id: 'COV-11', family: 'architecture', fields: ['a_1','a_2','a_3','a_4'], native: ['a_1','a_2','a_3','a_4'], body: `
{% group id="g" label="$a_1$" /%}
{% node id="a" group="g" role="process" label="$a_2$" /%}
{% node id="b" role="storage" label="Store" /%}
{% edge id="r" from="a" to="b" kind="data" label="$a_3$" quantity="$a_4$" /%}` },
  { id: 'COV-12', family: 'state', fields: ['s_1','s_2','s_3','s_4','s_5'], native: ['s_1','s_2','s_4'], body: `
{% state id="a" label="$s_1$" initial=true /%}
{% state id="b" label="End" terminal=true /%}
{% transition id="r" from="a" to="b" label="$s_2$" event="$s_3$" guard="$s_4$" action="$s_5$" /%}` },
  { id: 'COV-13', family: 'cause', fields: ['c_1','c_2'], native: ['c_1','c_2'], body: `
{% factor id="a" label="$c_1$" basis="observed" /%}
{% factor id="b" label="Effect" basis="observed" /%}
{% causal-link id="r" from="a" to="b" label="$c_2$" basis="inferred" /%}` },
  { id: 'COV-14', family: 'plan', fields: ['p_1','p_2','p_3','p_4','p_5','p_6','p_7'], native: ['p_1','p_6','p_7'], body: `
{% task id="a" label="$p_1$" owner="$p_2$" output="$p_3$" acceptance="$p_4$" risk="$p_5$" /%}
{% task id="b" label="Next" /%}
{% dependency id="r" from="a" to="b" label="$p_6$" quantity="$p_7$" /%}` },
  { id: 'COV-15', family: 'transform', fields: ['t_1','t_2','t_3','t_4','t_5','t_6','t_7','t_8','t_9','t_{10}'], native: ['t_1','t_2','t_5','t_7','t_8','t_{10}'], body: `
{% stage id="a" label="$t_1$" representation="$t_2$" shape=["$t_3$"] units="$t_4$" location="$t_5$" ownership="$t_6$" /%}
{% stage id="b" label="Result" representation="result" /%}
{% conversion id="r" from="a" to="b" label="$t_7$" loss="$t_8$" condition="$t_9$" quantity="$t_{10}$" /%}` },
  { id: 'COV-16', family: 'domain', fields: ['d_1','d_2','d_3','d_4'], native: ['d_1','d_2','d_3','d_4'], body: `
{% concept id="a" definition="da" label="$d_1$" attributes=["$d_2$"] /%}
{% concept id="b" definition="db" label="Other" /%}
{% relation id="r" from="a" to="b" kind="has" label="$d_3$" cardinality="$d_4$" /%}` },
];

describe('native family field math @M02 @M10 @M13', () => {
  it.each(cases)('$id $family preserves each field in HTML and Markdown and reserves native geometry', async specimen => {
    const tag = ['transform', 'domain'].includes(specimen.family) ? specimen.family : 'graph';
    const mode = tag === 'graph' ? ` mode="${specimen.family}"` : '';
    const definitions = specimen.family === 'domain' ? `{% definition id="da" term="Alpha" %}
Alpha meaning.
{% /definition %}
{% definition id="db" term="Beta" %}
Beta meaning.
{% /definition %}
` : '';
    const source = `---${frontmatter}---\n\n${definitions}\n{% ${tag} id="fig"${mode} title="Title $f_1$" question="Question $f_2$" %}\nBody $f_3$.\n${specimen.body}\n{% /${tag} %}\n`;
    writeFileSync(join(dir, 'index.md'), source);
    const bundle = loadBundle(join(dir, 'index.md'));
    expect(bundle.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    const result = await compileDocument(bundle, { version: '0.0.0', sha256: 'a'.repeat(64), assets: { 'math.js': 'b'.repeat(64) } }, { audience: 'private', includeSource: false, layoutFallback: false });
    const html = new TextDecoder().decode(result.files.find(f => f.path.endsWith('/index.html'))!.bytes);
    const markdown = new TextDecoder().decode(result.files.find(f => f.path.endsWith('/document.md'))!.bytes);
    const doc: Document = new JSDOM(html).window.document;
    const visibleSource = [...doc.querySelectorAll('.vs-math-source')].map(el => el.textContent);
    for (const tex of [...specimen.fields, 'f_1', 'f_2', 'f_3']) {
      expect(visibleSource, `HTML ${tex}`).toContain(`$${tex}$`);
      expect(markdown, `Markdown ${tex}`).toContain(`$${tex}$`);
    }
    const slots = [...doc.querySelectorAll('[data-vs-math-native]')];
    for (const tex of specimen.native) {
      const matches = slots.filter(el => JSON.parse(el.getAttribute('data-vs-math-key')!)[1] === tex);
      expect(matches.length, `native slot ${tex}`).toBeGreaterThan(0);
      const metrics = convertMath(tex, false).metrics;
      for (const slot of matches) {
        expect(Number(slot.getAttribute('width')) + 0.0005).toBeGreaterThanOrEqual(metrics.widthEm * 14);
        expect(Number(slot.getAttribute('height')) + 0.0005).toBeGreaterThanOrEqual(metrics.heightEm * 14);
      }
    }
  });
});
