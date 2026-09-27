// `refs show` (§11.12): a current packet for a live target the user did not
// reference. Read-only, with the same root confinement as resolution.
import { existsSync } from 'node:fs';
import { relative, sep } from 'node:path';
import { loadBundle } from '../model/bundle.ts';
import { HashError } from '../model/hash.ts';
import { createPacket, normalizeQuoteText, type ReferencePacket } from './packet.ts';
import { assertInsideRoots } from './registry.ts';

export type ShowOptions = {
  repoRoot: string;
  quote?: string;
};

export type ShowResult = {
  packet: ReferencePacket;
  yaml: string;
  quoteFound?: boolean;
};

/** Repository-relative POSIX path used as an advisory `sourceHint`. */
export function sourceHintFor(indexPath: string, repoRoot: string): string | undefined {
  const rel = relative(repoRoot, indexPath).split(sep).join('/');
  return rel.startsWith('..') ? undefined : rel;
}

export function showReference(docPath: string, targetId: string, opts: ShowOptions): ShowResult {
  const indexPath = assertInsideRoots(docPath, opts.repoRoot);
  if (!existsSync(indexPath)) throw new HashError('E_REF_BROKEN', 'E_REF_BROKEN', `${docPath} does not exist`);
  const bundle = loadBundle(indexPath);
  const errors = bundle.diagnostics.filter((d) => d.severity === 'error');
  if (errors.length > 0 || !bundle.docId || !bundle.sourceRevision) {
    const first = errors[0];
    throw new HashError(first?.code ?? 'E_SYNTAX', 'E_SOURCE', `the document has errors: ${first?.message ?? 'no source revision'}`);
  }
  const record = bundle.model.targets.get(targetId);
  if (!record) {
    const retired = (bundle.parsed.frontmatter['retiredTargets'] as Record<string, unknown> | undefined)?.[targetId];
    throw new HashError('E_REF_BROKEN', 'E_REF_BROKEN', retired ? `target ${targetId} is retired` : `target ${targetId} does not exist`);
  }
  const hint = sourceHintFor(indexPath, opts.repoRoot);
  const { packet, yaml } = createPacket({
    docId: bundle.docId,
    targetId,
    sourceRevision: bundle.sourceRevision,
    bodySha256: record.bodySha256,
    issuedBy: 'refs-show',
    label: record.label.split(/\s+/).join(' ').slice(0, 200),
    kind: record.kind,
    ...(hint ? { sourceHint: hint } : {}),
    ...(opts.quote !== undefined ? { quote: { exact: opts.quote } } : {}),
  });
  const result: ShowResult = { packet, yaml };
  if (opts.quote !== undefined) {
    result.quoteFound = normalizeQuoteText(record.plainText, true).includes(normalizeQuoteText(opts.quote, true));
  }
  return result;
}
