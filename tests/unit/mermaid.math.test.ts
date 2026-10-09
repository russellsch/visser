import { describe, expect, it } from 'vitest';
import { MATH_LIMITS } from '../../packages/core/src/math/policy.ts';
import { validateMermaidMathLabel } from '../../packages/core/src/mermaid/math.ts';

describe('pinned Mermaid label math validation', () => {
  it('preserves native $$ source, offsets, and repeated occurrence costs', () => {
    const label = 'α $$x^2$$ and $$\\frac{a}{b}$$';
    const result = validateMermaidMathLabel(label);
    expect(result.source).toBe(label);
    expect(result.parts.map(part => part.source).join('')).toBe(label);
    expect(result.parts.map(part => [part.kind, part.start, part.end])).toEqual([
      ['text', 0, 2], ['math', 2, 9], ['text', 9, 14], ['math', 14, 29],
    ]);
    expect(result.parts.filter(part => part.kind === 'math').map(part => part.tex)).toEqual(['x^2', '\\frac{a}{b}']);
    expect(result.total.occurrences).toBe(2);
    expect(result.total.svgBytes).toBeGreaterThan(0);
    expect(result.total.elementCount).toBeGreaterThan(0);
    expect(validateMermaidMathLabel('again $$x^2$$', result.total).total.occurrences).toBe(3);
  });

  it('uses UTF-16 offsets in a parsed label and leaves single dollars literal', () => {
    const label = '😀 $5 $$x<y$$';
    const result = validateMermaidMathLabel(label);
    expect(result.parts[0]).toMatchObject({ kind: 'text', source: '😀 $5 ', start: 0, end: 6 });
    expect(result.parts[1]).toMatchObject({ kind: 'math', tex: 'x<y', start: 6, end: 13 });
    expect(validateMermaidMathLabel('cost $5').parts).toEqual([{ kind: 'text', source: 'cost $5', start: 0, end: 7 }]);
  });

  it('matches Mermaid’s regex inside code markers and after a backslash', () => {
    const label = 'code `$$x$$` and \\$$y$$';
    expect(validateMermaidMathLabel(label).parts.filter(part => part.kind === 'math').map(part => part.tex)).toEqual(['x', 'y']);
  });

  it('rejects unmatched, multiline, and empty double-dollar pairs', () => {
    for (const label of ['before $$x', '$$x\ny$$', '$$$$']) {
      expect(() => validateMermaidMathLabel(label)).toThrowError(/Mermaid label math at UTF-16 offset/);
    }
    expect(validateMermaidMathLabel('$$x$$$$y$$').total.occurrences).toBe(2);
  });

  it('uses KaTeX’s effective strict parse and rejects unsupported or unsafe TeX', () => {
    expect(validateMermaidMathLabel(String.raw`$$\begin{matrix}a&b\\c&d\end{matrix}$$`).total.occurrences).toBe(1);
    for (const tex of [String.raw`\notacommand{x}`, String.raw`\frac{a`, String.raw`\def\foo{x}\foo`,
      String.raw`\href{https://example.com}{x}`, String.raw`\htmlClass{a}{x}`,
      String.raw`\begin{equation}x\end{equation}`, '<script>alert(1)</script>']) {
      expect(() => validateMermaidMathLabel(`$$${tex}$$`)).toThrowError(/E_MATH_INVALID|Mermaid label math/);
    }
  });

  it('enforces expression and accumulated document limits', () => {
    expect(() => validateMermaidMathLabel(`$$${'x'.repeat(MATH_LIMITS.expressionSourceBytes + 1)}$$`))
      .toThrowError(/source byte limit/);
    expect(() => validateMermaidMathLabel(String.raw`$$\rule{5000em}{1em}$$`))
      .toThrowError(/dimension limit/);
    expect(() => validateMermaidMathLabel('$$x$$', { svgBytes: 0, elementCount: 0, occurrences: MATH_LIMITS.documentOccurrences }))
      .toThrowError(/document budget/);
  });
});
