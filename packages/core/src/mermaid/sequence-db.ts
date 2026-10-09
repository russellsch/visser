// Reconcile logical source owners with the pinned sequence renderer DB before
// layout mutates actors/messages. These are semantic slots; mirrored/lifecycle
// copies require a separate render plan and must not be inferred from text.
import { MathPolicyError } from '../math/policy.ts';
import type { SequenceMathRecord } from './sequence-math.ts';

type Db = Record<string, (...args: unknown[]) => unknown>;
type Item = Record<string, unknown>;
export type SequenceMathSlot = {
  key: string;
  kind: 'actor' | 'message' | 'box' | 'title';
  recordIndex: number;
};
function invalid(message: string): never {
  throw new MathPolicyError('E_MATH_INVALID', `sequence renderer reconciliation: ${message}`);
}
function item(value: unknown): Item {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('expected a DB record');
  return value as Item;
}
function sameText(expected: string, actual: unknown): void {
  if (typeof actual !== 'string' || actual !== expected) invalid('label differs from renderer DB');
}
function index(value: unknown, length: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) >= length) invalid('invalid source owner index');
  return value as number;
}

/** Array merges can add named properties omitted by JSON.stringify(array). */
export function sequencePropertiesIdentity(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  // JSON.parse permits overflow to Infinity; JSON.stringify would collapse it
  // to null. Use a typed, iterative encoding and retain named array properties.
  const output: string[] = [];
  const pending: {value?: unknown; literal?: string}[] = [{value}];
  while (pending.length) {
    const next = pending.pop()!;
    if (next.literal !== undefined) { output.push(next.literal); continue; }
    const item = next.value;
    if (item === null) { output.push('null'); continue; }
    if (typeof item === 'number') { output.push(`n:${Object.is(item, -0) ? '-0' : String(item)}`); continue; }
    if (typeof item === 'string') { output.push(`s:${JSON.stringify(item)}`); continue; }
    if (typeof item === 'boolean') { output.push(String(item)); continue; }
    if (typeof item !== 'object') invalid('non-JSON participant property');
    output.push(Array.isArray(item) ? `a:${item.length}{` : 'o:{');
    pending.push({literal:'}'});
    const entries = Object.entries(item);
    for (let at = entries.length - 1; at >= 0; at--) {
      const [key, entry] = entries[at]!;
      pending.push({literal:','}, {value:entry}, {literal:`${JSON.stringify(key)}:`});
    }
  }
  return output.join('');
}

export function reconcileSequenceMath(db: Db, records: readonly SequenceMathRecord[]): SequenceMathSlot[] {
  const actors = db['getActors']?.();
  const messages = db['getMessages']?.();
  const boxes = db['getBoxes']?.();
  if (!(actors instanceof Map) || !Array.isArray(messages) || !Array.isArray(boxes)) invalid('missing sequence DB collections');
  const slots: SequenceMathSlot[] = [];
  const claimed = new Set<string>();
  const coveredMessages = new Set<number>();
  const coveredBoxes = new Set<number>();
  const coveredActors = new Set<string>();
  const add = (kind: SequenceMathSlot['kind'], identity: string, recordIndex: number) => {
    const key = kind === 'title' ? 'title' : `${kind}:${identity}`;
    if (claimed.has(key)) invalid('duplicate effective source owner');
    claimed.add(key);
    slots.push({key,kind,recordIndex});
  };
  for (const [recordIndex, record] of records.entries()) {
    if (!record.active) continue;
    if (record.role === 'actor' || record.role === 'actor.metadata') {
      if (typeof record.ownerId !== 'string' || !actors.has(record.ownerId)) invalid('missing actor source owner');
      const actor = item(actors.get(record.ownerId));
      if (actor['name'] !== record.ownerId) invalid('actor identity differs from renderer DB');
      sameText(record.semanticValue, actor['description']);
      const identity = record.actorIdentity;
      if (!identity || identity.type !== actor['type'] || identity.wrap !== actor['wrap']) invalid('actor rendering identity differs from DB');
      if (identity.propertiesIdentity !== sequencePropertiesIdentity(actor['properties'])) invalid('actor properties differ from renderer DB');
      const actualBox = actor['box'] === undefined ? undefined : boxes.indexOf(actor['box']);
      if (actualBox === -1 || identity.boxIndex !== actualBox) invalid('actor box identity differs from DB');
      coveredActors.add(record.ownerId);
      add('actor',record.ownerId,recordIndex);
    } else if (record.role === 'box') {
      const at = index(record.boxIndex, boxes.length);
      const actual = item(boxes[at]);
      sameText(record.semanticValue,actual['name']);
      if (!record.boxIdentity || record.boxIdentity.wrap !== actual['wrap'] || record.boxIdentity.fill !== actual['fill']) {
        invalid('box rendering identity differs from DB');
      }
      coveredBoxes.add(at);
      add('box',String(at),recordIndex);
    } else if (record.messageIndex !== undefined) {
      const at = index(record.messageIndex,messages.length);
      const actual = item(messages[at]);
      const expected = record.messageIdentity;
      if (!expected || expected.id !== String(at)) invalid('missing grammar message identity');
      for (const field of ['id','type','from','to','placement','wrap','activate','centralConnection'] as const) {
        if (actual[field] !== expected[field]) invalid(`message ${field} differs from renderer DB`);
      }
      sameText(record.semanticValue,actual['message']);
      coveredMessages.add(at);
      add('message',String(at),recordIndex);
    }
  }
  if (coveredActors.size !== actors.size) invalid('renderer actor lacks source ownership');
  for (const [at,value] of boxes.entries()) {
    const name = item(value)['name'];
    if (name && !coveredBoxes.has(at)) invalid('renderer box label lacks source ownership');
  }
  for (const [at,value] of messages.entries()) {
    const message = item(value);
    // Structural entries (rect colors and autonumber models) are not labels.
    // Their accepted types are pinned; every text-bearing event needs a source.
    if ([11,14,16,17,18,21,23,29,31,59,60,61].includes(message['type'] as number)) {
      if (message['message'] !== '') invalid('structural message unexpectedly contains text');
      continue;
    }
    if (message['type'] === 22) {
      if (typeof message['message'] !== 'string' || message['message'].includes('$$')) invalid('invalid rectangle color');
      continue;
    }
    if (message['type'] === 26) { item(message['message']); continue; }
    if (typeof message['message'] !== 'string') invalid('unexpected non-text message');
    if (message['message'] && !coveredMessages.has(at)) invalid('renderer message label lacks source ownership');
  }
  for (const [role,getter] of [['title','getDiagramTitle'],['accTitle','getAccTitle'],['accDescr','getAccDescription']] as const) {
    const matches = records.map((record,at)=>({record,at})).filter(({record})=>record.active&&record.role===role);
    if (matches.length > 1) invalid('duplicate effective root field');
    sameText(matches[0]?.record.semanticValue ?? '',db[getter]?.());
    if (role === 'title' && matches[0]) add('title','',matches[0].at);
  }
  return slots;
}
