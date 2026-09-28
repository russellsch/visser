// Edge labels sit closer to their own line than to any other line
// (dogfood-2 Q10: a state label sat between two parallel lines, nearer the
// wrong one). The graph is the lifecycle figure from that page.
import { describe, expect, it } from 'vitest';
import { layoutGraph, type GraphInput, type Point } from '../../packages/core/src/compiler/layout.ts';

const states: Array<[string, string]> = [
  ['st_exact', 'exact (initial)'], ['st_stale_same', 'stale, text unchanged'], ['st_stale_changed', 'stale, text changed'],
  ['st_missing', 'missing'], ['st_deleted', 'deleted (terminal)'],
];
const transitions: Array<[string, string, string, string]> = [
  ['tr_other_edit', 'st_exact', 'st_stale_same', 'another block changes'],
  ['tr_own_edit', 'st_exact', 'st_stale_changed', "the target's text changes"],
  ['tr_own_edit_later', 'st_stale_same', 'st_stale_changed', "the target's text changes"],
  ['tr_refresh', 'st_stale_same', 'st_exact', 'refs refresh --acknowledge-stale'],
  ['tr_refresh_body', 'st_stale_changed', 'st_exact', 'refs refresh with both acknowledgements [the instruction still applies to the new text]'],
  ['tr_retire', 'st_exact', 'st_deleted', 'refs retire'],
  ['tr_hand_delete', 'st_exact', 'st_missing', 'block removed by hand, or any error'],
  ['tr_fixed', 'st_missing', 'st_stale_same', 'the error is fixed (usually stale)'],
];
const graph: GraphInput = {
  id: 'lifecycle',
  nodes: states.map(([id, label]) => ({ id, label })),
  groups: [],
  edges: transitions.map(([id, from, to, label]) => ({ id, from, to, label })),
} as GraphInput;

function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
const lineDistance = (p: Point, points: Point[]) => Math.min(...points.slice(1).map((b, i) => segmentDistance(p, points[i]!, b)));

describe('edge label placement', () => {
  it('each label centre is nearer its own edge than any other edge, by a clear margin', async () => {
    const layout = await layoutGraph(graph);
    for (const edge of layout.edges) {
      const label = edge.label!;
      const centre = { x: label.x + label.width / 2, y: label.y + label.height / 2 };
      const own = lineDistance(centre, edge.points);
      const others = layout.edges.filter((e) => e.id !== edge.id).map((e) => ({ id: e.id, d: lineDistance(centre, e.points) }));
      const nearest = others.reduce((m, o) => (o.d < m.d ? o : m));
      expect(own + 4, `${edge.id}: own ${own.toFixed(1)} px, ${nearest.id} ${nearest.d.toFixed(1)} px`).toBeLessThan(nearest.d);
    }
  });
});
