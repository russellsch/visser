import { assertRequirementSourceTransport } from './parse.ts';
// Bind Requirement renderer slots to the records owned by the pinned grammar.
import { createMermaidSourceDisplay, type MermaidSourceBody, type MermaidSourceExpression } from './math-source-display.ts';
import { reserveRequirementTransportMath, type RequirementRenderMath } from './requirement-transport.ts';

export type RequirementSourceMap = Readonly<{
  format: 'requirement'; source: string;
  labels: ReadonlyArray<Readonly<{ key: string; expressions: readonly MermaidSourceExpression[] }>>;
}>;

export function requirementMathSourceMap(
  figure: MermaidSourceBody & { requirementMath: RequirementRenderMath }, rawDocument: Uint8Array,
): RequirementSourceMap {
  reserveRequirementTransportMath(figure.requirementMath);
  const display = createMermaidSourceDisplay(figure, rawDocument);
  assertRequirementSourceTransport(figure.source, display.original, figure.requirementMath);
  const records = new Map(figure.requirementMath.records.map(record => [record.recordIndex, record]));
  const labels = figure.requirementMath.slots.flatMap(slot => {
    // Each surviving native row owns one rendered label.
    const expressions = Object.freeze(display.expressions(records.get(slot.recordIndex)!.parts));
    return expressions.length ? [Object.freeze({ key: slot.key, expressions })] : [];
  });
  return Object.freeze({ format: 'requirement', source: display.source, labels: Object.freeze(labels) });
}
