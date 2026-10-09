// Bind each planned sequence label copy to its grammar-owned source field.
import { MathPolicyError } from '../math/policy.ts';
import { createMermaidSourceDisplay, type MermaidSourceBody, type MermaidSourceExpression } from './math-source-display.ts';
import { assertMermaidSourceTransport } from './parse.ts';
import type { SequenceMathRecord } from './sequence-math.ts';
import type { SequenceMathSlot } from './sequence-db.ts';

type Copy = { key: string; slotKey: string; recordIndex: number };
export type SequenceSourceMap = {
  format: 'sequence'; source: string;
  labels: Array<{ key: string; expressions: MermaidSourceExpression[] }>;
};
type Figure = MermaidSourceBody & { sequenceMath: {
  records: readonly SequenceMathRecord[];
  slots: readonly SequenceMathSlot[];
  copies: readonly Copy[];
  hiddenKeys: readonly string[];
} };
function invalid(message: string): never {
  throw new MathPolicyError('E_MATH_INVALID', `sequence source map: ${message}`);
}

export function sequenceMathSourceMap(figure: Figure, rawDocument: Uint8Array): SequenceSourceMap {
  const display = createMermaidSourceDisplay(figure,rawDocument);
  assertMermaidSourceTransport('sequence', figure.source, display.original, figure.sequenceMath);
  const { records, slots, copies, hiddenKeys } = figure.sequenceMath;
  const owners = new Map<string, SequenceMathSlot>();
  for (const slot of slots) {
    if (!slot || owners.has(slot.key) || !Number.isSafeInteger(slot.recordIndex)) invalid('invalid or duplicate logical slot');
    const record = records[slot.recordIndex];
    if (!record?.active || record.parts.map(part=>part.source).join('') !== record.renderedValue) invalid('stale source record');
    const expected = slot.kind === 'actor' && (record.role === 'actor' || record.role === 'actor.metadata') && record.ownerId
      ? `actor:${record.ownerId}`
      : slot.kind === 'box' && record.role === 'box' && Number.isSafeInteger(record.boxIndex) && record.boxIndex! >= 0
        ? `box:${record.boxIndex}`
        : slot.kind === 'message' && !['actor','actor.metadata','box','title','accTitle','accDescr'].includes(record.role) && Number.isSafeInteger(record.messageIndex) && record.messageIndex! >= 0
          ? `message:${record.messageIndex}`
          : slot.kind === 'title' && record.role === 'title' ? 'title' : undefined;
    if (!expected || slot.key !== expected) invalid('slot differs from authored owner');
    owners.set(slot.key,slot);
  }
  const hidden = new Set(hiddenKeys);
  if (hidden.size !== hiddenKeys.length || [...hidden].some(key=>!owners.has(key))) invalid('invalid hidden source owner');
  const seen = new Set<string>();
  const used = new Set<string>();
  const labels: SequenceSourceMap['labels'] = [];
  for (const copy of copies) {
    const slot = owners.get(copy.slotKey);
    if (!slot || copy.recordIndex !== slot.recordIndex || hidden.has(slot.key) || seen.has(copy.key)) invalid('invalid or duplicate source copy');
    let validKey = false;
    if (slot.kind === 'actor') validKey = copy.key === `${slot.key}:header` || copy.key === `${slot.key}:footer`;
    else if (slot.kind === 'box') {
      const prefix = `${slot.key}:run:`;
      const suffix = copy.key.startsWith(prefix) ? copy.key.slice(prefix.length) : '';
      validKey = /^(0|[1-9][0-9]*)$/.test(suffix) && Number.isSafeInteger(Number(suffix));
    } else validKey = copy.key === slot.key;
    if (!validKey) invalid('copy key differs from logical owner');
    seen.add(copy.key);used.add(slot.key);
    // Plain labels have native SVG text, not a measured math DOM owner. Keep
    // validating their planned copies above, but bind only actual math labels.
    const expressions = display.expressions(records[copy.recordIndex]!.parts);
    if (expressions.length) labels.push({key:copy.key,expressions});
  }
  for (const slot of slots) if (!hidden.has(slot.key) && !used.has(slot.key)) invalid('visible source owner has no copy');
  return {format:'sequence',source:display.source,labels};
}
