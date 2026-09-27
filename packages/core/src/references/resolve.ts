// Read-only reference resolution (§11.6). Identity is (docId, targetId); the
// revision and body digests only describe what the reader saw.
import type { Diagnostic, TargetId, TargetRecord } from '../types.ts';
import { loadBundle, type LoadedBundle } from '../model/bundle.ts';
import { HashError, normalizeText } from '../model/hash.ts';
import { normalizeQuoteText, type ReferencePacket } from './packet.ts';
import { locateDocument } from './registry.ts';

export type ResolveStatus = 'exact' | 'stale' | 'deleted' | 'ambiguous' | 'missing' | 'invalid';

export type ResolveResult = {
  schema: 'visser-resolve/1';
  status: ResolveStatus;
  docId?: string;
  targetId?: string;
  viewedRevision?: string;
  currentRevision?: string;
  targetBodyUnchanged?: boolean;
  quoteFound?: boolean;
  labelMatches?: boolean;
  kindMatches?: boolean;
  current?: {
    target: TargetRecord;
    sourceText: string;
    parentContext: string;
    dependencies: Array<{ id: string; kind: string; text: string }>;
  };
  diagnostics: Diagnostic[];
};

export type ResolveOptions = {
  repoRoot: string;
  doc?: string;
};

export type Resolution = {
  result: ResolveResult;
  bundle?: LoadedBundle;
  indexPath?: string;
};

function diag(code: string, message: string, extra: Partial<Diagnostic> = {}): Diagnostic {
  return { code, severity: 'error', message, ...extra };
}

/** Normalized source text of a byte span. */
export function spanText(bundle: LoadedBundle, start: number, end: number): string {
  return normalizeText(bundle.parsed.rawBytes.subarray(start, end));
}

/** Source text of `id` with the spans of its direct child targets left out. */
function textWithoutChildren(bundle: LoadedBundle, record: TargetRecord): string {
  const children = [...bundle.model.targets.values()]
    .filter((t) => t.parentId === record.id)
    .sort((a, b) => a.span.startByte - b.span.startByte);
  const parts: string[] = [];
  let at = record.span.startByte;
  for (const child of children) {
    parts.push(spanText(bundle, at, child.span.startByte));
    at = child.span.endByte;
  }
  parts.push(spanText(bundle, at, record.span.endByte));
  return parts.join('');
}

/** §11.6: parent source without child spans, or the section heading when there is no parent. */
export function parentContext(bundle: LoadedBundle, record: TargetRecord): string {
  const contextId = record.parentId ?? record.sectionId;
  const context = contextId ? bundle.model.targets.get(contextId) : undefined;
  return context ? textWithoutChildren(bundle, context) : '';
}

export function currentView(bundle: LoadedBundle, record: TargetRecord): NonNullable<ResolveResult['current']> {
  return {
    target: record,
    sourceText: spanText(bundle, record.span.startByte, record.span.endByte),
    parentContext: parentContext(bundle, record),
    dependencies: record.dependencies.map((id: TargetId) => {
      const dep = bundle.model.targets.get(id);
      return { id, kind: dep?.kind ?? 'missing', text: dep?.plainText ?? '' };
    }),
  };
}

function retiredTargets(bundle: LoadedBundle): Record<string, { reason?: string; replacement?: string }> {
  const retired = bundle.parsed.frontmatter['retiredTargets'];
  return retired && typeof retired === 'object' ? (retired as Record<string, { reason?: string; replacement?: string }>) : {};
}

/** §11.6 resolution algorithm. The packet must already be schema-valid (parsePacket). */
export function resolveReference(packet: ReferencePacket, opts: ResolveOptions): Resolution {
  const base: ResolveResult = {
    schema: 'visser-resolve/1',
    status: 'missing',
    docId: packet.docId,
    targetId: packet.targetId,
    viewedRevision: packet.sourceRevision,
    diagnostics: [],
  };

  // Step 2: exactly one current source bundle within allowed roots.
  let located;
  try {
    located = locateDocument(packet.docId, opts.doc === undefined ? { repoRoot: opts.repoRoot } : { repoRoot: opts.repoRoot, doc: opts.doc });
  } catch (error) {
    if (!(error instanceof HashError)) throw error;
    return { result: { ...base, status: 'invalid', diagnostics: [diag(error.code, error.message)] } };
  }
  if (located.status === 'ambiguous') {
    return { result: { ...base, status: 'ambiguous', diagnostics: [diag('E_DOC_DUPLICATE', `docId ${packet.docId} appears in ${located.paths.length} primary files`, { suggestedAction: located.paths.join(', ') })] } };
  }
  if (located.status === 'missing') {
    return { result: { ...base, status: 'missing', diagnostics: [diag('E_REF_BROKEN', located.message)] } };
  }

  // Step 3: parse and validate current source; never use cached offsets.
  const bundle = loadBundle(located.path);
  const errors = bundle.diagnostics.filter((d) => d.severity === 'error');
  const duplicate = errors.find((d) => d.code === 'E_ID_DUPLICATE' && d.targetId === packet.targetId);
  if (duplicate) {
    return { result: { ...base, status: 'ambiguous', diagnostics: errors }, bundle, indexPath: located.path };
  }
  if (errors.length > 0 || bundle.sourceRevision === undefined) {
    return {
      result: { ...base, status: 'missing', diagnostics: [diag('E_REF_BROKEN', 'the current source has errors, so the target cannot be located reliably'), ...errors] },
      bundle,
      indexPath: located.path,
    };
  }

  const currentRevision = bundle.sourceRevision;
  const record = bundle.model.targets.get(packet.targetId);

  // Step 9: absent target.
  if (!record) {
    const retired = retiredTargets(bundle)[packet.targetId];
    if (retired) {
      const replacement = retired.replacement ? ` Advisory replacement: ${retired.replacement}.` : '';
      return {
        result: { ...base, status: 'deleted', currentRevision, diagnostics: [diag('E_REF_BROKEN', `target ${packet.targetId} was retired: ${retired.reason ?? 'no reason given'}.${replacement}`, { targetId: packet.targetId })] },
        bundle,
        indexPath: located.path,
      };
    }
    return {
      result: { ...base, status: 'missing', currentRevision, diagnostics: [diag('E_REF_BROKEN', `target ${packet.targetId} is not in the current document and has no retirement record`, { targetId: packet.targetId })] },
      bundle,
      indexPath: located.path,
    };
  }

  // Steps 5–8.
  const bodyUnchanged = packet.bodySha256 === record.bodySha256;
  const advisory: Partial<ResolveResult> = {};
  if (packet.quote) {
    advisory.quoteFound = normalizeQuoteText(record.plainText, true).includes(normalizeQuoteText(packet.quote.exact, true));
  }
  if (packet.label !== undefined) advisory.labelMatches = packet.label === record.label;
  if (packet.kind !== undefined) advisory.kindMatches = packet.kind === record.kind;

  let result: ResolveResult;
  if (packet.sourceRevision === currentRevision && bodyUnchanged) {
    result = { ...base, status: 'exact', currentRevision, targetBodyUnchanged: true, ...advisory, current: currentView(bundle, record), diagnostics: [] };
  } else if (packet.sourceRevision !== currentRevision) {
    result = {
      ...base,
      status: 'stale',
      currentRevision,
      targetBodyUnchanged: bodyUnchanged,
      ...advisory,
      current: currentView(bundle, record),
      diagnostics: [diag('E_REF_STALE', bodyUnchanged
        ? 'the document changed since the packet was copied; the target text is unchanged'
        : 'the document changed since the packet was copied, including the target text', { targetId: record.id, suggestedAction: 'reconcile, then run `visser refs refresh`' })],
    };
  } else {
    result = {
      ...base,
      status: 'invalid',
      currentRevision,
      targetBodyUnchanged: false,
      ...advisory,
      diagnostics: [diag('E_REF_INVALID', 'the packet body digest is inconsistent with its claimed source revision', { targetId: record.id })],
    };
  }
  return { result, bundle, indexPath: located.path };
}
