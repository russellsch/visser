// Trace figure (§9.4, P2 of docs/validation/dogfood-1.md): lifelines and event
// rows on wide screens, with the lists kept as the complete and narrow view.
import { describe, expect, it } from 'vitest';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { compileDocument } from '../../packages/core/src/compiler/index.ts';
import { render } from '../../packages/core/src/compiler/html.ts';
import { traceSvg } from '../../packages/core/src/compiler/svg.ts';

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
    expect(figure).toContain('<div class="vs-viewport" data-vs-viewport="">');
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
        { id: 'scan', actor: 'p', label: 'Scans again', kind: 'compute', layer: 7, meta: [], branch: 'b_ok' },
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
    // Different sub-columns: the boxes sit side by side, not one above the other.
    expect(scan.x).not.toBe(abort.x);
    const overlapsX = scan.x < abort.x + abort.w && abort.x < scan.x + scan.w;
    expect(overlapsX).toBe(false);
    // Same row (same order layer): neither box sits vertically between the
    // other and the shared prerequisite.
    expect(scan.y).toBe(abort.y);
    // Every box keeps a visible layer-number badge.
    expect(svg).toContain('class="vs-event-layer-badge"');
    const badges = [...svg.matchAll(/class="vs-event-layer-badge"[^>]*>(\d+)</g)].map((m) => m[1]);
    expect(badges).toEqual(['6', '7', '7']);
    // A fork mark shows once, labelled with both branch names.
    expect(svg).toContain('class="vs-trace-fork-label"');
    expect(svg).toContain('Scan succeeds / A step raised');
  });
});
