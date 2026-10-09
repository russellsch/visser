// Node-only state DB adaptation. Native extraction retains its actual
// sanitizeText/sanitizeTextOrArray call order; only their DOMPurify dependency
// is supplied by the private, network-disabled DOM during synchronous calls.
import stub from './dompurify-stub.ts';
import { MathPolicyError } from '../math/policy.ts';
import { prepareSequenceSanitizer, sanitizeMermaidHtmlPass } from './sequence-sanitize.ts';

type Purify = { sanitize(value: unknown, options?: { FORBID_TAGS: string[] }): string };
const dependency: Purify = stub;

/** Never keep the shared dependency replaced across an asynchronous boundary. */
export function withStateSanitizer<T>(run: () => T): T {
  const previous = dependency.sanitize;
  dependency.sanitize = (value, options) => {
    if (typeof value !== 'string') throw new MathPolicyError('E_MATH_INVALID', 'state sanitizer expected native text');
    return sanitizeMermaidHtmlPass(value, options);
  };
  try {
    const value = run();
    if (value && typeof (value as { then?: unknown }).then === 'function') {
      throw new MathPolicyError('E_MATH_INVALID', 'state sanitizer cannot cross an asynchronous boundary');
    }
    return value;
  } finally { dependency.sanitize = previous; }
}

let installed = false;
export async function installStateNodeDb(): Promise<void> {
  await prepareSequenceSanitizer();
  if (installed) return;
  // @ts-expect-error Mermaid has no declarations for the pinned state chunk.
  const { diagram } = await import('mermaid/dist/chunks/mermaid.core/stateDiagram-v2-GCMORJYK.mjs');
  const descriptor = Object.getOwnPropertyDescriptor(diagram, 'db');
  if (!descriptor?.get || !descriptor.configurable) {
    throw new MathPolicyError('E_MATH_INVALID', 'pinned state DB getter changed');
  }
  const nativeGet = descriptor.get;
  Object.defineProperty(diagram, 'db', { ...descriptor, get() {
    const db = nativeGet.call(this);
    for (const method of ['extract', 'setDiagramTitle', 'setAccTitle', 'setAccDescription']) {
      const nativeMethod = db[method];
      if (typeof nativeMethod !== 'function') throw new MathPolicyError('E_MATH_INVALID', 'pinned state DB method changed');
      db[method] = (...args: unknown[]) => withStateSanitizer(() => nativeMethod.apply(db, args));
    }
    return db;
  } });
  installed = true;
}
