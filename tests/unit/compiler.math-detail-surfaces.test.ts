import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { compileDocument } from '../../packages/core/src/compiler/compile.ts';
import { normalizedTextSha256 } from '../../packages/core/src/model/hash.ts';

const dir = mkdtempSync(join(tmpdir(), 'visser-math-detail-surfaces-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const frontmatter = readFileSync(new URL('../../examples/bounded-queue/index.md', import.meta.url), 'utf8').split('---')[1];
const toolkit = { version: '0.0.0', sha256: 'a'.repeat(64), assets: { 'math.js': 'b'.repeat(64) } };

async function compile(body: string): Promise<{ html: string; markdown: string }> {
  writeFileSync(join(dir, 'index.md'), `---${frontmatter}---\n\n${body}`);
  const bundle = loadBundle(join(dir, 'index.md'));
  expect(bundle.diagnostics.filter(diagnostic => diagnostic.severity === 'error')).toEqual([]);
  const result = await compileDocument(bundle, toolkit, { audience: 'private', includeSource: false, layoutFallback: false });
  const text = (suffix: string) => new TextDecoder().decode(result.files.find(file => file.path.endsWith(suffix))!.bytes);
  return { html: text('/index.html'), markdown: text('/document.md') };
}

function section(html: string, id: string): string {
  const start = html.indexOf(`id="x-${id}"`);
  expect(start, id).toBeGreaterThanOrEqual(0);
  const end = html.indexOf('</details>', start);
  expect(end, id).toBeGreaterThan(start);
  return html.slice(start, end);
}

describe('math compiler detail surfaces @M02 @M03 @M08 @M13', () => {
  it('preserves distinct authored formulas in component, definition, and source fields', async () => {
    const excerpt = 'const literal = "$code$";\n';
    const excerptSha256 = normalizedTextSha256(new TextEncoder().encode(excerpt));
    const { html, markdown } = await compile(`{% note id="note" kind="limit" %}
Note body $n_b$.
{% /note %}

{% self-check id="check" question="Question $q_c$?" %}
Answer body $a_c$.
{% /self-check %}

{% detail id="detail" label="Detail label $l_d$" %}
Detail body $b_d$.
{% /detail %}

{% graph id="graph" mode="architecture" title="Graph" question="Why?" %}
{% node id="node" role="process" label="Node" /%}
{% steps id="steps" %}
{% step id="step" label="Step label $l_s$" targets=["node"] %}
Step body $b_s$.
{% /step %}
{% step id="step_two" label="Second" targets=["node"] %}
Second step.
{% /step %}
{% /steps %}
{% /graph %}

{% definition id="definition" term="Term $t_d$" aliases=["terms"] %}
Definition body $b_f$. Another sentence.
{% /definition %}

<!-- vs:id alias_use -->
The terms are matching input.

{% source id="source" kind="example" title="Source title $t_s$" language="text" excerptSha256="${excerptSha256}" %}
\`\`\`text
${excerpt}\`\`\`
{% /source %}
`);

    expect(section(html, 'note')).toContain('class="vs-math-source">$n_b$');
    const check = section(html, 'check');
    expect(check).toContain('class="vs-self-check-question"');
    expect(check).toContain('class="vs-math-source">$q_c$');
    expect(check).toContain('class="vs-self-check-answer"');
    expect(check).toContain('class="vs-math-source">$a_c$');
    const detail = section(html, 'detail');
    expect(detail).toContain('class="vs-math-source">$l_d$');
    expect(detail).toContain('class="vs-math-source">$b_d$');
    const step = section(html, 'step');
    expect(step).toContain('class="vs-step-label"');
    expect(step).toContain('class="vs-math-source">$l_s$');
    expect(step).toContain('class="vs-step-body"');
    expect(step).toContain('class="vs-math-source">$b_s$');
    const definition = section(html, 'definition');
    expect(definition).toContain('class="vs-math-source">$t_d$');
    expect(definition).toContain('class="vs-math-source">$b_f$');
    expect(html).toMatch(/class="vs-term"[^>]*>terms<\/a>/);
    const source = section(html, 'source');
    expect(source).toContain('class="vs-math-source">$t_s$');
    expect(source).toContain('class="vs-code"');
    expect(source).toContain('const literal = "$code$";');
    expect(source).not.toContain('data-vs-math-key="[false,&quot;code&quot;]"');

    for (const tex of ['$n_b$', '$q_c$', '$a_c$', '$l_d$', '$b_d$', '$l_s$', '$b_s$', '$t_d$', '$b_f$', '$t_s$']) {
      expect(markdown, tex).toContain(tex);
    }
    expect(markdown).toContain('const literal = "$code$";');
    expect(markdown).toContain('The terms are matching input.');
  });
});
