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
  // `extra` adds secondary lines under the label (state marks, stage representation, task status).
  nodes: Array<{ id: string; label: string; group?: string; extra?: string[] }>;
  groups: Array<{ id: string; label: string; parent?: string }>;
  edges: Array<{ id: string; from: string; to: string; label: string }>;
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

export const NODE_LABEL_WIDTH = 160;
export const EDGE_LABEL_WIDTH = 140;

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
  'elk.padding': '[top=12,left=12,bottom=12,right=12]',
  'elk.json.shapeCoords': 'ROOT',
  'elk.json.edgeCoords': 'ROOT',
};

/** The ELK graph for an input, with sizes from the text-metrics table. */
export function toElkGraph(graph: GraphInput): { root: ElkNode; lines: Map<string, string[]> } {
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
    const b = box(n.label, NODE_LABEL_WIDTH, 12, 8, n.extra);
    lines.set(n.id, b.lines);
    elkNodes.set(n.id, { id: n.id, width: b.width, height: b.height });
  }
  const root: ElkNode = { id: `root:${graph.id}`, layoutOptions: { ...LAYOUT_OPTIONS }, children: [], edges: [] };
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
  return layout;
}

/** Lay out one graph in-process. The build normally calls this through the layout worker. */
export async function layoutGraph(graph: GraphInput): Promise<GraphLayout> {
  const elk = new ELK();
  const { root, lines } = toElkGraph(graph);
  const result = await elk.layout(structuredClone(root));
  return fromElk(graph, result, lines);
}
