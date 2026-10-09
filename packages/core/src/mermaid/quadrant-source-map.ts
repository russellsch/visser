// Bind visible quadrant slots to the records owned by the pinned grammar.
import { createMermaidSourceDisplay, type MermaidSourceBody, type MermaidSourceExpression } from './math-source-display.ts';
import { assertMermaidSourceTransport } from './parse.ts';
import { reserveQuadrantTransportMath, type QuadrantRenderMath } from './quadrant-transport.ts';

export type QuadrantSourceMap = Readonly<{
  format: 'quadrant'; source: string;
  labels: ReadonlyArray<Readonly<{ key: string; expressions: readonly MermaidSourceExpression[] }>>;
}>;

export function quadrantMathSourceMap(
  figure: MermaidSourceBody & { quadrantMath: QuadrantRenderMath }, rawDocument: Uint8Array,
): QuadrantSourceMap {
  reserveQuadrantTransportMath(figure.quadrantMath);
  const display = createMermaidSourceDisplay(figure, rawDocument);
  assertMermaidSourceTransport('quadrant', figure.source, display.original, figure.quadrantMath);
  const records = new Map(figure.quadrantMath.records.map(record => [record.recordIndex, record]));
  const labels = figure.quadrantMath.slots.flatMap(slot => {
    // Transport validation attests complete, unique slots and their owners.
    const expressions = Object.freeze(display.expressions(records.get(slot.recordIndex)!.parts));
    return expressions.length ? [Object.freeze({ key: slot.key, expressions })] : [];
  });
  return Object.freeze({ format: 'quadrant', source: display.source, labels: Object.freeze(labels) });
}
