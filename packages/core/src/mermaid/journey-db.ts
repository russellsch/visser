// Compare a single native journey DB snapshot with source-owned records.
// This helper never invokes getTasks(): a second native read duplicates tasks.
import { isDeepStrictEqual } from 'node:util';
import { MathPolicyError } from '../math/policy.ts';
import type { JourneyMath, JourneyMathRecord } from './journey-math.ts';

export type JourneyDbTask = Readonly<{ section: string; type: string; task: string; people: readonly string[]; score: number }>;
export type JourneyDbSnapshot = Readonly<{
  tasks: readonly JourneyDbTask[]; sections: readonly string[]; actors: readonly string[];
  title: string; accTitle: string; accDescr: string;
}>;
export type JourneyVisibleSlot = Readonly<{
  key: string; role: 'title' | 'section' | 'task' | 'actor'; recordIndex: number;
  taskStart?: number; taskCount?: number; actorName?: string;
}>;
export type JourneyDbPlan = Readonly<{
  snapshot: JourneyDbSnapshot;
  slots: readonly JourneyVisibleSlot[];
}>;
function invalid(message: string): never {
  throw new MathPolicyError('E_MATH_INVALID', `journey DB reconciliation: ${message}`);
}

export function reconcileJourneyDb(math: JourneyMath, native: JourneyDbSnapshot): JourneyDbPlan {
  const records = new Map<number, JourneyMathRecord>();
  for (const record of math.records) {
    if (!Number.isSafeInteger(record.recordIndex) || record.recordIndex < 1 || records.has(record.recordIndex)) invalid('duplicate or invalid record identity');
    records.set(record.recordIndex, record);
  }
  if (records.size !== math.labels.records.length) invalid('record inventory differs');
  for (const authored of math.labels.records) if (records.get(authored.recordIndex)?.role !== authored.role) invalid('record role differs');
  const get = (id: number, role: JourneyMathRecord['role']): JourneyMathRecord => {
    const record = records.get(id);
    if (!record || record.role !== role) invalid(`missing ${role} owner`);
    return record;
  };
  const last = (role: JourneyMathRecord['role']) => math.records.filter(record => record.role === role).at(-1);
  const tasks: JourneyDbTask[] = math.labels.tasks.map((task, index) => {
    if (task.taskIndex !== index) invalid('noncontiguous task identity');
    const section = task.sectionRecordIndex === undefined ? '' : get(task.sectionRecordIndex, 'section').dbValue;
    return Object.freeze({ section, type: section, task: get(task.labelRecordIndex, 'task').dbValue,
      people: Object.freeze(task.actorRecordIndices.map(id => get(id, 'actor').dbValue)), score: task.score });
  });
  const actors = [...new Set(tasks.flatMap(task => task.people))].sort();
  const snapshot: JourneyDbSnapshot = Object.freeze({ tasks: Object.freeze(tasks),
    sections: Object.freeze(math.records.filter(record => record.role === 'section').map(record => record.dbValue)),
    actors: Object.freeze(actors), title: last('title')?.dbValue ?? '', accTitle: last('accTitle')?.dbValue ?? '', accDescr: last('accDescr')?.dbValue ?? '' });
  if (!isDeepStrictEqual(snapshot, native)) invalid('native task, section, actor or metadata values differ');
  const slots: JourneyVisibleSlot[] = [];
  const title = last('title');
  if (title?.dbValue) slots.push(Object.freeze({ key: 'title', role: 'title', recordIndex: title.recordIndex }));
  // A shared legend is owned by the first authored occurrence of its exact
  // native actor identity. Later occurrences are still validated separately.
  const actorOwners = new Map<string, number>();
  for (const task of math.labels.tasks) for (const id of task.actorRecordIndices) {
    const name = get(id, 'actor').dbValue;
    if (!actorOwners.has(name)) actorOwners.set(name, id);
  }
  actors.forEach((name, index) => slots.push(Object.freeze({ key: `actor:${index}`, role: 'actor', actorName: name, recordIndex: actorOwners.get(name)! })));
  let previous = '';
  for (const [index, task] of tasks.entries()) {
    const authored = math.labels.tasks[index]!;
    if (task.section !== previous) {
      if (authored.sectionRecordIndex === undefined) invalid('visible section has no authored owner');
      let end = index + 1;
      while (end < tasks.length && tasks[end]!.section === task.section) end++;
      slots.push(Object.freeze({ key: `section:${index}`, role: 'section', recordIndex: authored.sectionRecordIndex, taskStart: index, taskCount: end - index }));
      previous = task.section;
    }
    slots.push(Object.freeze({ key: `task:${index}`, role: 'task', recordIndex: authored.labelRecordIndex, taskStart: index, taskCount: 1 }));
  }
  // Current native lifecycle renders each chosen authored field at most once.
  // Thus the all-authored validation total already bounds visible MathML;
  // accessible tooltip copies remain plain text. A future repeated visible
  // slot requires explicit resource expansion rather than silently reusing it.
  if (new Set(slots.map(slot => slot.recordIndex)).size !== slots.length) invalid('visible record requires extra copy accounting');
  return Object.freeze({ snapshot, slots: Object.freeze(slots) });
}
