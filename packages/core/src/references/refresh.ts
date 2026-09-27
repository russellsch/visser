// `refs refresh` (§11.10): deliberately reissue a stale packet. Changes no document.
import { HashError } from '../model/hash.ts';
import { createPacket, type ReferencePacket } from './packet.ts';
import { resolveReference, type ResolveOptions, type ResolveResult } from './resolve.ts';
import { sourceHintFor } from './show.ts';

export type RefreshAcknowledgements = {
  stale: boolean; // --acknowledge-stale
  bodyChange: boolean; // --acknowledge-body-change
};

export type RefreshResult = {
  packet: ReferencePacket;
  yaml: string;
  targetBodyUnchanged: boolean;
  resolution: ResolveResult;
};

/** An E_REF_STALE refusal that carries the current target text for the caller to print. */
export class RefreshRefused extends HashError {
  readonly currentText: string | undefined;
  readonly resolution: ResolveResult;
  constructor(message: string, resolution: ResolveResult, currentText?: string) {
    super('E_REF_STALE', 'E_REF_STALE', message);
    this.currentText = currentText;
    this.resolution = resolution;
  }
}

export function refreshReference(
  packet: ReferencePacket,
  expectedCurrent: string,
  acknowledgements: RefreshAcknowledgements,
  opts: ResolveOptions,
): RefreshResult {
  const { result, bundle, indexPath } = resolveReference(packet, opts);
  if (result.status !== 'stale' && result.status !== 'exact') {
    const first = result.diagnostics[0];
    throw new HashError(first?.code ?? 'E_REF_BROKEN', `STATUS_${result.status.toUpperCase()}`, `cannot refresh a ${result.status} packet: ${first?.message ?? ''}`);
  }
  const current = result.current!;
  if (result.currentRevision !== expectedCurrent) {
    throw new RefreshRefused(`--expected-current does not match the current revision ${result.currentRevision}`, result, current.sourceText);
  }
  if (result.status === 'stale' && !acknowledgements.stale) {
    throw new RefreshRefused('the packet is stale; pass --acknowledge-stale to reissue it', result, current.sourceText);
  }
  const bodyUnchanged = result.targetBodyUnchanged === true;
  if (!bodyUnchanged && !acknowledgements.bodyChange) {
    throw new RefreshRefused(
      'the target text changed since the packet was copied; show the current text to the user, then pass --acknowledge-body-change only if the instruction still clearly applies',
      result,
      current.sourceText,
    );
  }
  const hint = indexPath && bundle ? sourceHintFor(indexPath, opts.repoRoot) : undefined;
  const { packet: fresh, yaml } = createPacket({
    docId: packet.docId,
    targetId: packet.targetId,
    sourceRevision: result.currentRevision!,
    bodySha256: current.target.bodySha256,
    issuedBy: packet.issuedBy,
    label: current.target.label.split(/\s+/).join(' ').slice(0, 200),
    kind: current.target.kind,
    ...(hint ? { sourceHint: hint } : {}),
    ...(packet.quote ? { quote: { exact: packet.quote.exact, ...(packet.quote.prefix !== undefined ? { prefix: packet.quote.prefix } : {}), ...(packet.quote.suffix !== undefined ? { suffix: packet.quote.suffix } : {}) } } : {}),
  });
  return { packet: fresh, yaml, targetBodyUnchanged: bodyUnchanged, resolution: result };
}
