// Reconcile state accessibility assignments without mutating the renderer DB.
import { MathPolicyError } from '../math/policy.ts';
import type { StateLabels, StateLabelRecord } from './state-labels.ts';
import type { ProvenanceText } from './source-provenance.ts';

type Db = Record<string, unknown>;
export type StateAccessibilityField = Readonly<{ value: string; recordIndex?: number }>;
export type StateAccessibility = Readonly<{ accTitle: StateAccessibilityField; accDescr: StateAccessibilityField }>;

function invalid(message: string): never { throw new MathPolicyError('E_MATH_INVALID', `state accessibility reconciliation: ${message}`); }
function getter(db: Db, name: string): () => unknown {
  const value = db[name]; if (typeof value !== 'function') invalid(`missing ${name}`);
  return value as () => unknown;
}
function setter(db: Db, name: string): (value: string) => unknown {
  const value = db[name]; if (typeof value !== 'function') invalid(`missing ${name}`);
  return value as (value: string) => unknown;
}
function normalize(record: StateLabelRecord, sanitize: (value: ProvenanceText) => ProvenanceText): string {
  const sanitized = sanitize(record.mappedValue);
  if (!(sanitized instanceof Object) || typeof sanitized.text !== 'string') invalid(`sanitizer returned invalid ${record.role} text`);
  return record.role === 'accTitle' ? sanitized.text.replace(/^\s+/g, '') : sanitized.text.replace(/\n\s+/g, '\n');
}
function final(records: readonly StateLabelRecord[], role: 'accTitle' | 'accDescr'): StateLabelRecord | undefined {
  return records.findLast(record => record.role === role);
}
function field(record: StateLabelRecord | undefined, sanitize: (value: ProvenanceText) => ProvenanceText): StateAccessibilityField {
  return Object.freeze(record ? { value: normalize(record, sanitize), recordIndex: record.recordIndex } : { value: '' });
}

/** Apply the grammar-owned assignments in source order to a fresh isolated DB. */
export function replayStateAccessibility(db: Db, labels: StateLabels): void {
  const setTitle = setter(db, 'setAccTitle'); const setDescription = setter(db, 'setAccDescription');
  for (const record of labels.records) {
    if (record.role === 'accTitle') setTitle(record.semanticValue);
    else if (record.role === 'accDescr') setDescription(record.semanticValue);
  }
}

/** Compare pinned DB getters with the final sanitizer-normalized authored assignments. */
export function reconcileStateAccessibility(
  db: Db, labels: StateLabels, sanitize: (value: ProvenanceText) => ProvenanceText,
): StateAccessibility {
  const title = field(final(labels.records, 'accTitle'), sanitize);
  const description = field(final(labels.records, 'accDescr'), sanitize);
  const actualTitle = getter(db, 'getAccTitle')(); const actualDescription = getter(db, 'getAccDescription')();
  if (typeof actualTitle !== 'string' || typeof actualDescription !== 'string') invalid('accessibility getters must return strings');
  if (actualTitle !== title.value) invalid('accTitle differs from final normalized assignment');
  if (actualDescription !== description.value) invalid('accDescr differs from final normalized assignment');
  return Object.freeze({ accTitle: title, accDescr: description });
}
