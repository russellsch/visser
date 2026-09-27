// Pure conversion from a rounded graph layout to SVG (§9.3, §10.3, §10.5).
// Geometry uses attributes only (no inline style), so the CSP needs no
// 'unsafe-inline'. Every node and edge is an <a> instance of its canonical target.
import { DOM } from './dom-contract.ts';
import { h, type HNode } from './html.ts';
import { LINE_HEIGHT, round3, type GraphLayout, type Point } from './layout.ts';

export type SvgInput = {
  figureId: string;
  title: string;
  layout: GraphLayout;
  labelOf: (id: string) => string;
  roleOf: (id: string) => string | undefined;
  kindOf: (id: string) => string | undefined;
  relationship: (id: string) => { from: string; to: string } | undefined;
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
    layout.groups.map((g) => h('a', { class: 'ex-group', href: `#${DOM.canonicalId(g.id)}`, id: DOM.svgInstanceId(figureId, g.id), [DOM.attr.target]: g.id, [DOM.attr.interactive]: true, 'aria-label': `${input.labelOf(g.id)} (boundary)` },
      h('rect', { x: n(g.x + MARGIN), y: n(g.y + MARGIN), width: n(g.width), height: n(g.height), rx: '8', ry: '8', fill: '#f5f7fa', stroke: '#8a94a3', 'stroke-width': '1' }),
      h('text', { class: 'ex-group-label', x: n(g.x + MARGIN + 12), y: n(g.y + MARGIN + 20), 'font-size': 13, fill: '#3a4250' }, input.labelOf(g.id)))),
    layout.edges.map((e) => {
      const rel = input.relationship(e.id);
      const kind = input.kindOf(e.id) ?? 'relationship';
      const label = input.labelOf(e.id);
      const aria = rel ? `${input.labelOf(rel.from)}, ${label}, ${input.labelOf(rel.to)}` : label;
      const d = pathData(e.points);
      return h('a', { class: `ex-edge ex-kind-${kind}`, href: `#${DOM.canonicalId(e.id)}`, id: DOM.svgInstanceId(figureId, e.id), [DOM.attr.target]: e.id, [DOM.attr.rel]: e.id, [DOM.attr.interactive]: true, 'aria-label': aria },
        e.points.length > 1 ? h('path', { class: 'ex-hit', d, fill: 'none', stroke: 'transparent', 'stroke-width': '16', 'stroke-linecap': 'round' }) : null,
        e.points.length > 1 ? h('path', { class: 'ex-line', d, fill: 'none', stroke: '#444444', 'stroke-width': '1.5', 'marker-end': `url(#${marker})` }) : null,
        e.label ? h('rect', { class: 'ex-edge-label-bg', x: n(e.label.x + MARGIN), y: n(e.label.y + MARGIN), width: n(e.label.width), height: n(e.label.height), rx: '3', ry: '3', fill: '#ffffff' }) : null,
        e.label ? textLines(e.label.lines, e.label.x + MARGIN + e.label.width / 2, e.label.y + MARGIN, 'ex-edge-label') : null);
    }),
    layout.nodes.map((node) => {
      const role = input.roleOf(node.id);
      return h('a', { class: `ex-node${role ? ` ex-role-${role}` : ''}`, href: `#${DOM.canonicalId(node.id)}`, id: DOM.svgInstanceId(figureId, node.id), [DOM.attr.target]: node.id, [DOM.attr.interactive]: true, 'aria-label': role ? `${input.labelOf(node.id)} (${role})` : input.labelOf(node.id) },
        h('rect', { x: n(node.x + MARGIN), y: n(node.y + MARGIN), width: n(node.width), height: n(node.height), rx: '6', ry: '6', fill: '#ffffff', stroke: '#2f3a4a', 'stroke-width': '1.5' }),
        textLines(node.lines, node.x + MARGIN + node.width / 2, node.y + MARGIN + 8, 'ex-node-label'));
    }));
}
