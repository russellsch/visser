// Trace figure (§9.4, P2 of docs/validation/dogfood-1.md): lifelines and event
// rows on wide screens, with the lists kept as the complete and narrow view.
import { describe, expect, it } from 'vitest';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { compileDocument } from '../../packages/core/src/compiler/index.ts';
import { render } from '../../packages/core/src/compiler/html.ts';
import { traceSvg } from '../../packages/core/src/compiler/svg.ts';
import { legend, traceLineChips } from '../../packages/core/src/compiler/encoding.ts';
import { textWidth } from '../../packages/core/src/compiler/layout.ts';

const examplePath = new URL('../../examples/bounded-queue/index.md', import.meta.url).pathname;
const bundle = loadBundle(examplePath);
const result = await compileDocument(bundle, { version: '0.0.0', sha256: 'e'.repeat(64) }, { audience: 'private', includeSource: false, layoutFallback: false });
const html = new TextDecoder().decode(result.files.find((f) => f.path === `${result.directory}/index.html`)!.bytes);
const figure = html.slice(html.indexOf('id="x-full_queue_trace"'), html.indexOf('</figure>', html.indexOf('id="x-full_queue_trace"')));

describe('trace figure @R04 @R06', () => {
  const events = [...bundle.model.targets.values()].filter((t) => t.parentId === 'full_queue_trace' && t.kind === 'event');
  const actors = [...bundle.model.targets.values()].filter((t) => t.parentId === 'full_queue_trace' && t.kind === 'actor');
  const orders = bundle.model.relationships.filter((r) => r.kind === 'order');

  it('draws an SVG in a map/list figure, with one instance for every event, actor, and order', () => {
    expect(figure).toContain('data-vs-views="map list"');
    expect(figure).toMatch(/<div class="vs-viewport" tabindex="0" role="region" aria-label="Diagram: [^"]+" data-vs-viewport="">/);
    expect(events.length).toBeGreaterThan(0);
    for (const t of [...events, ...actors]) expect(figure, t.id).toContain(`id="v-full_queue_trace.${t.id}"`);
    for (const r of orders) expect(figure, r.id).toContain(`id="v-full_queue_trace.${r.id}"`);
  });

  it('keeps the lists: the flat event list and the actor cards are still present', () => {
    expect(figure).toContain('class="vs-trace-events"');
    expect(figure).toContain('class="vs-trace-by-actor"');
    for (const e of events) expect(figure, e.id).toContain(`id="l-full_queue_trace.${e.id}"`);
  });

  it('states "Ordering, not duration." exactly once', () => {
    expect(figure.split('Ordering, not duration.').length - 1).toBe(1);
  });

  it('explains only the line types drawn in a trace, with arrows distinct from lifelines', async () => {
    // The queue trace has prerequisites and lifelines, but no message destination arrow.
    expect(figure).toContain('event order');
    expect(figure).toContain('actor lifeline');
    expect(figure).not.toContain('message destination (not proof of receipt)');

    const messageBundle = loadBundle(new URL('../fixtures/interactions/index.md', import.meta.url).pathname);
    const compiled = await compileDocument(messageBundle, { version: '0.0.0', sha256: 'e'.repeat(64) }, { audience: 'private', includeSource: false, layoutFallback: false });
    const page = new TextDecoder().decode(compiled.files.find((f) => f.path === `${compiled.directory}/index.html`)!.bytes);
    const trace = page.slice(page.indexOf('id="x-flow"'), page.indexOf('</figure>', page.indexOf('id="x-flow"')));
    expect(trace).toContain('message destination (not proof of receipt)');
    expect(trace).toContain('event order');
    expect(trace).toContain('actor lifeline');
    expect(trace).toMatch(/class="vs-trace-message"[^>]*stroke-dasharray="5 3"/);

    const key = render(legend(traceLineChips(true, true, true), 'data-vs-generated')!);
    expect(key).toMatch(/d="M2,10 L34,10"[^>]*stroke-dasharray="5 3"[^>]*class="vs-line"/);
    expect(key).toMatch(/d="M18,1 L18,19"[^>]*stroke-dasharray="4 4"[^>]*class="vs-line vs-lifeline"/);
    expect(key.match(/class="vs-edge-mark vs-edge-mark-fill"/g)).toHaveLength(2);
    const onlyLifeline = render(legend(traceLineChips(false, false, true), 'data-vs-generated')!);
    expect(onlyLifeline).toContain('actor lifeline');
    expect(onlyLifeline).not.toContain('vs-edge-mark');
    expect(legend(traceLineChips(false, false, false), 'data-vs-generated')).toBeNull();
  });

  it('is deterministic', async () => {
    const again = await compileDocument(bundle, { version: '0.0.0', sha256: 'e'.repeat(64) }, { audience: 'private', includeSource: false, layoutFallback: false });
    expect(new TextDecoder().decode(again.files.find((f) => f.path === `${again.directory}/index.html`)!.bytes)).toBe(html);
  });

  it('routes an arrow around a box stacked in its path, so it never reads as following that box', () => {
    // a -> c, with b in the same column and layer as c, above it.
    const svg = render(traceSvg({
      figureId: 'f', title: 'T',
      actors: [{ id: 'p', label: 'P' }],
      events: [
        { id: 'a', actor: 'p', label: 'A', kind: 'compute', layer: 1, meta: [] },
        { id: 'b', actor: 'p', label: 'B', kind: 'failure', layer: 2, meta: [] },
        { id: 'c', actor: 'p', label: 'C', kind: 'compute', layer: 2, meta: [] },
      ],
      orders: [{ id: 'a~b', from: 'a', to: 'b' }, { id: 'a~c', from: 'a', to: 'c' }],
      messages: [],
      branches: [],
      labelOf: (x) => x.toUpperCase(),
    }));
    const pathOf = (id: string) => {
      const start = svg.indexOf(`id="v-f.${id}"`);
      return /class="vs-line" d="([^"]+)"/.exec(svg.slice(start))![1]!;
    };
    expect(pathOf('a~b').split('L').length).toBe(2); // straight down to the box directly below
    expect(pathOf('a~c').split('L').length).toBeGreaterThan(3); // around through the gutter
  });

  it('gives two exclusive branches on one actor their own sub-columns, so their boxes never interleave (dogfood-3 F2)', () => {
    // A single prerequisite forks into a success and a failure branch on the
    // same actor. Before the fix, both later events landed in the same
    // column and simply stacked, so the failure box could render between two
    // success boxes and read as part of the success chain.
    const svg = render(traceSvg({
      figureId: 'f', title: 'T',
      actors: [{ id: 'p', label: 'Background index thread' }],
      events: [
        { id: 'acquire', actor: 'p', label: 'acquire_cutover', kind: 'compute', layer: 6, meta: [] },
        { id: 'scan', actor: 'p', label: 'Scans again after checking all available work', kind: 'compute', layer: 7, meta: [], branch: 'b_ok' },
        { id: 'abort', actor: 'p', label: 'Abort scan', kind: 'failure', layer: 7, meta: [], branch: 'b_fail' },
      ],
      orders: [{ id: 'acquire~scan', from: 'acquire', to: 'scan' }, { id: 'acquire~abort', from: 'acquire', to: 'abort' }],
      messages: [],
      branches: [
        { id: 'b_ok', label: 'Scan succeeds', exclusiveWith: ['b_fail'] },
        { id: 'b_fail', label: 'A step raised', exclusiveWith: ['b_ok'] },
      ],
      labelOf: (x) => x.toUpperCase(),
    }));
    const boxOf = (id: string) => {
      const start = svg.indexOf(`id="v-f.${id}"`);
      const rect = /<rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.-]+)" height="([\d.-]+)"/.exec(svg.slice(start))!;
      const [, x, y, w, h] = rect.map(Number);
      return { x: x!, y: y!, w: w!, h: h! };
    };
    const scan = boxOf('scan');
    const abort = boxOf('abort');
    expect(scan.w).toBeGreaterThan(150);
    const lane = svg.slice(svg.indexOf('id="v-f.p"'), svg.indexOf('</a>', svg.indexOf('id="v-f.p"')));
    const [, headerX, headerW] = /<rect x="([\d.-]+)" y="[\d.-]+" width="([\d.-]+)"/.exec(lane)!.map(Number);
    const labelX = Number(/class="vs-lane-label" x="([\d.-]+)"/.exec(lane)![1]);
    expect(headerX).toBe(Math.min(scan.x, abort.x));
    expect(headerX! + headerW!).toBe(Math.max(scan.x + scan.w, abort.x + abort.w));
    expect(headerX! + headerW! / 2).toBe(labelX);
    // Different sub-columns: the boxes sit side by side, not one above the other.
    expect(scan.x).not.toBe(abort.x);
    const overlapsX = scan.x < abort.x + abort.w && abort.x < scan.x + scan.w;
    expect(overlapsX).toBe(false);
    // Same row (same order layer): neither box sits vertically between the
    // other and the shared prerequisite.
    expect(scan.y).toBe(abort.y);
    // The order layer shows once per row on the axis, not on every box (IMPROVEMENTS F8).
    expect(svg).not.toContain('vs-event-layer-badge');
    // A fork mark shows once. The branch headings name each side, so the mark has no text of its own.
    expect(svg.split('class="vs-trace-fork"').length - 1).toBe(1);
    expect(svg).not.toContain('vs-trace-fork-label');
    expect(svg).not.toContain('Scan succeeds / A step raised');
  });

  it('draws branch headings that do not overlap each other or a box, over neutral bands (IMPROVEMENTS F8, §3.2)', () => {
    const svg = render(traceSvg({
      figureId: 'f', title: 'T',
      actors: [{ id: 'w', label: 'Charge worker' }],
      events: [
        { id: 'call', actor: 'w', label: 'Calls the provider', kind: 'call', layer: 1, meta: [] },
        { id: 'paid', actor: 'w', label: 'Marks the order paid', kind: 'state-change', layer: 2, meta: [], branch: 'b_ok' },
        { id: 'failed', actor: 'w', label: 'Marks the order payment-failed', kind: 'failure', layer: 2, meta: [], branch: 'b_no' },
      ],
      orders: [{ id: 'call~paid', from: 'call', to: 'paid' }, { id: 'call~failed', from: 'call', to: 'failed' }],
      messages: [],
      branches: [
        { id: 'b_ok', label: 'Charge succeeds after a long provider round trip', exclusiveWith: ['b_no'] },
        { id: 'b_no', label: 'Charge declined', exclusiveWith: ['b_ok'] },
      ],
      labelOf: (x) => x,
      hue: true,
    }));
    const headings = [...svg.matchAll(/<text class="vs-trace-branch-heading[^"]*" x="([\d.]+)" y="([\d.]+)"[^>]*>(.*?)<\/text>/g)].map((m) => {
      const lines = [...m[3]!.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map((t) => t[1]!);
      const w = Math.max(...lines.map((l) => textWidth(l)));
      return { x: Number(m[1]) - w / 2, y: Number(m[2]), w, h: 18 * lines.length };
    });
    expect(headings).toHaveLength(2);
    const [a, b] = headings as [typeof headings[0], typeof headings[0]];
    const overlap = (p: { x: number; y: number; w: number; h: number }, q: { x: number; y: number; w: number; h: number }) =>
      p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
    expect(overlap(a, b)).toBe(false);
    for (const id of ['call', 'paid', 'failed']) {
      const start = svg.indexOf(`id="v-f.${id}"`);
      const [, x, y, w, h] = /<rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.-]+)" height="([\d.-]+)"/.exec(svg.slice(start))!.map(Number);
      for (const hd of headings) expect(overlap(hd, { x: x!, y: y!, w: w!, h: h! }), `heading over ${id}`).toBe(false);
    }
    // One band per branch sub-column: the panel colour, then the page colour.
    // The bands have no hue, so the trace encodes one variable in hue (review F-03).
    expect([...svg.matchAll(/class="vs-trace-band vs-band-([a-z]+)"/g)].map((m) => m[1])).toEqual(['panel', 'bg']);
    expect(svg).not.toMatch(/vs-trace-band[^"]*vs-cat/);
    expect(svg).toMatch(/class="vs-trace-branch-heading vs-band-panel"/);
    // The box shows the label only: no kind and no branch line.
    expect(svg).not.toContain('[state-change]');
    expect(svg).not.toContain('branch:');
  });
  const rectOf = (svg: string, id: string) => {
    const start = svg.indexOf(`id="v-f.${id}"`);
    const [, x, y, w, h] = /<rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.-]+)" height="([\d.-]+)"/.exec(svg.slice(start))!.map(Number);
    return { x: x!, y: y!, w: w!, h: h! };
  };
  const bandsOf = (svg: string) => [...svg.matchAll(/<rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.-]+)" height="([\d.-]+)"[^>]*class="vs-trace-band/g)]
    .map((m) => ({ x: Number(m[1]), y: Number(m[2]), w: Number(m[3]), h: Number(m[4]) }));
  type Rect = { x: number; y: number; w: number; h: number };
  const overlaps = (p: Rect, q: Rect) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;

  it('splits a branch band at a row where a main-column box of the same actor sits between its boxes (review F-04)', () => {
    // The reviewer's probe: a1 and a2 are in branch A, and tick is a
    // main-column event of the same actor in the row between them. One band
    // from a1 to a2 covered half of tick, so tick read as part of branch A.
    const svg = render(traceSvg({
      figureId: 'f', title: 'T',
      actors: [{ id: 'p', label: 'P' }],
      events: [
        { id: 'a1', actor: 'p', label: 'A one', kind: 'compute', layer: 1, meta: [], branch: 'A' },
        { id: 'b1', actor: 'p', label: 'B one', kind: 'compute', layer: 1, meta: [], branch: 'B' },
        { id: 'tick', actor: 'p', label: 'Tick', kind: 'compute', layer: 2, meta: [] },
        { id: 'a2', actor: 'p', label: 'A two', kind: 'compute', layer: 3, meta: [], branch: 'A' },
      ],
      orders: [{ id: 'a1~tick', from: 'a1', to: 'tick' }, { id: 'tick~a2', from: 'tick', to: 'a2' }],
      messages: [],
      branches: [
        { id: 'A', label: 'Branch A', exclusiveWith: ['B'] },
        { id: 'B', label: 'Branch B', exclusiveWith: ['A'] },
      ],
      labelOf: (x) => x,
    }));
    const bands = bandsOf(svg);
    const tick = rectOf(svg, 'tick');
    for (const band of bands) expect(overlaps(band, tick), 'a band covers tick').toBe(false);
    // Branch A has two runs, so two bands; branch B has one.
    expect(bands).toHaveLength(3);
    // Each branch box is inside a band.
    for (const id of ['a1', 'b1', 'a2']) {
      const b = rectOf(svg, id);
      expect(bands.some((band) => band.x <= b.x && band.y <= b.y && b.x + b.w <= band.x + band.w && b.y + b.h <= band.y + band.h), id).toBe(true);
    }
  });

  it('marks a failure with a "✕" in the right padding, clear of the label (review F-02)', () => {
    const svg = render(traceSvg({
      figureId: 'f', title: 'T',
      actors: [{ id: 'w', label: 'Worker' }],
      events: [
        { id: 'ok', actor: 'w', label: 'Calls the provider', kind: 'call', layer: 1, meta: [] },
        { id: 'bad', actor: 'w', label: 'Marks the order payment-failed', kind: 'failure', layer: 2, meta: [] },
      ],
      orders: [{ id: 'ok~bad', from: 'ok', to: 'bad' }],
      messages: [],
      branches: [],
      labelOf: (x) => x,
      hue: true,
    }));
    const part = (id: string) => svg.slice(svg.indexOf(`id="v-f.${id}"`), svg.indexOf('</a>', svg.indexOf(`id="v-f.${id}"`)));
    expect(part('ok')).not.toContain('class="vs-mark"');
    const mark = /<path d="M([\d.]+),[\d.]+ L[\d.]+,[\d.]+ M[\d.]+,[\d.]+ L[\d.]+,[\d.]+" fill="none"[^>]*class="vs-mark"/.exec(part('bad'));
    expect(mark).not.toBeNull();
    const box = rectOf(svg, 'bad');
    const lines = [...part('bad').matchAll(/<tspan class="vs-trace-label"[^>]*>([^<]+)<\/tspan>/g)].map((m) => m[1]!);
    expect(lines.length).toBeLessThanOrEqual(2);
    const labelRight = box.x + box.w / 2 + Math.max(...lines.map((l) => textWidth(l))) / 2;
    expect(Number(mark![1]) - labelRight).toBeGreaterThanOrEqual(8);
  });

  it('widens the boxes of a lane so that a long event label takes 2 lines, not 3 (review F-15)', () => {
    const svg = render(traceSvg({
      figureId: 'f', title: 'T',
      actors: [{ id: 'q', label: 'Queue' }, { id: 'c', label: 'Client' }],
      events: [
        { id: 'long', actor: 'q', label: 'Rechecks capacity and enqueues if space remains', kind: 'compute', layer: 1, meta: [] },
        { id: 'short', actor: 'c', label: 'Sends', kind: 'send', layer: 1, meta: [] },
      ],
      orders: [],
      messages: [],
      branches: [],
      labelOf: (x) => x,
    }));
    const part = svg.slice(svg.indexOf('id="v-f.long"'), svg.indexOf('</a>', svg.indexOf('id="v-f.long"')));
    expect(part.split('class="vs-trace-label"').length - 1).toBe(2);
    expect(rectOf(svg, 'long').w).toBeGreaterThan(150);
    const lane = svg.slice(svg.indexOf('id="v-f.q"'), svg.indexOf('</a>', svg.indexOf('id="v-f.q"')));
    const [, headerX, headerW] = /<rect x="([\d.-]+)" y="[\d.-]+" width="([\d.-]+)"/.exec(lane)!.map(Number);
    const labelX = Number(/class="vs-lane-label" x="([\d.-]+)"/.exec(lane)![1]);
    expect(headerW).toBe(rectOf(svg, 'long').w);
    expect(headerX! + headerW! / 2).toBe(labelX);
    // A lane with short labels keeps the narrowest box.
    expect(rectOf(svg, 'short').w).toBe(150);
  });

  it('gives the "at T" line its own class, after the receiver line, so the reader mutes only the time', () => {
    const svg = render(traceSvg({
      figureId: 'f', title: 'T',
      actors: [{ id: 'c', label: 'Client' }, { id: 's', label: 'Server' }],
      events: [{ id: 'send', actor: 'c', label: 'Sends', kind: 'send', layer: 1, meta: ['\u2192 Server'], time: 'at 5 ms' }],
      orders: [],
      messages: [{ event: 'send', to: 's' }],
      branches: [],
      labelOf: (x) => x,
    }));
    const part = svg.slice(svg.indexOf('id="v-f.send"'), svg.indexOf('</a>', svg.indexOf('id="v-f.send"')));
    expect([...part.matchAll(/<tspan class="([^"]+)"[^>]*>([^<]+)<\/tspan>/g)].map((m) => [m[1], m[2]])).toEqual([
      ['vs-trace-label', 'Sends'],
      ['vs-trace-meta', '\u2192 Server'],
      ['vs-trace-meta vs-trace-time', 'at 5 ms'],
    ]);
    expect(part).toContain('aria-label="Sends (c; \u2192 Server; at 5 ms); opens more detail"');
  });
});
