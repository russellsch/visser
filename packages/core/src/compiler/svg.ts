// Pure conversion from a rounded graph layout to SVG (§9.3, §10.3, §10.5).
// Geometry uses attributes only (no inline style), so the CSP needs no
// 'unsafe-inline'. Every node and edge is an <a> instance of its canonical target.
import { DOM } from './dom-contract.ts';
import { h, type HNode } from './html.ts';
import { LINE_HEIGHT, round3, wrapText, type GraphLayout, type Point } from './layout.ts';

export type SvgInput = {
  figureId: string;
  title: string;
  layout: GraphLayout;
  labelOf: (id: string) => string;
  roleOf: (id: string) => string | undefined; // architecture role: a class name and part of the aria-label
  noteOf?: (id: string) => string | undefined; // other families: descriptive text for the aria-label only
  kindOf: (id: string) => string | undefined;
  relationship: (id: string) => { from: string; to: string } | undefined;
  // Optional per-family decoration: extra node classes (e.g. initial, terminal)
  // and an edge line pattern (cause basis). Patterns always accompany text.
  nodeClassOf?: (id: string) => string | undefined;
  dashOf?: (id: string) => string | undefined;
};

const MARGIN = 8;

function n(v: number): string {
  return String(round3(v));
}

function pathData(points: Point[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${n(p.x + MARGIN)},${n(p.y + MARGIN)}`).join(' ');
}

function textLines(lines: string[], cx: number, top: number, className: string): HNode {
  return h('text', { class: className, x: n(cx), y: n(top), 'text-anchor': 'middle', 'font-size': 14, fill: '#1a1a1a' },
    lines.map((line, i) => h('tspan', { x: n(cx), dy: i === 0 ? '1em' : String(LINE_HEIGHT) }, line)));
}

export function graphSvg(input: SvgInput): HNode {
  const { figureId, layout } = input;
  const width = layout.width + 2 * MARGIN;
  const height = layout.height + 2 * MARGIN;
  const marker = `m-${figureId}.arrow`;
  return h('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 0 ${n(width)} ${n(height)}`, width: n(width), height: n(height), role: 'group', 'aria-label': input.title, focusable: 'false' },
    h('defs', {},
      h('marker', { id: marker, viewBox: '0 0 10 10', refX: '10', refY: '5', markerWidth: '8', markerHeight: '8', orient: 'auto-start-reverse', markerUnits: 'userSpaceOnUse' },
        h('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#444444' }))),
    layout.groups.map((g) => h('a', { class: 'vs-group', href: `#${DOM.canonicalId(g.id)}`, id: DOM.svgInstanceId(figureId, g.id), [DOM.attr.target]: g.id, [DOM.attr.interactive]: true, 'aria-label': `${input.labelOf(g.id)} (boundary)` },
      h('rect', { x: n(g.x + MARGIN), y: n(g.y + MARGIN), width: n(g.width), height: n(g.height), rx: '8', ry: '8', fill: '#f5f7fa', stroke: '#8a94a3', 'stroke-width': '1' }),
      h('text', { class: 'vs-group-label', x: n(g.x + MARGIN + 12), y: n(g.y + MARGIN + 20), 'font-size': 13, fill: '#3a4250' }, input.labelOf(g.id)))),
    layout.edges.map((e) => {
      const rel = input.relationship(e.id);
      const kind = input.kindOf(e.id) ?? 'relationship';
      const label = input.labelOf(e.id);
      const aria = rel ? `${input.labelOf(rel.from)}, ${label}, ${input.labelOf(rel.to)}` : label;
      const d = pathData(e.points);
      const dash = input.dashOf?.(e.id);
      return h('a', { class: `vs-edge vs-kind-${kind}`, href: `#${DOM.canonicalId(e.id)}`, id: DOM.svgInstanceId(figureId, e.id), [DOM.attr.target]: e.id, [DOM.attr.rel]: e.id, [DOM.attr.interactive]: true, 'aria-label': aria },
        e.points.length > 1 ? h('path', { class: 'vs-hit', d, fill: 'none', stroke: 'transparent', 'stroke-width': '16', 'stroke-linecap': 'round' }) : null,
        e.points.length > 1 ? h('path', { class: 'vs-line', d, fill: 'none', stroke: '#444444', 'stroke-width': '1.5', 'stroke-dasharray': dash, 'marker-end': `url(#${marker})` }) : null,
        e.label ? h('rect', { class: 'vs-edge-label-bg', x: n(e.label.x + MARGIN), y: n(e.label.y + MARGIN), width: n(e.label.width), height: n(e.label.height), rx: '3', ry: '3', fill: '#ffffff' }) : null,
        e.label ? textLines(e.label.lines, e.label.x + MARGIN + e.label.width / 2, e.label.y + MARGIN, 'vs-edge-label') : null);
    }),
    layout.nodes.map((node) => {
      const role = input.roleOf(node.id);
      const extraClass = input.nodeClassOf?.(node.id);
      const terminal = extraClass?.includes('vs-terminal');
      const note = role ?? input.noteOf?.(node.id);
      const roleClass = role && /^[a-z][a-z-]*$/.test(role) ? ` vs-role-${role}` : '';
      return h('a', { class: `vs-node${roleClass}${extraClass ? ` ${extraClass}` : ''}`, href: `#${DOM.canonicalId(node.id)}`, id: DOM.svgInstanceId(figureId, node.id), [DOM.attr.target]: node.id, [DOM.attr.interactive]: true, 'aria-label': note ? `${input.labelOf(node.id)} (${note})` : input.labelOf(node.id) },
        h('rect', { x: n(node.x + MARGIN), y: n(node.y + MARGIN), width: n(node.width), height: n(node.height), rx: '6', ry: '6', fill: '#ffffff', stroke: '#2f3a4a', 'stroke-width': '1.5' }),
        // A terminal state gets a second inner border; the text mark says the same.
        terminal ? h('rect', { x: n(node.x + MARGIN + 3), y: n(node.y + MARGIN + 3), width: n(node.width - 6), height: n(node.height - 6), rx: '4', ry: '4', fill: 'none', stroke: '#2f3a4a', 'stroke-width': '1' }) : null,
        textLines(node.lines, node.x + MARGIN + node.width / 2, node.y + MARGIN + 8, 'vs-node-label'));
    }));
}

// ---------------------------------------------------------------------------
// Trace figure (§9.4): lifelines and event rows. One column (lifeline) per
// actor, one row per order layer. The row is the longest `after` chain before
// an event, so events in one row have no ordering constraint between them, and
// the vertical position is never a time. Placement is a pure function of the
// model, so the figure needs no layout engine.

export type TraceSvgEvent = {
  id: string;
  actor: string;
  label: string;
  kind: string;
  layer: number; // 1-based order layer
  meta: string[]; // generated notes shown under the label: kind, branch, message target, time
  branch?: string; // branch ID (dogfood-3 F2)
};

// A branch that mutually excludes one or more others (§9.4). Branches that do
// not declare `exclusiveWith` render as before (no sub-column, no fork mark):
// only a real fork needs the side-by-side treatment (dogfood-3 F2).
export type TraceSvgBranch = { id: string; label: string; exclusiveWith: string[] };

export type TraceSvgInput = {
  figureId: string;
  title: string;
  actors: Array<{ id: string; label: string }>;
  events: TraceSvgEvent[];
  orders: Array<{ id: string; from: string; to: string }>; // relationship ID, prerequisite event, event
  messages: Array<{ event: string; to: string }>; // event ID, receiving actor ID
  branches: TraceSvgBranch[];
  labelOf: (id: string) => string;
};

const AXIS_WIDTH = 64;
const BOX_WIDTH = 170;
const GUTTER = 40;
const SUB_GUTTER = 16; // gap between two exclusive-branch sub-columns in one lane
const VGAP = 22;
const PAD = 8;
const TEXT_WIDTH = BOX_WIDTH - 2 * PAD;

// Group each branch with every other branch it (transitively) excludes, in
// authored order. A branch with no exclusive partner maps to a singleton
// group, which callers treat as "no sub-column" (dogfood-3 F2).
function branchGroups(branches: TraceSvgBranch[]): Map<string, string[]> {
  const byId = new Map(branches.map((b) => [b.id, b]));
  const groupOf = new Map<string, string[]>();
  for (const b of branches) {
    if (groupOf.has(b.id)) continue;
    const group = new Set<string>([b.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const id of [...group]) {
        const bb = byId.get(id);
        for (const ex of bb?.exclusiveWith ?? []) if (byId.has(ex) && !group.has(ex)) { group.add(ex); changed = true; }
        for (const other of branches) if (other.exclusiveWith.includes(id) && !group.has(other.id)) { group.add(other.id); changed = true; }
      }
    }
    const ordered = branches.filter((x) => group.has(x.id)).map((x) => x.id);
    for (const id of ordered) groupOf.set(id, ordered);
  }
  return groupOf;
}

function traceText(lines: Array<{ text: string; className: string }>, x: number, top: number): HNode {
  return h('text', { class: 'vs-trace-text', x: n(x), y: n(top), 'text-anchor': 'middle', 'font-size': 14, fill: '#1a1a1a' },
    lines.map((line, i) => h('tspan', { class: line.className, x: n(x), dy: i === 0 ? '1em' : String(LINE_HEIGHT) }, line.text)));
}

export function traceSvg(input: TraceSvgInput): HNode {
  const { figureId } = input;
  const layers = Math.max(1, ...input.events.map((e) => e.layer));
  const wrapped = new Map(input.events.map((e) => [e.id, [
    ...wrapText(e.label, TEXT_WIDTH).map((text) => ({ text, className: 'vs-trace-label' })),
    ...e.meta.flatMap((m) => wrapText(m, TEXT_WIDTH).map((text) => ({ text, className: 'vs-trace-meta' }))),
  ]]));
  const boxHeight = (id: string) => 2 * PAD + LINE_HEIGHT * wrapped.get(id)!.length - 4;

  // Exclusive branches (dogfood-3 F2): each gets its own sub-column inside the
  // actor's lane, side by side, so their events never interleave vertically
  // with another branch's. A branch with no exclusive partner is not a real
  // fork and keeps the single centered column (unchanged layout).
  const groupOf = branchGroups(input.branches);
  const branchLabel = new Map(input.branches.map((b) => [b.id, b.label]));
  const slotInfo = (e: TraceSvgEvent): { slot: number; size: number } | null => {
    if (!e.branch) return null;
    const g = groupOf.get(e.branch);
    return g && g.length > 1 ? { slot: g.indexOf(e.branch), size: g.length } : null;
  };
  const slotKey = (e: TraceSvgEvent): string => (slotInfo(e) ? `b:${e.branch}` : 'main');
  const boxRegionWidth = (slots: number) => slots * BOX_WIDTH + (slots - 1) * SUB_GUTTER;
  const laneWidth = (slots: number) => boxRegionWidth(slots) + GUTTER;
  const actorSlots = new Map<string, number>();
  for (const a of input.actors) {
    let w = 1;
    for (const e of input.events.filter((x) => x.actor === a.id)) {
      const s = slotInfo(e);
      if (s) w = Math.max(w, s.size);
    }
    actorSlots.set(a.id, w);
  }
  const colLeft = new Map<string, number>();
  let laneX = MARGIN + AXIS_WIDTH;
  for (const a of input.actors) {
    colLeft.set(a.id, laneX);
    laneX += laneWidth(actorSlots.get(a.id)!);
  }
  if (input.actors.length === 0) laneX += laneWidth(1); // keep a minimum width for an empty trace
  const boxX = (e: TraceSvgEvent): number => {
    const left = colLeft.get(e.actor) ?? MARGIN + AXIS_WIDTH;
    const slots = actorSlots.get(e.actor) ?? 1;
    const s = slotInfo(e);
    return s ? left + GUTTER / 2 + s.slot * (BOX_WIDTH + SUB_GUTTER) : left + GUTTER / 2 + (boxRegionWidth(slots) - BOX_WIDTH) / 2;
  };
  const laneCenterX = (actor: string): number => (colLeft.get(actor) ?? MARGIN + AXIS_WIDTH) + GUTTER / 2 + boxRegionWidth(actorSlots.get(actor) ?? 1) / 2;

  // Events of one actor, in one layer, and in one branch sub-column (or the
  // shared main column) stack inside that slot; different sub-columns never
  // share vertical space, so one branch's box cannot sit between two of another's.
  const slotTop = new Map<string, number>(); // offset of the box inside its row+sub-column
  const rowHeight = new Map<number, number>();
  for (let layer = 1; layer <= layers; layer++) {
    let tallest = 0;
    for (const a of input.actors) {
      const bySlot = new Map<string, TraceSvgEvent[]>();
      for (const e of input.events.filter((x) => x.actor === a.id && x.layer === layer)) {
        const key = slotKey(e);
        (bySlot.get(key) ?? bySlot.set(key, []).get(key)!).push(e);
      }
      for (const evs of bySlot.values()) {
        let offset = 0;
        for (const e of evs) {
          slotTop.set(e.id, offset);
          offset += boxHeight(e.id) + VGAP;
        }
        tallest = Math.max(tallest, offset);
      }
    }
    rowHeight.set(layer, Math.max(tallest, LINE_HEIGHT + VGAP));
  }
  const headLines = new Map(input.actors.map((a) => [a.id, wrapText(a.label, BOX_WIDTH)]));
  const header = 2 * PAD + LINE_HEIGHT * Math.max(1, ...[...headLines.values()].map((l) => l.length)) + 8;
  const rowTop = new Map<number, number>();
  let y = MARGIN + header + VGAP / 2;
  for (let layer = 1; layer <= layers; layer++) {
    rowTop.set(layer, y);
    y += rowHeight.get(layer)!;
  }
  const width = laneX + MARGIN;
  const height = y + MARGIN;
  const box = (id: string) => {
    const e = input.events.find((x) => x.id === id)!;
    return { x: boxX(e), y: rowTop.get(e.layer)! + slotTop.get(e.id)!, w: BOX_WIDTH, h: boxHeight(e.id) };
  };
  const marker = `m-${figureId}.arrow`;
  const column = new Map(input.actors.map((a, i) => [a.id, i]));

  return h('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 0 ${n(width)} ${n(height)}`, width: n(width), height: n(height), role: 'group', 'aria-label': input.title, focusable: 'false' },
    h('defs', {},
      h('marker', { id: marker, viewBox: '0 0 10 10', refX: '10', refY: '5', markerWidth: '8', markerHeight: '8', orient: 'auto-start-reverse', markerUnits: 'userSpaceOnUse' },
        h('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#444444' }))),
    // Row numbers: the order layer, never a time.
    h('text', { class: 'vs-trace-axis', x: n(MARGIN), y: n(MARGIN + header - 10), 'font-size': 14, fill: '#3a4250' }, 'Order layer'),
    Array.from({ length: layers }, (_, i) =>
      h('text', { class: 'vs-trace-axis', x: n(MARGIN + AXIS_WIDTH / 2 - 8), y: n(rowTop.get(i + 1)! + 16), 'text-anchor': 'middle', 'font-size': 14, fill: '#3a4250' }, String(i + 1))),
    // Lifelines: a header and a dashed vertical line per actor; the header is an instance of the actor.
    input.actors.map((a) => {
      const cx = laneCenterX(a.id);
      const regionW = boxRegionWidth(actorSlots.get(a.id) ?? 1);
      const lines = headLines.get(a.id)!;
      return h('a', { class: 'vs-lane', href: `#${DOM.canonicalId(a.id)}`, id: DOM.svgInstanceId(figureId, a.id), [DOM.attr.target]: a.id, [DOM.attr.interactive]: true, 'aria-label': `${a.label} (actor)` },
        h('path', { class: 'vs-lifeline', d: `M${n(cx)},${n(MARGIN + header)} L${n(cx)},${n(height - MARGIN)}`, fill: 'none', stroke: '#9aa3af', 'stroke-width': '1', 'stroke-dasharray': '4 4' }),
        h('rect', { x: n((colLeft.get(a.id) ?? MARGIN + AXIS_WIDTH) + GUTTER / 2), y: n(MARGIN), width: n(regionW), height: n(header - 8), rx: '6', ry: '6', fill: '#eef1f5', stroke: '#2f3a4a', 'stroke-width': '1.5' }),
        h('text', { class: 'vs-lane-label', x: n(cx), y: n(MARGIN + PAD - 2), 'text-anchor': 'middle', 'font-size': 14, fill: '#1a1a1a' },
          lines.map((line, j) => h('tspan', { x: n(cx), dy: j === 0 ? '1em' : String(LINE_HEIGHT) }, line))));
    }),
    // A branch label above the top-most box of its sub-column, shown once per
    // actor/branch (dogfood-3 F2b): the reader sees which fork they are in
    // without re-reading every box's meta line.
    input.actors.flatMap((a) => {
      const byBranch = new Map<string, TraceSvgEvent[]>();
      for (const e of input.events.filter((x) => x.actor === a.id)) {
        if (!slotInfo(e)) continue;
        (byBranch.get(e.branch!) ?? byBranch.set(e.branch!, []).get(e.branch!)!).push(e);
      }
      return [...byBranch.entries()].map(([branchId, evs]) => {
        const boxes = evs.map((e) => box(e.id));
        const top = Math.min(...boxes.map((bb) => bb.y));
        const cx = boxes[0]!.x + BOX_WIDTH / 2;
        return h('text', { class: 'vs-trace-branch-heading', x: n(cx), y: n(top - 6), 'text-anchor': 'middle', 'font-size': 14, fill: '#3a4250' }, branchLabel.get(branchId) ?? branchId);
      });
    }),
    // Messages: a dashed arrow from the event to the receiving actor's lifeline.
    // Decoration only; the event box and the lists carry the relationship.
    input.messages.map((m) => {
      const e = input.events.find((x) => x.id === m.event);
      if (!e || e.actor === m.to || !column.has(m.to)) return null;
      const b = box(m.event);
      const toX = laneCenterX(m.to);
      const right = toX > b.x;
      const x1 = right ? b.x + b.w : b.x;
      const yy = b.y + b.h / 2;
      return h('path', { class: 'vs-trace-message', d: `M${n(x1)},${n(yy)} L${n(toX)},${n(yy)}`, fill: 'none', stroke: '#6b7686', 'stroke-width': '1.25', 'stroke-dasharray': '5 3', 'marker-end': `url(#${marker})`, 'aria-hidden': 'true' });
    }),
    // `after` prerequisites: from the bottom of the prerequisite to the top of
    // the event, turning just above the event's row.
    input.orders.map((r) => {
      const a = box(r.from);
      const b = box(r.to);
      const x1 = a.x + a.w / 2;
      const y1 = a.y + a.h;
      const x2 = b.x + b.w / 2;
      const y2 = b.y;
      const ym = y2 - VGAP / 2;
      // A straight line down the source column must not pass through another
      // box: it would read as a step that follows that box. Such an arrow
      // leaves through the column's right gutter instead. Sub-columns already
      // keep exclusive branches apart in x, so only a box actually under this
      // vertical line (same sub-column) can block it (dogfood-3 F2d).
      const fromActor = input.events.find((x) => x.id === r.from)!.actor;
      const bottom = x1 === x2 ? y2 : ym;
      const blocked = input.events.some((x) => {
        if (x.id === r.from || x.id === r.to || x.actor !== fromActor) return false;
        const o = box(x.id);
        if (x1 < o.x || x1 > o.x + o.w) return false;
        return o.y < bottom && o.y + o.h > y1;
      });
      const gx = a.x + a.w + GUTTER / 4;
      const yExit = y1 + VGAP / 3;
      const d = blocked
        ? `M${n(x1)},${n(y1)} L${n(x1)},${n(yExit)} L${n(gx)},${n(yExit)} L${n(gx)},${n(ym)} L${n(x2)},${n(ym)} L${n(x2)},${n(y2)}`
        : x1 === x2 ? `M${n(x1)},${n(y1)} L${n(x2)},${n(y2)}` : `M${n(x1)},${n(y1)} L${n(x1)},${n(ym)} L${n(x2)},${n(ym)} L${n(x2)},${n(y2)}`;
      return h('a', { class: 'vs-edge vs-kind-order', href: `#${DOM.canonicalId(r.to)}`, id: DOM.svgInstanceId(figureId, r.id), [DOM.attr.target]: r.to, [DOM.attr.rel]: r.id, [DOM.attr.interactive]: true, 'aria-label': `${input.labelOf(r.to)}, after ${input.labelOf(r.from)}` },
        h('path', { class: 'vs-hit', d, fill: 'none', stroke: 'transparent', 'stroke-width': '12', 'stroke-linecap': 'round' }),
        h('path', { class: 'vs-line', d, fill: 'none', stroke: '#444444', 'stroke-width': '1.25', 'marker-end': `url(#${marker})` }));
    }),
    // Fork/split marks (dogfood-3 F2c): a labelled bracket where one shared
    // prerequisite's children fan out into different exclusive-branch columns.
    (() => {
      const forkChildren = new Map<string, TraceSvgEvent[]>();
      for (const r of input.orders) {
        const child = input.events.find((x) => x.id === r.to);
        if (!child || !slotInfo(child)) continue;
        (forkChildren.get(r.from) ?? forkChildren.set(r.from, []).get(r.from)!).push(child);
      }
      return [...forkChildren.entries()]
        .filter(([, children]) => new Set(children.map((c) => slotInfo(c)!.slot)).size > 1)
        .map(([fromId, children]) => {
          const a = box(fromId);
          const xs = children.map((c) => box(c.id).x + BOX_WIDTH / 2);
          const minX = Math.min(...xs), maxX = Math.max(...xs);
          const yTop = a.y + a.h + VGAP / 2 - 5;
          const labels = [...new Set(children.map((c) => branchLabel.get(c.branch!) ?? c.branch!))];
          return h('g', { class: 'vs-trace-fork', 'aria-hidden': 'true' },
            h('path', { class: 'vs-trace-fork-bracket', d: `M${n(minX)},${n(yTop - 5)} L${n(minX)},${n(yTop)} L${n(maxX)},${n(yTop)} L${n(maxX)},${n(yTop - 5)}`, fill: 'none', stroke: '#6b7686', 'stroke-width': '1.25' }),
            h('text', { class: 'vs-trace-fork-label', x: n((minX + maxX) / 2), y: n(yTop + 14), 'text-anchor': 'middle', 'font-size': 14, fill: '#3a4250' }, labels.join(' / ')));
        });
    })(),
    // The order layer stays visible on every box regardless of stacking or
    // fork position, so it never reads as following an unrelated neighbour
    // (dogfood-3 F2a); the axis column gives the same number once per row.
    // Drawn outside the event's <a> so each event keeps exactly one <text>
    // (the label), which the reader/inspector click target relies on.
    input.events.map((e) => {
      const b = box(e.id);
      return h('text', { class: 'vs-event-layer-badge', x: n(b.x - 6), y: n(b.y + 14), 'text-anchor': 'end', 'font-size': 14, fill: '#3a4250', 'aria-hidden': 'true' }, String(e.layer));
    }),
    input.events.map((e) => {
      const b = box(e.id);
      const wait = e.kind === 'wait';
      const failure = e.kind === 'failure';
      return h('a', { class: `vs-node vs-event-box vs-kind-${e.kind}`, href: `#${DOM.canonicalId(e.id)}`, id: DOM.svgInstanceId(figureId, e.id), [DOM.attr.target]: e.id, [DOM.attr.interactive]: true, 'aria-label': `${e.label} (${[input.labelOf(e.actor), ...e.meta].join('; ')})` },
        h('rect', { x: n(b.x), y: n(b.y), width: n(b.w), height: n(b.h), rx: '6', ry: '6', fill: '#ffffff', stroke: failure ? '#b00020' : '#2f3a4a', 'stroke-width': failure ? '2' : '1.5', 'stroke-dasharray': wait ? '5 3' : undefined }),
        traceText(wrapped.get(e.id)!, b.x + b.w / 2, b.y + PAD - 2));
    }));
}
