import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { compileDocument } from '../../packages/core/src/compiler/compile.ts';
import { checkMermaidSource } from '../../packages/core/src/mermaid/rules.ts';

const toolkit = { version: '0.0.0', sha256: 'a'.repeat(64),
  integrity: { 'mermaid.js': 'sha384-TESTDIGEST' } };
const options = { audience: 'private' as const, includeSource: false, layoutFallback: false };

function documentOf(diagram: string): string {
  return `---
format: visser/1
docId: 2b6d1c0e-6f2a-4c3e-9b1d-5a7e8f9c0d1e
title: Mermaid math guard
kind: teaching
capturedAt: 2026-09-27T00:00:00Z
visibility: private
---

<!-- vs:id overview -->
# Mermaid math guard

{% mermaid id="figure" title="Guard" question="What is shown?" %}
The diagram is described here.

\`\`\`mermaid
${diagram}
\`\`\`
{% /mermaid %}
`;
}

async function withBundle<T>(diagram: string, use: (bundle: ReturnType<typeof loadBundle>, source: string) => T | Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'visser-mermaid-math-guard-'));
  try {
    const source = documentOf(diagram);
    const path = join(dir, 'index.md');
    writeFileSync(path, source);
    return await use(loadBundle(path), source);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('Mermaid math export validation', () => {
  it.each([String.raw`"\u0069con": "fa:user"`, String.raw`"\u0069mg": "https://example.invalid/image.png"`, 'key: &k icon, *k : "fa:user"'])('rejects decoded unsafe metadata before export: %s', async metadata => {
    await withBundle(`flowchart LR\nA@{ ${metadata} }`, async (bundle, source) => {
      const expectedLine = source.split('\n').findIndex(line => line.includes(metadata)) + 1;
      await expect(compileDocument(bundle, toolkit, options)).rejects.toMatchObject({ diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'E_UNSAFE_CONTENT', startLine: expectedLine, message: expect.stringMatching(/decoded (?:icon|img) property/) }),
      ]) });
    });
  });
  it.each([String.raw`"\u0024\u0024x\u0024\u0024"`, String.raw`["\u0024\u0024x\u0024\u0024", "unused"]`])('exports validated YAML-decoded delimiters absent from source: %s', async label => {
    const diagram = `flowchart LR\n A@{ label: ${label} }`;
    expect(diagram.includes('$$')).toBe(false);
    await withBundle(diagram, async bundle => {
      expect(bundle.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
      const math = bundle.model.mermaid.get('figure')!.flowchartMath!;
      expect(math.slots.some(slot => slot.key === 'node:A')).toBe(true);
      expect(math.records.flatMap(record => record.parts).filter(part => part.kind === 'math')).toHaveLength(1);
      const output = await compileDocument(bundle, toolkit, options);
      const html = new TextDecoder().decode(output.files.find(file => file.path.endsWith('index.html'))!.bytes);
      expect(html).toContain('data-vs-mermaid-flowchart-slots=');
      expect(html).toContain('data-vs-mermaid-source-map=');
      expect(html).toContain('encoded&quot;:true');
    });
  });
  it.each([
    ['gantt', 'gantt\n title $$x^2$$', 'title $$x^2$$'],
  ])('reports an E_MATH line and blocks %s export', async (family, diagram, labelLine) => {
    await withBundle(diagram, async (bundle, source) => {
      const expectedLine = source.split('\n').findIndex(line => line.includes(labelLine)) + 1;
      const math = bundle.diagnostics.filter(d => d.code === 'E_MATH');
      expect(math).toHaveLength(1);
      expect(math[0]).toMatchObject({ path: 'index.md', targetId: 'figure', startLine: expectedLine, severity: 'error' });
      expect(math[0]!.message).toContain(`${family} math adapter is not implemented`);
      await expect(compileDocument(bundle, toolkit, options)).rejects.toMatchObject({ diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'E_MATH', startLine: expectedLine }),
      ]) });
    });
  });

  it('leaves plain diagrams and math-like whole-line comments unaffected', async () => {
    for (const diagram of [
      'flowchart LR\n %% $$not-a-label$$\n A --> B',
      'pie\n %% $$not-a-label$$\n "One" : 1',
    ]) {
      expect(checkMermaidSource(diagram).filter(issue => issue.code === 'E_MATH')).toEqual([]);
      await withBundle(diagram, bundle => {
        expect(bundle.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
      });
    }
  });
});

it.each(['$$x$$', String.raw`\u0024\u0024x\u0024\u0024`])('exports verified ELK math with original source records: %s', async label => {
  await withBundle(`flowchart-elk\n A@{label: "${label}"}`, async bundle => {
    expect(bundle.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(bundle.model.mermaid.get('figure')!.flowchartMath!.slots).toEqual([
      expect.objectContaining({ key: 'node:A', kind: 'node', id: 'A' }),
    ]);
    const output = await compileDocument(bundle, toolkit, options);
    const html = new TextDecoder().decode(output.files.find(file => file.path.endsWith('index.html'))!.bytes);
    expect(html).toContain('data-vs-mermaid-source-map=');
  });
});
