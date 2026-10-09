import { describe, expect, it } from 'vitest';
import { convertMath, type MathSvgElement } from '../../packages/core/src/math/engine.ts';
import { MATH_LIMITS, MathPolicyError } from '../../packages/core/src/math/policy.ts';

function mmlNodes(root: MathSvgElement): string[] {
  return [root.attrs['data-mml-node'], ...root.children.flatMap(mmlNodes)].filter((value): value is string => Boolean(value));
}

function allElements(root: MathSvgElement): MathSvgElement[] {
  return [root, ...root.children.flatMap(allElements)];
}

describe('MathJax conversion and structural output @M07 @M11', () => {
  it('reserves painted overhang while retaining standard spacing and suppressed dimensions', () => {
    const ordinary = convertMath('x', false);
    for (const tex of [String.raw`\rlap{xxxxxxxxxx}x`, String.raw`\llap{xxxxxxxxxx}x`]) {
      const result = convertMath(tex, false);
      expect(result.metrics.widthEm).toBeGreaterThan(ordinary.metrics.widthEm * 8);
      expect(result.source).toBe(tex);
    }
    const tall = String.raw`\begin{matrix}a\\b\\c\\d\end{matrix}`;
    expect(convertMath(`\\smash{${tall}}y`, false).metrics.heightEm)
      .toBeGreaterThan(convertMath('y', false).metrics.heightEm * 3);
    expect(convertMath(String.raw`\kern-2em x`, false).metrics.widthEm).toBeGreaterThan(0.4);
    expect(convertMath(String.raw`x\!y`, false).metrics.widthEm).toBeLessThan(convertMath('xy', false).metrics.widthEm);
    expect(() => convertMath(String.raw`\kern-5000em x`, false)).toThrow(/ink dimension exceeds/);
  });

  it('preserves independently meaningful grouping and fraction structure', () => {
    const grouped = mmlNodes(convertMath('x^{a+b}', false).svg);
    const ungrouped = mmlNodes(convertMath('x^a+b', false).svg);
    expect(grouped).toEqual(['math', 'msup', 'mi', 'TeXAtom', 'mi', 'mo', 'mi']);
    expect(ungrouped).toEqual(['math', 'msup', 'mi', 'mi', 'mo', 'mi']);
    expect(mmlNodes(convertMath(String.raw`\frac{a}{b}`, false).svg)).toEqual(['math', 'mfrac', 'mi', 'mi']);
  });

  it('accepts roots, Greek, bounded operators, matrices, and aligned rows without error nodes', () => {
    const cases: Array<[string, string[]]> = [
      [String.raw`\sqrt{x}`, ['msqrt']],
      [String.raw`\alpha+\beta`, ['mi', 'mo']],
      [String.raw`\sum_{i=1}^{n}i`, ['munderover']],
      [String.raw`\int_0^1 x\,dx`, ['msubsup', 'mspace']],
      [String.raw`\begin{matrix}a&b\\c&d\end{matrix}`, ['mtable', 'mtr', 'mtd']],
      [String.raw`\begin{aligned}a&=b\\c&=d\end{aligned}`, ['mtable', 'mtr', 'mtd']],
      [String.raw`\text{cost \$5}`, ['mtext']],
    ];
    for (const [source, expected] of cases) {
      const result = convertMath(source, true);
      const nodes = mmlNodes(result.svg);
      for (const kind of expected) expect(nodes, source).toContain(kind);
      expect(nodes, source).not.toContain('merror');
      expect(result.source).toBe(source);
      expect(result.display).toBe(true);
    }
    expect(mmlNodes(convertMath(cases[4]![0], true).svg).filter(kind => kind === 'mtr')).toHaveLength(2);
    expect(mmlNodes(convertMath(cases[4]![0], true).svg).filter(kind => kind === 'mtd')).toHaveLength(4);
    expect(allElements(convertMath(String.raw`\text{cost \$5}`, false).svg).some(node => node.tag === 'path' && node.attrs.d === '')).toBe(true);
  });

  it('reports coherent em geometry for tall and deep notation', () => {
    const ordinary = convertMath('x', false).metrics;
    const fraction = convertMath(String.raw`\frac{a}{b}`, false).metrics;
    const matrix = convertMath(String.raw`\begin{matrix}a&b\\c&d\end{matrix}`, false).metrics;
    const subscript = convertMath('x_i', false).metrics;
    expect(fraction.heightEm).toBeGreaterThan(ordinary.heightEm);
    expect(matrix.heightEm).toBeGreaterThan(fraction.heightEm);
    expect(matrix.depthEm).toBeGreaterThan(fraction.depthEm);
    expect(subscript.depthEm).toBeGreaterThan(ordinary.depthEm);
    for (const metric of [ordinary, fraction, matrix, subscript]) {
      expect(metric.widthEm).toBeGreaterThan(0);
      expect(metric.heightEm).toBeCloseTo(metric.ascentEm + metric.depthEm, 6);
      expect(metric.ascentEm).toBeGreaterThan(0);
    }
  });

  it('returns only approved SVG structure and no authored source in attributes', () => {
    const source = String.raw`\frac{a}{b}`;
    const result = convertMath(source, false);
    expect(result.svg.tag).toBe('svg');
    const nodes = allElements(result.svg);
    expect(result.elementCount).toBe(nodes.length);
    expect(nodes.every(node => ['svg', 'g', 'path', 'rect'].includes(node.tag))).toBe(true);
    for (const node of nodes) {
      expect(node.attrs).not.toHaveProperty('style');
      expect(node.attrs).not.toHaveProperty('data-latex');
      expect(node.attrs).not.toHaveProperty('href');
      expect(node.attrs).not.toHaveProperty('id');
    }
    expect(JSON.stringify(result.svg)).not.toContain(source);
    expect(result.svgBytes).toBeGreaterThan(0);
    expect(result.fingerprintInputs.font).toBe('@mathjax/mathjax-tex-font@4.1.3');
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it.each(['x<y>z', 'a<b>c'])('keeps ordinary comparison chain %s as safe math', source => {
    const result = convertMath(source, false);
    expect(result.source).toBe(source);
    expect(allElements(result.svg).every(node => ['svg', 'g', 'path', 'rect'].includes(node.tag))).toBe(true);
    expect(JSON.stringify(result.svg)).not.toMatch(/<\/?(?:script|style|iframe|object|img|svg)\b/i);
  });

  it.each([
    String.raw`\notACommand{x}`,
    String.raw`\frac{a}{`,
    String.raw`\label{bad}x`,
    String.raw`\ref{bad}`,
    String.raw`\tag{1}x`,
    String.raw`\def\foo{x}\foo`,
    String.raw`\href{https://example.test}{x}`,
    String.raw`\begin{equation}x\end{equation}`,
    String.raw`\text{🙂}`,
    '<script>alert(1)</script>',
  ])('rejects unsupported or hostile expression %s', source => {
    expect(() => convertMath(source, false)).toThrow(MathPolicyError);
  });

  it.each(['equation', 'eqnarray', 'align', 'gather', 'multline', 'flalign', 'alignat', 'xalignat', 'xxalignat'])
    ('rejects TeX-owned numbering environment %s', environment => {
      expect(() => convertMath(String.raw`\begin{${environment}}a&=b\\c&=d\end{${environment}}`, true))
        .toThrow(/Visser equation IDs/);
      expect(() => convertMath(String.raw`\begin{${environment}*}a&=b\\c&=d\end{${environment}*}`, true))
        .toThrow(/Visser equation IDs/);
    });

  it('enforces input and expanded output caps independently', () => {
    expect(convertMath(`${' '.repeat(MATH_LIMITS.expressionSourceBytes - 1)}x`, false).source).toHaveLength(MATH_LIMITS.expressionSourceBytes);
    expect(() => convertMath(`${' '.repeat(MATH_LIMITS.expressionSourceBytes)}x`, false)).toThrow(/byte budget/);
    expect(() => convertMath(Array(512).fill('x').join('+'), false)).toThrow(/Math SVG/);
  });

  it('rejects a short spacing command that expands beyond the em dimension cap', () => {
    expect(convertMath(String.raw`x\kern 3620em`, false).metrics.widthEm).toBeLessThan(MATH_LIMITS.maxDimensionEm);
    expect(() => convertMath(String.raw`x\kern 3621em`, false)).toThrow(/em budget/);
  });
});
