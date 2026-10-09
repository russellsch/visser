import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { compileDocument } from '../../packages/core/src/compiler/compile.ts';
import { normalizedTextSha256 } from '../../packages/core/src/model/hash.ts';

const dir = mkdtempSync(join(tmpdir(), 'visser-math-other-surfaces-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const frontmatter = readFileSync(new URL('../../examples/bounded-queue/index.md', import.meta.url), 'utf8').split('---')[1];
const toolkit = { version: '0.0.0', sha256: 'a'.repeat(64), assets: { 'math.js': 'b'.repeat(64) } };

function source(id: string, content: string): string {
  const text = `${content}\n`;
  const hash = normalizedTextSha256(new TextEncoder().encode(text));
  return `{% source id="${id}" kind="example" title="${id}" language="text" excerptSha256="${hash}" %}\n\`\`\`text\n${text}\`\`\`\n{% /source %}`;
}

async function compile(body: string): Promise<{ html: string; markdown: string }> {
  writeFileSync(join(dir, 'index.md'), `---${frontmatter}---\n\n${body}`);
  const bundle = loadBundle(join(dir, 'index.md'));
  expect(bundle.diagnostics.filter(diagnostic => diagnostic.severity === 'error')).toEqual([]);
  const result = await compileDocument(bundle, toolkit, { audience: 'private', includeSource: false, layoutFallback: false });
  const text = (suffix: string) => new TextDecoder().decode(result.files.find(file => file.path.endsWith(suffix))!.bytes);
  return { html: text('/index.html'), markdown: text('/document.md') };
}

function figure(html: string, id: string): string {
  const start = html.indexOf(`id="x-${id}"`);
  expect(start, id).toBeGreaterThanOrEqual(0);
  const end = html.indexOf('</figure>', start);
  expect(end, id).toBeGreaterThan(start);
  return html.slice(start, end);
}

function detail(html: string, id: string): string {
  const start = html.indexOf(`id="x-${id}"`);
  expect(start, id).toBeGreaterThanOrEqual(0);
  const end = html.indexOf('</details>', start);
  expect(end, id).toBeGreaterThan(start);
  return html.slice(start, end);
}

describe('math compiler measure, tree, comparison, and annotation surfaces @M02 @M03 @M08 @M13', () => {
  it('preserves authored formulas and literal machine/excerpt text across HTML and Markdown', async () => {
    const { html, markdown } = await compile(`{% measure id="measure" title="Measure title $m_t$" question="Measure question $m_q$?" unit="$m_u$" %}
Measure body $m_b$.
{% reading id="reading" label="Reading label $m_l$" value=7 valueStatus="measured" display="$m_d$" /%}
{% reading id="reading_two" label="Reference" value=14 valueStatus="measured" display="$m_e$" /%}
{% /measure %}

{% tree id="tree" title="Tree title $t_t$" question="Tree question $t_q$?" %}
Tree body $t_b$.
{% entry id="entry" path="src/$t_p$" label="Entry label $t_l$" /%}
{% /tree %}

{% compare id="compare" title="Compare title $c_t$" question="Compare question $c_q$?" %}
Compare body $c_b$.
{% option id="option" label="Option label $c_o$" /%}
{% criterion id="criterion" label="Criterion label $c_c$" units="$c_u$" /%}
{% criterion id="body_criterion" label="Body criterion $c_i$" /%}
{% cell id="cell" option="option" criterion="criterion" value="$c_v$" /%}
{% cell id="body_cell" option="option" criterion="body_criterion" %}
Cell body $c_x$.
{% /cell %}
{% /compare %}

{% annotated id="annotated" title="Annotated title $a_t$" question="Annotated question $a_q$?" source="after" before="before" %}
Annotated body $a_b$.
{% annotation id="annotation" label="Annotation label $a_l$" lines=[1, 1] %}
Annotation body $a_x$.
{% /annotation %}
{% /annotated %}

${source('before', 'const literal = "$code$";')}
${source('after', 'const literal = "$code$"; // changed')}
`);

    const measure = figure(html, 'measure');
    for (const tex of ['$m_t$', '$m_q$', '$m_b$', '$m_u$', '$m_l$', '$m_d$', '$m_e$']) {
      expect(measure, tex).toContain(`class="vs-math-source">${tex}`);
    }
    expect([...measure.matchAll(/<rect class="vs-bar"[^>]*width="([^"]+)"/g)].map(match => Number(match[1]))).toEqual([180, 360]);

    const tree = figure(html, 'tree');
    for (const tex of ['$t_t$', '$t_q$', '$t_b$', '$t_l$']) expect(tree, tex).toContain(`class="vs-math-source">${tex}`);
    expect(tree).toContain('<code class="vs-tree-path">src/$t_p$</code>');
    expect(tree).not.toContain('class="vs-math-source">$t_p$');

    const compare = figure(html, 'compare');
    for (const tex of ['$c_t$', '$c_q$', '$c_b$', '$c_o$', '$c_c$', '$c_u$', '$c_i$', '$c_v$', '$c_x$']) {
      expect(compare, tex).toContain(`class="vs-math-source">${tex}`);
    }
    const table = compare.slice(compare.indexOf('class="vs-compare-table"'), compare.indexOf('</table>'));
    const cards = compare.slice(compare.indexOf('class="vs-compare-cards"'), compare.indexOf('</figure>'));
    for (const tex of ['$c_o$', '$c_c$', '$c_u$', '$c_v$']) {
      expect(table, `table ${tex}`).toContain(`class="vs-math-source">${tex}`);
      expect(cards, `cards ${tex}`).toContain(`class="vs-math-source">${tex}`);
    }
    for (const tex of ['$c_i$', '$c_x$']) {
      expect(table, `table ${tex}`).toContain(`class="vs-math-source">${tex}`);
      expect(cards, `cards ${tex}`).toContain(`class="vs-math-source">${tex}`);
    }

    const annotated = figure(html, 'annotated');
    for (const tex of ['$a_t$', '$a_q$', '$a_b$', '$a_l$']) expect(annotated, tex).toContain(`class="vs-math-source">${tex}`);
    expect(detail(html, 'annotation')).toContain('class="vs-math-source">$a_x$');
    expect(annotated).toContain('const literal = "$code$";');
    expect(annotated).not.toContain('data-vs-math-key="[false,&quot;code&quot;]"');

    for (const tex of ['$m_t$', '$m_q$', '$m_b$', '$m_u$', '$m_l$', '$m_d$', '$m_e$', '$t_t$', '$t_q$', '$t_b$', '$t_l$',
      '$c_t$', '$c_q$', '$c_b$', '$c_o$', '$c_c$', '$c_u$', '$c_i$', '$c_v$', '$c_x$', '$a_t$', '$a_q$', '$a_b$', '$a_l$', '$a_x$']) {
      expect(markdown, tex).toContain(tex);
    }
    expect(markdown).toContain('src/$t_p$');
    expect(markdown).toContain('const literal = "$code$";');
  });
});
