// Bind each planned Kanban text draw to its authenticated authored record.
import { createMermaidSourceDisplay, type MermaidSourceBody, type MermaidSourceExpression } from './math-source-display.ts';
import { assertMermaidSourceTransport } from './parse.ts';
import { reserveKanbanTransportMath, type KanbanRenderMath } from './kanban-transport.ts';

export type KanbanSourceMap = Readonly<{
  format: 'kanban'; source: string;
  labels: ReadonlyArray<Readonly<{ key: string; expressions: readonly MermaidSourceExpression[] }>>;
}>;

/**
 * Kanban transport is sparse: only draw copies with visible math are emitted.
 * Its draw key names the native copy; this suffix names the text helper within
 * that copy so the renderer can bind title, ticket, and assignee separately.
 */
export function kanbanMathSourceMap(
  figure: MermaidSourceBody & { kanbanMath: KanbanRenderMath }, rawDocument: Uint8Array,
): KanbanSourceMap {
  const display = createMermaidSourceDisplay(figure, rawDocument);
  // Authenticate before accepting resource claims or traversing source parts.
  assertMermaidSourceTransport('kanban', figure.source, display.original, figure.kanbanMath);
  reserveKanbanTransportMath(figure.kanbanMath);
  const records = figure.kanbanMath.records;
  const labels: Array<Readonly<{ key: string; expressions: readonly MermaidSourceExpression[] }>> = [];
  for (const draw of figure.kanbanMath.draws) {
    for (const [suffix, index] of [
      ['label', draw.binding.labelRecord],
      ['ticket', draw.binding.ticketRecord],
      ['assigned', draw.binding.assignedRecord],
    ] as const) {
      if (index === undefined) continue;
      const expressions = Object.freeze(display.expressions(records[index]!.parts));
      if (expressions.length) labels.push(Object.freeze({ key: `${draw.key}:${suffix}`, expressions }));
    }
  }
  return Object.freeze({ format: 'kanban', source: display.source, labels: Object.freeze(labels) });
}
