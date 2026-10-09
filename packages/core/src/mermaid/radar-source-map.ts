// Bind Radar renderer slots to the records owned by the pinned grammar.
import { createMermaidSourceDisplay, type MermaidSourceBody, type MermaidSourceExpression } from './math-source-display.ts';
import { assertMermaidSourceTransport } from './parse.ts';
import { reserveRadarTransportMath, type RadarRenderMath } from './radar-transport.ts';

export type RadarSourceMap = Readonly<{
  format: 'radar'; source: string;
  labels: ReadonlyArray<Readonly<{ key: string; expressions: readonly MermaidSourceExpression[] }>>;
}>;

export function radarMathSourceMap(
  figure: MermaidSourceBody & { radarMath: RadarRenderMath }, rawDocument: Uint8Array,
): RadarSourceMap {
  reserveRadarTransportMath(figure.radarMath);
  const display = createMermaidSourceDisplay(figure, rawDocument);
  assertMermaidSourceTransport('radar', figure.source, display.original, figure.radarMath);
  const records = new Map(figure.radarMath.records.map(record => [record.recordIndex, record]));
  const labels = figure.radarMath.slots.flatMap(slot => {
    // Each visible title, axis and legend owns one rendered label.
    const expressions = Object.freeze(display.expressions(records.get(slot.recordIndex)!.parts));
    return expressions.length ? [Object.freeze({ key: slot.key, expressions })] : [];
  });
  return Object.freeze({ format: 'radar', source: display.source, labels: Object.freeze(labels) });
}
