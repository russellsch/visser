import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { measureSvg, type MeasureSvgInput } from '../../packages/core/src/compiler/measure-svg.ts';
import { render, type HNode } from '../../packages/core/src/compiler/html.ts';
import { mathMetricKey } from '../../packages/core/src/compiler/math-text.ts';
import { convertMath } from '../../packages/core/src/math/engine.ts';
import type { MathMetrics } from '../../packages/core/src/math/engine.ts';

const attrs = (node: HNode) => Object.fromEntries(node.attrs);
function nodes(root: HNode, tag: string): HNode[] {
  return [root, ...root.children.flatMap(child => typeof child === 'string' ? [] : nodes(child, tag))]
    .filter(node => node.tag === tag);
}
function metrics(...texes: string[]): Record<string, MathMetrics> {
  return Object.fromEntries(texes.map(tex => [mathMetricKey(tex), convertMath(tex, false).metrics]));
}

describe('measure figure native math geometry @M02 @M10', () => {
  it('leaves a no-math chart byte-identical to the prior renderer', () => {
    const input: MeasureSvgInput = { figureId: 'm', title: 'Metrics', rows: [
      { id: 'one', label: 'Latency', value: 5, status: 'measured', text: '5 ms' },
      { id: 'two', label: 'Throughput', value: 10, status: 'estimated', text: '10 ms' },
    ], maxText: '10 ms', mathMetrics: {} };
    const output = render(measureSvg(input));
    expect(createHash('sha256').update(output).digest('hex')).toBe('8086fee88ebfcdc29da3a3a7b4d0a882678012f17506855540f55972ee799748');
    expect(output).not.toContain('vs-math-native');
  });

  it('reserves tall mixed labels and values inside the viewport while preserving numeric bar lengths', () => {
    const fraction = String.raw`\frac{a}{b}`;
    const matrix = String.raw`\begin{matrix}a&b\\c&d\end{matrix}`;
    const unit = String.raw`\frac{m}{s}`;
    const long = Array.from({ length: 18 }, (_, i) => `x_{${i}}`).join('+');
    const seen: string[] = [];
    const input: MeasureSvgInput = {
      figureId: 'measure_math', title: 'Measured rate',
      rows: [
        { id: 'slow', label: `Long $${long}$ $${fraction}$ $${matrix}$`,
          value: 5, status: 'measured', text: `5 $${unit}$` },
        { id: 'fast', label: 'Reference', value: 10, status: 'measured', text: `10 $${unit}$` },
      ],
      maxText: `10 $${unit}$`, mathMetrics: metrics(fraction, matrix, unit, long),
      onMath: (key, tex) => { expect(key).toBe(mathMetricKey(tex)); seen.push(tex); },
    };
    const svg = measureSvg(input);
    const viewport = attrs(svg).viewBox!.split(' ').map(Number);
    const slots = nodes(svg, 'svg').slice(1);
    expect(slots.length).toBeGreaterThanOrEqual(5);
    expect(seen).toContain(matrix);
    expect(seen.filter(tex => tex === unit)).toHaveLength(3);
    for (const slot of slots) {
      const a = attrs(slot);
      expect(a.class).toBe('vs-math-native');
      expect(a['data-vs-math-native']).toBe('');
      expect(a['data-vs-math-key']).toBeTruthy();
      const x = Number(a.x);
      const y = Number(a.y);
      const width = Number(a.width);
      const height = Number(a.height);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + width).toBeLessThanOrEqual(viewport[2]! + 0.01);
      expect(y + height).toBeLessThanOrEqual(viewport[3]! + 0.01);
    }
    const bars = nodes(svg, 'rect').filter(node => attrs(node).class === 'vs-bar');
    expect(bars.map(node => Number(attrs(node).width))).toEqual([180, 360]);
    const rows = nodes(svg, 'a').filter(node => attrs(node).class?.startsWith('vs-measure-row'));
    expect(rows).toHaveLength(2);
    const firstSlots = nodes(rows[0]!, 'svg');
    const secondSlots = nodes(rows[1]!, 'svg');
    expect(Math.max(...firstSlots.map(node => Number(attrs(node).y) + Number(attrs(node).height))))
      .toBeLessThan(Math.min(...secondSlots.map(node => Number(attrs(node).y))));
  });

  it('keeps unmatched dollars in separate display and unit fields literal', () => {
    const text = '$5 kg$';
    const row = { id: 'cost', label: 'Cost', value: 5, status: 'measured', text,
      textSegments: ['$5', ' ', 'kg$'] };
    const input: MeasureSvgInput = { figureId: 'costs', title: 'Costs', rows: [row],
      maxText: text, maxTextSegments: ['$5', ' ', 'kg$'], mathMetrics: {} };
    const plain = render(measureSvg(input));
    expect(plain).not.toContain('vs-math-native');
    expect(plain).toContain('$5 kg$');

    const fraction = String.raw`\frac{a}{b}`;
    const withOtherMath = render(measureSvg({ ...input, rows: [{ ...row, label: `Rate $${fraction}$` }],
      mathMetrics: metrics(fraction) }));
    expect(withOtherMath.match(/data-vs-math-native=""/g)).toHaveLength(1);
    expect(withOtherMath).toContain('$5 kg$');
  });

  it('rejects value and axis segment lists that differ from the displayed string', () => {
    const input: MeasureSvgInput = { figureId: 'costs', title: 'Costs', rows: [
      { id: 'cost', label: 'Cost', value: 5, status: 'measured', text: '$5 kg$', textSegments: ['$5', ' kg'] },
    ], maxText: '$5 kg$', mathMetrics: {} };
    expect(() => measureSvg(input)).toThrowError(/segments do not match/);
    input.rows[0]!.textSegments = ['$5', ' ', 'kg$'];
    input.maxTextSegments = ['$5', 'kg$'];
    expect(() => measureSvg(input)).toThrowError(/segments do not match/);
  });
});
