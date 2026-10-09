import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { compileDocument } from '../../packages/core/src/compiler/compile.ts';

const dir = mkdtempSync(join(tmpdir(), 'visser-math-coverage-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const frontmatter = readFileSync(new URL('../../examples/bounded-queue/index.md', import.meta.url), 'utf8').split('---')[1];
const toolkit = { version: '0.0.0', sha256: 'a'.repeat(64), assets: { 'math.js': 'b'.repeat(64) } };
async function page(body: string): Promise<string> {
  writeFileSync(join(dir, 'index.md'), `---${frontmatter}---\n\n${body}`);
  const bundle = loadBundle(join(dir, 'index.md'));
  expect(bundle.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const result = await compileDocument(bundle, toolkit, { audience: 'private', includeSource: false, layoutFallback: false });
  return new TextDecoder().decode(result.files.find((file) => file.path.endsWith('/index.html'))!.bytes);
}
function section(html: string, start: string, end: string): string {
  const a = html.indexOf(start);
  expect(a).toBeGreaterThanOrEqual(0);
  const b = html.indexOf(end, a);
  expect(b).toBeGreaterThan(a);
  return html.slice(a, b);
}

describe('authored math in secondary compiler surfaces @M02', () => {
  it('typesets graph quantity, notes and owner separately in list and inspector', async () => {
    const html = await page(`{% graph id="architecture" mode="architecture" title="Architecture $G$" question="How?" %}
{% node id="a" role="process" label="A $x$" /%}
{% node id="b" role="storage" label="B" /%}
{% edge id="edge" from="a" to="b" kind="data" label="Rate $r$" quantity="$q$" /%}
{% /graph %}

{% graph id="plan" mode="plan" title="Plan" question="Who?" %}
{% task id="task" label="Task" owner="$o$" /%}
{% /graph %}
`);
    const relations = section(html, 'class="vs-rel-list"', '</ol>');
    expect(relations).toMatch(/class="vs-rel-quantity"[^>]*> \(<span class="vs-math"[^>]*><span class="vs-math-source">\$q\$/);
    const nodes = section(html, 'class="vs-node-list"', '</ul>');
    expect(nodes).toContain('class="vs-math-source">$x$');
    const task = section(html, 'id="x-task"', '</details>');
    expect(task).toContain('class="vs-math-source">$o$');
    expect(html).toMatch(/class="vs-role" data-vs-generated=""> \(status: proposed; owner: <span class="vs-math"[^>]*><span class="vs-math-source">\$o\$/);
    expect(html).toMatch(/Parts of 'Architecture <span class="vs-math"[^>]*><span class="vs-math-source">\$G\$/);
  });

  it('keeps separate transform shape values from pairing unmatched delimiters', async () => {
    const html = await page(`{% transform id="transform" title="Transform" question="How?" %}
{% stage id="stage" label="Stage" representation="pixels" shape=["$a", "b$"] location="host" /%}
{% /transform %}
`);
    const list = section(html, 'class="vs-node-list"', '</ul>');
    expect(list).toContain('shape: $a × b$');
    expect(list).not.toContain('class="vs-math"');
  });

  it('typesets trace actor, event, branch and time unit in both list forms and branch facts', async () => {
    const html = await page(`{% trace id="trace" title="Trace" question="When?" scale="time" timeUnit="$ms$" %}
{% actor id="actor" label="Actor $a$" /%}
{% branch id="branch" label="Branch $b$" condition="if $c$" /%}
{% event id="event" actor="actor" label="Event $e$" kind="compute" time=2 branch="branch" /%}
{% /trace %}
`);
    const scale = section(html, 'class="vs-trace-scale"', '</p>');
    expect(scale).toContain('class="vs-math-source">$ms$');
    const list = section(html, 'class="vs-trace-events"', '</ol>');
    for (const tex of ['$a$', '$e$', '$b$', '$ms$']) expect(list).toContain(`class="vs-math-source">${tex}`);
    const cards = section(html, 'class="vs-trace-cards"', '</ol>');
    for (const tex of ['$e$', '$b$', '$ms$']) expect(cards).toContain(`class="vs-math-source">${tex}`);
    const detail = section(html, 'id="x-branch"', '</details>');
    expect(detail).toContain('class="vs-math-source">$c$');
  });

  it('preserves definition math delimiters for summaries and typesets visible glossary meaning', async () => {
    const html = await page(`{% definition id="def" term="ratio" %}
The ratio $x! y$ describes the signal. Another sentence follows.
{% /definition %}

{% domain id="domain" title="Domain" question="What?" %}
{% concept id="concept" label="Ratio" definition="def" attributes=["$u$", "steady"] /%}
{% /domain %}
`);
    const glossary = section(html, 'class="vs-glossary"', '</table>');
    expect(glossary).toContain('class="vs-math-source">$x! y$');
    const definition = section(html, 'id="x-def"', '</details>');
    expect(definition).toContain('data-vs-summary="The ratio $x! y$ describes the signal."');
    expect(html).toContain('class="vs-math-source">$u$');
  });

  it('typesets a display equation when it is the first definition sentence', async () => {
    const html = await page(`{% definition id="def_display" term="identity" %}
$$
x=y
$$
{% /definition %}

{% domain id="domain" title="Domain" question="What?" %}
{% concept id="concept" label="Identity" definition="def_display" /%}
{% /domain %}
`);
    const glossary = section(html, 'class="vs-glossary"', '</table>');
    expect(glossary).toContain('class="vs-math vs-math-display"');
    expect(glossary).toContain('class="vs-math-source">$$');
  });

  it('keeps code and escaped dollar text literal in a definition summary', async () => {
    const html = await page(`{% definition id="def_literal" term="literal" %}
Use \`$code$\`, \\$escaped\\$ and $x$ here. Another sentence follows.
{% /definition %}

{% domain id="domain" title="Domain" question="What?" %}
{% concept id="concept" label="Literal" definition="def_literal" /%}
{% /domain %}
`);
    const glossary = section(html, 'class="vs-glossary"', '</table>');
    expect(glossary).toContain('$code$');
    expect(glossary).toContain('$escaped$');
    expect(glossary).toContain('class="vs-math-source">$x$');
    expect(glossary).not.toContain('data-vs-math-key="[false,&quot;code&quot;]"');
    expect(glossary).not.toContain('data-vs-math-key="[false,&quot;escaped&quot;]"');
    expect(html).toContain('data-vs-summary="Use $code$, $escaped$ and $x$ here."');
  });

  it('does not typeset a literal dollar run even when the same TeX is validated elsewhere', async () => {
    const html = await page(`{% definition id="def_literal" term="literal" %}
Use \`$code$\` and \\$escaped\\$ here.
{% /definition %}

{% domain id="domain" title="Domain" question="What?" %}
{% concept id="concept" label="Literal" definition="def_literal" /%}
{% /domain %}

<!-- vs:id other -->
Actual formulas $code$ and $escaped$ appear here.
`);
    const glossary = section(html, 'class="vs-glossary"', '</table>');
    expect(glossary).toContain('$code$ and $escaped$ here.');
    expect(glossary).not.toContain('class="vs-math"');
    expect(html).toContain('class="vs-math-source">$code$');
    expect(html).toContain('class="vs-math-source">$escaped$');
  });

  it('typesets criterion units beside labels without joining their delimiters', async () => {
    const html = await page(`{% compare id="compare" title="Compare" question="Which?" %}
{% option id="option" label="Option" /%}
{% criterion id="criterion" label="Efficiency" units="$W$" /%}
{% cell id="cell" option="option" criterion="criterion" value="Good" /%}
{% /compare %}
`);
    expect(html.match(/class="vs-units"[^>]*> \(<span class="vs-math"[^>]*><span class="vs-math-source">\$W\$/g)?.length).toBe(2);
  });

  it('typesets fallback term and detail-link labels inside their links', async () => {
    const html = await page(`{% definition id="definition" term="Rate $x$" %}
The rate is defined.
{% /definition %}

{% detail id="detail" label="More $y$" %}
More explanation.
{% /detail %}

<!-- vs:id paragraph -->
See {% term ref="definition" /%} and {% detail-link ref="detail" /%}.
`);
    const paragraph = section(html, 'id="x-paragraph"', '</p>');
    expect(paragraph).toMatch(/class="vs-term"[^>]*>Rate <span class="vs-math"[^>]*><span class="vs-math-source">\$x\$/);
    expect(paragraph).toMatch(/class="vs-detail-link"[^>]*>More <span class="vs-math"[^>]*><span class="vs-math-source">\$y\$/);
  });
});
