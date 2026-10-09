// Bind transported state render slots to their grammar-owned Mermaid sources.
import { MathPolicyError, type MathResourceTotal } from '../math/policy.ts';
import { createMermaidSourceDisplay, type MermaidSourceBody, type MermaidSourceExpression } from './math-source-display.ts';
import { assertMermaidSourceTransport } from './parse.ts';
import { reserveStateTransportMath, type StateRenderMath } from './state-transport.ts';

export type StateSourceMap = Readonly<{
  format: 'state'; source: string;
  labels: ReadonlyArray<Readonly<{ key: string; expressions: readonly MermaidSourceExpression[] }>>;
}>;
type Figure = MermaidSourceBody & { stateMath: StateRenderMath };

function invalid(message: string): never { throw new MathPolicyError('E_MATH_INVALID', `state source map: ${message}`); }
function allowed(slot: StateRenderMath['slots'][number]): boolean {
  if (slot.ownerKind === 'edge') return slot.shape === 'edge' && slot.role === 'label' && slot.inputPath === 'edge';
  if (slot.shape === 'rect' || slot.shape === 'note') return slot.role === 'label' && slot.inputPath === 'labelHelper';
  return slot.ownerKind === 'node' && slot.shape === 'rectWithTitle' && (slot.role === 'title' || slot.role === 'body') && slot.inputPath === 'createLabel';
}

export function stateMathSourceMap(figure: Figure, rawDocument: Uint8Array): StateSourceMap {
  // Transport resource accounting is validated before accepting serialized
  // slot data as source ownership.
  reserveStateTransportMath(figure.stateMath, { svgBytes: 0, elementCount: 0, occurrences: 0 } satisfies MathResourceTotal);
  const display = createMermaidSourceDisplay(figure, rawDocument);
  assertMermaidSourceTransport('state', figure.source, display.original, figure.stateMath);
  const records = new Map<number, StateRenderMath['records'][number]>();
  for (const record of figure.stateMath.records) {
    if (!Number.isSafeInteger(record.recordIndex) || records.has(record.recordIndex)) invalid('invalid or duplicate authored record');
    records.set(record.recordIndex, record);
  }
  const labels: Array<Readonly<{ key: string; expressions: readonly MermaidSourceExpression[] }>> = [];
  const seen = new Set<string>();
  for (const slot of figure.stateMath.slots) {
    const expected = JSON.stringify([slot.ownerKind, slot.ownerId, slot.role]);
    if (slot.key !== expected || seen.has(slot.key) || !allowed(slot)) invalid('invalid or duplicate visible slot');
    seen.add(slot.key);
    if (slot.parts.map(part => part.source).join('') !== slot.renderedValue) invalid('slot parts do not reconstruct rendered value');
    const owned = new Set(slot.recordIndices);
    if (owned.size !== slot.recordIndices.length || [...owned].some(index => !Number.isSafeInteger(index) || !records.has(index))) {
      invalid('slot has invalid authored record ownership');
    }
    for (const part of slot.parts) if (part.kind === 'math') {
      if (!owned.has(part.recordIndex) || !records.has(part.recordIndex)) invalid('math part differs from slot ownership');
    }
    const expressions = Object.freeze(display.expressions(slot.parts));
    if (expressions.length) labels.push(Object.freeze({ key: slot.key, expressions }));
  }
  return Object.freeze({ format: 'state', source: display.source, labels: Object.freeze(labels) });
}
