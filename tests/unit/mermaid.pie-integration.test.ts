import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { resolveMermaidFigures, mermaidMathTotal } from '../../packages/core/src/mermaid/index.ts';

const doc = (diagram: string) => `---
format: visser/1
docId: 2b6d1c0e-6f2a-4c3e-9b1d-5a7e8f9c0d1e
title: Pie math integration
kind: teaching
capturedAt: 2026-09-27T00:00:00Z
visibility: private
---

<!-- vs:id overview -->
# Pie math integration

{% mermaid id="figure" title="Pie" question="What is shown?" %}
The diagram is described here.

\`\`\`mermaid
${diagram}
\`\`\`
{% /mermaid %}
`;

function bundleOf(diagram: string) {
  const dir = mkdtempSync(join(tmpdir(), 'visser-pie-math-'));
  const source = doc(diagram);
  const path = join(dir, 'index.md');
  writeFileSync(path, source);
  try { return { bundle: loadBundle(path), source }; }
  finally { rmSync(dir, { recursive: true, force: true }); }
}

describe('pie math through isolated worker and model', () => {
  it('preserves all source-owned labels, exact Unicode/CRLF bytes and cumulative cost', () => {
    const diagram = 'pie\r\n%% ignored $$\\bad$$\r\n title Café $$x$$\r\n "😀 $$y$$": 1';
    const { bundle, source } = bundleOf(diagram);
    expect(bundle.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    const figure = bundle.model.mermaid.get('figure')!;
    expect(figure.mathLabels?.map(r => r.role)).toEqual(['title', 'section.label']);
    const base = figure.mathBodyStartByte!;
    const raw = Buffer.from(source);
    for (const record of figure.mathLabels!) for (const part of record.parts) if (part.kind === 'math') {
      expect(raw.subarray(base + part.startByte, base + part.endByte).toString()).toBe(part.rawSource);
    }
    expect(mermaidMathTotal(bundle.model.mermaid.values()).occurrences).toBe(2);
  });

  it('reports malformed math at its source line and rejects export input', () => {
    const diagram = 'pie\r\n%% ignored $$\\bad$$\r\n "😀 $$\\notacommand{x}$$": 1';
    const { bundle, source } = bundleOf(diagram);
    const line = source.split('\n').findIndex(row => row.includes('notacommand')) + 1;
    expect(bundle.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'E_MATH', startLine: line, targetId: 'figure' }),
    ]));
    expect(bundle.model.mermaid.get('figure')?.mathLabels).toBeUndefined();
  });

  it('validates overwritten titles and budgets duplicates even when not displayed', () => {
    const good = bundleOf('pie\n title first $$x$$\n title second $$y$$\n "A $$a$$": 1\n "A $$a$$": 2');
    const labels = good.bundle.model.mermaid.get('figure')?.mathLabels;
    expect(labels?.map(r => r.active)).toEqual([false, true, true, false]);
    expect(mermaidMathTotal(good.bundle.model.mermaid.values()).occurrences).toBe(4);
    const bad = bundleOf('pie\n title $$\\notacommand{x}$$\n title shown\n "A": 1');
    expect(bad.bundle.diagnostics.some(d => d.code === 'E_MATH')).toBe(true);
  });

  it('carries title, accessibility title and description, and section labels through the renderer cross-check', () => {
    const { bundle } = bundleOf('pie\n title T $$x$$\n accTitle: A $$y$$\n accDescr: B $$z$$\n "S $$q$$": 1');
    expect(bundle.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(bundle.model.mermaid.get('figure')?.mathLabels?.map(r => r.role)).toEqual([
      'title', 'accTitle', 'accDescr', 'section.label',
    ]);
  });

  it('fails closed without original source and leaves comments-only math unchanged', () => {
    const missing = resolveMermaidFigures([{ figureId: 'figure', source: 'pie\n "$$x$$": 1' }]).get('figure')!;
    expect(missing.issues.some(i => i.code === 'E_MATH')).toBe(true);
    const plain = bundleOf('pie\n %% $$\\bad$$\n "A": 1');
    expect(plain.bundle.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  });

  it('rejects math decoded from escaped dollar signs by the pie grammar', () => {
    const diagram = String.raw`pie
 "\$\$\notacommand{x}\$\$": 1`;
    expect(diagram.includes('$$')).toBe(false);
    const { bundle } = bundleOf(diagram);
    expect(bundle.diagnostics.some(d => d.code === 'E_MATH')).toBe(true);
    expect(bundle.model.mermaid.get('figure')?.mathLabels).toBeUndefined();
  });
});
