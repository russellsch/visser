// Journey exposes one module-level DB. Wrap only its common setters, retaining
// native sanitization order and restoring the temporary dependency each call.
import { MathPolicyError } from '../math/policy.ts';
import { prepareSequenceSanitizer } from './sequence-sanitize.ts';
import { withStateSanitizer } from './state-node-db.ts';

let installed = false;
export async function installJourneyNodeDb(): Promise<void> {
  await prepareSequenceSanitizer();
  if (installed) return;
  // @ts-expect-error Mermaid provides no types for its pinned internal chunk.
  const { diagram } = await import('mermaid/dist/chunks/mermaid.core/journeyDiagram-ZHPQQLJL.mjs');
  const db = diagram.db;
  const names = ['setDiagramTitle', 'setAccTitle', 'setAccDescription'];
  if (names.some(name => typeof db[name] !== 'function')) throw new MathPolicyError('E_MATH_INVALID', 'pinned journey common setters changed');
  for (const name of names) {
    const native = db[name];
    db[name] = (...args: unknown[]) => withStateSanitizer(() => native.apply(db, args));
  }
  installed = true;
}
