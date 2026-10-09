// Count the pinned sequence renderer's semantic label copies before drawing.
// This is a plan for source binding and resource reservation, not activation.
import { MathPolicyError, reserveMathOccurrences, type MathResourceTotal } from '../math/policy.ts';
import { reconcileSequenceMath, type SequenceMathSlot } from './sequence-db.ts';
import type { SequenceMathRecord } from './sequence-math.ts';

type Db = Record<string, (...args: unknown[]) => unknown>;
type Item = Record<string, unknown>;
// Exact cases in the pinned drawActor switch; an unknown type has no native
// header/footer renderer, so counting copies for it would invent output.
const DRAWN_ACTOR_TYPES = new Set([
  'actor', 'participant', 'boundary', 'control', 'entity', 'database', 'collections', 'queue',
]);
export type SequenceRenderCopy = Readonly<{ key: string; slotKey: string; recordIndex: number }>;
export type SequenceRenderPlan = Readonly<{
  slots: readonly Readonly<SequenceMathSlot>[];
  copies: readonly SequenceRenderCopy[];
  hiddenKeys: readonly string[];
}>;

function invalid(message: string): never {
  throw new MathPolicyError('E_MATH_INVALID', `sequence render-copy plan: ${message}`);
}
function item(value: unknown): Item {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('expected a DB record');
  return value as Item;
}
function collection(db: Db, getter: string, kind: 'map' | 'array'): Map<string, unknown> | unknown[] {
  const value = db[getter]?.();
  if (kind === 'map' ? !(value instanceof Map) : !Array.isArray(value)) invalid(`missing ${getter} DB collection`);
  return value as Map<string, unknown> | unknown[];
}
function lifecycle(db: Db, getter: string, actors: Map<string, unknown>, messages: unknown[], endpoint: 'to' | 'either'): void {
  const entries = collection(db, getter, 'map') as Map<string, unknown>;
  for (const [actorId, at] of entries) {
    if (typeof actorId !== 'string' || !actors.has(actorId)) invalid(`${getter} references missing actor`);
    // Pinned addActor stores the *current* message-array length. Its eventual
    // event is the message at that original index, including activation rows.
    if (!Number.isSafeInteger(at) || (at as number) < 0 || (at as number) >= messages.length) {
      invalid(`${getter} has no original message index`);
    }
    const message = item(messages[at as number]);
    const matches = endpoint === 'to' ? message['to'] === actorId :
      message['from'] === actorId || message['to'] === actorId;
    if (!matches) invalid(`${getter} message endpoint differs from actor`);
  }
}

/** Plan exactly the visible actor/header/footer, message/title, and box-run copies. */
export function planSequenceRenderCopies(
  db: Db, records: readonly SequenceMathRecord[],
  options: Readonly<{ mirrorActors: boolean; hideUnusedParticipants: boolean }>,
): SequenceRenderPlan {
  if (typeof options.mirrorActors !== 'boolean' || typeof options.hideUnusedParticipants !== 'boolean') {
    invalid('render options must be explicit booleans');
  }
  const slots = reconcileSequenceMath(db, records).map(slot => Object.freeze({ ...slot }));
  const byKey = new Map(slots.map(slot => [slot.key, slot]));
  const actors = collection(db, 'getActors', 'map') as Map<string, unknown>;
  const messages = collection(db, 'getMessages', 'array') as unknown[];
  const boxes = collection(db, 'getBoxes', 'array') as unknown[];
  const actorKeys = db['getActorKeys']?.();
  if (!Array.isArray(actorKeys) || actorKeys.length !== actors.size ||
      new Set(actorKeys).size !== actorKeys.length ||
      actorKeys.some(key => typeof key !== 'string' || !actors.has(key))) {
    invalid('actor keys are not the renderer DB actor permutation');
  }
  lifecycle(db, 'getCreatedActors', actors, messages, 'to');
  lifecycle(db, 'getDestroyedActors', actors, messages, 'either');

  const used = new Set<string>();
  for (const value of messages) {
    const message = item(value);
    for (const endpoint of [message['from'], message['to']]) {
      if (endpoint === undefined) continue;
      if (typeof endpoint !== 'string') invalid('non-string message endpoint');
      used.add(endpoint);
    }
  }
  const visibleActors = options.hideUnusedParticipants ? actorKeys.filter(key => used.has(key)) : actorKeys;
  for (const id of visibleActors) {
    const type = item(actors.get(id))['type'];
    if (typeof type !== 'string' || !DRAWN_ACTOR_TYPES.has(type)) {
      invalid(`visible actor ${id} has no pinned drawActor path`);
    }
  }
  const copies: SequenceRenderCopy[] = [];
  const copyKeys = new Set<string>();
  const emit = (key: string, slotKey: string): void => {
    const slot = byKey.get(slotKey);
    if (!slot) invalid(`missing semantic slot ${slotKey}`);
    if (copyKeys.has(key)) invalid(`duplicate rendered copy key ${key}`);
    copyKeys.add(key);
    copies.push(Object.freeze({ key, slotKey, recordIndex: slot.recordIndex }));
  };
  for (const id of visibleActors) emit(`actor:${id}:header`, `actor:${id}`);
  for (const slot of slots) if (slot.kind === 'message') emit(slot.key, slot.key);
  if (options.mirrorActors) for (const id of visibleActors) emit(`actor:${id}:footer`, `actor:${id}`);

  // addActorRenderingData adds boxes at every transition in filtered actor
  // order and again for the final run. It does not deduplicate box identity.
  const runCounts = new Map<number, number>();
  let priorBox: number | undefined;
  for (const id of visibleActors) {
    const actorBox = item(actors.get(id))['box'];
    const boxIndex = actorBox === undefined ? undefined : boxes.indexOf(actorBox);
    if (boxIndex === -1) invalid(`actor ${id} references a detached box`);
    if (boxIndex !== priorBox && boxIndex !== undefined) {
      const run = runCounts.get(boxIndex) ?? 0;
      runCounts.set(boxIndex, run + 1);
      const slotKey = `box:${boxIndex}`;
      if (byKey.has(slotKey)) emit(`${slotKey}:run:${run}`, slotKey);
    }
    priorBox = boxIndex;
  }
  const title = byKey.get('title');
  if (title && db['getDiagramTitle']?.()) emit('title', 'title');

  const copied = new Set(copies.map(copy => copy.slotKey));
  const hiddenKeys = slots.filter(slot => !copied.has(slot.key)).map(slot => slot.key);
  return Object.freeze({ slots: Object.freeze(slots), copies: Object.freeze(copies), hiddenKeys: Object.freeze(hiddenKeys) });
}

/** Keep authored costs; reserve only the additional visible copies of each validated expression. */
export function reserveSequenceRenderCopies(
  plan: SequenceRenderPlan, records: readonly SequenceMathRecord[], authoredTotal: MathResourceTotal,
): MathResourceTotal {
  let total = reserveMathOccurrences(authoredTotal, { svgBytes: 0, elementCount: 0 }, 0);
  const slots = new Map(plan.slots.map(slot => [slot.key, slot]));
  const copyKeys = new Set<string>();
  const counts = new Map<string, number>();
  for (const copy of plan.copies) {
    if (copyKeys.has(copy.key)) invalid(`duplicate rendered copy key ${copy.key}`);
    copyKeys.add(copy.key);
    const slot = slots.get(copy.slotKey);
    if (!slot || slot.recordIndex !== copy.recordIndex) invalid('copy differs from semantic slot');
    counts.set(copy.slotKey, (counts.get(copy.slotKey) ?? 0) + 1);
  }
  for (const slot of plan.slots) {
    const record = records[slot.recordIndex];
    if (!record || !record.active) invalid('semantic slot has no active source record');
    const extra = Math.max(0, (counts.get(slot.key) ?? 0) - 1);
    for (const part of record.parts) {
      if (part.kind === 'math' && extra) {
        total = reserveMathOccurrences(total,
          { svgBytes: part.mathmlBytes, elementCount: part.elementCount }, extra);
      }
    }
  }
  return total;
}
