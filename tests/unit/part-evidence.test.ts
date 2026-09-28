// `evidence` on a part and `due` on a task (docs/IMPROVEMENTS.md §4.4): the
// validator, the §9.2 evidence set, the Markdown projection, the inspector
// order, the task box, and the two W_EVIDENCE_GAP prompts.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parseSource } from '../../packages/core/src/syntax/index.ts';
import { buildTargetRecords, evidenceIdsOf } from '../../packages/core/src/model/targets.ts';
import { isIsoDate, validateDocument } from '../../packages/core/src/model/validate.ts';
import { projectText } from '../../packages/core/src/model/project.ts';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { compileDocument } from '../../packages/core/src/compiler/index.ts';
import { normalizedTextSha256 } from '../../packages/core/src/model/hash.ts';
import { reviewDocument } from '../../packages/core/src/review/index.ts';
import { h, render, UnsafeMarkupError } from '../../packages/core/src/compiler/html.ts';

const TOOLKIT = { version: '0.0.0', sha256: 'e'.repeat(64) };
const OPTIONS = { audience: 'private' as const, includeSource: false, layoutFallback: false };
const work = mkdtempSync(join(tmpdir(), 'visser-part-evidence-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

function doc(body: string, kind = 'teaching'): string {
  return `---
format: visser/1
docId: 7e1c2e3f-4b5c-4d6e-8f70-8192a3b4c5d6
title: Part evidence
kind: ${kind}
capturedAt: 2026-09-27T00:00:00Z
visibility: private
---

<!-- vs:id h_top -->
# Part evidence

${body}
`;
}

/** A captured example source with a fenced excerpt and its hash. */
function source(id: string, title: string, text: string): string {
  const sha = normalizedTextSha256(new TextEncoder().encode(`${text}\n`));
  return `{% source id="${id}" kind="example" title="${title}" excerptSha256="${sha}" %}\n\`\`\`text\n${text}\n\`\`\`\n{% /source %}\n`;
}

function analyze(text: string) {
  const parsed = parseSource(new TextEncoder().encode(text), 'index.md');
  const model = buildTargetRecords(parsed);
  const diagnostics = [...parsed.diagnostics, ...model.diagnostics, ...validateDocument(parsed, model)];
  return { parsed, model, diagnostics };
}

const errors = (text: string) => analyze(text).diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.code}: ${d.message}`);

function load(text: string) {
  const dir = mkdtempSync(join(work, 'doc-'));
  writeFileSync(join(dir, 'index.md'), text);
  const bundle = loadBundle(join(dir, 'index.md'));
  expect(bundle.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return bundle;
}

async function compile(text: string) {
  const result = await compileDocument(load(text), TOOLKIT, OPTIONS);
  const read = (suffix: string) => new TextDecoder().decode(result.files.find((f) => f.path.endsWith(suffix))!.bytes);
  const html = read('/index.html');
  const cut = html.indexOf('<section id="vs-appendix"');
  return { html, markdown: read('/document.md'), main: html.slice(0, cut), appendix: html.slice(cut) };
}

/** A link-only web source: an origin URL and no captured excerpt. */
const LINK_ONLY = '{% source id="src_link" kind="web" title="Ticket" url="https://example.com/t/1" capturedAt="2026-09-27T00:00:00Z" availability="link-only" /%}\n';

const SOURCES = `${source('src_b', 'Queue code', 'const queue = [];')}\n${source('src_a', 'Worker code', 'take(queue);')}\n${source('src_c', 'Design note', 'The queue is bounded.')}`;

describe('`evidence` on a part: validation (IMPROVEMENTS.md §4.4)', () => {
  it('is accepted on node, event, state, stage, task, and cell when each ID names a source', () => {
    const text = doc(`${SOURCES}
{% graph id="g_arch" mode="architecture" title="Map" question="What calls what?" %}
{% node id="n_q" role="storage" label="Queue" evidence=["src_b"] /%}
{% /graph %}

{% graph id="g_state" mode="state" title="States" question="Which states?" %}
{% state id="s_a" label="Open" initial=true evidence=["src_a"] /%}
{% /graph %}

{% graph id="g_plan" mode="plan" title="Plan" question="What first?" %}
{% task id="t_a" label="Ship" due="2026-10-03" evidence=["src_c"] /%}
{% /graph %}

{% trace id="t_run" title="Run" question="What happens?" %}
{% actor id="a_w" label="Worker" /%}
{% event id="ev_a" actor="a_w" kind="compute" label="Take one" evidence=["src_a", "src_b"] /%}
{% /trace %}

{% transform id="tf" title="Value" question="How does it change?" %}
{% stage id="st_a" label="Raw" representation="bytes" evidence=["src_c"] /%}
{% /transform %}

{% compare id="cmp" title="Queues" question="Which queue has a measured bound?" %}
{% option id="op_a" label="Bounded" /%}
{% criterion id="cr_a" label="Capacity" /%}
{% cell id="cl_a" option="op_a" criterion="cr_a" value=100 evidence=["src_c"] /%}
{% /compare %}
`);
    expect(errors(text)).toEqual([]);
  });

  it('an unknown ID is E_REF_BROKEN', () => {
    const text = doc(`{% graph id="g" mode="plan" title="Plan" question="What first?" %}
{% task id="t_a" label="Ship" evidence=["src_missing"] /%}
{% /graph %}
`);
    expect(errors(text)).toEqual([expect.stringMatching(/^E_REF_BROKEN: .*src_missing/)]);
  });

  it('an ID that names a target other than a source is E_REF_BROKEN', () => {
    const text = doc(`{% graph id="g" mode="architecture" title="Map" question="What calls what?" %}
{% node id="n_a" role="process" label="A" evidence=["n_b"] /%}
{% node id="n_b" role="process" label="B" /%}
{% /graph %}
`);
    expect(errors(text)).toEqual(['E_REF_BROKEN: node n_a: `evidence` must name a source, but n_b is a node']);
  });

  it('`evidence` is not an attribute of an actor', () => {
    const text = doc(`${SOURCES}
{% trace id="t_run" title="Run" question="What happens?" %}
{% actor id="a_w" label="Worker" evidence=["src_a"] /%}
{% event id="ev_a" actor="a_w" kind="compute" label="Take one" /%}
{% /trace %}
`);
    expect(errors(text)).toEqual(['E_SYNTAX: actor a_w: unknown attribute `evidence`']);
  });

  it('`evidence` on a factor names a source or an observation (IMPROVEMENTS.md §14.6, phase 6a review C8)', () => {
    const graph = (evidence: string) => doc(`${SOURCES}
{% graph id="g" mode="cause" title="Cause" question="Why did it fail?" %}
{% factor id="f_a" label="Full queue" basis="observed" evidence=${evidence} /%}
{% factor id="f_b" label="Timeout" basis="inferred" /%}
{% causal-link id="c_ab" from="f_a" to="f_b" label="blocks the worker" basis="inferred" evidence=["src_a"] /%}
{% /graph %}

{% trace id="log" scale="time" timeUnit="s" title="Log" question="When?" %}
Log lines.

{% event id="ob_full" label="Queue full" kind="observation" time=2 evidence=["src_b"] /%}
{% event id="ev_done" label="Done" kind="compute" time=3 /%}
{% /trace %}
`);
    expect(errors(graph('["src_a"]'))).toEqual([]);
    expect(errors(graph('["ob_full"]'))).toEqual([]);
    expect(errors(graph('["ev_done"]'))).toEqual(['E_REF_BROKEN: factor f_a: `evidence` names event ev_done, which is not an observation; name a source or an event with kind="observation"']);
  });

  it('accepts a link-only source', () => {
    const text = doc(`${LINK_ONLY}
{% graph id="g" mode="plan" title="Plan" question="What first?" %}
{% task id="t_a" label="Ship" due="2026-10-03" evidence=["src_link"] /%}
{% /graph %}
`);
    expect(errors(text)).toEqual([]);
  });

  it('a string in place of a list names the list form in the diagnostic', () => {
    const text = doc(`${SOURCES}
{% graph id="g" mode="architecture" title="Map" question="What calls what?" %}
{% node id="n_a" role="process" label="A" evidence="src_a" /%}
{% /graph %}
`);
    expect(errors(text)).toEqual(['E_SYNTAX: node n_a: `evidence` must be a list of IDs, such as ["src_a"]']);
  });
});

describe('`due` on a task: validation (IMPROVEMENTS.md §4.4)', () => {
  const plan = (due: string) => doc(`{% graph id="g" mode="plan" title="Plan" question="What first?" %}
{% task id="t_a" label="Ship" due=${due} /%}
{% /graph %}
`);
  it('accepts an ISO 8601 date', () => {
    expect(errors(plan('"2026-10-03"'))).toEqual([]);
  });
  for (const bad of ['"3 October 2026"', '"2026-10-3"', '"2026-13-01"', '"2026-10-03T10:00:00Z"', '20261003', '"2026-02-30"', '"2026-04-31"']) {
    it(`rejects ${bad} with E_SYNTAX`, () => {
      expect(errors(plan(bad))).toEqual(['E_SYNTAX: task t_a: `due` must be an ISO 8601 date such as 2026-10-03']);
    });
  }
  it('checks the day against the length of the month, with the Gregorian leap-year rule', () => {
    for (const good of ['2026-01-31', '2026-02-28', '2024-02-29', '2000-02-29', '2026-04-30', '2026-12-31']) expect(isIsoDate(good), good).toBe(true);
    for (const bad of ['2026-02-29', '1900-02-29', '2100-02-29', '2026-02-30', '2026-02-31', '2026-04-31', '2026-06-31', '2026-09-31', '2026-11-31']) expect(isIsoDate(bad), bad).toBe(false);
  });
  it('is not an attribute of a node', () => {
    const text = doc(`{% graph id="g" mode="architecture" title="Map" question="What calls what?" %}
{% node id="n_a" role="process" label="A" due="2026-10-03" /%}
{% /graph %}
`);
    expect(errors(text)).toEqual(['E_SYNTAX: node n_a: unknown attribute `due`']);
  });
});

describe('§9.2 evidenceIds of a part and the Markdown projection', () => {
  const text = doc(`${SOURCES}
{% graph id="g" mode="architecture" title="Map" question="What calls what?" %}
{% node id="n_q" role="storage" label="Queue" evidence=["src_b", "src_a", "src_b"] %}
Holds requests. {% cite ref="src_c" /%} Bounded. {% cite ref="src_a" /%}
{% /node %}
{% node id="n_w" role="process" label="Worker" %}
Takes requests. {% cite ref="src_c" /%}
{% /node %}
{% edge id="e_take" from="n_w" to="n_q" kind="call" label="take next" %}
Takes the next request. {% cite ref="src_a" /%}
{% /edge %}
{% /graph %}
`);

  it('the document is valid', () => {
    expect(errors(text)).toEqual([]);
  });

  it('is the sorted, deduplicated union of the attribute and the cited sources', () => {
    const { model } = analyze(text);
    const targetNodes = new Set(model.nodes.values());
    expect(evidenceIdsOf(model.nodes.get('n_q')!, (n) => targetNodes.has(n))).toEqual(['src_a', 'src_b', 'src_c']);
    expect(evidenceIdsOf(model.nodes.get('n_w')!, (n) => targetNodes.has(n))).toEqual(['src_c']);
  });

  it('prints "Evidence: TITLE (ID)" after the body of a part with `evidence`', () => {
    const { parsed } = analyze(text);
    const md = projectText(parsed);
    const block = md.slice(md.indexOf('<!-- vs:target n_q -->'), md.indexOf('<!-- vs:target n_w -->'));
    expect(block.trim().split('\n').slice(-2)).toEqual(['Evidence: Queue code (src_b)', 'Evidence: Worker code (src_a)']);
    expect(block.indexOf('Holds requests.')).toBeLessThan(block.indexOf('Evidence: Queue code (src_b)'));
    // A part with only a citation keeps it in the body; a relationship keeps its ID line.
    const worker = md.slice(md.indexOf('<!-- vs:target n_w -->'), md.indexOf('<!-- vs:target e_take -->'));
    expect(worker).toContain('[cite: src_c]');
    expect(worker).not.toContain('Evidence: Design note');
    const edge = md.slice(md.indexOf('<!-- vs:target e_take -->'));
    // A relationship prints its evidence as TITLE (ID) too (phase 6b review F16).
    expect(edge).toContain('\nEvidence: Worker code (src_a)');
  });

  it('two sources with one title stay apart by ID', () => {
    const same = doc(`${source('src_x', 'Handler', 'a();')}\n${source('src_y', 'Handler', 'b();')}
{% graph id="g" mode="architecture" title="Map" question="What calls what?" %}
{% node id="n_a" role="process" label="A" evidence=["src_x", "src_y"] /%}
{% /graph %}
`);
    expect(errors(same)).toEqual([]);
    const md = projectText(analyze(same).parsed);
    expect(md).toContain('Evidence: Handler (src_x)\nEvidence: Handler (src_y)');
  });
});

describe('the inspector of a part with `evidence` (IMPROVEMENTS.md §4.2, §4.4)', () => {
  it('lists the `evidence` sources first, then the cited ones, excerpt first, before the body', async () => {
    const { appendix } = await compile(doc(`${SOURCES}
{% graph id="g" mode="architecture" title="Map" question="What calls what?" %}
{% node id="n_q" role="storage" label="Queue" evidence=["src_b", "src_a"] %}
Holds requests. {% cite ref="src_c" /%} {% cite ref="src_a" /%}
{% /node %}
{% node id="n_w" role="process" label="Worker" /%}
{% edge id="e_take" from="n_w" to="n_q" kind="call" label="take next" /%}
{% /graph %}
`));
    const start = appendix.indexOf('id="x-n_q"');
    const queue = appendix.slice(start, appendix.indexOf('</details>', appendix.indexOf('vs-detail-evidence', start)));
    const items = [...queue.matchAll(/<div class="vs-evidence-item">([\s\S]*?)<a class="vs-inspect-link" href="#x-(src_[a-z])">/g)];
    expect(items.map((m) => m[2])).toEqual(['src_b', 'src_a', 'src_c']);
    for (const m of items) expect(m[1]).toMatch(/^<pre class="vs-code">/);
    // The Evidence section comes first, then the body, then the Relationships.
    const order = ['vs-detail-evidence', 'vs-detail-text', 'vs-detail-rels'].map((c) => queue.indexOf(c));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
  });

  it('a part with only citations keeps the Evidence section last', async () => {
    const { appendix } = await compile(doc(`${SOURCES}
{% graph id="g" mode="architecture" title="Map" question="What calls what?" %}
{% node id="n_q" role="storage" label="Queue" %}
Holds requests. {% cite ref="src_c" /%}
{% /node %}
{% node id="n_w" role="process" label="Worker" /%}
{% edge id="e_take" from="n_w" to="n_q" kind="call" label="take next" /%}
{% /graph %}
`));
    const start = appendix.indexOf('id="x-n_q"');
    const queue = appendix.slice(start, appendix.indexOf('</details>', appendix.indexOf('vs-detail-evidence', start)));
    expect(queue.indexOf('vs-detail-text')).toBeLessThan(queue.indexOf('vs-detail-evidence'));
  });

  it('a link-only source shows the appendix notice in place of an excerpt', async () => {
    const { appendix } = await compile(doc(`${LINK_ONLY}
{% graph id="g" mode="architecture" title="Map" question="What calls what?" %}
{% node id="n_q" role="storage" label="Queue" evidence=["src_link"] /%}
{% node id="n_w" role="process" label="Worker" /%}
{% edge id="e_take" from="n_w" to="n_q" kind="call" label="take next" /%}
{% /graph %}
`));
    const notice = '<p class="vs-link-only" data-vs-generated="">No captured excerpt; this origin link is not self-contained evidence.</p>';
    const start = appendix.indexOf('id="x-n_q"');
    const queue = appendix.slice(start, appendix.indexOf('</details>', appendix.indexOf('vs-detail-evidence', start)));
    expect(queue).toMatch(/<div class="vs-evidence-item"><p class="vs-link-only"/);
    expect(queue).toContain(notice);
    expect(queue).not.toContain('<pre class="vs-code">');
    // The source's own appendix row uses the same words.
    const row = appendix.slice(appendix.indexOf('id="x-src_link"'));
    expect(row).toContain(notice);
  });

  it('a `causal-link` with `evidence` keeps its Evidence section last: it is a relationship, not a part', async () => {
    const { appendix } = await compile(doc(`${SOURCES}
{% graph id="g" mode="cause" title="Cause" question="Why did it fail?" %}
{% factor id="f_a" label="Full queue" basis="observed" /%}
{% factor id="f_b" label="Timeout" basis="inferred" /%}
{% causal-link id="c_ab" from="f_a" to="f_b" label="blocks the worker" basis="inferred" evidence=["src_a"] %}
The worker waits on the queue.
{% /causal-link %}
{% /graph %}
`));
    const start = appendix.indexOf('id="x-c_ab"');
    const link = appendix.slice(start, appendix.indexOf('</details>', appendix.indexOf('vs-detail-evidence', start)));
    expect(link.indexOf('vs-detail-text')).toBeGreaterThan(0);
    expect(link.indexOf('vs-detail-text')).toBeLessThan(link.indexOf('vs-detail-evidence'));
  });
});

describe('a task `due` date on the page (IMPROVEMENTS.md §3.4, §4.4)', () => {
  it('is muted text under the label in the box, a note in the list, and a fact in the inspector', async () => {
    const { main, appendix, markdown } = await compile(doc(`${source('src_cal', 'Release calendar', '2026-10-03: ship')}
{% graph id="g" mode="plan" title="Plan" question="What first?" %}
{% task id="t_a" label="Build" status="complete" /%}
{% task id="t_b" label="Ship" due="2026-10-03" evidence=["src_cal"] /%}
{% dependency id="d_ab" from="t_a" to="t_b" label="build first" /%}
{% /graph %}
`));
    const box = main.slice(main.indexOf('id="v-g.t_b"'), main.indexOf('</a>', main.indexOf('id="v-g.t_b"')));
    expect(box).toMatch(/<tspan[^>]*>Ship<\/tspan><tspan class="vs-node-meta"[^>]*fill-opacity="0.72"[^>]*>due 2026-10-03<\/tspan>/);
    // A task with no date shows its label only.
    const other = main.slice(main.indexOf('id="v-g.t_a"'), main.indexOf('</a>', main.indexOf('id="v-g.t_a"')));
    expect(other).not.toContain('vs-node-meta');
    expect(main).toMatch(/id="l-g\.t_b"[^>]*>Ship<\/a><span class="vs-role"[^>]*> \(status: proposed; due: 2026-10-03\)<\/span>/);
    const detail = appendix.slice(appendix.indexOf('id="x-t_b"'));
    expect(detail).toMatch(/<dt>due<\/dt><dd>2026-10-03<\/dd>/);
    expect(markdown).toContain('due: 2026-10-03');
    expect(markdown).toContain('Evidence: Release calendar (src_cal)');
  });
});

describe('W_EVIDENCE_GAP for parts (IMPROVEMENTS.md §4.4)', () => {
  const gaps = (text: string) => reviewDocument(load(text)).filter((d) => d.code === 'W_EVIDENCE_GAP');

  it('prompts for a `due` date with no `evidence` on its task, and not for one with it', () => {
    const prompts = gaps(doc(`${source('src_cal', 'Release calendar', '2026-10-03: ship')}
{% graph id="g" mode="plan" title="Plan" question="What first?" %}
{% task id="t_a" label="Build" due="2026-10-01" /%}
{% task id="t_b" label="Ship" due="2026-10-03" evidence=["src_cal"] /%}
{% task id="t_c" label="Test" due="2026-10-02" %}
The calendar sets this date. {% cite ref="src_cal" /%}
{% /task %}
{% /graph %}
`, 'plan'));
    expect(prompts.map((d) => d.targetId)).toEqual(['t_a', 't_c']);
    expect(prompts[0]!.message).toBe('review: task t_a has a `due` date (2026-10-01) and no `evidence`; name the source of the date in `evidence`, or remove the date');
  });

  it('counts the parts with no evidence and no cite once per figure in a root-cause document', () => {
    const body = `${source('src_a', 'Worker code', 'take(queue);')}
{% trace id="t_run" title="Run" question="What happened?" %}
{% actor id="a_w" label="Worker" /%}
{% event id="ev_a" actor="a_w" kind="compute" label="Take one" evidence=["src_a"] /%}
{% event id="ev_b" actor="a_w" kind="compute" label="Retry" after=["ev_a"] %}
The log shows a retry. {% cite ref="src_a" /%}
{% /event %}
{% event id="ev_c" actor="a_w" kind="failure" label="Time out" after=["ev_b"] /%}
{% event id="ev_d" actor="a_w" kind="wait" label="Wait" after=["ev_b"] /%}
{% /trace %}

{% graph id="g" mode="architecture" title="Map" question="What calls what?" %}
{% node id="n_a" role="process" label="A" evidence=["src_a"] /%}
{% /graph %}
`;
    const prompts = gaps(doc(body, 'root-cause'));
    expect(prompts.map((d) => d.targetId)).toEqual(['t_run']);
    expect(prompts[0]!.message).toBe('review: in t_run, 2 of 4 parts have no `evidence` and no `cite`, or only link-only sources (ev_c, ev_d); in a root-cause document, give each part that is code an `evidence` source, or cite the observation in its body');
    // The same document of another kind gets no count.
    expect(gaps(doc(body, 'teaching'))).toEqual([]);
  });

  it('in a root-cause document, counts a part whose sources are all link-only as a part without evidence', () => {
    const body = `${source('src_a', 'Worker code', 'take(queue);')}
${LINK_ONLY}
{% trace id="t_run" title="Run" question="What happened?" %}
{% actor id="a_w" label="Worker" /%}
{% event id="ev_a" actor="a_w" kind="compute" label="Take one" evidence=["src_a", "src_link"] /%}
{% event id="ev_b" actor="a_w" kind="compute" label="Retry" after=["ev_a"] evidence=["src_link"] /%}
{% event id="ev_c" actor="a_w" kind="failure" label="Time out" after=["ev_b"] %}
The ticket reports the time-out. {% cite ref="src_link" /%}
{% /event %}
{% /trace %}
`;
    const prompts = gaps(doc(body, 'root-cause'));
    expect(prompts.map((d) => d.targetId)).toEqual(['t_run']);
    expect(prompts[0]!.message).toBe('review: in t_run, 2 of 3 parts have no `evidence` and no `cite`, or only link-only sources (ev_b, ev_c); in a root-cause document, give each part that is code an `evidence` source, or cite the observation in its body');
  });

  it('a link-only source names where a `due` date comes from: no prompt', () => {
    const prompts = gaps(doc(`${LINK_ONLY}
{% graph id="g" mode="plan" title="Plan" question="What first?" %}
{% task id="t_a" label="Ship" due="2026-10-03" evidence=["src_link"] /%}
{% /graph %}
`, 'plan'));
    expect(prompts).toEqual([]);
  });

  it('the positive fixture gets no prompt', () => {
    const text = readFileSync(new URL('../../fixtures/positive/family-part-evidence.md', import.meta.url), 'utf8');
    expect(reviewDocument(load(text)).map((d) => d.code)).toEqual([]);
  });
});

describe('the sanitizer checks the value of `fill-opacity` (review S1)', () => {
  it('accepts a number from 0 to 1', () => {
    for (const ok of ['0', '1', '0.72', '.5']) expect(render(h('tspan', { 'fill-opacity': ok }, 'x'))).toContain(`fill-opacity="${ok}"`);
  });
  for (const bad of ['url(x)', '1;expression', '0.5 ']) {
    it(`rejects ${JSON.stringify(bad)} with UnsafeMarkupError`, () => {
      expect(() => h('tspan', { 'fill-opacity': bad }, 'x')).toThrow(UnsafeMarkupError);
    });
  }
});
