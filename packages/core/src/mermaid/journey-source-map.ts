// Bind visible journey slots to the records owned by the pinned grammar.
import { createMermaidSourceDisplay, type MermaidSourceBody, type MermaidSourceExpression } from './math-source-display.ts';
import { assertMermaidSourceTransport } from './parse.ts';
import { reserveJourneyTransportMath, type JourneyRenderMath } from './journey-transport.ts';

export type JourneySourceMap = Readonly<{
  format: 'journey'; source: string;
  labels: ReadonlyArray<Readonly<{ key: string; expressions: readonly MermaidSourceExpression[] }>>;
}>;

export function journeyMathSourceMap(
  figure: MermaidSourceBody & { journeyMath: JourneyRenderMath }, rawDocument: Uint8Array,
): JourneySourceMap {
  reserveJourneyTransportMath(figure.journeyMath);
  const display = createMermaidSourceDisplay(figure, rawDocument);
  assertMermaidSourceTransport('journey', figure.source, display.original, figure.journeyMath);
  const records = new Map(figure.journeyMath.records.map(record => [record.recordIndex, record]));
  const labels = figure.journeyMath.slots.flatMap(slot => {
    // Transport validation attests complete, unique slots and their owners.
    const expressions = Object.freeze(display.expressions(records.get(slot.recordIndex)!.parts));
    return expressions.length ? [Object.freeze({ key: slot.key, expressions })] : [];
  });
  return Object.freeze({ format: 'journey', source: display.source, labels: Object.freeze(labels) });
}
