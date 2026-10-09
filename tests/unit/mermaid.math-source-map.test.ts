import { describe, expect, it } from 'vitest';
import { parseMermaid } from '../../packages/core/src/mermaid/parse.ts';
import { pieMathSourceMap } from '../../packages/core/src/mermaid/math-source-map.ts';
import type { MermaidFigure } from '../../packages/core/src/mermaid/types.ts';
import { stripMermaidComments } from '../../packages/core/src/mermaid/rules.ts';
import { visibleBidi } from '../../packages/core/src/compiler/html.ts';

const encoder = new TextEncoder();
function workerMath(family: 'pie' | 'timeline', original: string, source = original) {
  const result = parseMermaid([{figureId: family, type: 'other', [family]: true, source, originalSource: original}]).get(family)!;
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result;
}
function pieMath(original: string, source = original) {
  const result = workerMath('pie', original, source).pieMath;
  if (!result) throw new Error('missing pie math');
  return result;
}
function timelineMath(source: string) {
  const result = workerMath('timeline', source).timelineMath;
  if (!result) throw new Error('missing timeline math');
  return result;
}

async function fixture() {
  const lines = [
    'pie',
    String.raw`%% hidden $$\bad$$`,
    String.raw`title overwritten $$x$$`,
    String.raw`title Current $$\frac{a}{b}$$ and $$x$$`,
    String.raw`"😀 $$q$$": 1`,
    String.raw`"😀 $$q$$": 2`,
    String.raw`"β $$r$$": 3`,
  ];
  const rendered = `${lines.join('\n')}\n`;
  const rawBody = `\uFEFF${lines.map(line => `  ${line}`).join('\r\n')}\r\n`;
  const prefix = '\uFEFFPreface\r\n```mermaid\r\n';
  const document = encoder.encode(`${prefix}${rawBody}\`\`\`\r\n`);
  const extracted = pieMath(rawBody, rendered);
  const figure: MermaidFigure = {
    figureId: 'pie_1', diagramType: 'other', declaredType: 'pie', parsed: false,
    source: rendered, elements: [], relationships: [], mathLabels: extracted.records,
    mathBodyStartByte: encoder.encode(prefix).length,
  };
  return { figure, document, rawBody };
}

describe('pie code source map', () => {
  it('maps active math through BOM, CRLF, Unicode, fence dedent and removed comments', async () => {
    const { figure, document } = await fixture();
    const result = pieMathSourceMap(figure, document);
    expect(result.source).toBe(stripMermaidComments(figure.source));
    expect(result.source).not.toContain('hidden');
    expect(result.labels.map(label => [label.key, label.expressions.map(expression => expression.tex)])).toEqual([
      ['title', [String.raw`\frac{a}{b}`, 'x']],
      ['section:0', ['q']],
      ['section:1', ['r']],
    ]);
    for (const label of result.labels) for (const expression of label.expressions) {
      expect(result.source.slice(expression.start, expression.end)).toBe(expression.rawSource);
    }
    expect(result.labels[0]!.expressions[0]!.start).toBeLessThan(result.labels[0]!.expressions[1]!.start);
    expect(result.labels[1]!.expressions[0]!.start).toBeLessThan(result.labels[2]!.expressions[0]!.start);
  });

  it('rejects stale byte spans, changed source and incorrect duplicate activity', async () => {
    const { figure, document } = await fixture();
    expect(() => pieMathSourceMap({ ...figure, mathBodyStartByte: figure.mathBodyStartByte! + 1 }, document)).toThrow(/Mermaid source map|flowchart source mapping/);
    expect(() => pieMathSourceMap({ ...figure, source: figure.source.replace('Current', 'Changed') }, document)).toThrow(/Mermaid source map|flowchart source mapping/);
    const labels = structuredClone(figure.mathLabels!);
    const firstTitle = labels.find(record => record.role === 'title' && record.active)!;
    const math = firstTitle.parts.find(part => part.kind === 'math')!;
    math.endByte++;
    expect(() => pieMathSourceMap({ ...figure, mathLabels: labels }, document)).toThrow(/Mermaid source map|flowchart source mapping/);
    const duplicateLabels = structuredClone(figure.mathLabels!);
    duplicateLabels.find(record => record.role === 'section.label' && !record.active)!.active = true;
    expect(() => pieMathSourceMap({ ...figure, mathLabels: duplicateLabels }, document)).toThrow(/duplicate activity/);
  });

  it('returns the unchanged comment-free source for a figure with no math records', () => {
    const figure: MermaidFigure = { figureId: 'plain', diagramType: 'other', declaredType: 'pie', parsed: false,
      source: 'pie\n%% comment\n"A": 1\n', elements: [], relationships: [] };
    expect(pieMathSourceMap(figure, new Uint8Array())).toEqual({ source: 'pie\n"A": 1\n', labels: [] });
  });

  it('uses the compiler-visible bidi spelling before formulas when calculating UTF-16 offsets', async () => {
    const body = 'pie\n title A \u202E then $$x$$\n "B \u2066 $$y$$": 1\n';
    const extracted = pieMath(body);
    const figure: MermaidFigure = { figureId: 'bidi', diagramType: 'other', declaredType: 'pie', parsed: false,
      source: body, elements: [], relationships: [], mathLabels: extracted.records, mathBodyStartByte: 0 };
    const mapped = pieMathSourceMap(figure, encoder.encode(body));
    expect(mapped.source).toBe(visibleBidi(body));
    expect(mapped.labels.map(label => label.expressions[0]?.start)).toEqual([
      mapped.source.indexOf('$$x$$'), mapped.source.indexOf('$$y$$'),
    ]);
    for (const label of mapped.labels) for (const expression of label.expressions) {
      expect(mapped.source.slice(expression.start, expression.end)).toBe(expression.rawSource);
    }
  });

  it('omits a grammar-accepted empty title because Mermaid creates no title label', async () => {
    const body = 'pie\n title\n "A $$x$$": 1\n';
    const extracted = pieMath(body);
    expect(extracted.records[0]).toMatchObject({ role: 'title', value: '', active: true });
    const figure: MermaidFigure = { figureId: 'empty', diagramType: 'other', declaredType: 'pie', parsed: false,
      source: body, elements: [], relationships: [], mathLabels: extracted.records, mathBodyStartByte: 0 };
    expect(pieMathSourceMap(figure, encoder.encode(body)).labels.map(label => label.key)).toEqual(['section:0']);
  });
});

import { timelineMathSourceMap } from '../../packages/core/src/mermaid/math-source-map.ts';

describe('timeline code source map', () => {
  it('maps repeated section copies to the same original task and event bytes', async () => {
    const body = 'timeline\n title $$t$$\n Hidden $$h$$ : $$z$$\n section Same $$s$$\n Task $$x$$ : Event $$y$$\n section Same $$s$$\n Other $$q$$ : Last $$r$$\n';
    const extracted = timelineMath(body);
    const figure: MermaidFigure = { figureId: 'timeline', diagramType: 'other', declaredType: 'timeline', parsed: false,
      source: body, elements: [], relationships: [], mathBodyStartByte: 0,
      timelineMathLabels: extracted.records };
    const mapped = timelineMathSourceMap(figure, encoder.encode(body));
    expect(mapped.labels.map(label => label.key)).toEqual([
      'title', 'section:0', 'task:0:1', 'task:1:1', 'event:0:1:0', 'event:1:1:0',
      'section:1', 'task:0:2', 'task:1:2', 'event:0:2:0', 'event:1:2:0',
    ]);
    expect(mapped.labels.filter(label => label.key.startsWith('task:')).map(label => label.expressions[0]!.start))
      .toEqual([body.indexOf('$$x$$'), body.indexOf('$$x$$'), body.indexOf('$$q$$'), body.indexOf('$$q$$')]);
    for (const label of mapped.labels) for (const expression of label.expressions) {
      expect(mapped.source.slice(expression.start, expression.end)).toBe(expression.rawSource);
    }
  });
  it('uses the unsectioned renderer group when no sections exist', async () => {
    const body = 'timeline\n Task $$x$$ : Event $$y$$\n';
    const extracted = timelineMath(body);
    const figure: MermaidFigure = { figureId: 'timeline', diagramType: 'other', declaredType: 'timeline', parsed: false,
      source: body, elements: [], relationships: [], mathBodyStartByte: 0,
      timelineMathLabels: extracted.records };
    expect(timelineMathSourceMap(figure, encoder.encode(body)).labels.map(label => label.key))
      .toEqual(['task:none:0', 'event:none:0:0']);
  });
});
