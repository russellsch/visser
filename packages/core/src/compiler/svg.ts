// Pure conversion from a rounded graph layout to SVG (§9.3, §10.3, §10.5).
// Geometry uses attributes only (no inline style), so the CSP needs no
// 'unsafe-inline'. Every node and edge is an <a> instance of its canonical target.
import { DOM } from './dom-contract.ts';
import { h, type HNode } from './html.ts';
import { chooseLabelWidth, LINE_HEIGHT, MARKED_PAD_X, NODE_LABEL_WIDTHS, NODE_PAD_X, round3, textWidth, wrapText, type GraphLayout, type Point } from './layout.ts';
import { BAND_FILL, BAND_STROKE, BRANCH_BANDS, CATEGORY_HEX, catClasses, EVENT_CUES, filterToken, NODE_FILL, outline, styleFor, type Category, type PartStyle } from './encoding.ts';

export type SvgInput = {
  figureId: string;
  title: string;
  layout: GraphLayout;
  labelOf: (id: string) => string;
  roleOf: (id: string) => string | undefined; // architecture role: a class name and part of the aria-label
  noteOf?: (id: string) => string | undefined; // other families: descriptive text for the aria-label only
  kindOf: (id: string) => string | undefined;
  relationship: (id: string) => { from: string; to: string } | undefined;
  // Optional per-family encoding (docs/IMPROVEMENTS.md §3.2): the hue, the
  // shape, the line pattern, and the marks of a node or an edge. The value
  // word always stays in the lists and in the aria-label.
  nodeStyleOf?: (id: string) => PartStyle | undefined;
  edgeStyleOf?: (id: string) => PartStyle | undefined;
  // The word for an edge's line cue (kind, basis, or loss), for its aria-label.
  edgeNoteOf?: (id: string) => string | undefined;
  // Uses of defined terms in a label (docs/IMPROVEMENTS.md §13.3, §13.4).
  termsOf?: TermsOf;
  // The number of lines at the end of a node box that are muted metadata,
  // such as a task's `due` date (docs/IMPROVEMENTS.md §3.4, §4.4).
  mutedLinesOf?: (id: string) => number;
  // Figure interactions (docs/IMPROVEMENTS.md §14.9). The filter token of a
  // node or an edge, for the legend chips.
  filterOf?: (id: string) => string | undefined;
  // The `quantity` of an edge. The edge label already ends in "(quantity)";
  // the renderer mutes that part.
  edgeQuantityOf?: (id: string) => string | undefined;
  // The groups with `collapsed=true`, and the group of a node or the parent
  // of a group. For each such group the SVG holds a hidden fold box, a Fold
  // control, and proxy edges; the reader runtime shows them.
  collapsed?: readonly string[];
  parentOf?: (id: string) => string | undefined;
};

/** Split a label line into plain text and uses of defined terms. */
export type TermsOf = (text: string) => Array<string | { text: string; defId: string }>;

const MARGIN = 8;

function n(v: number): string {
  return String(round3(v));
}

function pathData(points: Point[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${n(p.x + MARGIN)},${n(p.y + MARGIN)}`).join(' ');
}

/**
 * The content of each line of one wrapped label. Each use of a defined term
 * is a nested tspan with the class `vs-term`, so it gets the dotted
 * underline and the definition bubble (docs/IMPROVEMENTS.md §13.4). The
 * label is already a link to its part, so the term is not a second link.
 * The terms are found in the whole label, so a term that wraps to the next
 * line is still found; each line then holds its own piece of the term. The
 * first use of a term in a label is underlined, and a later use is quiet
 * (§13.5).
 */
function labelContent(lines: readonly string[], termsOf: TermsOf | undefined, muted?: { from: number; to: number }): Array<Array<HNode | string>> {
  if (!termsOf && !muted) return lines.map((line) => [line]);
  const joined = lines.join(' ');
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }
  const out = lines.map(() => [] as Array<HNode | string>);
  const seen = new Set<string>();
  let pos = 0;
  for (const seg of termsOf ? termsOf(joined) : [joined]) {
    const text = typeof seg === 'string' ? seg : seg.text;
    const from = pos;
    const to = pos + text.length;
    pos = to;
    const quiet = typeof seg !== 'string' && seen.has(seg.defId);
    if (typeof seg !== 'string') seen.add(seg.defId);
    // The muted range (an edge quantity) cuts a segment in pieces.
    const cuts = [from, ...(muted ? [muted.from, muted.to] : []).filter((c) => c > from && c < to), to];
    for (let k = 0; k + 1 < cuts.length; k++) {
      const [c0, c1] = [cuts[k]!, cuts[k + 1]!];
      const quantity = muted !== undefined && c0 >= muted.from && c1 <= muted.to;
      lines.forEach((line, i) => {
        const a = Math.max(c0, starts[i]!);
        const b = Math.min(c1, starts[i]! + line.length);
        if (a >= b) return;
        const piece = joined.slice(a, b);
        out[i]!.push(quantity ? h('tspan', { class: 'vs-edge-quantity', 'fill-opacity': MUTED_OPACITY }, piece)
          : typeof seg === 'string' ? piece : h('tspan', { class: quiet ? 'vs-term vs-term-quiet' : 'vs-term', [DOM.attr.term]: seg.defId }, piece));
      });
    }
  }
  return out;
}

/** The range of "(quantity)" in the joined lines of an edge label (docs/IMPROVEMENTS.md §14.9). */
function quantityRange(lines: readonly string[], quantity: string | undefined): { from: number; to: number } | undefined {
  if (quantity === undefined) return undefined;
  const text = `(${quantity.split(/\s+/).filter((w) => w !== '').join(' ')})`;
  const at = lines.join(' ').lastIndexOf(text);
  return at < 0 ? undefined : { from: at, to: at + text.length };
}

// A muted line keeps the text colour of the theme at a lower opacity, so it
// stays readable in the light and the dark theme with no extra CSS.
const MUTED_OPACITY = '0.72';

function textLines(lines: string[], cx: number, top: number, className: string, termsOf?: TermsOf, muted = 0): HNode {
  // Terms are linked in the label only, not in the muted lines under it.
  const labelCount = Math.max(0, lines.length - muted);
  const content = labelContent(lines.slice(0, labelCount), termsOf);
  return h('text', { class: className, x: n(cx), y: n(top), 'text-anchor': 'middle', 'font-size': 14, fill: '#1a1a1a' },
    lines.map((line, i) => i < labelCount
      ? h('tspan', { x: n(cx), dy: i === 0 ? '1em' : String(LINE_HEIGHT) }, content[i])
      : h('tspan', { class: 'vs-node-meta', x: n(cx), dy: i === 0 ? '1em' : String(LINE_HEIGHT), 'fill-opacity': MUTED_OPACITY }, line)));
}

function arrowMarker(id: string, fill: string, className?: string): HNode {
  return h('marker', { id, class: className, viewBox: '0 0 10 10', refX: '10', refY: '5', markerWidth: '8', markerHeight: '8', orient: 'auto-start-reverse', markerUnits: 'userSpaceOnUse' },
    h('path', { d: 'M0,0 L10,5 L0,10 z', fill }));
}

/**
 * The line ends of a domain relation (docs/IMPROVEMENTS.md §5.3): a hollow
 * triangle at `to` (is-a) and a filled diamond at the owner (has).
 */
function triangleMarker(id: string): HNode {
  return h('marker', { id, viewBox: '0 0 12 12', refX: '11', refY: '6', markerWidth: '12', markerHeight: '12', orient: 'auto-start-reverse', markerUnits: 'userSpaceOnUse' },
    h('path', { class: 'vs-marker-hollow', d: 'M1,1 L11,6 L1,11 z', fill: NODE_FILL, stroke: '#444444', 'stroke-width': '1.5' }));
}

function diamondMarker(id: string): HNode {
  return h('marker', { id, viewBox: '0 0 18 10', refX: '1', refY: '5', markerWidth: '18', markerHeight: '10', orient: 'auto', markerUnits: 'userSpaceOnUse' },
    h('path', { d: 'M1,5 L9,1 L17,5 L9,9 z', fill: '#444444' }));
}

/** A small open ring at the start of a feedback edge (§3.2: "feedback with a loop marker"). */
function loopMark(points: Point[]): HNode | null {
  if (points.length < 2) return null;
  const [a, b] = [points[0]!, points[1]!];
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const cx = a.x + MARGIN + ((b.x - a.x) / len) * 6;
  const cy = a.y + MARGIN + ((b.y - a.y) / len) * 6;
  const r = 4;
  return h('path', { class: 'vs-edge-mark', d: `M${n(cx - r)},${n(cy)} a${r},${r} 0 1,0 ${r * 2},0 a${r},${r} 0 1,0 ${-r * 2},0 Z`, fill: NODE_FILL, stroke: '#444444', 'stroke-width': '1.5', 'aria-hidden': 'true' });
}

export function graphSvg(input: SvgInput): HNode {
  const { figureId, layout } = input;
  let width = layout.width + 2 * MARGIN;
  let height = layout.height + 2 * MARGIN;
  const marker = `m-${figureId}.arrow`;
  const edgeStyles = new Map(layout.edges.map((e) => [e.id, input.edgeStyleOf?.(e.id) ?? {}]));
  // One arrowhead per edge hue, in a fixed order, so a coloured line ends in a coloured head.
  const edgeCats = (Object.keys(CATEGORY_HEX) as Category[]).filter((c) => [...edgeStyles.values()].some((s) => s.cat === c));
  const markerFor = (s: PartStyle) => (s.cat ? `${marker}-${s.cat}` : marker);
  // Domain relation ends, defined only when a figure uses them, so other figures keep their bytes.
  const hasMark = (m: 'triangle' | 'diamond') => [...edgeStyles.values()].some((st) => st.marks?.includes(m));
  const endMarker = (st: PartStyle) => (st.marks?.includes('diamond') ? undefined : st.marks?.includes('triangle') ? `url(#${marker}-triangle)` : `url(#${markerFor(st)})`);
  type LayoutEdge = GraphLayout['edges'][number];
  // One edge: the authored route, or a proxy route to a fold box (docs/IMPROVEMENTS.md §14.9).
  const edgeElement = (e: LayoutEdge, proxy?: Proxy) => {
    const rel = input.relationship(e.id);
    const kind = input.kindOf(e.id) ?? 'relationship';
    const label = input.labelOf(e.id);
    const note = input.edgeNoteOf?.(e.id);
    const quantity = input.edgeQuantityOf?.(e.id);
    const said = quantity ? `${label} (${quantity})` : label;
    const aria = `${rel ? `${input.labelOf(rel.from)}, ${said}, ${input.labelOf(rel.to)}` : said}${note ? ` (${note})` : ''}`;
    const d = pathData(e.points);
    const style = edgeStyles.get(e.id)!;
    const cats = catClasses(style);
    const stroke = style.cat ? CATEGORY_HEX[style.cat].stroke : '#444444';
    const labelFill = style.cat && style.labelHue ? CATEGORY_HEX[style.cat].stroke : '#1a1a1a';
    return h('a', {
      class: `vs-edge vs-kind-${kind}${cats ? ` ${cats}` : ''}${style.labelHue ? ' vs-label-hue' : ''}`, href: `#${DOM.canonicalId(e.id)}`,
      id: proxy?.id ?? DOM.svgInstanceId(figureId, e.id), [DOM.attr.target]: e.id, [DOM.attr.rel]: e.id, [DOM.attr.interactive]: true, 'aria-label': aria,
      [DOM.attr.filter]: input.filterOf?.(e.id),
      ...(proxy ? { [DOM.attr.proxyFor]: e.id, [DOM.attr.proxyFrom]: proxy.from, [DOM.attr.proxyTo]: proxy.to, [DOM.attr.proxyEnds]: proxy.ends, hidden: true } : {}),
    },
      e.points.length > 1 ? h('path', { class: 'vs-hit', d, fill: 'none', stroke: 'transparent', 'stroke-width': '16', 'stroke-linecap': 'round' }) : null,
      e.points.length > 1 ? h('path', { class: 'vs-line', d, fill: 'none', stroke, 'stroke-width': '1.5', 'stroke-dasharray': style.dash, 'marker-start': style.marks?.includes('diamond') ? `url(#${marker}-diamond)` : undefined, 'marker-end': endMarker(style) }) : null,
      style.marks?.includes('loop') ? loopMark(e.points) : null,
      e.label ? h('rect', { class: 'vs-edge-label-bg', x: n(e.label.x + MARGIN), y: n(e.label.y + MARGIN), width: n(e.label.width), height: n(e.label.height), rx: '3', ry: '3', fill: '#ffffff' }) : null,
      e.label ? h('text', { class: 'vs-edge-label', x: n(e.label.x + MARGIN + e.label.width / 2), y: n(e.label.y + MARGIN), 'text-anchor': 'middle', 'font-size': 14, fill: labelFill },
        ((content) => e.label!.lines.map((_, i) => h('tspan', { x: n(e.label!.x + MARGIN + e.label!.width / 2), dy: i === 0 ? '1em' : String(LINE_HEIGHT) }, content[i])))(labelContent(e.label.lines, input.termsOf, quantityRange(e.label.lines, quantity)))) : null);
  };
  const folds = foldPlan(input);
  for (const proxy of folds.proxies) {
    const rect = proxy.callout?.rect ?? proxy.edge.label;
    if (rect) {
      width = Math.max(width, rect.x + rect.width + 2 * MARGIN);
      height = Math.max(height, rect.y + rect.height + 2 * MARGIN);
    }
    if (proxy.callout) {
      width = Math.max(width, proxy.callout.keyPoint.x + 7 + 2 * MARGIN);
      height = Math.max(height, proxy.callout.keyPoint.y + 7 + 2 * MARGIN);
    }
  }
  const boxOf = new Map(folds.boxes.map((b) => [b.group, b]));
  return h('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 0 ${n(width)} ${n(height)}`, width: n(width), height: n(height), role: 'group', 'aria-label': input.title, focusable: 'false' },
    h('defs', {},
      arrowMarker(marker, '#444444'),
      edgeCats.map((c) => arrowMarker(`${marker}-${c}`, CATEGORY_HEX[c].stroke, `vs-cat vs-cat-${c}`)),
      hasMark('triangle') ? triangleMarker(`${marker}-triangle`) : null,
      hasMark('diamond') ? diamondMarker(`${marker}-diamond`) : null),
    // Each group, then its fold box and its Fold control when it can fold
    // (docs/IMPROVEMENTS.md §14.9). The fold box is under the edges, so no
    // outline covers an arrowhead (phase 6b review F3). The Fold control comes
    // right after its group, so the next Tab after a keyboard unfold goes on
    // into the figure, not out of it (F9).
    layout.groups.map((g) => [
      h('a', { class: 'vs-group', href: `#${DOM.canonicalId(g.id)}`, id: DOM.svgInstanceId(figureId, g.id), [DOM.attr.target]: g.id, [DOM.attr.interactive]: true, 'aria-label': `${input.labelOf(g.id)} (boundary)` },
        h('rect', { x: n(g.x + MARGIN), y: n(g.y + MARGIN), width: n(g.width), height: n(g.height), rx: '8', ry: '8', fill: '#f5f7fa', stroke: '#8a94a3', 'stroke-width': '1' }),
        h('text', { class: 'vs-group-label', x: n(g.x + MARGIN + 12), y: n(g.y + MARGIN + 20), 'font-size': 13, fill: '#3a4250' }, labelContent([input.labelOf(g.id)], input.termsOf)[0])),
      boxOf.has(g.id) ? foldBox(boxOf.get(g.id)!, input.labelOf(g.id)) : null,
      boxOf.has(g.id) ? foldToggle(boxOf.get(g.id)!, input.labelOf(g.id)) : null,
    ]),
    layout.edges.map((e) => edgeElement(e)),
    folds.proxies.map((p) => edgeElement(p.edge, p)),
    layout.nodes.map((node) => {
      const role = input.roleOf(node.id);
      const style = input.nodeStyleOf?.(node.id) ?? {};
      const note = role ?? input.noteOf?.(node.id);
      const roleClass = role && /^[a-z][a-z-]*$/.test(role) ? ` vs-role-${role}` : '';
      const cats = catClasses(style);
      const classes = `vs-node${roleClass}${style.className ? ` ${style.className}` : ''}${cats ? ` ${cats}` : ''}`;
      return h('a', { class: classes, href: `#${DOM.canonicalId(node.id)}`, id: DOM.svgInstanceId(figureId, node.id), [DOM.attr.target]: node.id, [DOM.attr.interactive]: true, 'aria-label': note ? `${input.labelOf(node.id)} (${note})` : input.labelOf(node.id), [DOM.attr.filter]: input.filterOf?.(node.id) },
        outline(style, node.x + MARGIN, node.y + MARGIN, node.width, node.height),
        textLines(node.lines, node.x + MARGIN + node.width / 2, node.y + MARGIN + 8, 'vs-node-label', input.termsOf, input.mutedLinesOf?.(node.id) ?? 0));
    }),
    // A terminal proxy-label fallback sits in the right gutter. It overlays
    // nodes, so its two matching keys remain visible even when a node covers
    // every route point, and shares the proxy metadata for fold visibility.
    folds.proxies.map((proxy) => {
      const callout = proxy.callout;
      if (!callout) return null;
      const { rect, attachment, keyPoint, text } = callout;
      const keyX = rect.x + 10, keyY = rect.y + 10;
      return h('a', { class: 'vs-edge vs-proxy-callout', href: `#${DOM.canonicalId(proxy.edge.id)}`, [DOM.attr.target]: proxy.edge.id, [DOM.attr.rel]: proxy.edge.id, [DOM.attr.interactive]: true, [DOM.attr.filter]: input.filterOf?.(proxy.edge.id), [DOM.attr.proxyFor]: proxy.edge.id, [DOM.attr.proxyFrom]: proxy.from, [DOM.attr.proxyTo]: proxy.to, [DOM.attr.proxyEnds]: proxy.ends, tabindex: '-1', 'aria-hidden': 'true', hidden: true },
        attachment.x !== keyPoint.x || attachment.y !== keyPoint.y ? h('path', { class: 'vs-proxy-callout-stem', d: pathData([attachment, keyPoint]), fill: 'none', 'aria-hidden': 'true' }) : null,
        h('rect', { class: 'vs-proxy-callout-key', x: n(keyPoint.x + MARGIN - 7), y: n(keyPoint.y + MARGIN - 7), width: '14', height: '14', rx: '7', ry: '7', 'aria-hidden': 'true' }),
        h('text', { class: 'vs-proxy-callout-key-text', x: n(keyPoint.x + MARGIN), y: n(keyPoint.y + MARGIN + 4), 'text-anchor': 'middle', 'font-size': '12', 'aria-hidden': 'true' }, callout.key),
        h('rect', { class: 'vs-proxy-callout-bg', x: n(rect.x + MARGIN), y: n(rect.y + MARGIN), width: n(rect.width), height: n(rect.height), rx: '3', ry: '3' }),
        h('rect', { class: 'vs-proxy-callout-key', x: n(keyX + MARGIN - 7), y: n(keyY + MARGIN - 7), width: '14', height: '14', rx: '7', ry: '7', 'aria-hidden': 'true' }),
        h('text', { class: 'vs-proxy-callout-key-text', x: n(keyX + MARGIN), y: n(keyY + MARGIN + 4), 'text-anchor': 'middle', 'font-size': '12', 'aria-hidden': 'true' }, callout.key),
        h('text', { class: 'vs-proxy-callout-context', x: n(rect.x + MARGIN + 20), y: n(rect.y + MARGIN + 15), 'font-size': '12' }, text),
        h('text', { class: 'vs-edge-label', x: n(rect.x + MARGIN + rect.width / 2), y: n(rect.y + MARGIN + 18), 'text-anchor': 'middle', 'font-size': 14 },
          proxy.edge.label!.lines.map((line, i) => h('tspan', { x: n(rect.x + MARGIN + rect.width / 2), dy: i === 0 ? '1em' : String(LINE_HEIGHT) }, line))));
    }));
}

// ---------------------------------------------------------------------------
// Collapsible groups (docs/IMPROVEMENTS.md §14.9). The compiler owns the
// geometry: the full layout stays as it is, and for each `collapsed=true`
// group the SVG also holds a fold box in the middle of the group, a Fold
// control at its top right, and a proxy route for each edge with one end
// inside it. All three are `hidden`; the reader runtime folds a group by
// hiding its parts and showing these. Without JavaScript the group is
// unfolded. Proxy routes keep the part of the authored route outside the
// folded groups, and join it to the fold box with straight lines inside the
// group, so no proxy crosses a part that stays visible.

type Rect = { x: number; y: number; width: number; height: number };
type FoldBox = Rect & { group: string; count: number; hide: string[]; area: Rect };
type ProxyCallout = { rect: Rect; attachment: Point; keyPoint: Point; text: string; key: string };
type Proxy = { edge: GraphLayout['edges'][number]; id: string; from: string; to: string; ends: string; callout?: ProxyCallout };

const FOLD_BOX_HEIGHT = LINE_HEIGHT + 16;
// The Fold control is a 44 × 24 px target (WCAG 2.5.8; phase 6b review F10).
// It sits in the 30 px label band at the top of the group, over no node.
const FOLD_TOGGLE_WIDTH = 44;
const FOLD_TOGGLE_HEIGHT = 24;
const FOLD_JOIN_INSET = 3; // a join line meets the box this far from a corner, or more

/** The text of a fold box: the group label and the count of its nodes, such as "Order service · 4". */
function foldText(label: string, count: number): { label: string; count: string } {
  return { label, count: ` · ${count}` };
}

/** Where a route leaves a folded group: the point, the side of the group, and the index of the first point outside. */
type Exit = { at: Point; side: 'left' | 'right' | 'top' | 'bottom'; index: number };

function exitOf(points: Point[], area: Rect): Exit | undefined {
  const i = points.findIndex((p, k) => k > 0 && outside(p, area));
  if (i < 0) return undefined;
  const at = exitPoint(points[i - 1]!, points[i]!, area);
  const eps = 0.01;
  const side = Math.abs(at.x - area.x) < eps ? 'left'
    : Math.abs(at.x - (area.x + area.width)) < eps ? 'right'
      : Math.abs(at.y - area.y) < eps ? 'top' : 'bottom';
  return { at, side, index: i };
}

function foldPlan(input: SvgInput): { boxes: FoldBox[]; proxies: Proxy[] } {
  const collapsed = input.collapsed ?? [];
  const parentOf = input.parentOf;
  if (collapsed.length === 0 || !parentOf) return { boxes: [], proxies: [] };
  const { layout, figureId } = input;
  const groupRects = new Map(layout.groups.map((g) => [g.id, g]));
  // True when `id` (a node or a group) is inside `group`, at any depth.
  const inside = (id: string, group: string): boolean => {
    let p = parentOf(id);
    for (let i = 0; p !== undefined && i < 1000; i++, p = parentOf(p)) if (p === group) return true;
    return false;
  };
  // The collapsible groups around a node, innermost first.
  const chain = (id: string): string[] => collapsed.filter((g) => inside(id, g)).sort((a, b) => (inside(a, b) ? -1 : inside(b, a) ? 1 : 0));
  const ends = new Map(layout.edges.map((e) => [e.id, input.relationship(e.id)]));
  const boxes: FoldBox[] = [];
  for (const group of collapsed) {
    const area = groupRects.get(group);
    if (!area) continue;
    const nodes = layout.nodes.filter((nd) => inside(nd.id, group)).map((nd) => nd.id);
    const groups = layout.groups.filter((g) => inside(g.id, group)).map((g) => g.id);
    const edges = layout.edges.filter((e) => {
      const r = ends.get(e.id);
      return r !== undefined && inside(r.from, group) && inside(r.to, group);
    }).map((e) => e.id);
    const text = foldText(input.labelOf(group), nodes.length);
    const width = Math.min(area.width, Math.ceil(textWidth(text.label + text.count) + 2 * NODE_PAD_X));
    const height = Math.min(area.height, FOLD_BOX_HEIGHT);
    boxes.push({
      group, count: nodes.length, hide: [...nodes, ...groups, ...edges], area,
      x: round3(area.x + (area.width - width) / 2), y: round3(area.y + (area.height - height) / 2), width, height,
    });
  }
  const boxOf = new Map(boxes.map((b) => [b.group, b]));
  // Every fold combination of every edge with an end in a collapsible group.
  type Combo = { e: GraphLayout['edges'][number]; from: string; to: string; ends: string };
  const combos: Combo[] = [];
  for (const e of layout.edges) {
    const r = ends.get(e.id);
    if (!r || e.points.length < 2) continue;
    const fromChain = chain(r.from).filter((g) => boxOf.has(g));
    const toChain = chain(r.to).filter((g) => boxOf.has(g));
    if (fromChain.length === 0 && toChain.length === 0) continue;
    for (const f of ['', ...fromChain]) {
      for (const t of ['', ...toChain]) {
        // A combination that cannot show: no fold, one fold for both ends,
        // or a fold that holds the other end too.
        if ((f === '' && t === '') || f === t || (t !== '' && inside(r.from, t)) || (f !== '' && inside(r.to, f))) continue;
        combos.push({ e, from: f, to: t, ends: `${r.from} ${r.to}` });
      }
    }
  }
  // Each edge end that meets a fold box gets its own point on the face of
  // the box that looks at the side where the route leaves the group. The
  // points are in the order of the exits along that side, so no two proxies
  // share a segment (phase 6b review F2). An edge end keeps one point in
  // every fold state.
  const slots = new Map<string, { k: number; n: number }>();
  const faces = new Map<string, Array<{ key: string; u: number }>>();
  const endKey = (edge: string, which: 'from' | 'to', group: string) => `${edge}|${which}|${group}`;
  for (const c of combos) {
    for (const [which, group] of [['from', c.from], ['to', c.to]] as const) {
      if (group === '') continue;
      const box = boxOf.get(group)!;
      const exit = exitOf(which === 'from' ? c.e.points : [...c.e.points].reverse(), box.area);
      if (!exit) continue;
      const key = endKey(c.e.id, which, group);
      const face = `${group}|${exit.side}`;
      const list = faces.get(face) ?? [];
      if (!list.some((x) => x.key === key)) list.push({ key, u: exit.side === 'left' || exit.side === 'right' ? exit.at.y : exit.at.x });
      faces.set(face, list);
    }
  }
  for (const list of faces.values()) {
    list.sort((a, b) => a.u - b.u || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    list.forEach((x, k) => slots.set(x.key, { k, n: list.length }));
  }
  // A visible endpoint requires its outermost folded ancestor, or every
  // ancestor open. Compatible requirements can hold in the same fold state.
  type State = Map<string, boolean>;
  const endpointState = (id: string, standIn = ''): State => new Map(chain(id)
    .filter((g) => standIn === '' || g === standIn || inside(standIn, g))
    .map((g) => [g, g === standIn]));
  const edgeState = (from: string, to: string, f = '', t = ''): State => new Map([...endpointState(from, f), ...endpointState(to, t)]);
  const compatible = (a: State, b: State) => [...a].every(([g, value]) => !b.has(g) || b.get(g) === value);
  const fixed: Array<{ rect: Rect; state: State }> = [
    ...layout.nodes.map((node) => ({ rect: node, state: endpointState(node.id) })),
    ...boxes.map((box) => ({ rect: box, state: new Map([...endpointState(box.group), [box.group, true] as const]) })),
    ...layout.edges.flatMap((edge) => {
      const rel = ends.get(edge.id);
      return edge.label && rel ? [{ rect: edge.label, state: edgeState(rel.from, rel.to) }] : [];
    }),
  ];
  const placed: Array<{ rect: Rect; state: State }> = [];
  const proxies: Proxy[] = [];
  for (const c of combos) {
    let points = c.e.points;
    const folded: Rect[] = [];
    if (c.from !== '') {
      points = toBox(points, boxOf.get(c.from)!, slots.get(endKey(c.e.id, 'from', c.from)));
      folded.push(boxOf.get(c.from)!.area);
    }
    if (c.to !== '') {
      points = toBox([...points].reverse(), boxOf.get(c.to)!, slots.get(endKey(c.e.id, 'to', c.to))).reverse();
      folded.push(boxOf.get(c.to)!.area);
    }
    const e = c.e;
    const rel = ends.get(e.id)!;
    const state = edgeState(rel.from, rel.to, c.from, c.to);
    const obstacles = [...fixed, ...placed].filter((item) => compatible(state, item.state)).map((item) => item.rect);
    const calloutText = `${input.labelOf(rel.from)} → ${input.labelOf(e.id)} → ${input.labelOf(rel.to)}`;
    const calloutSize = e.label ? calloutSizeFor(e.label, calloutText) : undefined;
    const placement = e.label && [...folded, ...obstacles].some((a) => overlaps(e.label!, a))
      ? labelAt(points, folded, obstacles, e.label, layout, calloutSize) : undefined;
    const label = e.label && placement ? { ...e.label, x: placement.x, y: placement.y } : e.label;
    const callout = label && placement?.callout && calloutSize ? calloutFor(points, label, calloutSize, calloutText) : undefined;
    if (label) placed.push({ rect: callout?.rect ?? label, state });
    proxies.push({
      edge: { id: e.id, points, ...(label ? { label } : {}) },
      id: `${DOM.svgInstanceId(figureId, e.id)}~${c.from || '-'}~${c.to || '-'}`, from: c.from, to: c.to, ends: c.ends, callout,
    });
  }
  const calloutKeys = new Map([...new Set(proxies.flatMap((p) => p.callout ? [p.edge.id] : []))].sort().map((id, i) => [id, String(i + 1)]));
  for (const proxy of proxies) if (proxy.callout) proxy.callout.key = calloutKeys.get(proxy.edge.id)!;
  // Place foreground route keys against full panels and earlier co-visible
  // keys. One downward pass over sorted obstacles is finite, including when
  // distinct attachment points are closer than the key diameter. A stem keeps
  // each displaced key attached to its own route.
  const keyObstacles: Array<{ rect: Rect; state: State }> = proxies.flatMap((proxy) => {
    const rel = ends.get(proxy.edge.id)!;
    return proxy.callout ? [{ rect: proxy.callout.rect, state: edgeState(rel.from, rel.to, proxy.from, proxy.to) }] : [];
  });
  for (const proxy of proxies) if (proxy.callout) {
    const callout = proxy.callout, rel = ends.get(proxy.edge.id)!;
    const state = edgeState(rel.from, rel.to, proxy.from, proxy.to);
    const rect = { x: Math.max(0, callout.attachment.x - 7), y: Math.max(0, callout.attachment.y - 7), width: 14, height: 14 };
    for (const obstacle of keyObstacles.filter((item) => compatible(state, item.state)).map((item) => item.rect).sort((a, b) => a.y - b.y)) {
      if (overlaps(rect, { x: obstacle.x - 2, y: obstacle.y - 2, width: obstacle.width + 4, height: obstacle.height + 4 })) {
        rect.y = obstacle.y + obstacle.height + 2;
      }
    }
    callout.keyPoint = { x: round3(rect.x + 7), y: round3(rect.y + 7) };
    keyObstacles.push({ rect, state });
  }
  return { boxes, proxies };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function outside(p: Point, r: Rect): boolean {
  return p.x < r.x || p.x > r.x + r.width || p.y < r.y || p.y > r.y + r.height;
}

/** Where the segment a→b leaves `r`, with `a` inside `r` (Liang–Barsky clipping). */
function exitPoint(a: Point, b: Point, r: Rect): Point {
  const dx = b.x - a.x, dy = b.y - a.y;
  let t1 = 1;
  for (const [p, q] of [[dx, r.x + r.width - a.x], [-dx, a.x - r.x], [dy, r.y + r.height - a.y], [-dy, a.y - r.y]] as const) {
    if (p > 0) t1 = Math.min(t1, q / p);
  }
  t1 = Math.max(0, t1);
  return { x: round3(a.x + t1 * dx), y: round3(a.y + t1 * dy) };
}

/**
 * A route that starts at the fold box `box` in place of its first point: the
 * part of `points` after it leaves the group, joined to the box inside the
 * group. The join starts at point k of n on the box face that looks at the
 * side where the route leaves, runs straight out from the face to a level
 * of its own, then along that level, then straight to the exit: a Z, or one
 * line when the two ends are in line.
 */
function toBox(points: Point[], box: FoldBox, slot: { k: number; n: number } | undefined): Point[] {
  const area = box.area;
  const exit = exitOf(points, area);
  const cx = round3(box.x + box.width / 2);
  if (!exit) return [{ x: cx, y: round3(box.y + box.height) }, ...points.slice(1)];
  const { k, n } = slot ?? { k: 0, n: 1 };
  // Work in the axes of the side: `x` along the side, `y` across it.
  const across = exit.side === 'left' || exit.side === 'right';
  const flip = (p: Point): Point => (across ? { x: p.y, y: p.x } : p);
  const X = flip(exit.at);
  const lo = across ? box.y : box.x;
  const len = across ? box.height : box.width;
  const face = exit.side === 'left' ? box.x : exit.side === 'right' ? box.x + box.width : exit.side === 'top' ? box.y : box.y + box.height;
  const inset = Math.min(FOLD_JOIN_INSET, len / 2);
  const u = round3(lo + inset + ((k + 1) * (len - 2 * inset)) / (n + 1));
  const level = round3(face + ((X.y - face) * (k + 1)) / (n + 1));
  const join = (Math.abs(u - X.x) < 0.01 ? [{ x: u, y: face }] : [{ x: u, y: face }, { x: u, y: level }, { x: X.x, y: level }]).map(flip);
  const route = [...join, exit.at, ...points.slice(exit.index)].map((p) => ({ x: round3(p.x), y: round3(p.y) }));
  return route.filter((p, i) => i === 0 || p.x !== route[i - 1]!.x || p.y !== route[i - 1]!.y);
}

/** Try external segments by length, then the original and obstacle boundaries.
 * If none fits, a right gutter guarantees a free rectangle in bounded work;
 * graphSvg includes that gutter in its viewBox. No unbounded search is needed.
 */
function labelAt(points: Point[], folded: Rect[], obstacles: Rect[], label: Rect, layout: { width: number; height: number }, calloutSize: Pick<Rect, 'width' | 'height'> | undefined): { x: number; y: number; callout?: true } {
  const blocked = [...folded, ...obstacles];
  const free = (p: Point, size: Pick<Rect, 'width' | 'height'> = label) => p.x >= 0 && p.y >= 0 && p.y + size.height <= layout.height
    && !blocked.some((r) => overlaps({ ...size, ...p }, r));
  const candidates = points.slice(1).map((b, k) => {
    const a = points[k]!;
    return { x: round3((a.x + b.x - label.width) / 2), y: round3((a.y + b.y - label.height) / 2), len: Math.hypot(b.x - a.x, b.y - a.y) };
  }).sort((a, b) => b.len - a.len);
  for (const p of candidates) if (free(p)) return { x: p.x, y: p.y };
  if (free(label)) return { x: label.x, y: label.y };
  // At most four candidates per obstacle, in source order.
  for (const r of blocked) {
    for (const p of [
      { x: r.x + r.width + 4, y: r.y }, { x: r.x - label.width - 4, y: r.y },
      { x: r.x, y: r.y + r.height + 4 }, { x: r.x, y: r.y - label.height - 4 },
    ]) if (calloutSize && free(p, calloutSize)) {
      const placed = { ...label, x: round3(p.x), y: round3(p.y) };
      return { x: placed.x, y: placed.y, callout: true };
    }
  }
  const right = blocked.reduce((x, r) => Math.max(x, r.x + r.width), layout.width);
  const placed = { ...label, x: round3(right + 4), y: 0 };
  return { x: placed.x, y: placed.y, callout: true };
}

function calloutSizeFor(label: Rect, text: string): Pick<Rect, 'width' | 'height'> {
  return { width: Math.max(label.width, Math.ceil(textWidth(text) + 30)), height: label.height + LINE_HEIGHT + 2 };
}

/** The terminal fallback's foreground panel and its deterministic route key. */
function calloutFor(points: Point[], label: Rect, size: Pick<Rect, 'width' | 'height'>, text: string): ProxyCallout {
  const rect = { ...label, ...size };
  const target = { x: label.x + label.width / 2, y: label.y + label.height / 2 };
  let attachment = points[0]!;
  let distance = Number.POSITIVE_INFINITY;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!;
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((target.x - a.x) * dx + (target.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    const candidate = { x: round3(a.x + t * dx), y: round3(a.y + t * dy) };
    const d = (target.x - candidate.x) ** 2 + (target.y - candidate.y) ** 2;
    if (d < distance) {
      attachment = candidate;
      distance = d;
    }
  }
  return { rect, attachment, keyPoint: attachment, text, key: '' };
}

/** The fold box of a group: a button that unfolds the group. It is hidden until the runtime folds the group. */
function foldBox(b: FoldBox, label: string): HNode {
  const text = foldText(label, b.count);
  const cx = b.x + MARGIN + b.width / 2;
  return h('g', { class: 'vs-fold', [DOM.attr.fold]: b.group, [DOM.attr.foldHide]: b.hide.join(' '), role: 'button', tabindex: '0', 'aria-label': `Unfold ${label} (${b.count} ${b.count === 1 ? 'node' : 'nodes'})`, hidden: true },
    // A second outline behind the box: the box stands for several parts.
    h('rect', { class: 'vs-fold-back', x: n(b.x + MARGIN + 4), y: n(b.y + MARGIN + 4), width: n(b.width), height: n(b.height), rx: '8', ry: '8', fill: '#f5f7fa', stroke: '#8a94a3', 'stroke-width': '1' }),
    h('rect', { class: 'vs-fold-shape', x: n(b.x + MARGIN), y: n(b.y + MARGIN), width: n(b.width), height: n(b.height), rx: '8', ry: '8', fill: '#f5f7fa', stroke: '#8a94a3', 'stroke-width': '1.5' }),
    h('text', { class: 'vs-fold-label', x: n(cx), y: n(b.y + MARGIN + 8), 'text-anchor': 'middle', 'font-size': 14, fill: '#1a1a1a' },
      h('tspan', { x: n(cx), dy: '1em' }, text.label, h('tspan', { class: 'vs-fold-count', 'fill-opacity': MUTED_OPACITY }, text.count))));
}

/** The Fold control at the top right of an unfolded group. It is hidden until the runtime runs. */
function foldToggle(b: FoldBox, label: string): HNode {
  const right = b.area.x + MARGIN + b.area.width - 6;
  const top = b.area.y + MARGIN + 3;
  return h('g', { class: 'vs-fold-toggle', [DOM.attr.foldToggle]: b.group, role: 'button', tabindex: '0', 'aria-label': `Fold ${label}`, hidden: true },
    h('rect', { x: n(right - FOLD_TOGGLE_WIDTH), y: n(top), width: n(FOLD_TOGGLE_WIDTH), height: n(FOLD_TOGGLE_HEIGHT), rx: '4', ry: '4', fill: '#ffffff', stroke: '#8a94a3', 'stroke-width': '1' }),
    h('text', { x: n(right - FOLD_TOGGLE_WIDTH / 2), y: n(top + 16), 'text-anchor': 'middle', 'font-size': 12, fill: '#3a4250' }, 'Fold'));
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
  meta: string[]; // generated lines shown under the label, such as the message receiver
  time?: string; // the generated "at T" line on a time scale, after `meta`; the reader mutes only this line
  // The `time` of the event on a time scale. Events in one slot stack in
  // time order, not in authored order (phase 6a review C6).
  timeValue?: number;
  notes?: string[]; // generated facts for the aria-label only: kind and branch (default: meta and time)
  branch?: string; // branch ID (dogfood-3 F2)
};

// A branch that mutually excludes one or more others (§9.4). Branches that do
// not declare `exclusiveWith` render as before (no sub-column, no fork mark):
// only a real fork needs the side-by-side treatment (dogfood-3 F2).
export type TraceSvgBranch = { id: string; label: string; exclusiveWith: string[] };

export type TraceSvgInput = {
  figureId: string;
  title: string;
  // `implicit`: the one lane of a time-scaled trace with no actors
  // (docs/IMPROVEMENTS.md §14.6). It has a lifeline and no header.
  actors: Array<{ id: string; label: string; implicit?: boolean }>;
  events: TraceSvgEvent[];
  orders: Array<{ id: string; from: string; to: string }>; // relationship ID, prerequisite event, event
  messages: Array<{ event: string; to: string }>; // event ID, receiving actor ID
  branches: TraceSvgBranch[];
  labelOf: (id: string) => string;
  // The figure shows hue only when its events use 2 or more kinds (§2.1).
  hue?: boolean;
  // Uses of defined terms in actor and event labels (docs/IMPROVEMENTS.md §13.4).
  termsOf?: TermsOf;
};

const AXIS_WIDTH = 64;
// Event box widths, narrowest first: the node label widths with the node
// padding, so the narrowest box is 150 px. All boxes in one lane have one
// width, which chooseLabelWidth selects as for a node (review F-15).
const BOX_WIDTHS = NODE_LABEL_WIDTHS.map((w) => w + 2 * NODE_PAD_X);
const BOX_WIDTH = BOX_WIDTHS[0]!;
const GUTTER = 40;
const SUB_GUTTER = 24; // gap between two exclusive-branch sub-columns in one lane
const VGAP = 22;
const PAD = 8;
const BAND_PAD = 6; // space between a branch band and the boxes in it
const HEADING_GAP = 6; // space between a branch heading and the box under it
const BAND_TOP = 4; // offset of a branch band below the top of its row

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

/** The generated lines under an event label, in box order: `meta`, then the time. */
function metaLines(e: TraceSvgEvent): string[] {
  return e.time === undefined ? e.meta : [...e.meta, e.time];
}

function traceText(lines:Array<{ text: string; className: string }>, x: number, top: number, termsOf?: TermsOf): HNode {
  // Terms are linked in the event label only, not in the generated lines under it.
  const labelLines = lines.filter((l) => l.className === 'vs-trace-label').map((l) => l.text);
  const content = labelContent(labelLines, termsOf);
  return h('text', { class: 'vs-trace-text', x: n(x), y: n(top), 'text-anchor': 'middle', 'font-size': 14, fill: '#1a1a1a' },
    lines.map((line, i) => h('tspan', { class: line.className, x: n(x), dy: i === 0 ? '1em' : String(LINE_HEIGHT) },
      line.className === 'vs-trace-label' ? content[i] : line.text)));
}

export function traceSvg(input: TraceSvgInput): HNode {
  const { figureId } = input;
  const layers = Math.max(1, ...input.events.map((e) => e.layer));
  // The style of each event. A failure has a "✕" mark in its right padding,
  // so its label keeps the wider padding on each side and stays centred.
  const styleOf = new Map(input.events.map((e) => [e.id, styleFor(EVENT_CUES[e.kind], input.hue ?? false)]));
  // An observation has its evidence mark in the right padding (§14.6), as a failure has its cross.
  const inset = (e: TraceSvgEvent) => 2 * (styleOf.get(e.id)!.marks?.some((m) => m === 'cross' || m === 'evidence') ? MARKED_PAD_X : PAD);
  // One box width per lane: the rule of chooseLabelWidth, over the lane's events.
  const laneBoxWidth = new Map(input.actors.map((a) => {
    const own = input.events.filter((e) => e.actor === a.id);
    const width = own.length === 0 ? BOX_WIDTH : chooseLabelWidth(own.map((e) => ({ label: e.label, extra: metaLines(e), inset: inset(e) })), BOX_WIDTHS, BOX_WIDTHS[2]!);
    return [a.id, width];
  }));
  const boxW = (actor: string) => laneBoxWidth.get(actor) ?? BOX_WIDTH;
  const wrapped = new Map(input.events.map((e) => {
    const textWidth = boxW(e.actor) - inset(e);
    return [e.id, [
      ...wrapText(e.label, textWidth).map((text) => ({ text, className: 'vs-trace-label' })),
      ...e.meta.flatMap((m) => wrapText(m, textWidth).map((text) => ({ text, className: 'vs-trace-meta' }))),
      ...(e.time === undefined ? [] : wrapText(e.time, textWidth).map((text) => ({ text, className: 'vs-trace-meta vs-trace-time' }))),
    ]];
  }));
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
  const boxRegionWidth = (slots: number, bw = BOX_WIDTH) => slots * bw + (slots - 1) * SUB_GUTTER;
  const laneWidth = (slots: number, bw = BOX_WIDTH) => boxRegionWidth(slots, bw) + GUTTER;
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
    laneX += laneWidth(actorSlots.get(a.id)!, boxW(a.id));
  }
  if (input.actors.length === 0) laneX += laneWidth(1); // keep a minimum width for an empty trace
  const boxX = (e: TraceSvgEvent): number => {
    const left = colLeft.get(e.actor) ?? MARGIN + AXIS_WIDTH;
    const slots = actorSlots.get(e.actor) ?? 1;
    const bw = boxW(e.actor);
    const s = slotInfo(e);
    return s ? left + GUTTER / 2 + s.slot * (bw + SUB_GUTTER) : left + GUTTER / 2 + (boxRegionWidth(slots, bw) - bw) / 2;
  };
  const laneCenterX = (actor: string): number => (colLeft.get(actor) ?? MARGIN + AXIS_WIDTH) + GUTTER / 2 + boxRegionWidth(actorSlots.get(actor) ?? 1, boxW(actor)) / 2;

  // Events of one actor, in one layer, and in one branch sub-column (or the
  // shared main column) stack inside that slot; different sub-columns never
  // share vertical space, so one branch's box cannot sit between two of another's.
  const slotTop = new Map<string, number>(); // offset of the box inside its row+sub-column
  const tallestInRow = new Map<number, number>();
  for (let layer = 1; layer <= layers; layer++) {
    let tallest = 0;
    for (const a of input.actors) {
      const bySlot = new Map<string, TraceSvgEvent[]>();
      for (const e of input.events.filter((x) => x.actor === a.id && x.layer === layer)) {
        const key = slotKey(e);
        (bySlot.get(key) ?? bySlot.set(key, []).get(key)!).push(e);
      }
      for (const slot of bySlot.values()) {
        // On a time scale, the earlier event is higher. The sort is stable,
        // so events at one time keep their authored order.
        const evs = slot.every((e) => e.timeValue !== undefined) ? [...slot].sort((p, q) => p.timeValue! - q.timeValue!) : slot;
        let offset = 0;
        for (const e of evs) {
          slotTop.set(e.id, offset);
          offset += boxHeight(e.id) + VGAP;
        }
        tallest = Math.max(tallest, offset);
      }
    }
    tallestInRow.set(layer, Math.max(tallest, LINE_HEIGHT + VGAP));
  }

  // Branch sub-columns: one per actor and exclusive branch, in authored order.
  // Each has a heading above its first box. The heading wraps to the box width,
  // and its row gets headroom for it, so two headings at one fork never share
  // space and never cover a box (F8).
  type SubColumn = { actor: string; branch: string; slot: number; events: TraceSvgEvent[]; first: TraceSvgEvent; heading: string[] };
  const subColumns: SubColumn[] = [];
  for (const a of input.actors) {
    const byBranch = new Map<string, TraceSvgEvent[]>();
    for (const e of input.events.filter((x) => x.actor === a.id)) {
      if (!slotInfo(e)) continue;
      (byBranch.get(e.branch!) ?? byBranch.set(e.branch!, []).get(e.branch!)!).push(e);
    }
    for (const [branch, evs] of byBranch) {
      const first = evs.reduce((best, e) => (e.layer < best.layer || (e.layer === best.layer && slotTop.get(e.id)! < slotTop.get(best.id)!) ? e : best));
      subColumns.push({ actor: a.id, branch, slot: slotInfo(first)!.slot, events: evs, first, heading: wrapText(branchLabel.get(branch) ?? branch, boxW(a.id) - 2 * BAND_PAD) });
    }
  }
  const headroom = new Map<number, number>();
  for (const c of subColumns) {
    const need = BAND_TOP + LINE_HEIGHT * c.heading.length + HEADING_GAP;
    headroom.set(c.first.layer, Math.max(headroom.get(c.first.layer) ?? 0, need));
  }
  const room = (layer: number) => headroom.get(layer) ?? 0;

  const headLines = new Map(input.actors.map((a) => [a.id, wrapText(a.label, boxW(a.id))]));
  const header = 2 * PAD + LINE_HEIGHT * Math.max(1, ...[...headLines.values()].map((l) => l.length)) + 8;
  const rowTop = new Map<number, number>();
  let y = MARGIN + header + VGAP / 2;
  for (let layer = 1; layer <= layers; layer++) {
    rowTop.set(layer, y);
    y += room(layer) + tallestInRow.get(layer)!;
  }
  const width = laneX + MARGIN;
  const height = y + MARGIN;
  const byId = new Map(input.events.map((e) => [e.id, e]));
  const box = (id: string) => {
    const e = byId.get(id)!;
    return { x: boxX(e), y: rowTop.get(e.layer)! + room(e.layer) + slotTop.get(e.id)!, w: boxW(e.actor), h: boxHeight(e.id) };
  };
  const marker = `m-${figureId}.arrow`;
  const column = new Map(input.actors.map((a, i) => [a.id, i]));
  const firstOfBranch = new Set(subColumns.map((c) => c.first.id));
  // The height where an arrow into an event turns: in the gap above the
  // event's row when the event is the first in its slot, else just above the box.
  const turnY = (id: string) => (slotTop.get(id) === 0 ? rowTop.get(byId.get(id)!.layer)! - VGAP / 2 : box(id).y - VGAP / 2);

  // A band covers one run of a sub-column's boxes. The run stops before a
  // box whose band would also cover a box that is not in the branch (for
  // example, a main-column box of the same actor in a row between), so the
  // reader never sees that box as part of the branch (review F-04). The
  // first run starts at the top of its row and holds the branch heading.
  type Band = { x: number; y: number; w: number; h: number; tone: 'panel' | 'bg' };
  const bands: Band[] = [];
  for (const c of subColumns) {
    const tone = BRANCH_BANDS[c.slot % BRANCH_BANDS.length]!;
    const members = new Set(c.events.map((e) => e.id));
    const sorted = [...c.events].sort((p, q) => p.layer - q.layer || slotTop.get(p.id)! - slotTop.get(q.id)!);
    const bw = boxW(c.actor);
    const x = boxX(c.first) - BAND_PAD;
    const w = bw + 2 * BAND_PAD;
    const rectOf = (run: TraceSvgEvent[]) => {
      const top = run[0]!.id === c.first.id ? rowTop.get(c.first.layer)! + BAND_TOP / 2 : box(run[0]!.id).y - BAND_PAD;
      const bottom = Math.max(...run.map((e) => box(e.id).y + box(e.id).h)) + BAND_PAD;
      return { x, y: top, w, h: bottom - top };
    };
    const coversOther = (r: { x: number; y: number; w: number; h: number }) => input.events.some((o) => {
      if (members.has(o.id)) return false;
      const b = box(o.id);
      return b.x < r.x + r.w && r.x < b.x + b.w && b.y < r.y + r.h && r.y < b.y + b.h;
    });
    let run: TraceSvgEvent[] = [];
    for (const e of sorted) {
      if (run.length > 0 && coversOther(rectOf([...run, e]))) {
        bands.push({ ...rectOf(run), tone });
        run = [];
      }
      run.push(e);
    }
    if (run.length > 0) bands.push({ ...rectOf(run), tone });
  }

  return h('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 0 ${n(width)} ${n(height)}`, width: n(width), height: n(height), role: 'group', 'aria-label': input.title, focusable: 'false' },
    h('defs', {},
      h('marker', { id: marker, viewBox: '0 0 10 10', refX: '10', refY: '5', markerWidth: '8', markerHeight: '8', orient: 'auto-start-reverse', markerUnits: 'userSpaceOnUse' },
        h('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#444444' }))),
    // Row numbers: the order layer, never a time. The axis is the only place
    // that shows the number; the boxes do not repeat it (F8).
    h('text', { class: 'vs-trace-axis', x: n(MARGIN), y: n(MARGIN + header - 10), 'font-size': 14, fill: '#3a4250' }, 'Order layer'),
    Array.from({ length: layers }, (_, i) =>
      h('text', { class: 'vs-trace-axis', x: n(MARGIN + AXIS_WIDTH / 2 - 8), y: n(rowTop.get(i + 1)! + room(i + 1) + 16), 'text-anchor': 'middle', 'font-size': 14, fill: '#3a4250' }, String(i + 1))),
    // Exclusive branches: neutral bands behind each sub-column, the panel and
    // the page colour in turn (§3.2). The heading text is the paired cue, so
    // the band never carries the branch alone.
    bands.map((band) => h('rect', { x: n(band.x), y: n(band.y), width: n(band.w), height: n(band.h), rx: '8', ry: '8', fill: BAND_FILL[band.tone], stroke: BAND_STROKE, 'stroke-width': '1', class: `vs-trace-band vs-band-${band.tone}`, 'aria-hidden': 'true' })),
    // Lifelines: a header and a dashed vertical line per actor; the header is an instance of the actor.
    input.actors.map((a) => {
      const cx = laneCenterX(a.id);
      const regionW = boxRegionWidth(actorSlots.get(a.id) ?? 1);
      const lines = headLines.get(a.id)!;
      if (a.implicit) {
        return h('path', { class: 'vs-lifeline vs-lane-implicit', d: `M${n(cx)},${n(MARGIN + header)} L${n(cx)},${n(height - MARGIN)}`, fill: 'none', stroke: '#9aa3af', 'stroke-width': '1', 'stroke-dasharray': '4 4', 'aria-hidden': 'true' });
      }
      return h('a', { class: 'vs-lane', href: `#${DOM.canonicalId(a.id)}`, id: DOM.svgInstanceId(figureId, a.id), [DOM.attr.target]: a.id, [DOM.attr.interactive]: true, 'aria-label': `${a.label} (actor)` },
        h('path', { class: 'vs-lifeline', d: `M${n(cx)},${n(MARGIN + header)} L${n(cx)},${n(height - MARGIN)}`, fill: 'none', stroke: '#9aa3af', 'stroke-width': '1', 'stroke-dasharray': '4 4' }),
        h('rect', { x: n((colLeft.get(a.id) ?? MARGIN + AXIS_WIDTH) + GUTTER / 2), y: n(MARGIN), width: n(regionW), height: n(header - 8), rx: '6', ry: '6', fill: '#eef1f5', stroke: '#2f3a4a', 'stroke-width': '1.5' }),
        h('text', { class: 'vs-lane-label', x: n(cx), y: n(MARGIN + PAD - 2), 'text-anchor': 'middle', 'font-size': 14, fill: '#1a1a1a' },
          ((content) => lines.map((_, j) => h('tspan', { x: n(cx), dy: j === 0 ? '1em' : String(LINE_HEIGHT) }, content[j])))(labelContent(lines, input.termsOf))));
    }),
    // Messages: a dashed arrow from the event to the receiving actor's lifeline.
    // Decoration only; the event box and the lists carry the relationship.
    input.messages.map((m) => {
      const e = byId.get(m.event);
      if (!e || e.actor === m.to || !column.has(m.to)) return null;
      const b = box(m.event);
      const toX = laneCenterX(m.to);
      const right = toX > b.x;
      const x1 = right ? b.x + b.w : b.x;
      const yy = b.y + b.h / 2;
      return h('path', { class: 'vs-trace-message', d: `M${n(x1)},${n(yy)} L${n(toX)},${n(yy)}`, fill: 'none', stroke: '#6b7686', 'stroke-width': '1.25', 'stroke-dasharray': '5 3', 'marker-end': `url(#${marker})`, 'aria-hidden': 'true' });
    }),
    // `after` prerequisites: from the bottom of the prerequisite to the top of
    // the event, turning in the gap just above the event's row. An arrow into
    // the first event of a branch ends at the top of the branch band, so it
    // does not cross the branch heading.
    input.orders.map((r) => {
      const a = box(r.from);
      const b = box(r.to);
      const x1 = a.x + a.w / 2;
      const y1 = a.y + a.h;
      const x2 = b.x + b.w / 2;
      const y2 = firstOfBranch.has(r.to) ? rowTop.get(byId.get(r.to)!.layer)! + BAND_TOP / 2 : b.y;
      const ym = turnY(r.to);
      // A straight line down the source column must not pass through another
      // box: it would read as a step that follows that box. Such an arrow
      // leaves through the column's right gutter instead. Sub-columns already
      // keep exclusive branches apart in x, so only a box actually under this
      // vertical line (same sub-column) can block it (dogfood-3 F2d).
      const fromActor = byId.get(r.from)!.actor;
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
    // Fork marks (dogfood-3 F2c): a bracket where one shared prerequisite's
    // children fan out into different exclusive-branch columns. The bracket
    // has no text of its own: the branch headings name each side, and a
    // second copy of the names overlapped them (F8).
    (() => {
      const forkChildren = new Map<string, TraceSvgEvent[]>();
      for (const r of input.orders) {
        const child = byId.get(r.to);
        if (!child || !slotInfo(child)) continue;
        (forkChildren.get(r.from) ?? forkChildren.set(r.from, []).get(r.from)!).push(child);
      }
      return [...forkChildren.entries()]
        .filter(([, children]) => new Set(children.map((c) => slotInfo(c)!.slot)).size > 1)
        .map(([fromId, children]) => {
          const xs = children.map((c) => box(c.id).x + box(c.id).w / 2);
          const minX = Math.min(...xs), maxX = Math.max(...xs);
          // The bracket lies on the arrows' turn line, so the two read as one mark.
          const yTop = Math.min(...children.map((c) => turnY(c.id)));
          return h('g', { class: 'vs-trace-fork', 'aria-hidden': 'true' },
            h('path', { class: 'vs-trace-fork-bracket', d: `M${n(minX)},${n(yTop - 5)} L${n(minX)},${n(yTop)} L${n(maxX)},${n(yTop)} L${n(maxX)},${n(yTop - 5)}`, fill: 'none', stroke: '#6b7686', 'stroke-width': '1.25' }));
        });
    })(),
    // A branch heading above the first box of its sub-column, shown once per
    // actor and branch (dogfood-3 F2b), inside the row's headroom. Drawn after
    // the arrows, so its halo (reader.css) keeps it readable where an arrow
    // enters the box under it.
    subColumns.map((c) => {
      const b = box(c.first.id);
      const cx = b.x + b.w / 2;
      const tone = BRANCH_BANDS[c.slot % BRANCH_BANDS.length]!;
      return h('text', { class: `vs-trace-branch-heading vs-band-${tone}`, x: n(cx), y: n(rowTop.get(c.first.layer)! + BAND_TOP), 'text-anchor': 'middle', 'font-size': 14, fill: '#1a1a1a' },
        c.heading.map((line, i) => h('tspan', { x: n(cx), dy: i === 0 ? '1em' : String(LINE_HEIGHT) }, line)));
    }),
    input.events.map((e) => {
      const b = box(e.id);
      const style = styleOf.get(e.id)!;
      const cats = catClasses(style);
      return h('a', { class: `vs-node vs-event-box vs-kind-${e.kind}${cats ? ` ${cats}` : ''}`, href: `#${DOM.canonicalId(e.id)}`, id: DOM.svgInstanceId(figureId, e.id), [DOM.attr.target]: e.id, [DOM.attr.interactive]: true, 'aria-label': `${e.label} (${[e.actor ? input.labelOf(e.actor) : '', ...(e.notes ?? metaLines(e))].filter(Boolean).join('; ')})`, [DOM.attr.filter]: filterToken('kind', e.kind) },
        outline(style, b.x, b.y, b.w, b.h, style.danger ? '2' : '1.5'),
        traceText(wrapped.get(e.id)!, b.x + b.w / 2, b.y + PAD - 2, input.termsOf));
    }));
}
