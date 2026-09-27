// Guarded deletion (§11.11): remove a target's whole span and record it, and
// every target nested in it, under `retiredTargets` in one guarded write.
import { relative, sep } from 'node:path';
import type { TargetId, TargetRecord } from '../types.ts';
import type { LoadedBundle } from '../model/bundle.ts';
import { fail, guardedWrite, unifiedDiff } from './guarded-write.ts';
import { checkReason, insertRetiredTargets, type RetiredEntry } from './frontmatter-edit.ts';
import type { ReferencePacket } from './packet.ts';
import { locateDocument } from './registry.ts';
import type { EditResult, ReplaceOptions } from './replace.ts';
import { resolveReference } from './resolve.ts';

export type RetireRequest = { reason: string; replacement?: TargetId };

export type RetireResult = EditResult & { retiredTargets: TargetId[] };

const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const encoder = new TextEncoder();

export function ancestorsOf(targets: Map<TargetId, TargetRecord>, id: TargetId): TargetId[] {
  const out: TargetId[] = [];
  let current = targets.get(id)?.parentId;
  while (current) {
    out.push(current);
    current = targets.get(current)?.parentId;
  }
  return out;
}

export function descendantsOf(targets: Map<TargetId, TargetRecord>, id: TargetId): TargetId[] {
  return [...targets.values()].filter((t) => ancestorsOf(targets, t.id).includes(id)).map((t) => t.id);
}

export function retiredMap(bundle: LoadedBundle): Record<string, { reason?: string; replacement?: string }> {
  const retired = bundle.parsed.frontmatter['retiredTargets'];
  return retired && typeof retired === 'object' ? (retired as Record<string, { reason?: string; replacement?: string }>) : {};
}

/** Live targets outside `removed` that name any removed ID in their dependencies. */
export function referrersOf(bundle: LoadedBundle, removed: ReadonlySet<TargetId>): string[] {
  const out: string[] = [];
  for (const t of bundle.model.targets.values()) {
    if (removed.has(t.id)) continue;
    for (const dep of t.dependencies) if (removed.has(dep)) out.push(`${t.id} -> ${dep}`);
  }
  return out;
}

/** Remove bytes [start, end) and one adjacent separating blank line, preferring the following one. */
export function removeSpan(bytes: Uint8Array, start: number, end: number): Uint8Array {
  let from = start;
  let to = end;
  const endsWithNewline = end > 0 && bytes[end - 1] === 0x0a;
  if (endsWithNewline && bytes[to] === 0x0a) to += 1;
  else if (endsWithNewline && bytes[to] === 0x0d && bytes[to + 1] === 0x0a) to += 2;
  else if (from >= 2 && bytes[from - 1] === 0x0a && bytes[from - 2] === 0x0a) from -= 1;
  else if (from >= 3 && bytes[from - 1] === 0x0a && bytes[from - 2] === 0x0d && bytes[from - 3] === 0x0a) from -= 2;
  const out = new Uint8Array(bytes.length - (to - from));
  out.set(bytes.subarray(0, from), 0);
  out.set(bytes.subarray(to), from);
  return out;
}

/** Insert frontmatter entries into raw document bytes (keeps a BOM and line endings). */
export function withRetiredEntries(bytes: Uint8Array, entries: RetiredEntry[]): Uint8Array {
  let text: string;
  try {
    text = decoder.decode(bytes);
  } catch {
    fail('E_SYNTAX', 'the document is not valid UTF-8');
  }
  return encoder.encode(insertRetiredTargets(text, entries));
}

export function retireTarget(packet: ReferencePacket, request: RetireRequest, expectedRevision: string, opts: ReplaceOptions): RetireResult {
  checkReason(request.reason);
  const located = locateDocument(packet.docId, opts.doc === undefined ? { repoRoot: opts.repoRoot } : { repoRoot: opts.repoRoot, doc: opts.doc });
  if (located.status === 'ambiguous') fail('E_DOC_DUPLICATE', `docId ${packet.docId} appears in ${located.paths.length} primary files`);
  if (located.status === 'missing') fail('E_REF_BROKEN', located.message);
  const indexPath = located.path;

  let before: LoadedBundle | undefined;
  let removedIds: TargetId[] = [];
  const { after, original, candidate } = guardedWrite({ repoRoot: opts.repoRoot, docId: packet.docId, indexPath, ...(opts.fsContext ? { fsContext: opts.fsContext } : {}) }, () => {
    const { result, bundle } = resolveReference(packet, { repoRoot: opts.repoRoot, doc: indexPath });
    if (result.status === 'stale') fail('E_REF_STALE', 'the packet is stale; resolve, reconcile, and refresh it before retiring');
    if (result.status !== 'exact' || !bundle) {
      const first = result.diagnostics[0];
      fail(first?.code ?? 'E_REF_INVALID', `the packet does not resolve exactly (${result.status}): ${first?.message ?? ''}`);
    }
    if (bundle.sourceRevision !== expectedRevision) {
      fail('E_REF_STALE', `--expected-revision ${expectedRevision} is not the current revision ${bundle.sourceRevision}`);
    }
    const record = bundle.model.targets.get(packet.targetId)!;
    if (record.kind.startsWith('mermaid-')) {
      fail('E_REF_INVALID', `${packet.targetId} is inside Mermaid figure ${record.parentId ?? ''}; use \`refs replace --retire\` on the figure`);
    }
    const removed = [packet.targetId, ...descendantsOf(bundle.model.targets, packet.targetId)];
    const removedSet = new Set(removed);

    if (request.replacement !== undefined) {
      if (removedSet.has(request.replacement)) fail('E_SEMANTIC', `--replacement ${request.replacement} is inside the retired span`);
      if (!bundle.model.targets.has(request.replacement)) fail('E_REF_BROKEN', `--replacement ${request.replacement} is not a live target`);
    }
    const referrers = referrersOf(bundle, removedSet);
    if (referrers.length > 0) fail('E_REF_BROKEN', `live targets still refer to retired IDs: ${referrers.join(', ')}; change them first`);
    const chained = Object.entries(retiredMap(bundle)).filter(([, entry]) => entry.replacement !== undefined && removedSet.has(entry.replacement));
    if (chained.length > 0) {
      fail('E_SEMANTIC', `retired targets name a removed ID as their replacement (${chained.map(([id, e]) => `${id} -> ${e.replacement}`).join(', ')}); a replacement chain is not allowed`);
    }

    const bytes = bundle.parsed.rawBytes;
    const cut = removeSpan(bytes, record.span.startByte, record.span.endByte);
    const entries: RetiredEntry[] = removed.map((id) => (
      id === packet.targetId && request.replacement !== undefined
        ? { id, reason: request.reason, replacement: request.replacement }
        : { id, reason: request.reason }
    ));
    before = bundle;
    removedIds = removed;
    return {
      original: bytes,
      candidate: withRetiredEntries(cut, entries),
      validate: (next) => {
        for (const id of removed) if (next.model.targets.has(id)) fail('E_SEMANTIC', `${id} is still live after the edit; nothing was written`);
      },
    };
  });
  const bundle = before!;

  const oldAncestors = ancestorsOf(bundle.model.targets, packet.targetId);
  const containing: TargetId[] = [];
  const changed: TargetId[] = [];
  for (const [id, now] of after.model.targets) {
    const was = bundle.model.targets.get(id);
    if (!was || was.bodySha256 === now.bodySha256) continue;
    if (oldAncestors.includes(id)) containing.push(id);
    else changed.push(id);
  }
  const oldText = new TextDecoder().decode(original).replace(/\r\n?/g, '\n');
  const newText = new TextDecoder().decode(candidate).replace(/\r\n?/g, '\n');
  return {
    schema: 'explain-edit/1',
    docId: packet.docId,
    targetId: packet.targetId,
    oldRevision: bundle.sourceRevision!,
    newRevision: after.sourceRevision!,
    changedTargets: changed,
    addedTargets: [],
    containingTargets: containing,
    dependentTargets: [],
    retiredTargets: removedIds,
    diff: unifiedDiff(oldText, newText, relative(opts.repoRoot, indexPath).split(sep).join('/')),
  };
}
