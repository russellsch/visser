import { describe, expect, it } from 'vitest';
import { traceSvg, type TraceSvgInput } from '../../packages/core/src/compiler/svg.ts';
import { mathMetricKey } from '../../packages/core/src/compiler/math-text.ts';
import { render, type HNode } from '../../packages/core/src/compiler/html.ts';

const frac = '\\frac{a}{b}';
const matrix = '\\begin{matrix}a&b\\\\c&d\\end{matrix}';
const metric = {
  [mathMetricKey(frac)]: { widthEm: 2.5, heightEm: 3, ascentEm: 2.2, depthEm: 0.8 },
  [mathMetricKey(matrix)]: { widthEm: 4, heightEm: 4, ascentEm: 3, depthEm: 1 },
};
const base: TraceSvgInput = {
  figureId: 'trace_math', title: 'Trace',
  actors: [{ id: 'actor', label: `Actor $${matrix}$` }],
  events: [
    { id: 'start', actor: 'actor', label: `Start $${frac}$`, kind: 'compute', layer: 1,
      meta: [`unit $${matrix}$`] },
    { id: 'ok', actor: 'actor', label: 'Done', kind: 'compute', layer: 2, meta: [], branch: 'success' },
    { id: 'fail', actor: 'actor', label: 'Failed', kind: 'failure', layer: 2, meta: [], branch: 'failure' },
  ],
  orders: [{ id: 'one', from: 'start', to: 'ok' }, { id: 'two', from: 'start', to: 'fail' }],
  messages: [],
  branches: [
    { id: 'success', label: `Good $${frac}$`, exclusiveWith: ['failure'] },
    { id: 'failure', label: 'Bad', exclusiveWith: ['success'] },
  ],
  labelOf: (id) => id,
  mathMetrics: metric,
};
const attr = (node: HNode, key: string) => node.attrs.find(([name]) => name === key)?.[1];
function descendants(node: HNode, predicate: (node: HNode) => boolean): HNode[] {
  return [node, ...node.children.flatMap((child) => typeof child === 'string' ? [] : descendants(child, predicate))].filter(predicate);
}
const slotsOf = (node: HNode) => descendants(node, (item) => item.tag === 'svg' && attr(item, 'data-vs-math-native') === '');

describe('native math trace labels @M10', () => {
  it('reserves tall actor, event, metadata and branch-heading space before routing', () => {
    const seen: string[] = [];
    const root = traceSvg({ ...base, onMath: (key) => seen.push(key) });
    const slots = slotsOf(root);
    expect(slots).toHaveLength(4);
    expect(seen).toEqual(slots.map((slot) => attr(slot, 'data-vs-math-key')));
    const actor = descendants(root, (node) => attr(node, 'data-vs-target') === 'actor')[0]!;
    const header = descendants(actor, (node) => node.tag === 'rect' && attr(node, 'fill') === '#eef1f5')[0]!;
    expect(Number(attr(header, 'height'))).toBeGreaterThan(56);
    const start = descendants(root, (node) => attr(node, 'data-vs-target') === 'start')[0]!;
    const eventOutline = descendants(start, (node) => node.tag === 'rect' && attr(node, 'width') !== undefined)[0]!;
    expect(Number(attr(eventOutline, 'height'))).toBeGreaterThan(42 + 56);
    const eventSlots = slotsOf(start);
    expect(eventSlots).toHaveLength(2);
    const bottom = Number(attr(eventOutline, 'y')) + Number(attr(eventOutline, 'height'));
    expect(eventSlots.every((slot) => Number(attr(slot, 'y')) + Number(attr(slot, 'height')) <= bottom)).toBe(true);
    expect(render(root)).toContain('class="vs-trace-branch-heading');
  });

  it('keeps plain traces byte-identical with or without an unrelated metric table', () => {
    const plain: TraceSvgInput = { ...base, actors: [{ id: 'actor', label: 'Actor' }],
      events: base.events.map((event) => ({ ...event, label: event.id, meta: [] })),
      branches: base.branches.map((branch) => ({ ...branch, label: branch.id })) };
    expect(render(traceSvg(plain))).toBe(render(traceSvg({ ...plain, mathMetrics: undefined })));
    expect(slotsOf(traceSvg(plain))).toHaveLength(0);
  });

  it('does not pair delimiters across separate event metadata fields', () => {
    const input: TraceSvgInput = { ...base, events: base.events.map((event) => event.id === 'start'
      ? { ...event, meta: ['cost $5 / $7'], metaSegments: ['cost $5', ' / ', '$7'].map((segment) => [segment]) }
      : event) };
    expect(() => traceSvg(input)).toThrow(); // segments must match each displayed line
    const separated: TraceSvgInput = { ...base, events: base.events.map((event) => event.id === 'start'
      ? { ...event, meta: ['cost $5 / $7'], metaSegments: [['cost $5', ' / ', '$7']] }
      : event) };
    const root = traceSvg(separated);
    expect(slotsOf(root)).toHaveLength(3); // actor, event label, branch heading; no metadata math
  });

  it('widens a lane for one indivisible formula beyond all preset box widths', () => {
    const wide: TraceSvgInput = { ...base, mathMetrics: { ...metric,
      [mathMetricKey(frac)]: { widthEm: 20, heightEm: 3, ascentEm: 2.2, depthEm: 0.8 } } };
    const root = traceSvg(wide);
    const start = descendants(root, (node) => attr(node, 'data-vs-target') === 'start')[0]!;
    const outline = descendants(start, (node) => node.tag === 'rect' && attr(node, 'width') !== undefined)[0]!;
    const slot = slotsOf(start).find((node) => attr(node, 'data-vs-math-key') === mathMetricKey(frac))!;
    expect(Number(attr(outline, 'width'))).toBeGreaterThan(280);
    expect(Number(attr(slot, 'x')) + Number(attr(slot, 'width'))).toBeLessThanOrEqual(
      Number(attr(outline, 'x')) + Number(attr(outline, 'width')));
  });
});
