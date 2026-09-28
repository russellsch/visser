// The term auto-link (docs/IMPROVEMENTS.md §13.3, §13.5), the appendix
// grouping (§4.5), the compare link rule (§4.6), and the static inspector
// data of a part (§4.2). Each test compiles a small document and reads the
// HTML. The Markdown projection must not change.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { compileDocument } from '../../packages/core/src/compiler/index.ts';
import { TermMatcher } from '../../packages/core/src/compiler/autolink.ts';
import { normalizedTextSha256 } from '../../packages/core/src/model/hash.ts';

const TOOLKIT = { version: '0.0.0', sha256: 'e'.repeat(64) };
const OPTIONS = { audience: 'private' as const, includeSource: false, layoutFallback: false };

const FRONTMATTER = `---
format: visser/1
docId: 5a1c2e3f-4b5c-4d6e-8f70-8192a3b4c5d6
title: Term fixture
kind: reference
capturedAt: 2026-09-27T00:00:00Z
visibility: private
---
`;

async function compile(body: string, whole = false): Promise<{ html: string; markdown: string; main: string; appendix: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'visser-autolink-'));
  writeFileSync(join(dir, 'index.md'), whole ? body : `${FRONTMATTER}\n<!-- vs:id h_top -->\n# Term fixture\n\n${body}\n`);
  const bundle = loadBundle(join(dir, 'index.md'));
  expect(bundle.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const result = await compileDocument(bundle, TOOLKIT, OPTIONS);
  const read = (suffix: string) => new TextDecoder().decode(result.files.find((f) => f.path.endsWith(suffix))!.bytes);
  const html = read('/index.html');
  const cut = html.indexOf('<section id="vs-appendix"');
  return { html, markdown: read('/document.md'), main: html.slice(0, cut), appendix: html.slice(cut) };
}

/** A captured example source with a fenced excerpt and its hash. */
function source(id: string, title: string, text: string): string {
  const sha = normalizedTextSha256(new TextEncoder().encode(`${text}\n`));
  return `{% source id="${id}" kind="example" title="${title}" excerptSha256="${sha}" %}\n\`\`\`text\n${text}\n\`\`\`\n{% /source %}\n`;
}

/** The text of each term use (a link, a quiet span, or an SVG tspan), with its definition ID. */
function uses(markup: string): Array<[string, string]> {
  return [...markup.matchAll(/<(a|span|tspan) class="vs-term[^"]*"[^>]*data-vs-term="([^"]+)"[^>]*>([^<]*)<\/\1>/g)].map((m) => [m[3]!, m[2]!]);
}

const DEF_PACKET = `{% definition id="def_packet" term="reference packet" aliases=["reference packets"] %}
A reference packet names one target. It has a hash.
{% /definition %}
`;
const DEF_TARGET = `{% definition id="def_target" term="target" %}
A target is one addressable part of a document.
{% /definition %}
`;

describe('TermMatcher (IMPROVEMENTS.md §13.3)', () => {
  const matcher = new TermMatcher([
    { id: 'def_target', term: 'target' },
    { id: 'def_id', term: 'target ID', aliases: ['target IDs'] },
    { id: 'def_off', term: 'state', auto: false },
  ]);

  it('matches whole words only, and ignores case', () => {
    expect(matcher.split('A Target and a TARGET.')).toEqual(['A ', { text: 'Target', defId: 'def_target' }, ' and a ', { text: 'TARGET', defId: 'def_target' }, '.']);
    expect(matcher.split('targeted retargets per-target target_x target2')).toEqual(['targeted retargets per-target target_x target2']);
    expect(matcher.split("the target's text")).toEqual(['the ', { text: 'target', defId: 'def_target' }, "'s text"]);
  });

  it('prefers the longest phrase, and matches across a line break', () => {
    expect(matcher.split('Each target ID is unique.')).toEqual(['Each ', { text: 'target ID', defId: 'def_id' }, ' is unique.']);
    expect(matcher.split('two target\nIDs here')).toEqual(['two ', { text: 'target\nIDs', defId: 'def_id' }, ' here']);
  });

  it('adds aliases, and never links a definition with auto=false', () => {
    expect(matcher.split('The state of the target IDs.')).toEqual(['The state of the ', { text: 'target IDs', defId: 'def_id' }, '.']);
    expect(matcher.ownerOf('state')).toBeUndefined();
  });

  it('gives a shared phrase to the first definition, and skips the given definition', () => {
    const shared = new TermMatcher([{ id: 'def_a', term: 'queue' }, { id: 'def_b', term: 'Queue' }]);
    expect(shared.ownerOf('QUEUE')).toBe('def_a');
    expect(matcher.split('A target.', 'def_target')).toEqual(['A target.']);
  });

  it('is deterministic: the same input gives the same output', () => {
    const text = 'A target ID names a target. The target IDs are unique.';
    const again = new TermMatcher([{ id: 'def_off', term: 'state', auto: false }, { id: 'def_id', term: 'target ID', aliases: ['target IDs'] }, { id: 'def_target', term: 'target' }]);
    expect(again.split(text)).toEqual(matcher.split(text));
  });
});

describe('term auto-link in the page (IMPROVEMENTS.md §13.3, §13.5)', () => {
  it('links every use in prose, lists, and tables; the first use in each paragraph is underlined', async () => {
    const { main } = await compile(`${DEF_TARGET}
<!-- vs:id p_one -->
A target has an ID. Each target is one part.

<!-- vs:id l_items -->
- The target of a marker.
- Nothing here.

<!-- vs:id t_table -->
| Name | Meaning |
|---|---|
| target | a part |
`);
    expect(uses(main)).toEqual([['target', 'def_target'], ['target', 'def_target'], ['target', 'def_target'], ['target', 'def_target']]);
    const paragraph = main.slice(main.indexOf('id="x-p_one"'));
    expect(paragraph).toMatch(/<a class="vs-term" href="#x-def_target" data-vs-term="def_target">target<\/a> has an ID\. Each <span class="vs-term vs-term-quiet" data-vs-term="def_target">target<\/span>/);
    expect(main).toContain('<li>The <a class="vs-term" href="#x-def_target" data-vs-term="def_target">target</a> of a marker.</li>');
    expect(main).toContain('<td><a class="vs-term" href="#x-def_target" data-vs-term="def_target">target</a></td>');
  });

  it('does not link in headings, code, links, citations, an authored term, or the term\'s own definition', async () => {
    const { main, appendix } = await compile(`${DEF_TARGET}
${source('src_a', 'A target in a source title', 'the target code')}
<!-- vs:id h_target -->
## The target

<!-- vs:id p_code -->
Use \`target\` here, and see [the target](https://example.com/target).

<!-- vs:id p_tag -->
The {% term ref="def_target" %}target{% /term %} is cited. {% cite ref="src_a" /%}

<!-- vs:id f_code -->
\`\`\`text
target
\`\`\`
`);
    expect(main).toContain('<h2>The target</h2>');
    expect(main).toContain('<code>target</code>');
    expect(main).toContain('<a href="https://example.com/target" rel="noopener noreferrer">the target</a>');
    expect(uses(main)).toEqual([['target', 'def_target']]);
    // The term in its own definition is plain text.
    const own = appendix.slice(appendix.indexOf('id="x-def_target"'));
    expect(own.slice(0, own.indexOf('</details>'))).not.toContain('vs-term');
    expect(uses(appendix)).toEqual([]);
  });

  it('links aliases, respects auto=false, and keeps the author tag for that definition', async () => {
    const { main } = await compile(`${DEF_PACKET}
{% definition id="def_state" term="state" auto=false %}
A state is one resolver answer.
{% /definition %}

<!-- vs:id p_uses -->
Two reference packets share one state. The {% term ref="def_state" %}state{% /term %} changes.
`);
    expect(uses(main)).toEqual([['reference packets', 'def_packet'], ['state', 'def_state']]);
  });

  it('links terms in part bodies and in figure labels, and not in the list links of the figure', async () => {
    const { main, appendix } = await compile(`${DEF_TARGET}
{% graph id="g_map" mode="architecture" title="Where a target lives" question="Which part holds the target?" %}
{% node id="n_store" role="storage" label="Target store" %}
Keeps each target.
{% /node %}
{% node id="n_api" role="interface" label="API" /%}
{% edge id="e_put" from="n_api" to="n_store" kind="call" label="put a target" /%}
{% /graph %}
`);
    const viewport = main.slice(main.indexOf('<div class="vs-viewport"'));
    const svg = viewport.slice(0, viewport.indexOf('</svg>'));
    // The edges come before the nodes in the SVG.
    expect(uses(svg)).toEqual([['target', 'def_target'], ['Target', 'def_target']]);
    expect(svg).toContain('<tspan class="vs-term" data-vs-term="def_target">Target</tspan> store');
    // The figure question is prose; the caption is a heading.
    expect(main).toMatch(/class="vs-figure-question">Which part holds the <a class="vs-term"[^>]*>target<\/a>\?<\/p>/);
    expect(main).toContain('<figcaption>Where a target lives</figcaption>');
    // The node list entry is a link, so it holds no term link.
    expect(main).toMatch(/<a id="l-g_map\.n_store"[^>]*href="#x-n_store"[^>]*>Target store<span class="vs-depth-cue[^>]*>[\s\S]*?<\/span><\/a>/);
    // The part body links the term. A Terms section under the part gives each
    // term of its label with the first sentence of its definition (§13.4,
    // phase-2 review R8), and links to the full definition.
    const store = appendix.slice(appendix.indexOf('id="x-n_store"'));
    expect(uses(store.slice(0, store.indexOf('</details>')))).toEqual([['target', 'def_target']]);
    expect(store).toContain('<section class="vs-detail-section vs-detail-terms" data-vs-generated=""><h3>Terms</h3><dl><dt><a class="vs-inspect-link" href="#x-def_target">Target</a></dt><dd>A target is one addressable part of a document.</dd></dl></section>');
  });

  it('adds no bytes to the Markdown projection, and the output is deterministic', async () => {
    const body = `${DEF_TARGET}\n<!-- vs:id p_one -->\nA target has an ID.\n`;
    const a = await compile(body);
    const b = await compile(body);
    expect(b.html).toBe(a.html);
    expect(a.markdown).not.toContain('vs-term');
    expect(a.markdown).toContain('A target has an ID.');
  });
});

describe('the auto-link fixture (fixtures/positive/term-autolink.md)', () => {
  it('links the term and its aliases everywhere except the heading, code, and auto=false', async () => {
    const text = readFileSync(new URL('../../fixtures/positive/term-autolink.md', import.meta.url), 'utf8');
    const { main, markdown } = await compile(text, true);
    const found = uses(main).map(([t, d]) => `${d}:${t}`);
    expect(found).toEqual([
      // The paragraph: later uses are quiet, and the author's tag for auto=false stays.
      'def_packet:reference packet', 'def_packet:packet', 'def_target:target', 'def_packet:packet', 'def_state:state',
      // The list, with the alias "targets", and the table.
      'def_target:target', 'def_target:targets', 'def_target:target', 'def_packet:packet',
      // The figure question and the interpretation.
      'def_packet:reference packet', 'def_packet:packet',
      // The SVG labels. The edge label wraps after "reference"; each line holds one piece of the term.
      'def_packet:reference', 'def_packet:packet', 'def_packet:Packet',
    ]);
    expect(main).toContain('<span class="vs-term vs-term-quiet" data-vs-term="def_packet">packet</span>');
    expect(found.filter((x) => x.startsWith('def_state:'))).toEqual(['def_state:state']);
    expect(main).toContain('<h1>A reference packet names a target</h1>');
    expect(main).toContain('<code>target</code>');
    expect(markdown).not.toContain('vs-term');
  });
});

describe('appendix grouping (IMPROVEMENTS.md §4.5)', () => {
  it('puts Sources and Definitions first and open, then one collapsed group per figure', async () => {
    const { appendix } = await compile(`${DEF_TARGET}
${source('src_a', 'Example source', 'code')}
{% graph id="g_map" mode="architecture" title="Map" question="What calls what?" %}
{% node id="n_queue" role="storage" label="Charge queue" %}
Holds charge requests. {% cite ref="src_a" /%}
{% /node %}
{% node id="n_worker" role="process" label="Worker" /%}
{% edge id="e_take" from="n_worker" to="n_queue" kind="call" label="take next" /%}
{% /graph %}
`);
    const groups = [...appendix.matchAll(/<details class="vs-appendix-group([^"]*)"[^>]*>\s*<summary><h3>(.*?)<\/h3><\/summary>/g)].map((m) => [m[1]!.trim(), m[2]!.replace(/<[^>]+>/g, '')]);
    expect(groups).toEqual([
      ['vs-appendix-open', 'Sources'],
      ['vs-appendix-open', 'Definitions'],
      // Without JavaScript every row shows, so the static count is every row (phase-2 review R2).
      ['vs-appendix-parts', "Parts of 'Map' (3)"],
    ]);
    expect(appendix).toMatch(/<details class="vs-appendix-group vs-appendix-open" open>/);
    expect(appendix).toMatch(/<details class="vs-appendix-group vs-appendix-parts" data-vs-figure="g_map">/);
    // A row is named by its label and its cue word.
    expect(appendix).toMatch(/<summary>Charge queue<span class="vs-kind" data-vs-generated=""> · storage<\/span><\/summary>/);
    // A part with no body can still add relationship context; the relationship
    // itself has no information beyond its visible row and remains bare.
    expect(appendix).toMatch(/<details class="vs-detail vs-kind-node" id="x-n_worker"[^>]*data-vs-depth="context"/);
    expect(appendix).toMatch(/<details class="vs-detail vs-kind-edge vs-detail-bare" id="x-e_take"/);
    expect(appendix).not.toMatch(/id="x-n_queue"[^>]*vs-detail-bare/);
  });

  it('keeps a figure group non-bare when its parts add relationship context', async () => {
    const { appendix } = await compile(`{% graph id="g_bare" mode="architecture" title="Bare" question="What is here?" %}
{% node id="n_a" role="process" label="A" /%}
{% node id="n_b" role="process" label="B" /%}
{% edge id="e_ab" from="n_a" to="n_b" kind="call" label="calls" /%}
{% /graph %}
`);
    expect(appendix).toContain('<details class="vs-appendix-group vs-appendix-parts" data-vs-figure="g_bare">');
    expect(appendix).not.toContain('vs-appendix-group-bare');
    // The static count is every row; the runtime shows the visible count.
    expect(appendix).toContain("Parts of 'Bare' <span class=\"vs-appendix-count\" data-vs-generated=\"\">(3)</span>");
  });
});

describe('inspector data of a part (IMPROVEMENTS.md §4.2)', () => {
  it('has Relationships with the edge and the other part, Appears in, and Evidence, in the static HTML', async () => {
    const { appendix } = await compile(`${source('src_a', 'Queue code', 'const queue = [];')}
{% graph id="g_map" mode="architecture" title="Map" question="What calls what?" %}
{% node id="n_queue" role="storage" label="Charge queue" %}
Holds charge requests. {% cite ref="src_a" /%}
{% /node %}
{% node id="n_worker" role="process" label="Worker" /%}
{% edge id="e_take" from="n_worker" to="n_queue" kind="call" label="take next" /%}
{% /graph %}

{% trace id="t_run" title="One run" question="What happens?" %}
{% actor id="a_queue" entity="n_queue" /%}
{% event id="ev_put" actor="a_queue" kind="compute" label="Store the request" /%}
{% /trace %}
`);
    const detail = appendix.slice(appendix.indexOf('id="x-n_queue"'));
    const queue = detail.slice(0, detail.indexOf('</details>'));
    const order = ['vs-detail-text', 'vs-detail-rels', 'vs-detail-appears', 'vs-detail-evidence'].map((c) => queue.indexOf(c));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    expect(queue).toMatch(/<li data-vs-edge="e_take" data-vs-other="n_worker">.*take next.*Worker.*<\/li>/);
    // The sections are h3 under the inspector's h2 title (phase-2 review R7).
    expect(queue).toMatch(/<h3>Appears in<\/h3><ul><li data-vs-entity="a_queue"><a class="vs-inspect-link" href="#x-a_queue">Charge queue<\/a> in <a href="#x-t_run">One run<\/a><\/li><\/ul>/);
    expect(queue).toMatch(/<details class="vs-detail-section vs-detail-evidence"[^>]*><summary>Evidence \(1\)<\/summary><div class="vs-detail-evidence-body"><div class="vs-evidence-item"><pre class="vs-code">[\s\S]*const queue = \[\];[\s\S]*<a class="vs-inspect-link" href="#x-src_a">Queue code<\/a>/);
    expect(queue).toContain('data-vs-cue="storage"');
    // The title already shows the cue word, so the facts list does not repeat it (phase-2 review S1).
    expect(queue).not.toContain('<dt>role</dt>');
  });
});

describe('compare cell link (IMPROVEMENTS.md §4.6)', () => {
  // The ruling on phase-2 review R1: the first paragraph of a cell with no
  // value is its value. The "›" link shows only when the inspector holds
  // more than the cell shows: a second block, evidence, a `cite`, or a nested
  // `detail`. It sits inline after the text. With no link, the cell body
  // keeps the cell's one table instance (§10.3).
  it('shows a "›" link only when the inspector holds more than the cell', async () => {
    const { main, markdown, appendix } = await compile(`${source('src_a', 'Queue code', 'const queue = [];')}
{% compare id="cmp" title="Queues" question="Which one?" %}
{% option id="o_a" label="Bounded" /%}
{% criterion id="c_x" label="Memory" /%}
{% criterion id="c_y" label="Failure" /%}
{% criterion id="c_z" label="Cost" /%}
{% criterion id="c_w" label="Latency" /%}
{% criterion id="c_c" label="Order" /%}
{% criterion id="c_v" label="Capacity" /%}
{% criterion id="c_e" label="Measured capacity" /%}
{% criterion id="c_n" label="Ordering" /%}
{% cell id="cl_x" option="o_a" criterion="c_x" value="fixed" /%}
{% cell id="cl_y" option="o_a" criterion="c_y" %}
Producers wait.
{% /cell %}
{% cell id="cl_z" option="o_a" criterion="c_z" /%}
{% cell id="cl_w" option="o_a" criterion="c_w" %}
Grows with the lag.

The producer sees the wait as latency.
{% /cell %}
{% cell id="cl_c" option="o_a" criterion="c_c" %}
First in, first out. {% cite ref="src_a" /%}
{% /cell %}
{% cell id="cl_v" option="o_a" criterion="c_v" value="100" %}
The limit is configurable.
{% /cell %}
{% cell id="cl_e" option="o_a" criterion="c_e" value="96" evidence=["src_a"] /%}
{% cell id="cl_n" option="o_a" criterion="c_n" value="FIFO" %}
{% detail id="nested_reason" label="Why FIFO" %}
One writer preserves insertion order.
{% /detail %}
{% /cell %}
{% /compare %}
`);
    const table = main.slice(main.indexOf('<table class="vs-compare-table"'), main.indexOf('</table>'));
    const links = [...table.matchAll(/<a class="vs-cell-link"[^>]*data-vs-target="([^"]+)"[^>]*>(.*?)<\/a>/g)];
    expect(links.map((m) => m[1])).toEqual(['cl_w', 'cl_c']);
    expect(links[0]![0]).toContain('aria-label="Bounded: Latency; opens more detail"');
    expect(links[0]![2]).toContain('vs-depth-cue vs-depth-explanation');
    expect(table).not.toContain('>details<');
    // Only the first block is the visible value; the link opens the later explanation.
    expect(table).toMatch(/<p>Grows with the lag\. <a class="vs-cell-link"[^>]*id="v-cmp\.cl_w"/);
    expect(table).not.toContain('The producer sees the wait as latency.');
    // A one-sentence cell and an empty cell: no link, and the cell body is the table instance.
    expect(table).toContain('<div class="vs-cell-body" id="v-cmp.cl_y" data-vs-target="cl_y"><p>Producers wait.</p></div>');
    expect(table).toContain('<div class="vs-cell-body" id="v-cmp.cl_z" data-vs-target="cl_z"></div>');
    // A value-only cell is still a target instance, but it is not a link.
    expect(table).toContain('<span class="vs-cell-value" id="v-cmp.cl_x" data-vs-target="cl_x" data-vs-depth="bare">fixed</span>');
    expect(table).not.toMatch(/<a[^>]*data-vs-target="cl_x"/);
    // A value with additional authored detail remains interactive.
    expect(table).toMatch(/<a class="vs-cell-value"[^>]*id="v-cmp\.cl_v"[^>]*data-vs-target="cl_v"[^>]*href="#x-cl_v"[^>]*data-vs-interactive=""[^>]*>100<span class="vs-depth-cue/);
    expect(table).not.toContain('The limit is configurable.');
    // Explicit evidence is also additional detail, even without a body.
    expect(table).toMatch(/<a class="vs-cell-value"[^>]*id="v-cmp\.cl_e"[^>]*data-vs-target="cl_e"[^>]*href="#x-cl_e"[^>]*data-vs-interactive=""[^>]*aria-label="Bounded: Measured capacity, 96; opens sources"[^>]*>96<span class="vs-depth-cue/);
    // Every cell has exactly one table instance.
    for (const cell of ['cl_x', 'cl_y', 'cl_z', 'cl_w', 'cl_c', 'cl_v', 'cl_e', 'cl_n']) expect(table.split(`id="v-cmp.${cell}"`).length - 1).toBe(1);

    const cards = main.slice(main.indexOf('<div class="vs-compare-cards"'), main.indexOf('</figure>'));
    expect(cards).toContain('<span id="l-cmp.cl_x" data-vs-target="cl_x" data-vs-depth="bare">Bounded</span>');
    expect(cards).not.toMatch(/<a[^>]*data-vs-target="cl_x"/);
    expect(cards).toMatch(/<a[^>]*id="l-cmp\.cl_v"[^>]*data-vs-target="cl_v"[^>]*data-vs-interactive/);
    expect(cards).toMatch(/<a[^>]*id="l-cmp\.cl_e"[^>]*data-vs-target="cl_e"[^>]*data-vs-interactive/);
    expect(cards).not.toContain('The limit is configurable.');
    expect(appendix).toContain('<section class="vs-detail-section vs-detail-nested"');
    expect(markdown).toContain('Evidence: Queue code (src_a)');
    const evidenceDetail = appendix.slice(appendix.indexOf('id="x-cl_e"'), appendix.indexOf('</details>', appendix.indexOf('id="x-cl_e"')));
    expect(evidenceDetail.indexOf('vs-detail-evidence')).toBeGreaterThan(evidenceDetail.indexOf('vs-detail-text'));
  });
});
