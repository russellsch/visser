// Bind Sankey renderer slots to the records owned by the pinned grammar.
import { createMermaidSourceDisplay, type MermaidSourceBody, type MermaidSourceExpression } from './math-source-display.ts';
import { assertMermaidSourceTransport } from './parse.ts';
import { reserveSankeyTransportMath, type SankeyRenderMath } from './sankey-transport.ts';

export type SankeySourceMap = Readonly<{
  format: 'sankey'; source: string;
  labels: ReadonlyArray<Readonly<{ key: string; expressions: readonly MermaidSourceExpression[] }>>;
}>;

export function sankeyMathSourceMap(
  figure: MermaidSourceBody & { sankeyMath: SankeyRenderMath }, rawDocument: Uint8Array,
): SankeySourceMap {
  reserveSankeyTransportMath(figure.sankeyMath);
  const display = createMermaidSourceDisplay(figure, rawDocument);
  assertMermaidSourceTransport('sankey', figure.source, display.original, figure.sankeyMath);
  const records = new Map(figure.sankeyMath.records.map(record => [record.recordIndex, record]));
  const labels = figure.sankeyMath.candidates.flatMap(slot => {
    // The measured renderer draws every native node once, with no visibility
    // toggle or extra formula copy for outlined labels. Reconciliation attests
    // the complete node order and first sanitized-name owner.
    const expressions = Object.freeze(display.expressions(records.get(slot.recordIndex)!.parts));
    return expressions.length ? [Object.freeze({ key: slot.key, expressions })] : [];
  });
  return Object.freeze({ format: 'sankey', source: display.source, labels: Object.freeze(labels) });
}
