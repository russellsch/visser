import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadBundle, type LoadedBundle } from '../../packages/core/src/model/bundle.ts';
import { compileDocument, type CompileResult } from '../../packages/core/src/compiler/index.ts';

const TOOLKIT = { version: '0.0.0', sha256: 'e'.repeat(64) };
const OPTIONS = { audience: 'private' as const, includeSource: false, layoutFallback: false };

const FRONTMATTER = `---
format: visser/1
docId: 7d2b9c1e-3f4a-4b5c-8d6e-9f0a1b2c3d4e
title: Family fixture
kind: reference
capturedAt: 2026-09-27T00:00:00Z
visibility: private
---
`;

function doc(figure: string): string {
  return `${FRONTMATTER}
<!-- vs:id h_fixture -->
# Family fixture

${figure}
`;
}

async function compile(text: string): Promise<{ bundle: LoadedBundle; result: CompileResult; html: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'visser-family-'));
  writeFileSync(join(dir, 'index.md'), text);
  const bundle = loadBundle(join(dir, 'index.md'));
  expect(bundle.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const result = await compileDocument(bundle, TOOLKIT, OPTIONS);
  const page = result.files.find((f) => f.path.endsWith('/index.html'))!;
  return { bundle, result, html: new TextDecoder().decode(page.bytes) };
}

/** Visible SVG text with tags removed; wrapped labels become one string. */
function svgText(markup: string): string {
  return markup.replace(/<\/tspan><tspan[^>]*>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

/** The opening tag of the SVG instance with the given ID. */
function tagOf(html: string, instanceId: string): string {
  return new RegExp(`<a [^>]*id="${instanceId.replace(/[.~]/g, '\\$&')}"[^>]*>`).exec(html)?.[0] ?? '';
}

/** Markup between a start marker and the next marker that closes the view. */
function section(html: string, start: string, end: string): string {
  const i = html.indexOf(start);
  if (i < 0) return '';
  const j = html.indexOf(end, i + start.length);
  return html.slice(i, j < 0 ? undefined : j);
}

function commonChecks(bundle: LoadedBundle, result: CompileResult, html: string) {
  for (const id of bundle.model.targets.keys()) {
    expect(html.split(`id="x-${id}"`).length - 1, `canonical x-${id}`).toBe(1);
  }
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!);
  expect(new Set(ids).size).toBe(ids.length);
  expect(html).not.toMatch(/\sstyle=/);
  expect(html).not.toMatch(/\son[a-z]+=/i);
  expect(html).not.toMatch(/<script(?![^>]*\ssrc=)/);
  expect(result.diagnostics.map((d) => d.code)).not.toContain('W_UNSUPPORTED_COMPONENT');
}

/** Every relationship has an instance in the map (desktop) and in the list (narrow and no-JS) views. */
function relationshipViews(bundle: LoadedBundle, html: string, figureId: string) {
  const map = section(html, '<div class="vs-viewport"', '</svg>');
  const lists = section(html, '<div class="vs-lists"', '</figure>');
  const rels = bundle.model.relationships.filter((r) => bundle.model.targets.get(r.id)?.parentId === figureId);
  expect(rels.length).toBeGreaterThan(0);
  for (const r of rels) {
    expect(map, `map instance of ${r.id}`).toContain(`data-vs-rel="${r.id}"`);
    expect(lists, `list instance of ${r.id}`).toContain(`data-vs-rel="${r.id}"`);
  }
  expect(html).toMatch(new RegExp(`<figure[^>]*id="x-${figureId}"[^>]*data-vs-views="map list"`));
}

const STATE = doc(`{% graph id="lifecycle" mode="state" title="Connection lifecycle" question="Which events move a connection between states?" %}
A connection opens once and closes once.

{% state id="st_idle" label="Idle" initial=true %}
No socket exists.
{% /state %}

{% state id="st_open" label="Open" %}
The socket is connected.
{% /state %}

{% state id="st_closed" label="Closed" terminal=true %}
Resources are released.
{% /state %}

{% transition id="tr_connect" from="st_idle" to="st_open" event="connect" label="connect succeeds" guard="host reachable" action="start heartbeat" %}
The heartbeat starts only after the handshake.
{% /transition %}

{% transition id="tr_close" from="st_open" to="st_closed" event="close" label="close requested" %}
Pending writes are flushed first.
{% /transition %}
{% /graph %}`);

const CAUSE = doc(`{% graph id="why_slow" mode="cause" title="Why requests slowed" question="Which mechanism links retries to latency?" %}
Two conditions together fill the queue.

{% factor id="f_retry" label="AND: retries enabled and no backoff" basis="inferred" %}
Both conditions are needed.
{% /factor %}

{% factor id="f_full" label="Queue full" basis="observed" %}
The queue gauge stayed at capacity.
{% /factor %}

{% factor id="f_latency" label="High latency" basis="observed" %}
The p99 rose.
{% /factor %}

{% causal-link id="cl_amplify" from="f_retry" to="f_full" label="amplifies load" basis="hypothesis" %}
Not yet confirmed.
{% /causal-link %}

{% causal-link id="cl_block" from="f_full" to="f_latency" label="blocks producers" basis="observed" %}
Producers wait at enqueue.
{% /causal-link %}
{% /graph %}`);

const PLAN = doc(`{% graph id="rollout" mode="plan" title="Schema rollout" question="What must finish before the switch?" %}
The switch waits for the backfill.

{% task id="t_schema" label="Add column" status="complete" %}
Migration merged.
{% /task %}

{% task id="t_backfill" label="Backfill rows" status="ready" owner="data team" %}
Runs in batches.
{% /task %}

{% task id="t_switch" label="Switch reads" %}
Reads use the new column.
{% /task %}

{% dependency id="d_first" from="t_schema" to="t_backfill" label="column must exist" %}
The backfill writes the new column.
{% /dependency %}

{% dependency id="d_input" from="t_backfill" to="t_switch" label="rows complete" kind="input" %}
The switch needs every row.
{% /dependency %}
{% /graph %}`);

const TRANSFORM = doc(`{% transform id="pipe" title="Image to mask" question="How does the representation change?" %}
Pixels become a tensor, then a mask.

{% stage id="s_raw" label="Upload" representation="JPEG bytes" units="bytes" %}
As received.
{% /stage %}

{% stage id="s_tensor" label="Tensor" representation="float32 tensor" shape=["batch", "height", "width", "channels"] %}
Normalized to 0..1.
{% /stage %}

{% stage id="s_mask" label="Mask" representation="uint8 mask" %}
One byte per pixel.
{% /stage %}

{% conversion id="cv_decode" from="s_raw" to="s_tensor" label="decode and normalize" loss="JPEG artifacts remain" %}
Decoding is lossy upstream.
{% /conversion %}

{% conversion id="cv_threshold" from="s_tensor" to="s_mask" label="threshold" %}
Values above 0.5 become 1.
{% /conversion %}

{% conversion id="cv_orientation" from="s_raw" to="s_mask" label="copy orientation" %}
EXIF orientation is carried separately.
{% /conversion %}
{% /transform %}`);

const COMPARE = doc(`{% compare id="queues" title="Bounded versus unbounded" question="What differs under overload?" %}
The difference is where waiting happens.

{% option id="o_bounded" label="Bounded queue" %}
Fixed capacity.
{% /option %}

{% option id="o_unbounded" label="Unbounded queue" %}
Grows with demand.
{% /option %}

{% criterion id="c_memory" label="Memory under overload" units="items" %}
{% /criterion %}

{% criterion id="c_failure" label="Failure behavior" %}
{% /criterion %}

{% cell id="cell_bm" option="o_bounded" criterion="c_memory" value="capacity" valueStatus="measured" %}
Never more than the configured capacity.
{% /cell %}

{% cell id="cell_bf" option="o_bounded" criterion="c_failure" %}
Producers wait.
{% /cell %}

{% cell id="cell_um" option="o_unbounded" criterion="c_memory" value="unbounded" valueStatus="illustrative" %}
Grows until memory runs out.
{% /cell %}
{% /compare %}`);

describe('Phase 2 rendering kernels (§9.3–9.10) @R06 @R14', () => {
  it('state: initial and terminal marks, label [guard] arrows, action in the detail', async () => {
    const { bundle, result, html } = await compile(STATE);
    commonChecks(bundle, result, html);
    relationshipViews(bundle, html, 'lifecycle');
    const map = section(html, '<div class="vs-viewport"', '</svg>');
    const text = svgText(map);
    // The box shows the label only. The marks are shapes: a dot for initial and
    // an inner ring for terminal. The words stay in the list (IMPROVEMENTS §3.4).
    expect(text).not.toContain('(initial)');
    expect(text).not.toContain('(terminal)');
    expect(map).toMatch(/class="vs-node vs-initial"/);
    expect(map).toMatch(/class="vs-node vs-terminal"/);
    expect(section(map, 'id="v-lifecycle.st_idle"', '</a>')).toContain('class="vs-mark vs-mark-fill"');
    expect(section(map, 'id="v-lifecycle.st_closed"', '</a>')).toMatch(/<rect [^>]*class="vs-mark"/);
    const nodeList = section(html, '<ul class="vs-node-list"', '</ul>');
    expect(nodeList).toContain('(initial)');
    expect(nodeList).toContain('(terminal)');
    // The state family has no hue variable, so it has no legend.
    expect(html).not.toContain('class="vs-legend"');
    // The arrow shows the transition's label, as the list does, with its guard (dogfood-2 Q4).
    expect(text).toContain('connect succeeds [host reachable]');
    const list = section(html, 'id="l-lifecycle.tr_connect"', '</li>');
    expect(list).toContain('connect succeeds');
    expect(list).toContain('event: connect');
    expect(section(html, 'id="x-tr_connect"', '</details>')).toMatch(/<dt>action<\/dt><dd>start heartbeat<\/dd>/);
  });

  it('cause: basis shown as text and as a line pattern, no verified badge', async () => {
    const { bundle, result, html } = await compile(CAUSE);
    commonChecks(bundle, result, html);
    relationshipViews(bundle, html, 'why_slow');
    const amplify = section(html, 'id="v-why_slow.cl_amplify"', '</a>');
    expect(amplify).toContain('stroke-dasharray="2 4"');
    expect(svgText(amplify)).toContain('amplifies load (hypothesis)');
    const block = section(html, 'id="v-why_slow.cl_block"', '</a>');
    expect(block).not.toContain('stroke-dasharray');
    expect(svgText(block)).toContain('(observed)');
    // The basis also has a hue, and the factor box shows the label only (IMPROVEMENTS §3.2, §3.4).
    expect(tagOf(html, 'v-why_slow.cl_amplify')).toMatch(/class="vs-edge vs-kind-[a-z-]+ vs-cat vs-cat-violet"/);
    const retry = section(html, 'id="v-why_slow.f_retry"', '</a>');
    expect(tagOf(html, 'v-why_slow.f_retry')).toMatch(/class="vs-node vs-cat vs-cat-amber"/);
    expect(retry).toContain('stroke-dasharray="6 4"');
    expect(svgText(retry.slice(retry.indexOf('>') + 1))).not.toContain('inferred');
    expect(svgText(section(html, '<ul class="vs-legend"', '</ul>')).trim().split(' ')).toEqual(['observed', 'inferred', 'hypothesis']);
    expect(html.toLowerCase()).not.toContain('verified');
  });

  it('plan: task status in the visual, no dates or percentages, dependency kind shown', async () => {
    const { bundle, result, html } = await compile(PLAN);
    commonChecks(bundle, result, html);
    relationshipViews(bundle, html, 'rollout');
    const markup = section(html, '<div class="vs-viewport"', '</svg>');
    const map = svgText(markup);
    // Status leaves the box: hue, a pattern or a mark, the legend, and the list carry it (IMPROVEMENTS §3.2, §3.4).
    expect(map).not.toContain('status:');
    expect(map).not.toContain('data team');
    expect(tagOf(markup, 'v-rollout.t_schema')).toMatch(/class="vs-node vs-cat vs-cat-green"/);
    expect(tagOf(markup, 'v-rollout.t_backfill')).toMatch(/class="vs-node vs-cat vs-cat-teal"/);
    expect(tagOf(markup, 'v-rollout.t_switch')).toMatch(/class="vs-node vs-cat vs-cat-slate vs-nofill"/);
    const nodeList = section(html, '<ul class="vs-node-list"', '</ul>');
    expect(nodeList).toContain('status: complete');
    expect(nodeList).toContain('status: proposed');
    expect(nodeList).toContain('owner: data team');
    // Proposed has a dotted outline, so it differs from ready without hue (review F-01).
    expect(section(markup, 'id="v-rollout.t_switch"', '</a>')).toContain('stroke-dasharray="2 4"');
    expect(section(markup, 'id="v-rollout.t_backfill"', '</a>')).not.toContain('stroke-dasharray');
    // The legend lists the status chips, then a pattern chip for each dependency kind in use (review F-08).
    const legendMarkup = section(html, '<ul class="vs-legend"', '</ul>');
    expect(svgText(legendMarkup).trim().split(' ')).toEqual(['complete', 'ready', 'proposed', 'finish-start', 'input']);
    // The dependency kind is a line pattern, and the arrow label keeps the word.
    expect(section(markup, 'id="v-rollout.d_input"', '</a>')).toContain('stroke-dasharray="6 4"');
    expect(map).toContain('rows complete (input)');
    expect(map).not.toMatch(/\d+%/);
  });

  it('transform: representation rows and loss in the main visual; merges keep separate arrows', async () => {
    const { bundle, result, html } = await compile(TRANSFORM);
    commonChecks(bundle, result, html);
    relationshipViews(bundle, html, 'pipe');
    const markup = section(html, '<div class="vs-viewport"', '</svg>');
    const map = svgText(markup);
    // A stage box keeps its representation; shape and units stay in the list (IMPROVEMENTS §3.4).
    expect(map).toContain('float32 tensor');
    expect(map).not.toContain('shape: batch × height');
    expect(section(html, '<ul class="vs-node-list"', '</ul>')).toContain('shape: batch × height');
    expect(map).toContain('loss: JPEG artifacts remain');
    // The lossy conversion is the one fact in hue: an amber line and label (IMPROVEMENTS §10).
    expect(tagOf(markup, 'v-pipe.cv_decode')).toMatch(/class="vs-edge vs-kind-[a-z-]+ vs-cat vs-cat-amber vs-label-hue"/);
    expect(tagOf(markup, 'v-pipe.cv_threshold')).not.toContain('vs-cat');
    expect(svgText(section(html, '<ul class="vs-legend"', '</ul>')).trim()).toBe('loss');
    expect(markup).toContain('id="v-pipe.cv_threshold"');
    expect(markup).toContain('id="v-pipe.cv_orientation"');
    expect(markup).not.toContain('vs-role-');
  });

  it('compare: semantic table, stacked cards, Not provided, value status, no ranking', async () => {
    const { bundle, result, html } = await compile(COMPARE);
    commonChecks(bundle, result, html);
    const table = section(html, '<table class="vs-compare-table"', '</table>');
    const cards = section(html, '<div class="vs-compare-cards"', '</figure>');
    expect(table).toContain('<th scope="col">');
    expect(table).toContain('<th scope="row">');
    expect(table).toContain('Not provided');
    expect(table).toContain('(measured)');
    for (const cell of ['cell_bm', 'cell_bf', 'cell_um']) {
      expect(table).toContain(`data-vs-target="${cell}"`);
      expect(cards).toContain(`data-vs-target="${cell}"`);
    }
    for (const option of ['o_bounded', 'o_unbounded']) {
      expect(cards.split(`data-vs-target="${option}"`).length - 1).toBe(1); // the options line
    }
    expect(cards).toContain('Not provided');
    // One link per option row: no generated "Details" link in the cards.
    expect(cards).not.toContain('>Details<');
    expect(cards).toContain('aria-label="Bounded queue: Failure behavior"');
    // Table cells without a value: no "Details" line above the text (dogfood-2 Q5).
    expect(table).not.toContain('>Details<');
    // The whole body of cell_bf is the one sentence in the table, so it gets
    // no "›" link, and the cell body is its table instance (docs/IMPROVEMENTS.md §4.6).
    expect(table).not.toContain('vs-cell-link');
    expect(table).toContain('<div class="vs-cell-body" id="v-queues.cell_bf" data-vs-target="cell_bf"><p>Producers wait.</p></div>');
    expect(html.toLowerCase()).not.toMatch(/winner|score/);
    expect(html).not.toMatch(/<figure[^>]*id="x-queues"[^>]*data-vs-views/);
  });

  it('compiles each family deterministically', async () => {
    for (const text of [STATE, CAUSE, PLAN, TRANSFORM, COMPARE]) {
      const a = await compile(text);
      const b = await compile(text);
      expect(b.html).toBe(a.html);
    }
  });
});
