// Worker-only adaptation of the pinned sequence DB's browser color query.
// No window, CSS or Option globals are installed. Browser rendering retains
// the native method and is checked independently for classification parity.
import { MathPolicyError } from '../math/policy.ts';
import { parseSequenceBoxData } from './sequence-box.ts';
import { prepareSequenceSanitizer, sanitizeSequenceText } from './sequence-sanitize.ts';
import { applySequenceProperties, parseSequenceProperties } from './sequence-properties.ts';

let installed = false;
export async function installSequenceNodeDb(needsHtml = false): Promise<void> {
  if (needsHtml) await prepareSequenceSanitizer();
  if (installed) return;
  // @ts-expect-error Mermaid has no declarations for the pinned chunk.
  const { diagram } = await import('mermaid/dist/chunks/mermaid.core/sequenceDiagram-PO4LG4MO.mjs');
  const descriptor = Object.getOwnPropertyDescriptor(diagram, 'db');
  if (!descriptor?.get || !descriptor.configurable) {
    throw new MathPolicyError('E_MATH_INVALID', 'pinned sequence DB getter changed');
  }
  const nativeGet = descriptor.get;
  Object.defineProperty(diagram, 'db', { ...descriptor, get() {
    const db = nativeGet.call(this);
    if (typeof db.parseBoxData !== 'function') {
      throw new MathPolicyError('E_MATH_INVALID', 'pinned sequence box parser changed');
    }
    db.parseBoxData = (raw: string) => {
      const data = parseSequenceBoxData(raw).data;
      if (data.text) data.text = sanitizeSequenceText(data.text);
      return data;
    };
    db.addProperties = (actorId: string, text: {text: string}) =>
      applySequenceProperties(db.getActor(actorId), parseSequenceProperties(text.text));
    for (const setter of ['setDiagramTitle', 'setAccTitle', 'setAccDescription']) {
      const nativeSet = db[setter];
      if (typeof nativeSet !== 'function') throw new MathPolicyError('E_MATH_INVALID',
        'pinned sequence common DB setter changed');
      db[setter] = (value: string) => {
        return nativeSet.call(db, sanitizeSequenceText(value));
      };
    }
    return db;
  } });
  installed = true;
}
