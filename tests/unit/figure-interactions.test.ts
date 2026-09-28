// Figure interactions (docs/IMPROVEMENTS.md §14.9): collapsible groups, the
// entity data for the cross-figure highlight, edge quantities, and the filter
// tokens of the legend chips. The runtime behaviour is in
// tests/browser/interactions.spec.ts; this file checks the static output.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parseSource } from '../../packages/core/src/syntax/index.ts';
import { buildTargetRecords } from '../../packages/core/src/model/targets.ts';
import { validateDocument } from '../../packages/core/src/model/validate.ts';
import { projectText } from '../../packages/core/src/model/project.ts';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { compileDocument } from '../../packages/core/src/compiler/index.ts';
import { graphSvg, type SvgInput } from '../../packages/core/src/compiler/svg.ts';
import { render } from '../../packages/core/src/compiler/html.ts';
import { reviewDocument } from '../../packages/core/src/review/index.ts';

const FIXTURE = join(import.meta.dirname, '../fixtures/interactions/index.md');
const TOOLKIT = { version: '0.0.0', sha256: 'e'.repeat(64) };
const OPTIONS = { audience: 'private' as const, includeSource: false, layoutFallback: false };
const work = mkdtempSync(join(tmpdir(), 'visser-interactions-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

const fixture = readFileSync(FIXTURE, 'utf8');

function diagnostics(text: string) {
  const parsed = parseSource(new TextEncoder().encode(text), 'index.md');
  const model = buildTargetRecords(parsed);
  return [...parsed.diagnostics, ...model.diagnostics, ...validateDocument(parsed, model)].map((d) => `${d.code}: ${d.message}`);
}

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
  const start = html.indexOf('aria-label="Orders call billing"');
  const svg = html.slice(start, html.indexOf('</svg>', start));
  return { html, svg, markdown: read('/document.md') };
}

/** The attributes of the element with the id `id`. */
function element(html: string, id: string): string {
  const at = html.indexOf(`id="${id}"`);
  expect(at, id).toBeGreaterThan(-1);
  return html.slice(html.lastIndexOf('<', at), html.indexOf('>', at) + 1);
}

/** The points of the line of the element with the id `id`. */
function route(svg: string, id: string): Array<[number, number]> {
  const at = svg.indexOf(`id="${id}"`);
  const d = /<path class="vs-line" d="([^"]+)"/.exec(svg.slice(at))![1]!;
  return d.split(' ').map((p) => p.slice(1).split(',').map(Number) as [number, number]);
}

function rect(svg: string, cls: string, group: string): { x: number; y: number; width: number; height: number } {
  const at = svg.indexOf(`data-vs-fold="${group}"`);
  const tag = new RegExp(`<rect class="${cls}" x="([\\d.]+)" y="([\\d.]+)" width="([\\d.]+)" height="([\\d.]+)"`).exec(svg.slice(at))!;
  return { x: Number(tag[1]), y: Number(tag[2]), width: Number(tag[3]), height: Number(tag[4]) };
}

describe('attributes (IMPROVEMENTS.md §14.9)', () => {
  it('the fixture checks with no errors', () => {
    expect(diagnostics(fixture)).toEqual([]);
  });

  it('`collapsed` on a group is a boolean', () => {
    const bad = fixture.replace('{% group id="g_orders" label="Order service" collapsed=true /%}', '{% group id="g_orders" label="Order service" collapsed="yes" /%}');
    expect(diagnostics(bad)).toContain('E_SYNTAX: group g_orders: `collapsed` must be boolean');
  });

  it('`quantity` and `evidence` are allowed on edge, conversion, and dependency, and not on a transition', () => {
    const transform = `{% transform id="t" title="Bytes to rows" question="What changes?" %}
{% stage id="s_a" label="Bytes" representation="raw" /%}
{% stage id="s_b" label="Rows" representation="table" /%}
{% conversion id="c_parse" from="s_a" to="s_b" label="parse" quantity="40 MB/s" evidence=["src_load"] /%}
{% /transform %}

{% graph id="p" mode="plan" title="Plan" question="What comes first?" %}
{% task id="k_a" label="Build" /%}
{% task id="k_b" label="Ship" /%}
{% dependency id="d_ab" from="k_a" to="k_b" label="needs the build" quantity="3 days" evidence=["src_load"] /%}
{% /graph %}

{% graph id="st" mode="state" title="States" question="What changes the state?" %}
{% state id="s_on" label="On" initial=true /%}
{% state id="s_off" label="Off" /%}
{% transition id="tr" from="s_on" to="s_off" event="stop" label="stop" quantity="1 per day" /%}
{% /graph %}
`;
    const out = diagnostics(fixture.replace('{% source id="src_load"', `${transform}\n{% source id="src_load"`));
    expect(out).toEqual(['E_SYNTAX: transition tr: unknown attribute `quantity`']);
  });

  it('`evidence` on an edge names a source', () => {
    const bad = fixture.replace('evidence=["src_load"]', 'evidence=["n_store"]');
    expect(diagnostics(bad).filter((d) => d.startsWith('E_REF_BROKEN'))).toEqual(['E_REF_BROKEN: edge e_invoice: `evidence` must name a source, but n_store is a node']);
  });

  it('a quantity with no evidence is W_EVIDENCE_GAP; with evidence it is not', () => {
    const gap = (text: string) => reviewDocument(load(text)).filter((d) => d.code === 'W_EVIDENCE_GAP').map((d) => d.targetId);
    expect(gap(fixture)).toEqual([]);
    expect(gap(fixture.replace(' evidence=["src_load"]', ''))).toEqual(['e_invoice']);
  });
});

describe('edge quantities (IMPROVEMENTS.md §14.9)', () => {
  it('the projection prints "(quantity)" after the label', () => {
    const text = projectText(parseSource(new TextEncoder().encode(fixture), 'index.md'));
    expect(text).toContain('Order API --[call; create invoice (40 req/s)]--> Billing API');
    expect(text).toContain('Evidence: Load test summary (src_load)');
  });

  it('the edge label mutes the quantity; the list shows it after the label; the inspector lists it', async () => {
    const { html, svg, markdown } = await compile(fixture);
    expect(markdown).toContain('create invoice (40 req/s)');
    const label = /<text class="vs-edge-label"[^>]*>((?:(?!<\/text>).)*create invoice(?:(?!<\/text>).)*)<\/text>/.exec(svg)![1]!;
    expect(label.replace(/<[^>]+>/g, '')).toBe('create invoice (40req/s)');
    expect(label).toMatch(/<tspan class="vs-edge-quantity" fill-opacity="0.72">\(40<\/tspan>/);
    expect(element(svg, 'v-map.e_invoice')).toContain('aria-label="Order API, create invoice (40 req/s), Billing API (call)"');
    expect(html).toContain('<a class="vs-rel-label" href="#x-e_invoice" id="l-map.e_invoice" data-vs-target="e_invoice" data-vs-rel="e_invoice" data-vs-interactive="">create invoice</a><span class="vs-rel-quantity" data-vs-generated=""> (40 req/s)</span>');
    const detail = html.slice(html.indexOf('id="x-e_invoice"'), html.indexOf('</details>', html.indexOf('id="x-e_invoice"')));
    expect(detail).toContain('<dt>quantity</dt><dd>40 req/s</dd>');
    expect(detail).toContain('<h3>Evidence</h3>');
  });
});

describe('collapsible groups (IMPROVEMENTS.md §14.9)', () => {
  it('draws the groups unfolded, with a hidden fold box and Fold control for each collapsed group', async () => {
    const { svg } = await compile(fixture);
    expect(element(svg, 'v-map.n_api')).not.toContain('hidden');
    expect(svg).toContain('<g class="vs-fold" data-vs-fold="g_orders" data-vs-fold-hide="n_api n_store e_save" role="button" tabindex="0" aria-label="Unfold Order service (2 nodes)" hidden>');
    expect(svg).toContain('<g class="vs-fold" data-vs-fold="g_billing" data-vs-fold-hide="n_bill n_ledger e_post" role="button" tabindex="0" aria-label="Unfold Billing service (2 nodes)" hidden>');
    expect(svg).toContain('<g class="vs-fold-toggle" data-vs-fold-toggle="g_orders" role="button" tabindex="0" aria-label="Fold Order service" hidden>');
    expect(svg).toMatch(/Order service<tspan class="vs-fold-count" fill-opacity="0.72"> · 2<\/tspan>/);
  });

  it('emits one hidden proxy route for each combination of folded ends, and none for an edge inside a group', async () => {
    const { svg } = await compile(fixture);
    const proxies = [...svg.matchAll(/data-vs-proxy-for="([^"]+)" data-vs-proxy-from="([^"]*)" data-vs-proxy-to="([^"]*)" data-vs-proxy-ends="([^"]+)" hidden/g)].map((m) => m.slice(1).join('|'));
    expect(proxies).toEqual([
      'e_submit||g_orders|n_client n_api',
      'e_invoice||g_billing|n_api n_bill',
      'e_invoice|g_orders||n_api n_bill',
      'e_invoice|g_orders|g_billing|n_api n_bill',
    ]);
    expect(element(svg, 'v-map.e_invoice~g_orders~g_billing')).toContain('data-vs-target="e_invoice" data-vs-rel="e_invoice"');
  });

  it('a proxy route starts on the fold box and keeps the authored route outside the folded group', async () => {
    const { svg } = await compile(fixture);
    const box = rect(svg, 'vs-fold-shape', 'g_orders');
    const proxy = route(svg, 'v-map.e_invoice~g_orders~-');
    const [x0, y0] = proxy[0]!;
    const onBorder = (x0 === box.x || x0 === box.x + box.width) ? y0 >= box.y && y0 <= box.y + box.height : (y0 === box.y || y0 === box.y + box.height) && x0 >= box.x && x0 <= box.x + box.width;
    expect(onBorder, JSON.stringify({ box, start: proxy[0] })).toBe(true);
    expect(proxy.at(-1)).toEqual(route(svg, 'v-map.e_invoice').at(-1));
    // Every segment of the route is horizontal or vertical.
    for (let i = 1; i < proxy.length; i++) expect(proxy[i]![0] === proxy[i - 1]![0] || proxy[i]![1] === proxy[i - 1]![1]).toBe(true);
    const both = route(svg, 'v-map.e_invoice~g_orders~g_billing');
    const billing = rect(svg, 'vs-fold-shape', 'g_billing');
    const [x1, y1] = both.at(-1)!;
    expect(x1 >= billing.x && x1 <= billing.x + billing.width && y1 >= billing.y && y1 <= billing.y + billing.height).toBe(true);
  });

  it('is deterministic, and a figure with no collapsed group has no fold markup', async () => {
    const a = await compile(fixture);
    const b = await compile(fixture);
    expect(a.html).toBe(b.html);
    const plain = await compile(fixture.replaceAll(' collapsed=true', ''));
    expect(plain.svg).not.toContain('vs-fold');
    expect(plain.svg).not.toContain('data-vs-proxy-for');
  });

  it('puts the fold box and the Fold control right after their group, under the edges (phase 6b review F3, F9)', async () => {
    const { svg } = await compile(fixture);
    expect(svg).toMatch(/<a class="vs-group" href="#x-g_orders"[^>]*>(?:(?!<\/a>)[\s\S])*<\/a><g class="vs-fold" data-vs-fold="g_orders"[\s\S]*?<\/g><g class="vs-fold-toggle" data-vs-fold-toggle="g_orders"/);
    expect(svg.indexOf('class="vs-fold"')).toBeLessThan(svg.indexOf('class="vs-edge'));
    expect(svg.lastIndexOf('class="vs-fold-toggle"')).toBeLessThan(svg.indexOf('class="vs-node'));
  });

  it('the Fold control is at least 44 × 24 px (phase 6b review F10)', async () => {
    const { svg } = await compile(fixture);
    const at = svg.indexOf('data-vs-fold-toggle="g_orders"');
    const size = /<rect x="[\d.]+" y="[\d.]+" width="([\d.]+)" height="([\d.]+)"/.exec(svg.slice(at))!;
    expect(Number(size[1])).toBeGreaterThanOrEqual(44);
    expect(Number(size[2])).toBeGreaterThanOrEqual(24);
  });

  it('no two proxies visible in one fold state share a segment or a point on the fold box (phase 6b review F2)', async () => {
    const text = fixture
      .replace('{% node id="n_client" label="Web client" role="external" /%}', [
        '{% node id="n_client" label="Web client" role="external" /%}',
        '{% node id="n_admin" label="Admin console" role="external" /%}',
        '{% node id="n_batch" label="Nightly batch" role="external" /%}',
      ].join('\n'))
      .replace('{% edge id="e_save"', [
        '{% edge id="e_admin" from="n_admin" to="n_api" kind="call" label="cancel order" /%}',
        '{% edge id="e_batch" from="n_batch" to="n_store" kind="data" label="archive orders" /%}',
        '{% edge id="e_save"',
      ].join('\n'));
    const { svg } = await compile(text);
    const proxies = [...svg.matchAll(/id="(v-map\.[^"]+~[^"]+~[^"]+)"[^>]*data-vs-proxy-for="([^"]+)" data-vs-proxy-from="([^"]*)" data-vs-proxy-to="([^"]*)"/g)].map((m) => ({ id: m[1]!, edge: m[2]!, from: m[3]!, to: m[4]! }));
    // The group around each end of an edge: the non-empty `from` and `to` of its proxies.
    const groupOf = (edge: string, end: 'from' | 'to') => proxies.find((p) => p.edge === edge && p[end] !== '')?.[end] ?? '';
    type Seg = [[number, number], [number, number]];
    const segments = (id: string): Seg[] => {
      const p = route(svg, id);
      return p.slice(1).map((b, i) => [p[i]!, b] as Seg);
    };
    // Two axis-aligned segments share a piece when they are on one line and their ranges overlap.
    const shared = (a: Seg, b: Seg): boolean => {
      const [[ax1, ay1], [ax2, ay2]] = a;
      const [[bx1, by1], [bx2, by2]] = b;
      const overlap = (p1: number, p2: number, q1: number, q2: number) => Math.min(Math.max(p1, p2), Math.max(q1, q2)) - Math.max(Math.min(p1, p2), Math.min(q1, q2)) > 0.01;
      if (ax1 === ax2 && bx1 === bx2 && ax1 === bx1) return overlap(ay1, ay2, by1, by2);
      if (ay1 === ay2 && by1 === by2 && ay1 === by1) return overlap(ax1, ax2, bx1, bx2);
      return false;
    };
    // Fold states: each subset of the two collapsible groups.
    let checked = 0;
    for (const folded of [['g_orders'], ['g_billing'], ['g_orders', 'g_billing']]) {
      // A proxy shows when its ends are the folded groups around the edge ends, as the runtime decides.
      const standIn = (g: string) => (folded.includes(g) ? g : '');
      const visible = proxies.filter((p) => p.from === standIn(groupOf(p.edge, 'from')) && p.to === standIn(groupOf(p.edge, 'to')));
      const ends = new Map<string, string>();
      for (let i = 0; i < visible.length; i++) {
        for (let j = i + 1; j < visible.length; j++) {
          for (const a of segments(visible[i]!.id)) for (const b of segments(visible[j]!.id)) {
            expect(shared(a, b), `${visible[i]!.id} and ${visible[j]!.id} share ${JSON.stringify(a)} ${JSON.stringify(b)}`).toBe(false);
            checked++;
          }
        }
        // The point on a fold box: the first point of a proxy from a folded group, the last point of one into it.
        const p = route(svg, visible[i]!.id);
        for (const [group, point] of [[visible[i]!.from, p[0]!], [visible[i]!.to, p.at(-1)!]] as const) {
          if (group === '') continue;
          const key = `${group}:${point.join(',')}`;
          expect(ends.get(key), `${visible[i]!.id} meets ${group} at the point of ${ends.get(key)}`).toBeUndefined();
          ends.set(key, visible[i]!.id);
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    // Three proxies meet the order service box: each at its own point.
    expect(proxies.filter((p) => p.to === 'g_orders' && p.from === '').length).toBeGreaterThanOrEqual(3);
  });

  it('does not change the text lists', async () => {
    const lists = (html: string) => html.slice(html.indexOf('<div class="vs-lists">'), html.indexOf('</div>', html.indexOf('<div class="vs-lists">')));
    expect(lists((await compile(fixture)).html)).toBe(lists((await compile(fixture.replaceAll(' collapsed=true', ''))).html));
  });
});

describe('density with collapsed groups (phase 6b review F19)', () => {
  const map = (collapsed: boolean) => {
    const nodes = Array.from({ length: 20 }, (_, i) => `{% node id="n_${i}" label="Service ${i}" role="process" /%}`);
    const inside = Array.from({ length: 10 }, (_, i) => `{% node id="m_${i}" group="g_big" label="Module ${i}" role="process" /%}`);
    return fixture.replace('{% group id="g_orders" label="Order service" collapsed=true /%}', `{% group id="g_orders" label="Order service" collapsed=true /%}\n{% group id="g_big" label="Big service"${collapsed ? ' collapsed=true' : ''} /%}\n${[...nodes, ...inside].join('\n')}`);
  };
  it('a collapsed group counts as one node in W_VISUAL_DENSITY, in the validator and in the review', () => {
    // 35 nodes. Unfolded g_big: 1 + 20 + 10 nodes and 2 boxes, so 33. Folded: 1 + 20 nodes and 3 boxes, so 24.
    const warn = (text: string) => diagnostics(text).filter((d) => d.startsWith('W_VISUAL_DENSITY'));
    expect(warn(map(false))).toEqual(['W_VISUAL_DENSITY: graph map shows 33 nodes (a collapsed group counts as one); consider splitting it (warning above 25)']);
    expect(warn(map(true))).toEqual([]);
    const review = (text: string) => reviewDocument(load(text)).filter((d) => d.code === 'W_VISUAL_DENSITY').map((d) => d.targetId);
    expect(review(map(false))).toEqual(['map']);
    expect(review(map(true))).toEqual([]);
  });
});

describe('cross-figure highlight and filter chips (IMPROVEMENTS.md §14.9)', () => {
  it('an Appears-in item names the other part, in both directions', async () => {
    const { html } = await compile(fixture);
    const appears = (id: string) => {
      const at = html.indexOf(`id="x-${id}"`);
      return html.slice(html.indexOf('<h3>Appears in</h3>', at), html.indexOf('</section>', html.indexOf('<h3>Appears in</h3>', at)));
    };
    expect(appears('n_api')).toContain('<li data-vs-entity="a_api">');
    expect(appears('a_api')).toContain('<li data-vs-entity="n_api">');
    expect(appears('a_bill')).toContain('<li data-vs-entity="n_bill">');
  });

  it('each legend chip and each drawn part carries its filter token', async () => {
    const { html, svg } = await compile(fixture);
    expect(html).toContain('<li class="vs-legend-chip" data-vs-filter="role:interface">');
    expect(html).toContain('<li class="vs-legend-chip" data-vs-filter="kind:data">');
    expect(element(svg, 'v-map.n_store')).toContain('data-vs-filter="role:storage"');
    expect(element(svg, 'v-map.e_post')).toContain('data-vs-filter="kind:data"');
    // The trace legend (failure) and its events.
    expect(html).toContain('<li class="vs-legend-chip" data-vs-filter="kind:failure">');
    expect(element(html, 'v-flow.ev_fail')).toContain('data-vs-filter="kind:failure"');
  });
});


describe('proxy label collision geometry (review R3)', () => {
  const intersects = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  function fixtureInput(twoEdges = false, nested = false): SvgInput {
    return {
      figureId: 'geometry', title: 'Fold label clearance', collapsed: nested ? ['g', 'outer'] : ['g'],
      parentOf: (id) => id === 'a' ? 'g' : id === 'g' && nested ? 'outer' : undefined,
      labelOf: (id) => id, roleOf: () => undefined, kindOf: () => 'call',
      relationship: () => ({ from: 'a', to: 'b' }),
      layout: {
        width: 600, height: 300,
        groups: (nested ? ['g', 'outer'] : ['g']).map((id) => ({ id, label: id, x: 0, y: 0, width: 200, height: 160 })),
        nodes: [
          { id: 'a', x: 50, y: 30, width: 80, height: 40, lines: ['a'] },
          { id: 'near', x: 278, y: 63, width: 110, height: 50, lines: ['near'] },
          { id: 'b', x: 450, y: 200, width: 80, height: 40, lines: ['b'] },
        ],
        edges: (twoEdges ? ['e', 'e2'] : ['e']).map((id) => ({ id,
          points: [{ x: 100, y: 53 }, { x: 490, y: 53 }, { x: 490, y: 200 }],
          label: { x: 70, y: 75, width: 90, height: 24, lines: [id] },
        })),
      },
    };
  }
  function labels(svg: string) {
    return [...svg.matchAll(/data-vs-proxy-for="([^"]+)"[^>]*data-vs-proxy-from="([^"]+)"[\s\S]*?<rect class="vs-edge-label-bg" x="([\d.-]+)" y="([\d.-]+)" width="([\d.]+)" height="([\d.]+)"/g)]
      .map((m) => ({ edge: m[1], group: m[2], x: Number(m[3]) - 8, y: Number(m[4]) - 8, width: Number(m[5]), height: Number(m[6]) }));
  }
  it('rejects a full label rectangle that hits a visible node although its route clears it', () => {
    const input = fixtureInput();
    const near = input.layout.nodes[1]!;
    expect(53).toBeLessThan(near.y); // the horizontal external route is 10 px above the node
    expect(intersects({ x: 300, y: 41, width: 90, height: 24 }, near)).toBe(true);
    const svg = render(graphSvg(input));
    const [label] = labels(svg);
    expect(label).toBeDefined();
    expect(intersects(label!, near)).toBe(false);
    for (const node of input.layout.nodes.slice(1)) expect(intersects(label!, node)).toBe(false);
    expect(intersects(label!, { x: 0, y: 0, width: 200, height: 160 })).toBe(false);
    expect(svg).toBe(render(graphSvg(input)));
  });
  it('keeps co-visible proxy labels apart', () => {
    const placed = labels(render(graphSvg(fixtureInput(true))));
    expect(placed).toHaveLength(2);
    expect(intersects(placed[0]!, placed[1]!)).toBe(false);
  });
  it('avoids an ordinary co-visible label and includes a crowded fallback in the viewBox', () => {
    const input = fixtureInput();
    input.layout.edges.push({ id: 'ordinary', points: [{ x: 400, y: 114 }, { x: 550, y: 114 }],
      label: { x: 445, y: 114.5, width: 90, height: 24, lines: ['ordinary'] } });
    input.relationship = (id) => id === 'ordinary' ? { from: 'near', to: 'b' } : { from: 'a', to: 'b' };
    const [placed] = labels(render(graphSvg(input)));
    expect(intersects(placed!, input.layout.edges[1]!.label!)).toBe(false);
    input.layout.nodes.push({ id: 'crowded', x: 0, y: 0, width: 600, height: 300, lines: ['crowded'] });
    const svg = render(graphSvg(input));
    const [fallback] = labels(svg);
    expect(fallback!.x).toBeGreaterThanOrEqual(600);
    expect(intersects(fallback!, input.layout.nodes.at(-1)!)).toBe(false);
    const viewWidth = Number(/viewBox="0 0 ([\d.]+)/.exec(svg)![1]);
    expect(viewWidth).toBeGreaterThanOrEqual(fallback!.x + fallback!.width + 16);
    // A gutter label has foreground paired keys and names both endpoints, so
    // the relationship remains legible even when a visible node covers its route.
    const callout = /<a class="vs-edge vs-proxy-callout"[^>]*data-vs-proxy-for="e" data-vs-proxy-from="g" data-vs-proxy-to="" data-vs-proxy-ends="a b"[^>]*hidden>[\s\S]*?<rect class="vs-proxy-callout-key"[^>]*width="14" height="14"[\s\S]*?<text class="vs-proxy-callout-key-text"[^>]*font-size="12"[^>]*>1<\/text>[\s\S]*?<rect class="vs-proxy-callout-key"[^>]*>[\s\S]*?<text class="vs-proxy-callout-context"[^>]*>a → e → b<\/text>/.exec(svg);
    expect(callout).not.toBeNull();
    const calloutBox = /<rect class="vs-proxy-callout-bg" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/.exec(callout![0])!;
    expect(viewWidth).toBeGreaterThanOrEqual(Number(calloutBox[1]) + Number(calloutBox[3]) + 8);
    expect(svg).not.toContain('vs-edge-label-leader');

    const paired = fixtureInput(true);
    paired.layout.nodes.push({ id: 'crowded', x: 0, y: 0, width: 600, height: 300, lines: ['crowded'] });
    const keys = [...render(graphSvg(paired)).matchAll(/class="vs-proxy-callout-key-text"[^>]*>(\d+)<\/text>/g)].map((m) => m[1]!);
    expect(keys).toEqual(['1', '1', '2', '2']);
    expect(render(graphSvg(paired))).toContain('class="vs-proxy-callout-stem"');
  });
  it('reserves complete long-endpoint panels and separates nearby route keys', () => {
    const input = fixtureInput(true);
    input.labelOf = (id) => id === 'a' ? 'Long source service endpoint' : id === 'b' ? 'Long destination service endpoint' : id;
    input.layout.nodes.push({ id: 'crowded', x: 0, y: 0, width: 600, height: 300, lines: ['crowded'] });
    // Nearby, non-identical attachment points must also keep their keys apart.
    input.layout.edges[1]!.points = [{ x: 100, y: 54 }, { x: 493, y: 54 }, { x: 493, y: 200 }];
    const svg = render(graphSvg(input));
    const callouts = [...svg.matchAll(/<a class="vs-edge vs-proxy-callout"[\s\S]*?<\/a>/g)].map((m) => m[0]);
    const bounds = (markup: string, cls: string) => {
      const m = new RegExp(`<rect class="${cls}" x="([\\d.-]+)" y="([\\d.-]+)" width="([\\d.]+)" height="([\\d.]+)"`).exec(markup)!;
      return { x: Number(m[1]), y: Number(m[2]), width: Number(m[3]), height: Number(m[4]) };
    };
    const panels = callouts.map((s) => bounds(s, 'vs-proxy-callout-bg'));
    const keys = callouts.map((s) => bounds(s, 'vs-proxy-callout-key'));
    expect(panels).toHaveLength(2);
    expect(intersects(panels[0]!, panels[1]!)).toBe(false);
    expect(intersects(keys[0]!, keys[1]!)).toBe(false);
    const view = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg)!;
    for (const panel of [...panels, ...keys]) {
      expect(panel.x).toBeGreaterThanOrEqual(0);
      expect(panel.y).toBeGreaterThanOrEqual(0);
      expect(panel.x + panel.width).toBeLessThanOrEqual(Number(view[1]));
      expect(panel.y + panel.height).toBeLessThanOrEqual(Number(view[2]));
    }
    for (const [i, callout] of callouts.entries()) {
      const baseline = Number(/class="vs-proxy-callout-context"[^>]* y="([\d.]+)"/.exec(callout)![1]);
      expect(baseline - panels[i]!.y).toBeGreaterThanOrEqual(12);
      expect(baseline).toBeLessThan(panels[i]!.y + panels[i]!.height);
    }
    expect(svg).toBe(render(graphSvg(input)));
  });
  it('lets mutually exclusive ancestor variants reuse the same label position', () => {
    const placed = labels(render(graphSvg(fixtureInput(false, true))));
    expect(placed).toHaveLength(2);
    expect(placed[0]!.group).not.toBe(placed[1]!.group);
    expect({ x: placed[0]!.x, y: placed[0]!.y }).toEqual({ x: placed[1]!.x, y: placed[1]!.y });
  });
});
