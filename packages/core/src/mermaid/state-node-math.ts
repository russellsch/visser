// Node orchestration: attest the collector-owned extraction against a normal
// native parse before transporting any state math to the compiler.
import { isDeepStrictEqual } from 'node:util';
import { MathPolicyError } from '../math/policy.ts';
import { extractStateLabels } from './state-labels.ts';
import { createStateProvenance } from './state-provenance.ts';
import { observeStateDb } from './state-observer.ts';
import { sanitizeSequenceField } from './sequence-sanitize.ts';
import { replayStateAccessibility, reconcileStateAccessibility } from './state-accessibility.ts';
import { validateStateMathRecords } from './state-math.ts';
import { planStateRenderCopies } from './state-render-plan.ts';
import { stateMathTransport, type StateRenderMath } from './state-transport.ts';

type Db = Record<string, (...args: unknown[]) => unknown>;
function invalid(message: string): never { throw new MathPolicyError('E_MATH_INVALID', `state math extraction: ${message}`); }
function snapshot(db: Db): unknown {
  const data = db['getData']!() as Record<string, unknown>;
  return structuredClone({nodes:data['nodes'], edges:data['edges'], direction:data['direction']});
}

/** Caller installs the pinned observer and real native sanitizer before parsing. */
export async function extractStateNodeMath(original: string, rendered: string, nativeDb: Db): Promise<StateRenderMath | undefined> {
  const expected = snapshot(nativeDb);
  const common = {title:nativeDb['getDiagramTitle']!(), accTitle:nativeDb['getAccTitle']!(), accDescr:nativeDb['getAccDescription']!()};
  if (common.title !== '') invalid('unowned native diagram title');
  const labels = await extractStateLabels(original, rendered);
  // @ts-expect-error Mermaid has no declarations for this pinned artifact.
  const module = await import('mermaid/dist/chunks/mermaid.core/stateDiagram-v2-GCMORJYK.mjs');
  if (module.stateObserverVersion !== 1) invalid('native extraction observer is unavailable');
  const db = module.diagram.db as Db;
  replayStateAccessibility(db, labels);
  const accessibility = reconcileStateAccessibility(db, labels, sanitizeSequenceField);
  if (common.accTitle !== accessibility.accTitle.value || common.accDescr !== accessibility.accDescr.value) {
    invalid('native accessibility differs from collected assignments');
  }
  const consumer = createStateProvenance(labels, sanitizeSequenceField);
  const stop = observeStateDb(db, consumer.listener);
  try {
    db['setRootDoc']!([...labels.root]);
    if (!isDeepStrictEqual(snapshot(db), expected)) invalid('collector-owned native extraction differs from parsed data');
    // The browser extracts once while parsing and again immediately before layout.
    db['extract']!(db['getRootDocV2']!());
    const provenance = consumer.result();
    const ledger = validateStateMathRecords(original, labels, provenance, sanitizeSequenceField);
    const plan = planStateRenderCopies(original, provenance, ledger.records, sanitizeSequenceField,
      undefined, {allowPlainUndefinedShape:true});
    return plan.total.occurrences ? {...stateMathTransport(ledger.records, plan), accessibility} : undefined;
  } finally { stop(); }
}
