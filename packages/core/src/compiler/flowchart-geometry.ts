import type { GraphInput, GraphLayout, Point } from './layout.ts';

const round3 = (v: number) => Math.round(v * 1000) / 1000;

export const FLOWCHART_GEOMETRY_WORK_LIMIT = 200_000;
export const FLOWCHART_SVG_BYTE_LIMIT = 2_097_152;

export class GeometryBudget {
  used = 0;
  readonly limit: number;
  constructor(limit = FLOWCHART_GEOMETRY_WORK_LIMIT) { this.limit = limit; }
  check(cost = 1): void {
    this.used += cost;
    if (this.used > this.limit) throw Object.assign(new Error('flowchart geometry work limit exceeded'), { code: 'E_LAYOUT_LIMIT' });
  }
}

function fail(message: string): never {
  throw Object.assign(new Error(message), { code: 'E_LAYOUT_LIMIT' });
}

type Shape = 'decision' | 'pill' | 'action';
function contains(p: Point, n: GraphLayout['nodes'][number], shape: Shape): boolean {
  const dx = Math.abs(p.x - (n.x + n.width / 2));
  const dy = Math.abs(p.y - (n.y + n.height / 2));
  const hw = n.width / 2, hh = n.height / 2;
  if (shape === 'decision') return dx / hw + dy / hh <= 1;
  if (shape === 'pill') {
    const r = Math.min(hw, hh);
    const qx = Math.max(0, dx - (hw - r));
    const qy = Math.max(0, dy - (hh - r));
    return qx * qx + qy * qy <= r * r;
  }
  return dx <= hw && dy <= hh;
}

function dock(p: Point, n: GraphLayout['nodes'][number], shape: Shape, budget: GeometryBudget): Point {
  if (shape === 'action') return p;
  const center = { x: n.x + n.width / 2, y: n.y + n.height / 2 };
  const vx = p.x - center.x, vy = p.y - center.y;
  if (Math.hypot(vx, vy) < 0.001) fail(`degenerate port at ${n.id}`);
  let low = 0, high = 1;
  for (let i = 0; i < 28; i++) {
    const mid = (low + high) / 2;
    budget.check();
    if (contains({ x: center.x + vx * mid, y: center.y + vy * mid }, n, shape)) low = mid;
    else high = mid;
  }
  return { x: round3(center.x + vx * low), y: round3(center.y + vy * low) };
}

function finiteLayout(layout: GraphLayout, budget: GeometryBudget): void {
  const rects = [...layout.nodes, ...layout.groups];
  for (const x of [layout.width, layout.height]) { budget.check(); if (!Number.isFinite(x) || x < 0) fail('nonfinite layout bounds'); }
  for (const r of rects) {
    budget.check(4);
    if (![r.x, r.y, r.width, r.height].every(Number.isFinite) || r.width <= 0 || r.height <= 0) fail(`nonfinite part ${r.id}`);
  }
  for (const e of layout.edges) {
    if (e.points.length < 2) fail(`missing route ${e.id}`);
    for (const p of e.points) { budget.check(2); if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) fail(`nonfinite route ${e.id}`); }
    if (e.label) {
      budget.check(4);
      if (![e.label.x, e.label.y, e.label.width, e.label.height].every(Number.isFinite)) fail(`nonfinite label ${e.id}`);
    }
  }
}

export function intersectsInterior(a: Point, b: Point, rect: { x: number; y: number; width: number; height: number }): boolean {
  const inset = 0.5;
  const left = rect.x + inset, right = rect.x + rect.width - inset;
  const top = rect.y + inset, bottom = rect.y + rect.height - inset;
  if (left >= right || top >= bottom) return false;
  let enter = 0, leave = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - left], [dx, right - a.x], [-dy, a.y - top], [dy, bottom - a.y]] as const) {
    if (p === 0) { if (q <= 0) return false; continue; }
    const t = q / p;
    if (p < 0) enter = Math.max(enter, t);
    else leave = Math.min(leave, t);
    if (enter >= leave) return false;
  }
  return enter < 1 && leave > 0;
}

export function overlap(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean {
  return a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5
    && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;
}

/** Flowchart-only endpoint docking and bounded geometry validation. Mutates one fresh layout. */
export function adaptFlowchartLayout(graph: GraphInput, layout: GraphLayout, budget = new GeometryBudget()): GraphLayout {
  finiteLayout(layout, budget);
  const nodes = new Map(layout.nodes.map((n) => [n.id, n]));
  const groups = new Map(layout.groups.map((g) => [g.id, g]));
  const within = (child: { x: number; y: number; width: number; height: number }, parent: { x: number; y: number; width: number; height: number }) =>
    child.x >= parent.x - 0.5 && child.y >= parent.y - 0.5
    && child.x + child.width <= parent.x + parent.width + 0.5
    && child.y + child.height <= parent.y + parent.height + 0.5;
  for (const n of graph.nodes) if (n.group) {
    budget.check();
    const child = nodes.get(n.id), parent = groups.get(n.group);
    if (!child || !parent || !within(child, parent)) fail(`node ${n.id} leaves group ${n.group}`);
  }
  for (const g of graph.groups) if (g.parent) {
    budget.check();
    const child = groups.get(g.id), parent = groups.get(g.parent);
    if (!child || !parent || !within(child, parent)) fail(`group ${g.id} leaves group ${g.parent}`);
  }
  const kinds = new Map(graph.nodes.map((n) => [n.id, n.flowKind]));
  for (let i = 0; i < graph.edges.length; i++) {
    const rel = graph.edges[i]!;
    const edge = layout.edges[i];
    if (!edge || edge.id !== rel.id) fail(`missing flow ${rel.id}`);
    const source = nodes.get(rel.from), target = nodes.get(rel.to);
    if (!source || !target) fail(`missing endpoint ${rel.id}`);
    const shape = (id: string): Shape => kinds.get(id) === 'decision' ? 'decision' :
      kinds.get(id) === 'start' || kinds.get(id) === 'end' ? 'pill' : 'action';
    budget.check(3); // Two docking calls and the destination tangent check.
    edge.points[0] = dock(edge.points[0]!, source, shape(rel.from), budget);
    edge.points[edge.points.length - 1] = dock(edge.points.at(-1)!, target, shape(rel.to), budget);
    if (edge.points.length >= 2) {
      const a = edge.points.at(-2)!, b = edge.points.at(-1)!;
      if (Math.hypot(a.x - b.x, a.y - b.y) < 0.001) fail(`degenerate destination tangent ${rel.id}`);
    }
  }
  // ELK's route is authoritative only after checking it does not cross an
  // unrelated node. It may cross other edges; crossings are not connections.
  for (let i = 0; i < graph.edges.length; i++) {
    const rel = graph.edges[i]!;
    const edge = layout.edges[i]!;
    for (const node of layout.nodes) {
      if (node.id === rel.from || node.id === rel.to) continue;
      if (edge.label && rel.label) {
        budget.check();
        if (overlap(edge.label, node)) fail(`flow label ${rel.id} overlaps ${node.id}`);
      }
      for (let j = 1; j < edge.points.length; j++) {
        budget.check();
        if (intersectsInterior(edge.points[j - 1]!, edge.points[j]!, node)) fail(`flow ${rel.id} crosses ${node.id}`);
      }
    }
  }
  for (let i = 0; i < layout.edges.length; i++) {
    const a = layout.edges[i]!;
    for (let j = i + 1; j < layout.edges.length; j++) {
      const b = layout.edges[j]!;
      if (a.label && b.label && graph.edges[i]!.label && graph.edges[j]!.label) {
        budget.check();
        if (overlap(a.label, b.label)) fail(`flow labels ${a.id} and ${b.id} overlap`);
      }
      if (b.label && graph.edges[j]!.label) for (let k = 1; k < a.points.length; k++) {
        budget.check();
        if (intersectsInterior(a.points[k - 1]!, a.points[k]!, b.label)) fail(`flow ${a.id} crosses label ${b.id}`);
      }
      if (a.label && graph.edges[i]!.label) for (let k = 1; k < b.points.length; k++) {
        budget.check();
        if (intersectsInterior(b.points[k - 1]!, b.points[k]!, a.label)) fail(`flow ${b.id} crosses label ${a.id}`);
      }
    }
  }
  layout.flowchartGeometryWork = budget.used;
  return layout;
}
