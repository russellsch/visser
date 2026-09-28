// Category hue, paired cues, the legend, and box content (docs/IMPROVEMENTS.md
// §2.1, §3.2, §3.3, §3.4, §3.6).
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { compileDocument } from '../../packages/core/src/compiler/index.ts';
import { textWidth } from '../../packages/core/src/compiler/layout.ts';

const FRONTMATTER = `---
format: visser/1
docId: 7d2b9c1e-3f4a-4b5c-8d6e-9f0a1b2c3d4e
title: Encoding fixture
kind: reference
capturedAt: 2026-09-27T00:00:00Z
visibility: private
---
`;

async function compile(figure: string): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'visser-encoding-'));
  writeFileSync(join(dir, 'index.md'), `${FRONTMATTER}
<!-- vs:id h_fixture -->
# Encoding fixture

${figure}
`);
  const bundle = loadBundle(join(dir, 'index.md'));
  expect(bundle.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const result = await compileDocument(bundle, { version: '0.0.0', sha256: 'e'.repeat(64) }, { audience: 'private', includeSource: false, layoutFallback: false });
  return new TextDecoder().decode(result.files.find((f) => f.path.endsWith('/index.html'))!.bytes);
}

function tagOf(html: string, instanceId: string): string {
  return new RegExp(`<a [^>]*id="${instanceId.replace(/[.~]/g, '\\$&')}"[^>]*>`).exec(html)?.[0] ?? '';
}

function nodeRect(html: string, instanceId: string): { width: number; height: number } {
  const start = html.indexOf(`id="${instanceId}"`);
  const m = /<rect x="[\d.-]+" y="[\d.-]+" width="([\d.]+)" height="([\d.]+)"/.exec(html.slice(start))!;
  return { width: Number(m[1]), height: Number(m[2]) };
}

const ARCH = `{% graph id="intake" mode="architecture" title="Order intake" question="Where does an order wait?" %}
The queue holds orders until a worker takes them.

{% node id="api" role="interface" label="Order API" %}
Takes requests.
{% /node %}

{% node id="queue" role="storage" label="Charge queue" %}
Holds charge requests.
{% /node %}

{% node id="worker" role="process" label="Charge worker" %}
Charges the card.
{% /node %}

{% node id="psp" role="external" label="Payment provider" %}
Outside the system.
{% /node %}

{% node id="route" role="decision" label="Retry?" %}
Chooses a path.
{% /node %}

{% node id="idea" role="concept" label="Order" %}
The domain object.
{% /node %}

{% edge id="e_put" from="api" to="queue" kind="data" label="enqueue" %}
{% /edge %}

{% edge id="e_take" from="worker" to="queue" kind="call" label="take next" %}
{% /edge %}

{% edge id="e_ctl" from="route" to="worker" kind="control" label="retry" %}
{% /edge %}

{% edge id="e_fb" from="psp" to="route" kind="feedback" label="declined" %}
{% /edge %}
{% /graph %}`;

const ONE_ROLE = `{% graph id="pair" mode="architecture" title="Two processes" question="Which process calls which?" %}
One process calls the other.

{% node id="a" role="process" label="Caller" %}
{% /node %}

{% node id="b" role="process" label="Callee" %}
{% /node %}

{% edge id="e_ab" from="a" to="b" kind="call" label="calls" %}
{% /edge %}
{% /graph %}`;

const PLAN = `{% graph id="steps" mode="plan" title="Schema steps" question="What must finish first?" %}
The backfill waits for the schema.

{% task id="t_schema" label="Write schema" status="complete" %}
{% /task %}

{% task id="t_back" label="Backfill existing rows" status="ready" %}
{% /task %}

{% task id="t_later" label="Drop old column" %}
{% /task %}

{% dependency id="d_in" from="t_schema" to="t_back" label="schema exists" kind="input" %}
{% /dependency %}

{% dependency id="d_drop" from="t_back" to="t_later" label="rows copied" %}
{% /dependency %}
{% /graph %}`;

const STATE = `{% graph id="life" mode="state" title="Session life" question="Which events move a session?" %}
A session opens and then times out.

{% state id="s_idle" label="Idle" initial=true %}
{% /state %}

{% state id="s_open" label="Open" %}
{% /state %}

{% state id="s_gone" label="Gone" terminal=true %}
{% /state %}

{% transition id="t_seen" from="s_idle" to="s_open" event="open" label="opens" basis="observed" %}
{% /transition %}

{% transition id="t_guess" from="s_open" to="s_gone" event="timeout" label="times out" basis="inferred" %}
{% /transition %}
{% /graph %}`;

describe('category hue and paired cues (IMPROVEMENTS §3.2)', () => {
  it('architecture: each role has a hue and a shape cue; the role word stays in the list and the aria-label', async () => {
    const html = await compile(ARCH);
    expect(tagOf(html, 'v-intake.api')).toContain('class="vs-node vs-role-interface vs-cat vs-cat-teal"');
    expect(tagOf(html, 'v-intake.worker')).toContain('class="vs-node vs-role-process vs-cat vs-cat-slate"');
    expect(tagOf(html, 'v-intake.queue')).toContain('class="vs-node vs-role-storage vs-cat vs-cat-amber"');
    expect(tagOf(html, 'v-intake.psp')).toContain('class="vs-node vs-role-external vs-cat vs-cat-violet"');
    expect(tagOf(html, 'v-intake.route')).toContain('class="vs-node vs-role-decision vs-cat vs-cat-green"');
    // A concept has no hue: no fill and a dotted stroke.
    expect(tagOf(html, 'v-intake.idea')).toContain('class="vs-node vs-role-concept"');
    expect(tagOf(html, 'v-intake.api')).toContain('aria-label="Order API (interface)"');
    const inside = (id: string) => html.slice(html.indexOf(`id="v-intake.${id}"`), html.indexOf('</a>', html.indexOf(`id="v-intake.${id}"`)));
    expect(inside('api')).toMatch(/<rect [^>]*rx="12"/); // pill corners
    expect(inside('worker')).toMatch(/<rect [^>]*rx="6"/);
    expect(inside('queue')).toContain('class="vs-mark"'); // the drum line
    expect(inside('psp')).toContain('stroke-dasharray="6 4"');
    expect(inside('route')).toMatch(/<path d="M[^"]+Z"[^>]*class="vs-shape"/); // chamfered corners
    expect(inside('idea')).toContain('stroke-dasharray="2 4"');
    // The role word does not show in the box.
    expect(inside('queue')).not.toContain('>storage<');
    expect(html).toMatch(/<a href="#x-queue"[^>]*>Charge queue<\/a><span class="vs-role" data-vs-generated=""> \(storage\)<\/span>/);
    // Edge kind is a line pattern, and feedback has a loop mark.
    expect(inside('e_put')).toContain('stroke-dasharray="6 4"');
    expect(inside('e_ctl')).toContain('stroke-dasharray="2 4"');
    expect(inside('e_take')).not.toContain('stroke-dasharray');
    expect(inside('e_fb')).toContain('class="vs-edge-mark"');
  });

  it('architecture: the legend sits after the interpretation paragraph, lists each used role once, and is static HTML', async () => {
    const html = await compile(ARCH);
    const legend = /<ul class="vs-legend" aria-label="Legend" data-vs-generated="">.*?<\/ul>/s.exec(html)![0];
    const words = [...legend.matchAll(/<span class="vs-legend-word">([^<]+)<\/span>/g)].map((m) => m[1]);
    // The role chips, then a pattern chip for each edge kind in use (review F-08).
    expect(words).toEqual(['interface', 'process', 'storage', 'external', 'decision', 'concept', 'call', 'data', 'control', 'feedback']);
    // The feedback chip has the loop ring, as the figure does.
    expect(legend.slice(legend.lastIndexOf('<li'))).toContain('class="vs-edge-mark"');
    expect(legend).toContain('aria-hidden="true"');
    const interpretation = html.indexOf('The queue holds orders until a worker takes them.');
    expect(interpretation).toBeGreaterThan(0);
    expect(html.indexOf('class="vs-legend"')).toBeGreaterThan(interpretation);
    expect(html.indexOf('class="vs-legend"')).toBeLessThan(html.indexOf('<div class="vs-viewport"'));
    // The paragraph and the legend share a wrapping row, so the two sit side by side when both are short (§3.6).
    expect(html).toMatch(/<div class="vs-figure-lead"><div class="vs-figure-text"><p>The queue holds orders until a worker takes them\.<\/p><\/div><ul class="vs-legend"/);
  });

  it('an edge aria-label carries the word for its line cue: kind, basis, dependency kind, or loss (review F-07)', async () => {
    const html = await compile(ARCH);
    expect(tagOf(html, 'v-intake.e_put')).toContain('aria-label="Order API, enqueue, Charge queue (data)"');
    expect(tagOf(html, 'v-intake.e_fb')).toContain('aria-label="Payment provider, declined, Retry? (feedback)"');
    const plan = await compile(PLAN);
    expect(tagOf(plan, 'v-steps.d_in')).toContain('aria-label="Write schema, schema exists, Backfill existing rows (input)"');
  });

  it('state: a transition basis other than observed is a pattern, a word on the arrow, and a legend chip (review F-08)', async () => {
    const html = await compile(STATE);
    const inside = (id: string) => html.slice(html.indexOf(`id="v-life.${id}"`), html.indexOf('</a>', html.indexOf(`id="v-life.${id}"`)));
    expect(inside('t_guess')).toContain('stroke-dasharray="6 4"');
    expect(inside('t_guess')).toContain('>times out (inferred)<');
    expect(tagOf(html, 'v-life.t_guess')).toContain('(inferred)"');
    // An observed transition is solid and keeps its plain label.
    expect(inside('t_seen')).not.toContain('stroke-dasharray');
    expect(inside('t_seen')).toContain('>opens<');
    const legend = /<ul class="vs-legend"[^>]*>.*?<\/ul>/s.exec(html)![0];
    expect([...legend.matchAll(/<span class="vs-legend-word">([^<]+)<\/span>/g)].map((m) => m[1])).toEqual(['observed', 'inferred']);
    // The state family has no hue variable, so the chips have no hue.
    expect(legend).not.toContain('vs-cat');
  });

  it('plan: proposed has a dotted outline and no fill, so it differs from ready without hue (review F-01)', async () => {
    const html = await compile(PLAN);
    const inside = (id: string) => html.slice(html.indexOf(`id="v-steps.${id}"`), html.indexOf('</a>', html.indexOf(`id="v-steps.${id}"`)));
    expect(tagOf(html, 'v-steps.t_later')).toContain('vs-nofill');
    expect(inside('t_later')).toContain('stroke-dasharray="2 4"');
    expect(inside('t_back')).not.toContain('stroke-dasharray');
  });

  it('a figure whose variable has one value shows no hue and no legend (IMPROVEMENTS §2.1)', async () => {
    const html = await compile(ONE_ROLE);
    expect(tagOf(html, 'v-pair.a')).toContain('class="vs-node vs-role-process"');
    expect(html).not.toContain('vs-cat-');
    expect(html).not.toContain('class="vs-legend"');
  });
});

describe('box content and figure heading (IMPROVEMENTS §3.4, §3.6)', () => {
  it('a box shows its label only and is at most 150 px wide for a short label', async () => {
    const html = await compile(ARCH);
    for (const id of ['api', 'queue', 'worker', 'psp', 'route', 'idea']) {
      const r = nodeRect(html, `v-intake.${id}`);
      expect(r.width, id).toBeLessThanOrEqual(150);
      // One line of text and the padding. A drum box has 6 px more under the
      // label, so its drum line does not read as an underline (review F-09).
      expect(r.height, id).toBe(18 + 16 + (id === 'queue' ? 6 : 0));
    }
  });

  it('a label that fits on one line at a width up to 176 takes one line, not two with an orphan (review F-10)', async () => {
    for (const label of ['API requests time out', 'Client retries add load', 'Backfill existing rows']) {
      const html = await compile(ONE_ROLE.replace('label="Caller"', `label="${label}"`));
      const r = nodeRect(html, 'v-pair.a');
      expect(r.height, label).toBe(18 + 16);
      expect(r.width, label).toBeLessThanOrEqual(176 + 24);
    }
  });

  it('the check mark of a complete task stays clear of the label (review F-11)', async () => {
    const html = await compile(PLAN);
    const start = html.indexOf('id="v-steps.t_schema"');
    const part = html.slice(start, html.indexOf('</a>', start));
    const [, x, w] = /<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)"/.exec(part)!.map(Number);
    const label = [...part.matchAll(/<tspan [^>]*>([^<]+)<\/tspan>/g)].map((m) => m[1]!);
    const labelRight = x! + w! / 2 + Math.max(...label.map((l) => textWidth(l))) / 2;
    const markLeft = Number(/<path d="M([\d.]+),[\d.]+ L[^"]*" fill="none"[^>]*class="vs-mark"/.exec(part)![1]);
    expect(markLeft - labelRight).toBeGreaterThanOrEqual(8);
  });

  it('a two-line label stays at two lines, and the box grows wider only when it must', async () => {
    const html = await compile(ONE_ROLE.replace('label="Caller"', 'label="Marks the order payment-failed"'));
    const r = nodeRect(html, 'v-pair.a');
    expect(r.height).toBe(2 * 18 + 16);
    expect(r.width).toBeLessThanOrEqual(150);
  });

  it('drops the visible "Figure" eyebrow and keeps the word in the accessible name', async () => {
    const html = await compile(ARCH);
    expect(html).not.toContain('vs-figure-eyebrow');
    expect(html).toMatch(/<figure [^>]*id="x-intake"[^>]*aria-label="Figure: Order intake"/);
    expect(html).toContain('<figcaption>Order intake</figcaption>');
  });
});
