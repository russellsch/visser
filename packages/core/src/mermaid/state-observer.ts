// Synchronous observation of the pinned native state extraction algorithm.
// This module has no Node dependencies and is shared by worker and browser.
// No text is matched and no native object is mutated here. Consumers receive
// live objects at each branch and must retain their own immutable provenance.
export const STATE_OBSERVER_VERSION = 1;

type Native = Record<string, unknown>;
export type StateExtractionEvent =
  | { kind: 'begin' | 'end'; db: object; nodes: object[]; edges: object[] }
  | { kind: 'init'; item: Native; target: Native }
  | { kind: 'sanitized'; item: Native; target: Native }
  | { kind: 'description'; mode: 'append' | 'replace-implicit' | 'prepend' | 'assign'; item: Native; target: Native }
  | { kind: 'candidate'; candidate: Native; target: Native }
  | { kind: 'node'; candidate: Native; retained: Native }
  | { kind: 'relation'; item: Native; edge: Native }
  | { kind: 'note-sanitized'; note: Native; before: unknown; after: unknown }
  | { kind: 'note'; item: Native; note: Native; group: Native }
  | { kind: 'split'; node: Native };
export type StateExtractionListener = (event: StateExtractionEvent) => void;
type Epoch = { db: object; nodes: object[]; edges: object[]; listener: StateExtractionListener };
const subscriptions = new WeakMap<object, StateExtractionListener>();
const current = new WeakMap<object, Epoch>();
const arrays = new WeakMap<object[], Epoch>();

function detach(epoch: Epoch): void {
  arrays.delete(epoch.nodes);
  if (current.get(epoch.db) === epoch) current.delete(epoch.db);
}

/**
 * Register before setRootDoc/extract and dispose in finally, including native
 * parse/extraction failures. Attest the module marker before registering.
 * Listeners must be synchronous and must not re-enter native extraction.
 */
export function observeStateDb(db: object, listener: StateExtractionListener): () => void {
  if (subscriptions.has(db)) throw new Error('state extraction already has an observer');
  subscriptions.set(db, listener);
  return () => {
    if (subscriptions.get(db) !== listener) return;
    subscriptions.delete(db);
    const epoch = current.get(db);
    if (epoch) detach(epoch);
  };
}

export function beginStateExtraction(db: object, nodes: object[], edges: object[]): void {
  // Native extract resets its arrays. A failed earlier extraction must not
  // leave its old arrays associated with a new epoch.
  const previous = current.get(db);
  if (previous) detach(previous);
  const listener = subscriptions.get(db);
  if (!listener) return;
  if (arrays.has(nodes)) throw new Error('state extraction arrays belong to another observer');
  const epoch = { db, nodes, edges, listener };
  current.set(db, epoch);
  arrays.set(nodes, epoch);
  dispatch(epoch, { kind: 'begin', db, nodes, edges });
}

function dispatch(epoch: Epoch, event: StateExtractionEvent): void {
  try { epoch.listener(event); }
  catch (error) { detach(epoch); throw error; }
}

export function observeStateExtraction<K extends Exclude<StateExtractionEvent['kind'], 'begin' | 'end'>>(
  nodes: object[], kind: K, payload: Omit<Extract<StateExtractionEvent, { kind: K }>, 'kind'>,
): void {
  const epoch = arrays.get(nodes);
  if (!epoch) return;
  dispatch(epoch, { ...payload, kind } as unknown as StateExtractionEvent);
}

export function endStateExtraction(db: object, nodes: object[], edges: object[]): void {
  const epoch = current.get(db);
  if (!epoch) return;
  if (epoch.nodes !== nodes || epoch.edges !== edges) {
    detach(epoch);
    throw new Error('state extraction replaced arrays within an epoch');
  }
  try { dispatch(epoch, { kind: 'end', db, nodes, edges }); }
  finally { detach(epoch); }
}
