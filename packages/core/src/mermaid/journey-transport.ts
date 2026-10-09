import { EMPTY_MATH_RESOURCE_TOTAL, MathPolicyError, reserveMathOccurrences, type MathResourceTotal } from '../math/policy.ts';
import type { JourneyMath, JourneyMathRecord } from './journey-math.ts';
import type { JourneyDbPlan } from './journey-db.ts';
import type { JourneyLabelRecord } from './journey-labels.ts';

export type JourneyTransportRecord = Pick<JourneyMathRecord, 'recordIndex' | 'role' | 'dbValue' | 'renderedValue' | 'parts'> &
  Pick<JourneyLabelRecord, 'intervals' | 'synthetic'>;
export type JourneyRenderMath = Readonly<JourneyDbPlan & {
  records: readonly JourneyTransportRecord[];
  total: MathResourceTotal;
}>;

/** Drop provenance instances and grammar data before crossing the process boundary. */
export function journeyMathTransport(math: JourneyMath, plan: JourneyDbPlan): JourneyRenderMath {
  const authored = new Map(math.labels.records.map(record => [record.recordIndex, record]));
  const result = { ...plan, total: math.total, records: math.records.map(record => {
    const source = authored.get(record.recordIndex)!;
    const {recordIndex, role, dbValue, renderedValue, parts} = record;
    return {recordIndex, role, dbValue, renderedValue, parts, intervals:source.intervals, synthetic:source.synthetic};
  }) };
  reserveJourneyTransportMath(result);
  return result;
}

/** Each visible owner is unique, so all authored fields bound visible math. */
export function reserveJourneyTransportMath(math: JourneyRenderMath, initial: MathResourceTotal = EMPTY_MATH_RESOURCE_TOTAL): MathResourceTotal {
  const invalid = (message: string): never => { throw new MathPolicyError('E_MATH_INVALID', `journey math transport: ${message}`); };
  const records = new Map<number, JourneyTransportRecord>();
  let own = EMPTY_MATH_RESOURCE_TOTAL, total = initial;
  for (const record of math.records) {
    if (!Number.isSafeInteger(record.recordIndex) || record.recordIndex <= 0 || records.has(record.recordIndex)) invalid('invalid or duplicate authored identity');
    if (record.parts.map(part => part.source).join('') !== record.renderedValue) invalid('parts differ from displayed value');
    records.set(record.recordIndex, record);
    for (const part of record.parts) if (part.kind === 'math') {
      const cost = {svgBytes:part.mathmlBytes,elementCount:part.elementCount};
      own = reserveMathOccurrences(own,cost,1);
      total = reserveMathOccurrences(total,cost,1);
    }
  }
  const keys = new Set<string>(), owners = new Set<number>();
  const expected = new Map<string, number>();
  if (math.snapshot.title) expected.set('title',1);
  math.snapshot.actors.forEach((_name,index) => expected.set(`actor:${index}`,1));
  let previousSection = '';
  for (const [index,task] of math.snapshot.tasks.entries()) {
    if (!Number.isFinite(task.score)) invalid('nonfinite task score');
    expected.set(`task:${index}`,1);
    if (task.section !== previousSection) {
      let end = index + 1;
      while (end < math.snapshot.tasks.length && math.snapshot.tasks[end]!.section === task.section) end++;
      expected.set(`section:${index}`,end-index);
      previousSection = task.section;
    }
  }
  for (const slot of math.slots) {
    const record = records.get(slot.recordIndex);
    if (!record) return invalid('invalid or repeated visible owner');
    if (record.role !== slot.role || owners.has(slot.recordIndex) || keys.has(slot.key) || !expected.has(slot.key)) invalid('invalid or repeated visible owner');
    keys.add(slot.key); owners.add(slot.recordIndex);
    if (slot.role === 'title') {
      if (slot.key !== 'title' || record.dbValue !== math.snapshot.title) invalid('title identity differs');
    } else if (slot.role === 'actor') {
      const index = math.snapshot.actors.indexOf(slot.actorName ?? '');
      if (index < 0 || slot.key !== `actor:${index}` || record.dbValue !== slot.actorName) invalid('actor identity differs');
    } else {
      const index = slot.taskStart;
      const task = index === undefined ? undefined : math.snapshot.tasks[index];
      if (!Number.isSafeInteger(index) || !task || slot.key !== `${slot.role}:${index}` || slot.taskCount !== expected.get(slot.key) ||
          record.dbValue !== (slot.role === 'task' ? task.task : task.section)) invalid('task or section identity differs');
    }
  }
  if (keys.size !== expected.size) invalid('visible slots are incomplete');
  if (own.occurrences !== math.total.occurrences || own.svgBytes !== math.total.svgBytes || own.elementCount !== math.total.elementCount) invalid('total differs from authored equations');
  return total;
}
