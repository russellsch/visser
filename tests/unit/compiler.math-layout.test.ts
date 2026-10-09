import { describe, expect, it } from 'vitest';
import { layoutGraph, type GraphInput } from '../../packages/core/src/compiler/layout.ts';
import { graphSvg, type SvgInput } from '../../packages/core/src/compiler/svg.ts';
import { mathMetricKey } from '../../packages/core/src/compiler/math-text.ts';
import { measureRichSegments } from '../../packages/core/src/compiler/math-text.ts';
import { render, type HNode } from '../../packages/core/src/compiler/html.ts';

const fraction = '\\frac{a}{b}';
const matrix = '\\begin{matrix}a&b\\\\c&d\\end{matrix}';
const graph: GraphInput = {
  id: 'math_graph',
  groups: [{ id: 'system', label: `System $${matrix}$` }],
  nodes: [
    { id: 'a', label: `Rate $${fraction}$`, group: 'system' },
    { id: 'b', label: 'Sink', group: 'system' },
  ],
  edges: [{ id: 'e', from: 'a', to: 'b', label: `flow $${fraction}$` }],
  mathMetrics: {
    [mathMetricKey(fraction)]: { widthEm: 2.5, heightEm: 3, ascentEm: 2.2, depthEm: 0.8 },
    [mathMetricKey(matrix)]: { widthEm: 4, heightEm: 4, ascentEm: 3, depthEm: 1 },
  },
};

const attr = (node: HNode, key: string) => node.attrs.find(([name]) => name === key)?.[1];
function descendants(node: HNode, predicate: (node: HNode) => boolean): HNode[] {
  return [node, ...node.children.flatMap((child) => typeof child === 'string' ? [] : descendants(child, predicate))].filter(predicate);
}
const inputFor = (layout: Awaited<ReturnType<typeof layoutGraph>>, onMath?: SvgInput['onMath']): SvgInput => ({
  figureId: 'math_graph', title: 'Math graph', layout,
  labelOf: (id) => id === 'system' ? graph.groups[0]!.label : id === 'e' ? graph.edges[0]!.label : graph.nodes.find((n) => n.id === id)?.label ?? id,
  roleOf: () => undefined, kindOf: () => undefined,
  relationship: (id) => id === 'e' ? { from: 'a', to: 'b' } : undefined,
  onMath,
});

describe('native math graph labels @M10', () => {
  it('uses tall conversion metrics to reserve node, group and edge geometry', async () => {
    const layout = await layoutGraph(graph);
    const a = layout.nodes.find((n) => n.id === 'a')!;
    const group = layout.groups[0]!;
    const edge = layout.edges[0]!.label!;
    expect(a.richLines?.[0]?.height).toBe(42);
    expect(a.height).toBeGreaterThanOrEqual(42 + 16);
    expect(group.richLines?.[0]?.height).toBe(56);
    expect(group.height).toBeGreaterThan(56);
    expect(edge.richLines?.[0]?.height).toBe(42);
    expect(edge.height).toBeGreaterThanOrEqual(42 + 2);
    expect(JSON.stringify(layout)).toBe(JSON.stringify(await layoutGraph(structuredClone(graph))));
  });

  it('emits measured native SVG slots inside their label boxes and reports every slot', async () => {
    const layout = await layoutGraph(graph);
    const seen: Array<[string, string]> = [];
    const svg = graphSvg(inputFor(layout, (key, tex) => seen.push([key, tex])));
    const slots = descendants(svg, (node) => node.tag === 'svg' && attr(node, 'data-vs-math-native') === '');
    expect(slots.length).toBeGreaterThanOrEqual(3);
    expect(seen).toEqual(slots.map((slot) => [attr(slot, 'data-vs-math-key')!,
      JSON.parse(attr(slot, 'data-vs-math-key')!)[1] as string]));
    for (const slot of slots) {
      const [x, y, width, height] = ['x', 'y', 'width', 'height'].map((key) => Number(attr(slot, key)));
      expect([x, y, width, height].every(Number.isFinite)).toBe(true);
      expect(width).toBeGreaterThan(0);
      expect(height).toBeGreaterThan(18);
      expect(attr(slot, 'viewBox')).toBe(`0 0 ${width} ${height}`);
    }
    const node = layout.nodes.find((n) => n.id === 'a')!;
    const aSlot = slots.find((slot) => attr(slot, 'data-vs-math-key') === mathMetricKey(fraction)
      && Number(attr(slot, 'x')) >= node.x + 8 && Number(attr(slot, 'x')) <= node.x + 8 + node.width)!;
    expect(Number(attr(aSlot, 'x'))).toBeGreaterThan(node.x + 8);
    expect(Number(attr(aSlot, 'x')) + Number(attr(aSlot, 'width'))).toBeLessThan(node.x + 8 + node.width);
    expect(Number(attr(aSlot, 'y'))).toBeGreaterThanOrEqual(node.y + 8);
    expect(Number(attr(aSlot, 'y')) + Number(attr(aSlot, 'height'))).toBeLessThanOrEqual(node.y + 8 + node.height);
    expect(render(svg)).toContain('data-vs-math-native=""');
  });

  it('leaves non-math layout unchanged when a metrics table is present', async () => {
    const plain = { ...graph, groups: [{ id: 'system', label: 'System' }],
      nodes: [{ id: 'a', label: 'Rate', group: 'system' }, { id: 'b', label: 'Sink', group: 'system' }],
      edges: [{ id: 'e', from: 'a', to: 'b', label: 'flow' }] } satisfies GraphInput;
    const without = await layoutGraph({ ...plain, mathMetrics: undefined });
    const withMetrics = await layoutGraph(plain);
    expect(withMetrics).toEqual(without);
    expect(render(graphSvg(inputFor(withMetrics)))).toBe(render(graphSvg(inputFor(without))));
  });

  it('keeps joined authored fields separate when dollar delimiters are unmatched', async () => {
    const metrics = graph.mathMetrics!;
    expect(measureRichSegments(['price $5', ' / ', '$7 charge'], 300, metrics, (s) => s.length * 7)).toBeUndefined();
    const edge = { id: 'e', from: 'a', to: 'b', label: `flow $${fraction}$`, segments: ['flow ', `$${fraction}$`] };
    const measured = await layoutGraph({ ...graph, edges: [edge] });
    expect(measured.edges[0]!.label!.richLines?.[0]?.runs.some((run) => run.kind === 'math')).toBe(true);
    await expect(layoutGraph({ ...graph, edges: [{ ...edge, segments: ['wrong'] }] })).rejects.toMatchObject({ code: 'E_MATH_INVALID' });
  });

  it('counts hidden fold and proxy math slots for native attachment', async () => {
    const folding = { ...graph, nodes: graph.nodes.map((node) => node.id === 'b' ? { ...node, group: undefined } : node) };
    const layout = await layoutGraph(folding);
    const seen: Array<[string, string]> = [];
    const input = inputFor(layout, (key, tex) => seen.push([key, tex]));
    input.collapsed = ['system'];
    input.parentOf = (id) => folding.nodes.find((node) => node.id === id)?.group;
    const svg = graphSvg(input);
    const slots = descendants(svg, (node) => node.tag === 'svg' && attr(node, 'data-vs-math-native') === '');
    expect(slots.some((slot) => attr(slot, 'data-vs-math-key') === mathMetricKey(matrix))).toBe(true);
    expect(descendants(svg, (node) => attr(node, 'class') === 'vs-fold')).toHaveLength(1);
    expect(descendants(svg, (node) => attr(node, 'data-vs-proxy-for') === 'e').length).toBeGreaterThan(0);
    expect(seen).toHaveLength(slots.length);
    expect(seen.filter(([key]) => key === mathMetricKey(matrix)).length).toBeGreaterThanOrEqual(2);
    expect(seen.filter(([key]) => key === mathMetricKey(fraction)).length).toBeGreaterThanOrEqual(3);
  });

  it('renders math in muted concept or stage metadata without losing its slot', async () => {
    const withExtra = { ...graph, nodes: graph.nodes.map((node) => node.id === 'a'
      ? { ...node, extra: [`shape $${fraction}$`] } : node) };
    const layout = await layoutGraph(withExtra);
    const input = inputFor(layout);
    input.mutedLinesOf = (id) => id === 'a' ? 1 : 0;
    const svg = graphSvg(input);
    const slots = descendants(svg, (node) => node.tag === 'svg' && attr(node, 'data-vs-math-native') === '');
    expect(slots.filter((slot) => attr(slot, 'data-vs-math-key') === mathMetricKey(fraction))).toHaveLength(3);
    expect(slots.some((slot) => attr(slot, 'fill-opacity') === '0.72')).toBe(true);
  });

  it('mutes only the quantity suffix in a rich edge label', async () => {
    const quantityGraph = { ...graph, edges: [{ ...graph.edges[0]!, label: `flow $${fraction}$ (2)` }] };
    const layout = await layoutGraph(quantityGraph);
    const input = inputFor(layout);
    input.edgeQuantityOf = () => '2';
    const rendered = render(graphSvg(input));
    expect(rendered).toContain('class="vs-edge-quantity" fill-opacity="0.72">(2)</tspan>');
    expect(rendered).not.toContain('class="vs-edge-quantity" fill-opacity="0.72">flow');
  });

  it('keeps one defined term linked when its plain text wraps beside math', async () => {
    const layout = await layoutGraph(graph);
    const a = layout.nodes.find((node) => node.id === 'a')!;
    a.richLines = [
      { runs: [{ kind: 'text', text: 'bounded', width: 55 }], width: 55, ascent: 14, descent: 4, height: 18 },
      { runs: [{ kind: 'text', text: 'queue ', width: 44 }, { kind: 'math', tex: fraction,
        key: mathMetricKey(fraction), width: 35, height: 42, ascent: 30.8, descent: 11.2 }],
        width: 79, ascent: 30.8, descent: 11.2, height: 42 },
    ];
    const input = inputFor(layout);
    input.termsOf = (text) => {
      const at = text.indexOf('bounded queue');
      return at < 0 ? [text] : [text.slice(0, at), { text: 'bounded queue', defId: 'definition' }, text.slice(at + 13)];
    };
    const rendered = render(graphSvg(input));
    expect(rendered).toContain('data-vs-term="definition">bounded</tspan>');
    expect(rendered).toContain('data-vs-term="definition">queue</tspan>');
  });

  it('places a plain proxy callout label below a tall math context', () => {
    const input: SvgInput = {
      figureId: 'proxy_math', title: 'Proxy math', collapsed: ['g'],
      parentOf: (id) => id === 'a' ? 'g' : undefined,
      labelOf: (id) => id === 'a' ? `$${matrix}$` : id,
      roleOf: () => undefined, kindOf: () => 'call',
      relationship: (id) => id === 'e' ? { from: 'a', to: 'b' } : undefined,
      layout: {
        width: 600, height: 300,
        groups: [{ id: 'g', label: 'g', x: 0, y: 0, width: 200, height: 160 }],
        nodes: [
          { id: 'a', x: 50, y: 30, width: 80, height: 80, lines: [`$${matrix}$`], richLines: [
            { runs: [{ kind: 'math', tex: matrix, key: mathMetricKey(matrix), width: 56, height: 56, ascent: 42, descent: 14 }],
              width: 56, height: 56, ascent: 42, descent: 14 },
          ] },
          { id: 'b', x: 450, y: 200, width: 80, height: 40, lines: ['b'] },
          { id: 'crowded', x: 0, y: 0, width: 600, height: 300, lines: ['crowded'] },
        ],
        edges: [{ id: 'e', points: [{ x: 100, y: 53 }, { x: 490, y: 53 }, { x: 490, y: 200 }],
          label: { x: 70, y: 75, width: 90, height: 24, lines: ['e'] } }],
      },
    };
    const root = graphSvg(input);
    const callout = descendants(root, (node) => (attr(node, 'class') ?? '').includes('vs-proxy-callout'))[0]!;
    expect(callout).toBeDefined();
    const slot = descendants(callout, (node) => node.tag === 'svg' && attr(node, 'data-vs-math-key') === mathMetricKey(matrix))[0]!;
    const label = descendants(callout, (node) => node.tag === 'text' && attr(node, 'class') === 'vs-edge-label')[0]!;
    const panel = descendants(callout, (node) => node.tag === 'rect' && attr(node, 'class') === 'vs-proxy-callout-bg')[0]!;
    expect(Number(attr(label, 'y'))).toBeGreaterThan(Number(attr(slot, 'y')) + Number(attr(slot, 'height')));
    expect(Number(attr(label, 'y'))).toBe(Number(attr(panel, 'y')) + 56 + 2);
    expect(Number(attr(label, 'y')) + 14).toBeLessThan(Number(attr(panel, 'y')) + Number(attr(panel, 'height')));
  });
});
