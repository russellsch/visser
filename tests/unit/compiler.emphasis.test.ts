import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadBundle, type LoadedBundle } from '../../packages/core/src/model/bundle.ts';
import { compileDocument, type CompileOptions, type CompileResult } from '../../packages/core/src/compiler/index.ts';
import type { ExtensionBinding } from '../../packages/core/src/extensions/registry.ts';

const TOOLKIT = { version: '0.0.0', sha256: 'e'.repeat(64) };
const OPTIONS = { audience: 'private' as const, includeSource: false, layoutFallback: false };
const FRONTMATTER = `---
format: visser/1
docId: 7d2b9c1e-3f4a-4b5c-8d6e-9f0a1b2c3d4e
title: Emphasis fixture
kind: reference
capturedAt: 2026-10-04T00:00:00Z
visibility: private
---
`;

type Compiled = { bundle: LoadedBundle; result: CompileResult; html: string; markdown: string };

function document(body: string): string {
  return `${FRONTMATTER}
<!-- vs:id h_emphasis -->
# Emphasis fixture

${body}
`;
}

async function compile(text: string, extra: Partial<CompileOptions> = {}): Promise<Compiled> {
  const dir = mkdtempSync(join(tmpdir(), 'visser-emphasis-'));
  writeFileSync(join(dir, 'index.md'), text);
  const bundle = loadBundle(join(dir, 'index.md'));
  expect(bundle.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const result = await compileDocument(bundle, TOOLKIT, { ...OPTIONS, ...extra });
  const textOf = (name: string) => new TextDecoder().decode(result.files.find((f) => f.path.endsWith(`/${name}`))!.bytes);
  return { bundle, result, html: textOf('index.html'), markdown: textOf('document.md') };
}

function errors(text: string): string[] {
  const dir = mkdtempSync(join(tmpdir(), 'visser-emphasis-invalid-'));
  writeFileSync(join(dir, 'index.md'), text);
  return loadBundle(join(dir, 'index.md')).diagnostics.filter((d) => d.severity === 'error').map((d) => d.code);
}

function tagOf(html: string, instanceId: string): string {
  return new RegExp(`<(?:a|g) [^>]*id="${instanceId.replace(/[.~]/g, '\\$&')}"[^>]*>`).exec(html)?.[0] ?? '';
}

function instance(html: string, instanceId: string): string {
  const start = html.indexOf(`id="${instanceId}"`);
  if (start < 0) return '';
  const open = html.lastIndexOf('<', start);
  const close = html.indexOf('</a>', start);
  return html.slice(open, close < 0 ? undefined : close + 4);
}

const ARCHITECTURE = `{% graph id="map" mode="architecture" title="Order map" question="What carries an order?" %}
The API sends data to storage.

{% group id="g_api" label="API boundary" /%}
{% node id="n_api" label="Order API" role="interface" group="g_api" emphasis="teal" %}
Accepts orders.
{% /node %}
{% node id="n_db" label="Order DB" role="storage" /%}
{% edge id="e_store" from="n_api" to="n_db" kind="data" label="stores order" emphasis="violet" %}
The write is durable.
{% /edge %}
{% /graph %}`;

const FAMILIES = `${ARCHITECTURE}

{% graph id="life" mode="state" title="Connection" question="How does it end?" %}
One connection ends after close.
{% state id="s_open" label="Open" emphasis="amber" /%}
{% state id="s_closed" label="Closed" terminal=true /%}
{% transition id="t_close" from="s_open" to="s_closed" event="close" label="closes" emphasis="teal" /%}
{% /graph %}

{% graph id="cause" mode="cause" title="Latency" question="Why slow?" %}
Retries fill the queue.
{% factor id="f_retry" label="Retries" basis="inferred" emphasis="violet" /%}
{% factor id="f_queue" label="Queue full" basis="observed" /%}
{% causal-link id="c_fill" from="f_retry" to="f_queue" label="fills" basis="hypothesis" emphasis="amber" /%}
{% /graph %}

{% graph id="plan" mode="plan" title="Release" question="What ships?" %}
The build precedes release.
{% task id="t_build" label="Build" status="ready" emphasis="teal" /%}
{% task id="t_release" label="Release" status="complete" /%}
{% dependency id="d_ship" from="t_build" to="t_release" label="ships" kind="input" emphasis="violet" /%}
{% /graph %}

{% transform id="pipe" title="Decode" question="What changes?" %}
Bytes become pixels.
{% stage id="st_bytes" label="Bytes" representation="JPEG" emphasis="amber" /%}
{% stage id="st_pixels" label="Pixels" representation="RGBA" /%}
{% conversion id="cv_decode" from="st_bytes" to="st_pixels" label="decode" emphasis="teal" /%}
{% /transform %}

{% definition id="def_order" term="order" %}
An order is a purchase.
{% /definition %}
{% definition id="def_line" term="line" %}
A line belongs to an order.
{% /definition %}
{% domain id="domain" title="Orders" question="What belongs?" %}
Orders have lines.
{% concept id="co_order" label="Order" definition="def_order" category="thing" emphasis="violet" /%}
{% concept id="co_line" label="Line" definition="def_line" category="event" /%}
{% relation id="r_has" from="co_order" to="co_line" kind="has" label="contains" emphasis="amber" /%}
{% /domain %}`;

// No child prose or additional task facts: the dependency is bare in both
// ordinary and emphasized output. Its emphasis must remain a presentation cue.
const BARE_DEPENDENCY = `{% graph id="bare_plan" mode="plan" title="Bare plan" question="What follows?" %}
Only the relationship labels are present.
{% task id="b_first" label="First" /%}
{% task id="b_second" label="Second" /%}
{% dependency id="b_after" from="b_first" to="b_second" label="after" emphasis="teal" /%}
{% /graph %}`;

const EXTENSION_EMPHASIS = `{% extension id="ext" use="collision" title="Extension" question="What does its part own?" %}
{% part id="part" label="Extension part" emphasis="teal" /%}
{% /extension %}`;

const COLLISION_EXTENSION = {
  name: 'collision', version: '0.0.0', sha256: 'c'.repeat(64), ready: true,
  run: () => ({
    schema: 'visser-component-output/1' as const,
    svg: { tag: 'svg', attrs: { viewBox: '0 0 100 40' }, children: [{ tag: 'g', target: 'part', children: [{ tag: 'text', attrs: { x: 5, y: 20 }, children: ['Extension part'] }] }] },
    parts: { part: { text: 'Extension output' } },
  }),
} satisfies ExtensionBinding;

describe('authored emphasis @CF03 @CF04 @CF05', () => {
  it('accepts all supported native graph-family parts and rejects unsupported values and kinds', () => {
    expect(errors(document(FAMILIES))).toEqual([]);
    expect(errors(document(ARCHITECTURE.replace('emphasis="teal"', 'emphasis="blue"')))).toEqual(['E_SYNTAX']);
    expect(errors(document(ARCHITECTURE.replace('label="API boundary" /%}', 'label="API boundary" emphasis="teal" /%}')))).toEqual(['E_SYNTAX']);
  });

  it('keeps semantic encodings while exposing authored emphasis through SVG, lists, names, and text projection', async () => {
    const { html, markdown } = await compile(document(FAMILIES));

    // The architecture has two role hues, so both requested palettes converge to
    // the one weight cue. The data edge keeps its semantic dash at the same time.
    for (const id of ['v-map.n_api', 'v-map.e_store', 'v-life.s_open', 'v-life.t_close', 'v-cause.f_retry', 'v-cause.c_fill', 'v-plan.t_build', 'v-plan.d_ship', 'v-pipe.st_bytes', 'v-pipe.cv_decode', 'v-domain.co_order', 'v-domain.r_has']) {
      const tag = tagOf(html, id);
      expect(tag, id).toContain('data-vs-emphasis=');
      expect(tag, id).toContain('vs-emphasis');
    }
    expect(tagOf(html, 'v-map.n_api')).toContain('data-vs-emphasis="teal"');
    expect(tagOf(html, 'v-map.n_api')).toContain('vs-emphasis-weight');
    expect(tagOf(html, 'v-map.e_store')).toContain('vs-emphasis-weight');
    expect(instance(html, 'v-map.e_store')).toContain('stroke-dasharray="6 4"');
    expect(instance(html, 'v-cause.c_fill')).toContain('stroke-dasharray="2 4"');
    expect(instance(html, 'v-life.s_closed')).toContain('class="vs-mark"'); // terminal marker survives a neighbouring emphasis cue

    // The paired list and an interactive map instance say what the visual cue means.
    expect(html).toMatch(/id="l-map\.n_api"[\s\S]*?emphasized/);
    expect(tagOf(html, 'v-map.n_api')).toMatch(/aria-label="Order API \(interface\).*emphasized.*opens more detail"/);
    expect(markdown).toMatch(/<!-- vs:target n_api -->[\s\S]*?\nemphasis: teal\n/);
    expect(markdown).toMatch(/<!-- vs:target e_store -->[\s\S]*?\nemphasis: violet\n/);
  });

  it('adds direct interaction outlines without arrows and leaves bare parts inert; omission preserves identity and depth', async () => {
    const emphasized = await compile(document(ARCHITECTURE));
    const plain = await compile(document(ARCHITECTURE.replaceAll(/ emphasis="(?:teal|violet)"/g, '')));

    const emphasizedIds = [...emphasized.html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    const plainIds = [...plain.html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(emphasizedIds).toEqual(plainIds);
    for (const id of ['v-map.n_api', 'v-map.e_store']) {
      expect(tagOf(emphasized.html, id).match(/data-vs-depth="[^"]+"/)?.[0]).toBe(tagOf(plain.html, id).match(/data-vs-depth="[^"]+"/)?.[0]);
    }
    expect(plain.html).not.toContain('data-vs-emphasis=');
    expect(plain.html).not.toContain('vs-emphasis');
    expect(plain.markdown).not.toContain('emphasis:');

    const edge = instance(emphasized.html, 'v-map.e_store');
    expect(edge).toMatch(/^<a [^>]*><(?:path|line|polyline) class="vs-selection-outline"[^>]*>/);
    expect(edge).toMatch(/<(?:path|line|polyline) class="vs-focus-outline"[^>]*>/);
    for (const overlay of edge.match(/<(?:path|line|polyline) class="vs-(?:selection|focus)-outline"[^>]*>/g) ?? []) {
      expect(overlay).not.toContain('marker-');
    }
    // This relationship is bare without emphasis as well. It remains a
    // non-focusable SVG group when it has an authored presentation cue.
    const bare = tagOf((await compile(document(BARE_DEPENDENCY))).html, 'v-bare_plan.b_after');
    expect(bare).toContain('data-vs-depth="bare"');
    expect(bare).toMatch(/^<g /);
    expect(bare).not.toContain('aria-label=');
  });

  it('does not treat an extension part attribute named emphasis as native authored emphasis', async () => {
    const { html, markdown } = await compile(document(EXTENSION_EMPHASIS), { extensions: new Map([['collision', COLLISION_EXTENSION]]) });
    expect(html).toContain('id="v-ext.part"');
    expect(html).not.toContain('data-vs-emphasis=');
    expect(html).not.toContain('vs-emphasis');
    expect(html).not.toMatch(/Extension part[^<]*emphasized/);
    const part = /<!-- vs:target part -->[\s\S]*?(?=\n<!-- vs:target|$)/.exec(markdown)?.[0] ?? '';
    expect(part.match(/^emphasis: teal$/gm)).toHaveLength(1);
  });

  it('keeps an emphasized external data edge identifiable and semantic through collapsed-group proxy routes', async () => {
    const source = document(FAMILIES.replace('kind="call" label="create invoice"', 'kind="data" label="create invoice" emphasis="amber"'));
    // Use the dedicated collapsed-group fixture shape: the external edge has
    // one end in each group, so the combined proxy has a stable identity.
    const grouped = source
      .replace(ARCHITECTURE, `{% graph id="map" mode="architecture" title="Orders call billing" question="What crosses boundaries?" %}
{% group id="g_orders" label="Orders" collapsed=true /%}
{% group id="g_billing" label="Billing" collapsed=true /%}
{% node id="n_api" label="Order API" role="interface" group="g_orders" /%}
{% node id="n_bill" label="Billing API" role="external" group="g_billing" /%}
{% edge id="e_invoice" from="n_api" to="n_bill" kind="data" label="create invoice" emphasis="amber" %}
Crosses service boundaries.
{% /edge %}
{% /graph %}`);
    const { html } = await compile(grouped);
    const direct = instance(html, 'v-map.e_invoice');
    const proxy = instance(html, 'v-map.e_invoice~g_orders~g_billing');
    expect(direct).toContain('data-vs-emphasis="amber"');
    expect(direct).toContain('vs-emphasis-weight');
    expect(direct).toContain('stroke-dasharray="6 4"');
    expect(direct).toMatch(/marker-end="url\(#m-map\.arrow/);
    expect(proxy).toContain('id="v-map.e_invoice~g_orders~g_billing"');
    expect(proxy).toContain('data-vs-proxy-for="e_invoice"');
    expect(proxy).toContain('data-vs-emphasis="amber"');
    expect(proxy).toContain('vs-emphasis-weight');
    expect(proxy).toContain('stroke-dasharray="6 4"');
    expect(proxy).toMatch(/marker-end="url\(#m-map\.arrow/);
    expect(tagOf(html, 'v-map.e_invoice~g_orders~g_billing')).toMatch(/aria-label="Order API, create invoice, Billing API \(data\); emphasized;/);
  });
});
