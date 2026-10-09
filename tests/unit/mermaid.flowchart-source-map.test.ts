import { describe, expect, it } from 'vitest';
import { flowchartMathSourceMap } from '../../packages/core/src/mermaid/flowchart-source-map.ts';
import { parseMermaid } from '../../packages/core/src/mermaid/parse.ts';
import { normalizeMermaidSource } from '../../packages/core/src/mermaid/rules.ts';
import type { FlowchartRenderMath, MermaidFigure } from '../../packages/core/src/mermaid/types.ts';

const encoder = new TextEncoder();

async function fixture(original: string, shown = normalizeMermaidSource(original), prefix = '') {
  const result = parseMermaid([{ figureId: 'f', type: 'flowchart', source: shown, originalSource: original }]).get('f')!;
  if (!result.ok || !result.flowchartMath) throw new Error(JSON.stringify(result));
  const figure: MermaidFigure = { figureId: 'f', diagramType: 'flowchart', declaredType: 'flowchart', parsed: true,
    source: shown, elements: [], relationships: [], mathBodyStartByte: encoder.encode(prefix).length,
    flowchartMath: result.flowchartMath };
  return { figure, document: encoder.encode(prefix + original) };
}

describe('flowchart source-owned code mapping', () => {
  it('maps literal node, edge, and cluster labels and preserves empty visible slots', async () => {
    const body = 'flowchart LR\nA["left $$x$$ and $$y$$"] -->|"edge $$z$$"| B[plain]\nsubgraph G["group $$q$$"]\nC[plain]\nend\n';
    const { figure, document } = await fixture(body);
    const map = flowchartMathSourceMap(figure as typeof figure & { flowchartMath: FlowchartRenderMath }, document);
    expect(map.format).toBe('flowchart');
    expect(map.labels.some(label => label.key === 'node:B' && label.expressions.length === 0)).toBe(true);
    expect(map.labels.some(label => label.key === 'subgraph:G' && label.expressions[0]?.tex === 'q')).toBe(true);
    expect(map.labels.some(label => label.key.startsWith('edge:') && label.expressions[0]?.tex === 'z')).toBe(true);
    const node = map.labels.find(label => label.key === 'node:A')!;
    expect(node.expressions.map(item => item.tex)).toEqual(['x', 'y']);
    for (const label of map.labels) for (const expression of label.expressions) {
      if ('rawSource' in expression) expect(map.source.slice(expression.start, expression.end)).toBe(expression.rawSource);
    }
  });

  it('marks YAML escapes encoded while retaining the exact authored escape span', async () => {
    const body = String.raw`flowchart LR
A@{label: "\u0024\u0024x\u0024\u0024"}
`;
    const { figure, document } = await fixture(body);
    const map = flowchartMathSourceMap(figure as typeof figure & { flowchartMath: FlowchartRenderMath }, document);
    const expression = map.labels.find(label => label.key === 'node:A')!.expressions[0]!;
    expect(expression).toMatchObject({ tex: 'x', encoded: true });
    if (!('rawSource' in expression)) throw new Error('expected authored source');
    expect(expression.rawSource).toBe(String.raw`\u0024\u0024x\u0024\u0024`);
    expect(map.source.slice(expression.start, expression.end)).toBe(expression.rawSource);
  });

  it('maps BOM, CRLF, dedent, comments, Unicode, and visible bidi without exposing comments', async () => {
    const shown = 'flowchart LR\n%% private $$hidden$$\nA["😀 \u202E $$x$$"]\n';
    const original = '\uFEFF' + shown.trimEnd().split('\n').map(line => `  ${line}`).join('\r\n') + '\r\n';
    const visible = shown;
    const { figure, document } = await fixture(original, visible, 'intro\r\n```mermaid\r\n');
    const map = flowchartMathSourceMap(figure as typeof figure & { flowchartMath: FlowchartRenderMath }, document);
    expect(map.source).not.toContain('private');
    expect(map.source).toContain('⟨U+202E⟩');
    const expression = map.labels.find(label => label.key === 'node:A')!.expressions[0]!;
    if (!('rawSource' in expression)) throw new Error('expected authored source');
    expect(map.source.slice(expression.start, expression.end)).toBe('$$x$$');
  });

  it('uses alias-definition provenance without searching the repeated formula text', async () => {
    const body = 'flowchart LR\nA@{base: &name "$$x$$", label: *name}\nB["$$x$$"]\n';
    const { figure, document } = await fixture(body);
    const map = flowchartMathSourceMap(figure as typeof figure & { flowchartMath: FlowchartRenderMath }, document);
    const a = map.labels.find(label => label.key === 'node:A')!.expressions[0]!;
    const b = map.labels.find(label => label.key === 'node:B')!.expressions[0]!;
    if (!('start' in a) || !('start' in b)) throw new Error('expected source spans');
    expect(a.start).toBeLessThan(b.start);
    expect(map.source.slice(a.start, a.end)).toBe('$$x$$');
  });

  it('keeps a folded YAML formula unrepresentable when indentation creates disjoint origins', async () => {
    const body = 'flowchart LR\nA@{label: >-\n  $$x\n  + y$$\n}\n';
    const { figure, document } = await fixture(body);
    const map = flowchartMathSourceMap(figure as typeof figure & { flowchartMath: FlowchartRenderMath }, document);
    const expression = map.labels.find(label => label.key === 'node:A')!.expressions[0]!;
    expect(expression).toEqual({ tex: 'x + y', unrepresentable: true });
  });

  it('preserves edge fanout source ownership and leaves disjoint origins unrepresentable', async () => {
    const body = 'flowchart LR\nA & B -->|"$$x$$"| C & D\n';
    const { figure, document } = await fixture(body);
    const map = flowchartMathSourceMap(figure as typeof figure & { flowchartMath: FlowchartRenderMath }, document);
    const edges = map.labels.filter(label => label.key.startsWith('edge:'));
    expect(edges).toHaveLength(4);
    expect(new Set(edges.map(label => 'start' in label.expressions[0]! ? label.expressions[0].start : -1)).size).toBe(1);
    const changed = structuredClone(figure) as typeof figure & { flowchartMath: FlowchartRenderMath };
    const record = changed.flowchartMath.records[changed.flowchartMath.slots.find(slot => slot.kind === 'edge')!.recordIndex]!;
    const expression = record.parts.find(part => part.kind === 'math')!;
    expression.origins = [expression.origins[0]!, expression.origins[0]!];
    expect(() => flowchartMathSourceMap(changed, document)).toThrow(/authenticated source ownership/);
  });

  it('marks a repeated source origin unrepresentable when it overlaps a prior formula in one label', async () => {
    const body = 'flowchart LR\nA["$$x$$ and $$x$$"]\n';
    const { figure, document } = await fixture(body);
    const changed = structuredClone(figure) as typeof figure & { flowchartMath: FlowchartRenderMath };
    const record = changed.flowchartMath.records.find(item => item.ownerId === 'A')!;
    const parts = record.parts.filter(part => part.kind === 'math');
    parts[1]!.origins = parts[0]!.origins;
    expect(() => flowchartMathSourceMap(changed, document)).toThrow(/authenticated source ownership/);
  });

  it('rejects stale body bytes, stale provenance, and duplicate or inactive slot identity', async () => {
    const { figure, document } = await fixture('flowchart LR\nA["$$x$$"]\n');
    const typed = figure as typeof figure & { flowchartMath: FlowchartRenderMath };
    expect(() => flowchartMathSourceMap({ ...typed, mathBodyStartByte: 1 }, document)).toThrow(/flowchart source map|flowchart source mapping/);
    const stale = structuredClone(typed);
    const expression = stale.flowchartMath.records.find(record => record.ownerId === 'A')!.parts.find(part => part.kind === 'math')!;
    Object.assign(expression.origins[0]!, { startByte: expression.origins[0]!.startByte + 1 });
    expect(() => flowchartMathSourceMap(stale, document)).toThrow(/authenticated source ownership/);
    const duplicate = structuredClone(typed);
    duplicate.flowchartMath.slots.push(duplicate.flowchartMath.slots[0]!);
    expect(() => flowchartMathSourceMap(duplicate, document)).toThrow(/authenticated source ownership/);
    const inactive = structuredClone(typed);
    inactive.flowchartMath.records[inactive.flowchartMath.slots[0]!.recordIndex]!.active = false;
    expect(() => flowchartMathSourceMap(inactive, document)).toThrow(/authenticated source ownership/);
  });
});
