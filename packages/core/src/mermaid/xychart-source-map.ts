// Bind visible xychart slots to the records owned by the pinned grammar.
import { createMermaidSourceDisplay, type MermaidSourceBody, type MermaidSourceExpression } from './math-source-display.ts';
import { assertMermaidSourceTransport } from './parse.ts';
import { reserveXYTransportMath, type XYRenderMath } from './xychart-transport.ts';

export type XYSourceMap = Readonly<{
  format: 'xychart'; source: string;
  labels: ReadonlyArray<Readonly<{ key: string; expressions: readonly MermaidSourceExpression[] }>>;
}>;

export function xyMathSourceMap(
  figure: MermaidSourceBody & { xyMath: XYRenderMath }, rawDocument: Uint8Array,
): XYSourceMap {
  reserveXYTransportMath(figure.xyMath);
  const display = createMermaidSourceDisplay(figure, rawDocument);
  assertMermaidSourceTransport('xy', figure.source, display.original, figure.xyMath);
  const records = new Map(figure.xyMath.records.map(record => [record.recordIndex, record]));
  const labels = figure.xyMath.slots.flatMap(slot => {
    // Transport validation attests complete, unique slots and their owners.
    const expressions = Object.freeze(display.expressions(records.get(slot.recordIndex)!.parts));
    return expressions.length ? [Object.freeze({ key: slot.key, expressions })] : [];
  });
  return Object.freeze({ format: 'xychart', source: display.source, labels: Object.freeze(labels) });
}
