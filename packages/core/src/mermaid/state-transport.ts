// JSON-only state math contract for the isolated parse worker. Grammar objects,
// Maps, sanitizer closures and ProvenanceText never cross this boundary.
import type { StateMathRecord } from './state-math.ts';
import type { StateRenderPlan, StateRenderSlot } from './state-render-plan.ts';
import type { StateAccessibility } from './state-accessibility.ts';
import { EMPTY_MATH_RESOURCE_TOTAL, MathPolicyError, reserveMathOccurrences, type MathResourceTotal } from '../math/policy.ts';
import { addStateMathCosts, maxStateMathCost } from './state-math.ts';

export type StateTransportRecord = Pick<StateMathRecord,
  'recordIndex' | 'role' | 'semanticValue' | 'parts' | 'cost' | 'intervals' | 'synthetic'>;
export type StateRenderMath = Readonly<{
  accessibility?: StateAccessibility;
  records: readonly StateTransportRecord[];
  slots: readonly StateRenderSlot[];
  total: MathResourceTotal;
  recordCosts: readonly Readonly<{ recordIndex: number; cost: MathResourceTotal }>[];
}>;

export function stateMathTransport(records: readonly StateMathRecord[], plan: StateRenderPlan): StateRenderMath {
  return {
    records: records.map(({recordIndex, role, semanticValue, parts, cost, intervals, synthetic}) =>
      ({recordIndex, role, semanticValue, parts, cost, intervals, synthetic})),
    slots: plan.slots,
    total: plan.total,
    recordCosts: [...plan.recordCosts].map(([recordIndex,cost]) => ({recordIndex,cost})),
  };
}

/** Recompute document charges from owned records and visible copies after JSON transport. */
export function reserveStateTransportMath(math: StateRenderMath, initial: MathResourceTotal = EMPTY_MATH_RESOURCE_TOTAL): MathResourceTotal {
  const records = new Map<number, StateTransportRecord>();
  const visible = new Map<number, MathResourceTotal>();
  const invalid = (message: string): never => { throw new MathPolicyError('E_MATH_INVALID', `state math transport: ${message}`); };
  for (const record of math.records) {
    if (!Number.isSafeInteger(record.recordIndex) || record.recordIndex <= 0 || records.has(record.recordIndex)) invalid('invalid or duplicate authored identity');
    addStateMathCosts(EMPTY_MATH_RESOURCE_TOTAL, record.cost);
    let canonical = EMPTY_MATH_RESOURCE_TOTAL;
    for (const part of record.parts) if (part.kind === 'math') canonical = reserveMathOccurrences(canonical,
      {svgBytes:part.mathmlBytes,elementCount:part.elementCount},1);
    if (canonical.occurrences > record.cost.occurrences || canonical.svgBytes > record.cost.svgBytes || canonical.elementCount > record.cost.elementCount) invalid('authored cost omits canonical equations');
    records.set(record.recordIndex, record);
  }
  const keys = new Set<string>();
  for (const slot of math.slots) {
    if (slot.key !== JSON.stringify([slot.ownerKind,slot.ownerId,slot.role]) || keys.has(slot.key)) invalid('invalid or duplicate visible identity');
    keys.add(slot.key);
    if (slot.parts.map(part=>part.source).join('') !== slot.renderedValue) invalid('visible parts differ from rendered value');
    for (const part of slot.parts) if (part.kind === 'math') {
      if (!records.has(part.recordIndex) || !slot.recordIndices.includes(part.recordIndex)) invalid('visible formula has no authored owner');
      visible.set(part.recordIndex, reserveMathOccurrences(visible.get(part.recordIndex) ?? EMPTY_MATH_RESOURCE_TOTAL,
        {svgBytes:part.mathmlBytes,elementCount:part.elementCount},1));
    }
  }
  const charges = new Map<number, MathResourceTotal>();
  for (const item of math.recordCosts) {
    if (!records.has(item.recordIndex) || charges.has(item.recordIndex)) invalid('invalid or duplicate cost owner');
    charges.set(item.recordIndex,item.cost);
  }
  let total = EMPTY_MATH_RESOURCE_TOTAL;
  const equal = (a:MathResourceTotal,b:MathResourceTotal) => a.svgBytes===b.svgBytes && a.elementCount===b.elementCount && a.occurrences===b.occurrences;
  for (const [index,record] of records) {
    const expected = maxStateMathCost(record.cost,visible.get(index) ?? EMPTY_MATH_RESOURCE_TOTAL);
    const actual = charges.get(index);
    if (!actual || !equal(expected,actual)) invalid('record charge differs from authored and visible costs');
    total = addStateMathCosts(total,expected);
  }
  if (!equal(total,math.total)) invalid('total differs from owned record charges');
  return addStateMathCosts(initial,total);
}
