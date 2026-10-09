// Pinned native participant properties are machine data, not label text.
// Preserve JSON.parse and shallow merge semantics; only effective root keys
// can cause native image loading or prototype mutation during a later merge.
import { MathPolicyError } from '../math/policy.ts';
import { sanitizeSequenceText } from './sequence-sanitize.ts';

export class SequencePropertiesError extends MathPolicyError {
  readonly key: string;
  constructor(key: string, message: string) { super('E_UNSAFE_CONTENT', message); this.key = key; }
}

export function parseSequenceProperties(text: string): {ok: true; value: unknown} | {ok: false} {
  let value: unknown;
  try { value = JSON.parse(sanitizeSequenceText(text)); }
  catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return {ok: false}; // Native malformed JSON has no effect.
  }
  for (const key of Object.keys(Object(value))) {
    if (key === 'icon') throw new SequencePropertiesError(key,
      'sequence participant icon properties are not allowed; they fetch or embed image content');
    if (key === '__proto__') throw new SequencePropertiesError(key,
      'sequence participant __proto__ properties are not allowed; merging them can change the actor property prototype');
  }
  return {ok: true, value};
}

/** Match native swallowed merge failures, including primitive/array roots. */
export function applySequenceProperties(actor: {properties?: unknown}, parsed: ReturnType<typeof parseSequenceProperties>): void {
  if (!parsed.ok) return;
  try {
    if (actor.properties == null) actor.properties = parsed.value;
    else for (const key in Object(parsed.value)) {
      (actor.properties as Record<string, unknown>)[key] = (parsed.value as Record<string, unknown>)[key];
    }
  } catch { /* Pinned addProperties catches assignment failures. */ }
}
