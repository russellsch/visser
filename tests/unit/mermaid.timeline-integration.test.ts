import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { mermaidMathTotal, resolveMermaidFigures } from '../../packages/core/src/mermaid/index.ts';
import { checkMermaidSource } from '../../packages/core/src/mermaid/rules.ts';

const doc = (diagram: string) => `---
format: visser/1
docId: 2b6d1c0e-6f2a-4c3e-9b1d-5a7e8f9c0d1e
title: Timeline math integration
kind: teaching
capturedAt: 2026-09-27T00:00:00Z
visibility: private
---

<!-- vs:id overview -->
# Timeline math integration

{% mermaid id="figure" title="Timeline" question="What is shown?" %}
The diagram is described here.

\`\`\`mermaid
${diagram}
\`\`\`
{% /mermaid %}
`;

function bundleOf(diagram: string) {
  const dir = mkdtempSync(join(tmpdir(), 'visser-timeline-math-'));
  const source = doc(diagram);
  const path = join(dir, 'index.md');
  writeFileSync(path, source);
  try { return { bundle: loadBundle(path), source }; }
  finally { rmSync(dir, { recursive: true, force: true }); }
}

describe('timeline math through isolated worker and model', () => {
  it('preserves all fields with original CRLF/Unicode bytes', () => {
    const diagram = 'timeline LR\r\n%% ignored $$\\bad$$\r\n title Café $$x$$\r\n accTitle: α $$a$$\r\n'
      + ' accDescr: β $$b$$\r\n section S $$s$$\r\n Task 😀 $$t$$\r\n : event $$e$$';
    const { bundle, source } = bundleOf(diagram);
    expect(bundle.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    const figure = bundle.model.mermaid.get('figure')!;
    expect(figure.timelineMathLabels?.map(record => record.role)).toEqual([
      'title', 'accTitle', 'accDescr', 'section', 'task', 'event',
    ]);
    const bytes = Buffer.from(source);
    const base = figure.mathBodyStartByte!;
    for (const record of figure.timelineMathLabels!) for (const part of record.parts) if (part.kind === 'math') {
      expect(bytes.subarray(base + part.startByte, base + part.endByte).toString()).toBe(part.rawSource);
    }
    expect(mermaidMathTotal(bundle.model.mermaid.values()).occurrences).toBe(6);
  });

  it('counts duplicate section replication of task and event math', () => {
    const diagram = 'timeline\n section A $$s$$\n Task $$t$$\n : event $$e$$\n section A $$s$$\n Task $$u$$';
    const { bundle } = bundleOf(diagram);
    expect(bundle.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    const records = bundle.model.mermaid.get('figure')!.timelineMathLabels!;
    expect(records.filter(record => record.role === 'task' || record.role === 'event')
      .map(record => record.renderCopies)).toEqual([2, 2, 2]);
    expect(mermaidMathTotal(bundle.model.mermaid.values()).occurrences).toBe(8);
  });

  it('rejects malformed math in an overwritten title with its source line', () => {
    const diagram = 'timeline\r\n title $$\\notacommand{x}$$\r\n title shown\r\n section A\r\n Task';
    const { bundle, source } = bundleOf(diagram);
    const expected = source.split('\n').findIndex(line => line.includes('notacommand')) + 1;
    expect(bundle.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'E_MATH', startLine: expected, targetId: 'figure' }),
    ]));
    expect(bundle.model.mermaid.get('figure')?.timelineMathLabels).toBeUndefined();
  });

  it('validates timeline grammar even without raw $$ and retains other-family fallback guard', () => {
    const malformed = bundleOf('timeline\n accDescr {unfinished');
    expect(malformed.bundle.diagnostics.some(d => d.code === 'E_SEMANTIC')).toBe(true);
    const missing = resolveMermaidFigures([{ figureId: 'f', source: 'timeline\n title $$x$$\n section A\n Task' }]).get('f')!;
    expect(missing.issues.some(i => i.code === 'E_MATH')).toBe(true);
    expect(checkMermaidSource('timeline\n title $$x$$')).toEqual([]);
    expect(checkMermaidSource('stateDiagram-v2\n A: $$x$$').some(i => i.code === 'E_MATH')).toBe(false);
  });

  it('reports a document limit when repeated section names replicate one task beyond the math budget', () => {
    const source = `timeline\nsection A\nTask $$x$$\n${'section A\n'.repeat(1000)}`;
    const result = resolveMermaidFigures([{ figureId: 'f', source, originalSource: source, mathBodyStartByte: 0 }]).get('f')!;
    expect(result.issues.some(issue => issue.code === 'E_LIMIT')).toBe(true);
    expect(result.figure.timelineMathLabels).toBeUndefined();
  });
});
