import { describe, expect, it } from 'vitest';
import { extractFlowchartMath, LocatedFlowchartMathError, mapSharedMermaidMathInput } from '../../packages/core/src/mermaid/flowchart-math.ts';
import { ProvenanceText } from '../../packages/core/src/mermaid/source-provenance.ts';
import { MATH_LIMITS } from '../../packages/core/src/math/policy.ts';

const visible = (records: Awaited<ReturnType<typeof extractFlowchartMath>>['records']) => records.filter(record => record.active);

describe('composed flowchart math validation', () => {
  it('validates actual shared-renderer slash normalization and reserves edge fanout copies', async () => {
    const source = String.raw`flowchart LR
 A["Rate $$\\frac{a}{b}$$"] & B -->|"Edge $$x$$"| C & D
`;
    const result = await extractFlowchartMath(source);
    expect(result.total.occurrences).toBe(5);
    const node = result.records.find(record => record.ownerId === 'A' && record.role === 'node.explicit')!;
    expect(node.renderedValue).toBe(String.raw`Rate $$\frac{a}{b}$$`);
    const math = node.parts.find(part => part.kind === 'math')!;
    expect(math.origins).toHaveLength(1);
    expect(math.origins[0]!.rawSource).toBe(String.raw`$$\\frac{a}{b}$$`);
    expect(result.records.find(record => record.role === 'edge')!.renderCopies).toBe(4);
    expect(result.records.find(record => record.role === 'edge')!.endpoints).toEqual([
      { start: 'A', end: 'C' }, { start: 'A', end: 'D' },
      { start: 'B', end: 'C' }, { start: 'B', end: 'D' },
    ]);
    expect(node.labelType).toBe('string');
  });
  it('lets same-value metadata replace the original label source and a later explicit label replace metadata', async () => {
    const source = 'flowchart LR\nA["$$x$$"]\nA@{label: "$$x$$"}\nB@{label: "$$y$$"}\nB["$$z$$"]\n';
    const result = await extractFlowchartMath(source);
    expect(visible(result.records).filter(record => record.ownerId === 'A').map(record => record.role)).toEqual(['node.metadata']);
    expect(visible(result.records).filter(record => record.ownerId === 'B').map(record => record.semanticValue)).toEqual(['$$z$$']);
    expect(result.total.occurrences).toBe(4);
  });
  it('decodes escaped-dollar and array metadata labels before validation', async () => {
    const source = String.raw`flowchart LR
 A@{label: "\u0024\u0024x\u0024\u0024"}
 B@{label: ["$$y$$", "$$\\badUnusedCommand$$"]}
`;
    const result = await extractFlowchartMath(source);
    expect(visible(result.records).filter(record => record.role === 'node.metadata').map(record => record.renderedValue)).toEqual(['$$x$$', '$$y$$']);
    expect(result.total.occurrences).toBe(2);
    expect(visible(result.records).filter(record => record.role === 'node.metadata').map(record => record.labelType)).toEqual(['markdown', 'markdown']);
  });
  it('uses pinned metadata labelType selection for the final displayed string', async () => {
    const source = 'flowchart LR\nA@{label: "$$x$$", labelType: string}\nB@{label: "$$y$$", labelType: unknown}\n';
    const records = visible((await extractFlowchartMath(source)).records).filter(record => record.role === 'node.metadata');
    expect(records.map(record => [record.ownerId, record.labelType])).toEqual([
      ['A', 'string'], ['B', 'markdown'],
    ]);
  });
  it('uses the pinned accessibility DB newline-indentation transform and preserves math source', async () => {
    const source = 'flowchart LR\naccDescr {first $$x$$\n   second $$y$$}\nA[plain]\n';
    const record = (await extractFlowchartMath(source)).records.find(record => record.role === 'accDescr')!;
    expect(record.semanticValue).toBe('first $$x$$\nsecond $$y$$');
    expect(record.renderedValue).toBe(record.semanticValue);
    const expressions = record.parts.filter(part => part.kind === 'math');
    expect(expressions).toHaveLength(2);
    expect(expressions.map(part => part.origins[0]!.rawSource)).toEqual(['$$x$$', '$$y$$']);
  });
  it.each(['42', 'true', '[]', '[42]'])('rejects a final truthy non-string metadata label %s', async label => {
    const source = `flowchart LR\nA["$$x$$"]\nA@{label: ${label}}\n`;
    let failure: unknown;
    try { await extractFlowchartMath(source); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(LocatedFlowchartMathError);
    const error = failure as LocatedFlowchartMathError;
    expect(error.code).toBe('E_MATH_INVALID');
    expect(error.startLine).toBe(3);
    expect(error.intervals.map(interval => interval.rawSource).join('')).toContain(`label: ${label}`);
  });
  it('permits a later explicit string after typed metadata while validating earlier authored math', async () => {
    const source = 'flowchart LR\nA["$$x$$"]\nA@{label: true}\nA["$$y$$"]\n';
    const result = await extractFlowchartMath(source);
    expect(visible(result.records).filter(record => record.ownerId === 'A').map(record => record.semanticValue)).toEqual(['$$y$$']);
    expect(result.total.occurrences).toBe(2);
    const invalidEarlier = String.raw`flowchart LR
A["$$\unsupportedVisserCommand$$"]
A@{label: true}
A["$$y$$"]
`;
    await expect(extractFlowchartMath(invalidEarlier)).rejects.toThrow(/KaTeX rejected/);
  });
  it('rejects unsupported overwritten expressions instead of validating only final DB strings', async () => {
    await expect(extractFlowchartMath(String.raw`flowchart LR
 A["$$\unsupportedVisserCommand$$"]
 A["plain"]
`)).rejects.toThrow(/KaTeX rejected/);
  });
  it('retains literal breaks as separate input lines and their original spans', () => {
    const raw = 'one<br/>two $$x$$';
    const mapped = mapSharedMermaidMathInput(ProvenanceText.identity(raw));
    expect(mapped.text).toBe('one\ntwo $$x$$');
    expect(mapped.mapRange(3, 4).intervals).toEqual([{ start: 3, end: 8 }]);
  });
  it('locates an escaped metadata failure on its exact original field with BOM, CRLF, and astral text', async () => {
    const field = String.raw`\u0024\u0024\u005CunsupportedVisserCommand\u0024\u0024`;
    const source = `\uFEFFflowchart LR\r\nA["😀 plain"]\r\nA@{label: "${field}"}\r\n`;
    let failure: unknown;
    try { await extractFlowchartMath(source); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(LocatedFlowchartMathError);
    const error = failure as LocatedFlowchartMathError;
    expect(error.code).toBe('E_MATH_INVALID');
    expect(error.startLine).toBe(3);
    expect(error.synthetic).toBe(false);
    expect(error.intervals).toHaveLength(1);
    expect(error.intervals[0]!.rawSource).toBe(field);
    const start = source.indexOf(field);
    expect(error.startByte).toBe(Buffer.byteLength(source.slice(0, start)));
    expect(error.endByte).toBe(Buffer.byteLength(source.slice(0, start + field.length)));
    expect(Object.isFrozen(error.intervals)).toBe(true);
    expect(Object.isFrozen(error.intervals[0])).toBe(true);
  });
  it('locates an edge fanout resource failure at the full original edge label', async () => {
    const field = '$$x$$';
    const source = `flowchart LR\r\nA & B -->|${field}| C & D\r\n`;
    let failure: unknown;
    try {
      await extractFlowchartMath(source, {
        svgBytes: 0, elementCount: 0, occurrences: MATH_LIMITS.documentOccurrences - 2,
      });
    } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(LocatedFlowchartMathError);
    const error = failure as LocatedFlowchartMathError;
    expect(error.code).toBe('E_MATH_DOCUMENT_LIMIT');
    expect(error.startLine).toBe(2);
    expect(error.synthetic).toBe(false);
    expect(error.intervals.map(interval => interval.rawSource)).toEqual([field]);
    const start = source.indexOf(field);
    expect(error.startByte).toBe(Buffer.byteLength(source.slice(0, start)));
    expect(error.endByte).toBe(Buffer.byteLength(source.slice(0, start + field.length)));
  });
});
