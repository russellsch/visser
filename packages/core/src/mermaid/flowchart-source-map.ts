// Flowchart owner validation over the shared original-to-display source map.
import { MathPolicyError } from '../math/policy.ts';
import { createMermaidSourceDisplay, type MermaidSourceExpression } from './math-source-display.ts';
import { assertMermaidSourceTransport } from './parse.ts';
import type { FlowchartRenderMath, MermaidFigure } from './types.ts';

export type FlowchartSourceExpression = MermaidSourceExpression;
export type FlowchartSourceMap = {
  format: 'flowchart'; source: string;
  labels: Array<{ key: string; expressions: FlowchartSourceExpression[] }>;
};
type Figure = Pick<MermaidFigure, 'source' | 'mathBodyStartByte'> & { flowchartMath: FlowchartRenderMath };
function invalid(message: string): never {
  throw new MathPolicyError('E_MATH_INVALID', `flowchart source map: ${message}`);
}

export function flowchartMathSourceMap(figure: Figure, rawDocument: Uint8Array): FlowchartSourceMap {
  const display = createMermaidSourceDisplay(figure, rawDocument);
  assertMermaidSourceTransport('flowchart', figure.source, display.original, figure.flowchartMath);
  const records = figure.flowchartMath.records;
  const labels: FlowchartSourceMap['labels'] = [];
  const seen = new Set<string>();
  for (const slot of figure.flowchartMath.slots) {
    const expected = `${slot.kind}:${slot.id}`;
    if (slot.key !== expected || seen.has(slot.key) || !Number.isSafeInteger(slot.recordIndex)) invalid('invalid or duplicate visible slot');
    seen.add(slot.key);
    const record = records[slot.recordIndex];
    if (!record?.active || record.parts.map(part => part.source).join('') !== record.renderedValue) invalid('slot has stale validated record');
    if (slot.kind === 'edge' ? record.role !== 'edge' || !record.edgeIds?.includes(slot.id)
      : slot.kind === 'subgraph' ? record.role !== 'subgraph' || record.ownerId !== slot.id
        : !record.role.startsWith('node.') || record.ownerId !== slot.id) invalid('slot differs from authored owner');
    labels.push({ key: slot.key, expressions: display.expressions(record.parts) });
  }
  return { format: 'flowchart', source: display.source, labels };
}
