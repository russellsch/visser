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
    expect(figure).toContain('data-ex-views="map list"');
    expect(figure).toContain('<div class="ex-viewport" data-ex-viewport="">');
    expect(events.length).toBeGreaterThan(0);
    for (const t of [...events, ...actors]) expect(figure, t.id).toContain(`id="v-full_queue_trace.${t.id}"`);
    for (const r of orders) expect(figure, r.id).toContain(`id="v-full_queue_trace.${r.id}"`);
  });

  it('keeps the lists: the flat event list and the actor cards are still present', () => {
    expect(figure).toContain('class="ex-trace-events"');
    expect(figure).toContain('class="ex-trace-by-actor"');
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
      labelOf: (x) => x.toUpperCase(),
    }));
    const pathOf = (id: string) => {
      const start = svg.indexOf(`id="v-f.${id}"`);
      return /class="ex-line" d="([^"]+)"/.exec(svg.slice(start))![1]!;
    };
    expect(pathOf('a~b').split('L').length).toBe(2); // straight down to the box directly below
    expect(pathOf('a~c').split('L').length).toBeGreaterThan(3); // around through the gutter
  });
});
