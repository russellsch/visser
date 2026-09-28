// Build-time graph layout (§7.5, §9.3). ELK options come only from this fixed
// allowlist; documents cannot pass raw ELK options. Node and label sizes come
// from a bundled text-metrics table, never from system fonts. Coordinates are
// rounded to three decimals. Characterized in spikes/elk-determinism/.
import ElkModule from 'elkjs/lib/elk.bundled.js';
import type { ELK as ElkInstance, ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api.js';

// elkjs is CommonJS; Node's ESM interop gives the constructor as the default
// export, but its typings describe an ES module default.
type ElkConstructor = new () => ElkInstance;
const ELK = ((ElkModule as unknown as { default?: ElkConstructor }).default ?? (ElkModule as unknown as ElkConstructor));

// --- Text metrics: advance widths for a nominal 14px sans font ------------

const WIDTHS = new Map<string, number>();
const set = (chars: string, width: number) => {
  for (const c of chars) WIDTHS.set(c, width);
};
set("iljI.,:;!|'", 3.9);
set('ftr()[]{}-" ', 4.7);
set('abcdeghknopqsuvxyz0123456789_?$', 7.8);
set('ABCDEFGHKLNOPRSTUVXYZJ', 9.3);
set('mwMW@%', 11.7);
const FALLBACK_WIDTH = 14.0; // any character not in the table
export const LINE_HEIGHT = 18;

export function round3(v: number): number {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? 0 : r;
}

export function textWidth(s: string): number {
  let w = 0;
  for (const c of s) w += WIDTHS.get(c) ?? FALLBACK_WIDTH;
  return round3(w);
}

export function wrapText(text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/).filter((w) => w !== '')) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && textWidth(candidate) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

function box(text: string, maxWidth: number, padX: number, padY: number, extra: string[] = []) {
  const lines = [...wrapText(text, maxWidth), ...extra.flatMap((line) => wrapText(line, maxWidth))];
  const width = Math.max(...lines.map(textWidth));
  return { lines, width: Math.ceil(width + 2 * padX), height: lines.length * LINE_HEIGHT + 2 * padY };
}

// --- Layout input and output ---------------------------------------------

export type GraphInput = {
  id: string;
  // `extra` adds secondary lines under the label (a transform stage's representation and location).
  // `marked` reserves side padding for a corner mark (a check, a question mark, or an initial dot).
  // `drum` reserves bottom padding for the storage drum line.
  nodes: Array<{ id: string; label: string; group?: string; extra?: string[]; marked?: boolean; drum?: boolean }>;
  groups: Array<{ id: string; label: string; parent?: string }>;
  edges: Array<{ id: string; from: string; to: string; label: string }>;
  // A domain map: the number of glossary rows that share its row on the page.
  // The direction rule then counts the glossary height (docs/IMPROVEMENTS.md
  // §5.4, `domainDirection`).
  glossaryRows?: number;
};

export type Point = { x: number; y: number };

export type GraphLayout = {
  width: number;
  height: number;
  nodes: Array<{ id: string; x: number; y: number; width: number; height: number; lines: string[] }>;
  groups: Array<{ id: string; x: number; y: number; width: number; height: number; label: string }>;
  edges: Array<{ id: string; points: Point[]; label?: { x: number; y: number; width: number; height: number; lines: string[] } }>;
};

export type LayoutFunction = (graph: GraphInput) => Promise<GraphLayout>;

/**
 * Node label wrap widths, narrowest first (docs/IMPROVEMENTS.md §3.4). A box
 * shows its label only, so it can be small. With 12 px padding on each side,
 * the narrowest width gives a box of 150 px. `chooseLabelWidth` gives the
 * rule.
 */
export const NODE_LABEL_WIDTHS: readonly number[] = [126, 150, 176, 200];
export const NODE_LABEL_WIDTH = NODE_LABEL_WIDTHS[0]!;
const NODE_LABEL_LINES = 2;
// The widest width at which a label that fits on 1 line takes 1 line.
export const ONE_LINE_MAX_WIDTH = 176;

export const NODE_PAD_X = 12;
// Room for a 10 px corner mark, with a gap of 9 px or more between the mark
// and the label on each side, so the label stays centred (review F-11).
export const MARKED_PAD_X = 26;
const DRUM_PAD_BOTTOM = 6; // more room under the label for the drum line (review F-09)

/**
 * The wrap width for one or more labels that share a width, from `widths`
 * (narrowest first). The choice is by line count first, then by width
 * (review F-10): the narrowest width up to `oneLineMax` (176 for a node
 * label) at which every label takes 1 line; else the narrowest width at which every label takes 2 lines or
 * fewer; else the widest width. Each secondary line must fit on 1 line at
 * the width. `inset` is the part of each width that the label cannot use
 * (for example, the room for a corner mark).
 */
export function chooseLabelWidth(items: ReadonlyArray<{ label: string; extra?: readonly string[]; inset?: number }>, widths: readonly number[] = NODE_LABEL_WIDTHS, oneLineMax = ONE_LINE_MAX_WIDTH): number {
  const lines = (w: number) => Math.max(0, ...items.map((i) => wrapText(i.label, w - (i.inset ?? 0)).length));
  const extrasFit = (w: number) => items.every((i) => (i.extra ?? []).every((x) => wrapText(x, w - (i.inset ?? 0)).length === 1));
  const oneLine = widths.find((w) => w <= oneLineMax && lines(w) === 1 && extrasFit(w));
  if (oneLine !== undefined) return oneLine;
  return widths.find((w) => lines(w) <= NODE_LABEL_LINES && extrasFit(w)) ?? widths[widths.length - 1]!;
}

function nodeBox(label: string, extra: string[] = [], marked = false, drum = false) {
  const b = box(label, chooseLabelWidth([{ label, extra }]), marked ? MARKED_PAD_X : NODE_PAD_X, 8, extra);
  return drum ? { ...b, height: b.height + DRUM_PAD_BOTTOM } : b;
}
export const EDGE_LABEL_WIDTH = 140;

export type LayoutDirection = 'RIGHT' | 'DOWN';

/**
 * Widest figure the default left-to-right layout may produce (§7.5 allowlist).
 * 1100 px fits a 1180 px window: the wide-screen figure breakout allows the
 * window width minus 4rem (64 px), and a desktop scrollbar takes about 16 px.
 * Most laptop windows are at least that wide, so a figure at or below this
 * width needs no horizontal scrolling on a desktop.
 */
export const MAX_FIGURE_WIDTH = 1100;

/**
 * The domain map and its glossary (docs/IMPROVEMENTS.md §5.4, phase 4 review
 * D2). The glossary sits beside a map up to DOMAIN_BESIDE_WIDTH wide: a
 * 1200 px window, minus 4rem, the 24 px gap, and the 30rem flex basis of the
 * glossary in reader.css (480 px). A wider map has the glossary under it,
 * 12 px lower. The glossary height is an estimate: a header and one row for
 * each concept.
 */
export const DOMAIN_BESIDE_WIDTH = 1200 - 64 - 24 - 480;
export const GLOSSARY_HEAD_HEIGHT = 40;
export const GLOSSARY_ROW_HEIGHT = 44;
const GLOSSARY_WRAP_GAP = 12;

/** The height of a domain map and its glossary on a 1200 px window. */
export function domainCost(layout: { width: number; height: number }, rows: number): number {
  const glossary = GLOSSARY_HEAD_HEIGHT + GLOSSARY_ROW_HEIGHT * rows;
  return layout.width <= DOMAIN_BESIDE_WIDTH ? Math.max(layout.height, glossary) : layout.height + GLOSSARY_WRAP_GAP + glossary;
}

// The fixed option allowlist (§7.5). Changing any value changes layout bytes.
export const LAYOUT_OPTIONS: Readonly<Record<string, string>> = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.randomSeed': '1',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.layered.crossingMinimization.forceNodeModelOrder': 'false',
  'elk.layered.thoroughness': '7',
  'elk.edgeLabels.placement': 'CENTER',
  'elk.layered.spacing.nodeNodeBetweenLayers': '48',
  'elk.spacing.nodeNode': '24',
  'elk.spacing.edgeLabel': '4',
  // Parallel edges keep 20 px apart, so a label (4 px from its own edge) is
  // clearly closer to its own line than to a neighbour (dogfood-2 Q10).
  'elk.spacing.edgeEdge': '20',
  'elk.layered.spacing.edgeEdgeBetweenLayers': '20',
  'elk.layered.spacing.edgeNodeBetweenLayers': '20',
  'elk.padding': '[top=12,left=12,bottom=12,right=12]',
  'elk.json.shapeCoords': 'ROOT',
  'elk.json.edgeCoords': 'ROOT',
};

/** The ELK graph for an input, with sizes from the text-metrics table. */
export function toElkGraph(graph: GraphInput, direction: LayoutDirection = 'RIGHT'): { root: ElkNode; lines: Map<string, string[]> } {
  const lines = new Map<string, string[]>();
  const elkNodes = new Map<string, ElkNode>();
  for (const g of graph.groups) {
    elkNodes.set(g.id, {
      id: g.id,
      labels: [{ text: g.label, width: textWidth(g.label), height: LINE_HEIGHT }],
      layoutOptions: { 'elk.padding': '[top=30,left=12,bottom=12,right=12]', 'elk.nodeLabels.placement': 'INSIDE V_TOP H_LEFT' },
      children: [],
    });
  }
  for (const n of graph.nodes) {
    const b = nodeBox(n.label, n.extra, n.marked, n.drum);
    lines.set(n.id, b.lines);
    elkNodes.set(n.id, { id: n.id, width: b.width, height: b.height });
  }
  const root: ElkNode = { id: `root:${graph.id}`, layoutOptions: { ...LAYOUT_OPTIONS, 'elk.direction': direction }, children: [], edges: [] };
  const attach = (id: string, parent: string | undefined) => {
    const node = elkNodes.get(id)!;
    const container = parent ? elkNodes.get(parent) : undefined;
    (container ? container.children! : root.children!).push(node);
  };
  // Groups first (parents before children, in authored order), then nodes.
  const placed = new Set<string>();
  const placeGroup = (id: string) => {
    if (placed.has(id)) return;
    const g = graph.groups.find((x) => x.id === id)!;
    if (g.parent) placeGroup(g.parent);
    attach(id, g.parent);
    placed.add(id);
  };
  graph.groups.forEach((g) => placeGroup(g.id));
  graph.nodes.forEach((n) => attach(n.id, n.group));
  for (const e of graph.edges) {
    const b = box(e.label, EDGE_LABEL_WIDTH, 2, 1);
    lines.set(e.id, b.lines);
    const edge: ElkExtendedEdge = { id: e.id, sources: [e.from], targets: [e.to], labels: [{ id: `${e.id}:label`, text: e.label, width: b.width, height: b.height }] };
    root.edges!.push(edge);
  }
  return { root, lines };
}

function collect(node: ElkNode, groupIds: Set<string>, lines: Map<string, string[]>, layout: GraphLayout) {
  for (const child of node.children ?? []) {
    const x = round3(child.x ?? 0), y = round3(child.y ?? 0), width = round3(child.width ?? 0), height = round3(child.height ?? 0);
    if (groupIds.has(child.id)) {
      layout.groups.push({ id: child.id, x, y, width, height, label: child.labels?.[0]?.text ?? '' });
      collect(child, groupIds, lines, layout);
    } else {
      layout.nodes.push({ id: child.id, x, y, width, height, lines: lines.get(child.id) ?? [] });
    }
  }
}

/**
 * Two or more self-transitions on the same node (dogfood-3 F6): ELK's default
 * self-loop routing does not reliably keep every label apart (it spreads a
 * single node's loops by depth, not by the label's own size), so two loops on
 * one node can draw their labels on top of each other. When a node has more
 * than one self-loop, give each one a distinct side of the node — top, right,
 * bottom, left, in that order, then repeating further out — so their label
 * boxes never overlap. A node with only one self-loop keeps ELK's own output
 * (unchanged bytes, §7.5). Pure function of the already-rounded layout, so
 * output stays deterministic.
 */
const SELF_LOOP_SIDES = ['top', 'right', 'bottom', 'left'] as const;
type SelfLoopSide = (typeof SELF_LOOP_SIDES)[number];
const SELF_LOOP_GAP = 10;
const SELF_LOOP_REACH = 8;

function selfLoopGeometry(
  side: SelfLoopSide, depth: number,
  node: { x: number; y: number; width: number; height: number },
  label: { width: number; height: number },
): { points: Point[]; label: { x: number; y: number; width: number; height: number } } {
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  const reach = Math.min(SELF_LOOP_REACH, Math.max(node.width, node.height) / 3);
  const dist = SELF_LOOP_GAP + depth * (label.height + 4);
  switch (side) {
    case 'top': {
      const apex = node.y - dist;
      return {
        points: [{ x: cx - reach, y: node.y }, { x: cx - reach, y: apex }, { x: cx + reach, y: apex }, { x: cx + reach, y: node.y }],
        label: { x: cx - label.width / 2, y: apex - label.height, width: label.width, height: label.height },
      };
    }
    case 'bottom': {
      const bottom = node.y + node.height;
      const apex = bottom + dist;
      return {
        points: [{ x: cx - reach, y: bottom }, { x: cx - reach, y: apex }, { x: cx + reach, y: apex }, { x: cx + reach, y: bottom }],
        label: { x: cx - label.width / 2, y: apex, width: label.width, height: label.height },
      };
    }
    case 'right': {
      const right = node.x + node.width;
      const apex = right + dist;
      return {
        points: [{ x: right, y: cy - reach }, { x: apex, y: cy - reach }, { x: apex, y: cy + reach }, { x: right, y: cy + reach }],
        label: { x: apex, y: cy - label.height / 2, width: label.width, height: label.height },
      };
    }
    case 'left': {
      const apex = node.x - dist;
      return {
        points: [{ x: node.x, y: cy - reach }, { x: apex, y: cy - reach }, { x: apex, y: cy + reach }, { x: node.x, y: cy + reach }],
        label: { x: apex - label.width, y: cy - label.height / 2, width: label.width, height: label.height },
      };
    }
  }
}

function placeSelfLoops(graph: GraphInput, layout: GraphLayout): void {
  const byNode = new Map<string, string[]>(); // node id -> self-loop edge ids, authored order
  for (const e of graph.edges) {
    if (e.from !== e.to) continue;
    (byNode.get(e.from) ?? byNode.set(e.from, []).get(e.from)!).push(e.id);
  }
  const multi = [...byNode.entries()].filter(([, ids]) => ids.length > 1);
  if (multi.length === 0) return; // single self-loop on every node: keep ELK's own output
  const nodeById = new Map(layout.nodes.map((n) => [n.id, n]));
  const edgeById = new Map(layout.edges.map((e) => [e.id, e]));
  const edgeInputById = new Map(graph.edges.map((e) => [e.id, e]));
  for (const [nodeId, edgeIds] of multi) {
    const node = nodeById.get(nodeId);
    if (!node) continue;
    edgeIds.forEach((edgeId, i) => {
      const edge = edgeById.get(edgeId);
      const input = edgeInputById.get(edgeId)!;
      if (!edge) return;
      const side = SELF_LOOP_SIDES[i % SELF_LOOP_SIDES.length]!;
      const depth = Math.floor(i / SELF_LOOP_SIDES.length);
      const b = box(input.label, EDGE_LABEL_WIDTH, 2, 1);
      const g = selfLoopGeometry(side, depth, node, { width: b.width, height: b.height });
      edge.points = g.points.map((p) => ({ x: round3(p.x), y: round3(p.y) }));
      edge.label = { ...g.label, x: round3(g.label.x), y: round3(g.label.y), lines: edge.label?.lines ?? b.lines };
    });
  }
  // These loops can protrude past the figure's previous bounds; recompute the
  // bounding box over every node, group, edge point, and label, and shift/grow
  // the layout to cover it (still a pure function of the rounded input).
  let minX = 0, minY = 0, maxX = layout.width, maxY = layout.height;
  const consider = (x: number, y: number) => {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  };
  for (const [nodeId] of multi) {
    for (const e of byNode.get(nodeId)!) {
      const edge = edgeById.get(e);
      if (!edge) continue;
      for (const p of edge.points) consider(p.x, p.y);
      if (edge.label) { consider(edge.label.x, edge.label.y); consider(edge.label.x + edge.label.width, edge.label.y + edge.label.height); }
    }
  }
  if (minX < 0 || minY < 0 || maxX > layout.width || maxY > layout.height) {
    const dx = round3(-Math.min(0, minX));
    const dy = round3(-Math.min(0, minY));
    const shift = (x: number) => round3(x);
    for (const n of layout.nodes) { n.x = shift(n.x + dx); n.y = shift(n.y + dy); }
    for (const g of layout.groups) { g.x = shift(g.x + dx); g.y = shift(g.y + dy); }
    for (const e of layout.edges) {
      e.points = e.points.map((p) => ({ x: shift(p.x + dx), y: shift(p.y + dy) }));
      if (e.label) { e.label.x = shift(e.label.x + dx); e.label.y = shift(e.label.y + dy); }
    }
    layout.width = round3(maxX - minX);
    layout.height = round3(maxY - minY);
  }
}

/** Convert ELK output to the rounded, ordered layout the renderer uses. */
export function fromElk(graph: GraphInput, result: ElkNode, lines: Map<string, string[]>): GraphLayout {
  const layout: GraphLayout = { width: round3(result.width ?? 0), height: round3(result.height ?? 0), nodes: [], groups: [], edges: [] };
  collect(result, new Set(graph.groups.map((g) => g.id)), lines, layout);
  const byId = new Map<string, ElkExtendedEdge>((result.edges ?? []).map((e): [string, ElkExtendedEdge] => [e.id, e as ElkExtendedEdge]));
  for (const input of graph.edges) {
    const e = byId.get(input.id);
    const section = e?.sections?.[0];
    const points: Point[] = section
      ? [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map((p) => ({ x: round3(p.x), y: round3(p.y) }))
      : [];
    const label = e?.labels?.[0];
    layout.edges.push({
      id: input.id,
      points,
      ...(label ? { label: { x: round3(label.x ?? 0), y: round3(label.y ?? 0), width: round3(label.width ?? 0), height: round3(label.height ?? 0), lines: lines.get(input.id) ?? [] } } : {}),
    });
  }
  // Authored order for nodes and groups, not ELK traversal order.
  const nodeOrder = new Map(graph.nodes.map((n, i) => [n.id, i]));
  layout.nodes.sort((a, b) => nodeOrder.get(a.id)! - nodeOrder.get(b.id)!);
  const groupOrder = new Map(graph.groups.map((g, i) => [g.id, i]));
  layout.groups.sort((a, b) => groupOrder.get(a.id)! - groupOrder.get(b.id)!);
  placeSelfLoops(graph, layout);
  return layout;
}

/** Lay out one graph in-process. The build normally calls this through the layout worker. */
export async function layoutGraph(graph: GraphInput): Promise<GraphLayout> {
  const elk = new ELK();
  const run = async (direction: LayoutDirection) => {
    const { root, lines } = toElkGraph(graph, direction);
    return fromElk(graph, await elk.layout(structuredClone(root)), lines);
  };
  // Direction rule: left-to-right first. A layout wider than MAX_FIGURE_WIDTH
  // switches to top-to-bottom when that is narrower. The choice depends only on
  // the layout input, so the output stays byte-deterministic (§7.5).
  // A domain map up to MAX_FIGURE_WIDTH also switches when top-to-bottom
  // costs less height with its glossary counted (`domainCost`, §5.4).
  const right = await run('RIGHT');
  const rows = graph.glossaryRows;
  if (right.width <= MAX_FIGURE_WIDTH && rows === undefined) return right;
  const down = await run('DOWN');
  if (right.width > MAX_FIGURE_WIDTH) return down.width < right.width ? down : right;
  return domainCost(down, rows!) < domainCost(right, rows!) ? down : right;
}
