// Guarded single-file replacement (§11.9). Coordinates cooperating Explain
// writers and detects external edits seen at the final pre-write check; it is
// not compare-and-swap against a noncooperating editor.
import { relative, sep } from 'node:path';
import type { TargetId, TargetRecord } from '../types.ts';
import type { LoadedBundle } from '../model/bundle.ts';
import { detectNewline } from '../syntax/index.ts';
import type { FsContext } from './fs-context.ts';
import { fail, guardedWrite, unifiedDiff } from './guarded-write.ts';
import type { ReferencePacket } from './packet.ts';
import { locateDocument } from './registry.ts';
import { resolveReference, type ResolveOptions } from './resolve.ts';
import { checkReason, type RetiredEntry } from './frontmatter-edit.ts';
import { withRetiredEntries } from './retire.ts';

export type EditResult = {
  schema: 'explain-edit/1';
  docId: string;
  targetId: string;
  oldRevision: string;
  newRevision: string;
  changedTargets: TargetId[];
  addedTargets: TargetId[];
  containingTargets: TargetId[];
  dependentTargets: Array<{ target: TargetId; dependents: TargetId[] }>;
  /** IDs this edit recorded under `retiredTargets` (§11.11). */
  retiredTargets?: TargetId[];
  diff: string;
};

export type ReplaceOptions = ResolveOptions & {
  fsContext?: FsContext;
  /** §11.11: nested IDs the replacement drops, retired in the same guarded write. */
  retire?: Array<{ id: TargetId; reason: string }>;
};

// ---------------------------------------------------------------------------
// Replacement validation (§11.9 step 3)

function ancestors(targets: Map<TargetId, TargetRecord>, id: TargetId): TargetId[] {
  const out: TargetId[] = [];
  let current = targets.get(id)?.parentId;
  while (current) {
    out.push(current);
    current = targets.get(current)?.parentId;
  }
  return out;
}

function descendants(targets: Map<TargetId, TargetRecord>, id: TargetId): TargetId[] {
  return [...targets.values()].filter((t) => ancestors(targets, t.id).includes(id)).map((t) => t.id);
}

/** Match the replacement's line endings and final newline to the replaced span. */
function fitReplacement(replacement: Uint8Array, original: Uint8Array, span: Uint8Array): Uint8Array {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(replacement);
  } catch {
    fail('E_SYNTAX', 'replacement is not valid UTF-8');
  }
  text = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const spanEndsWithNewline = span.length > 0 && (span[span.length - 1] === 0x0a || span[span.length - 1] === 0x0d);
  text = text.replace(/\n+$/, '');
  if (spanEndsWithNewline) text += '\n';
  const newline = detectNewline(original);
  return new TextEncoder().encode(newline === '\n' ? text : text.replace(/\n/g, newline));
}

function validateCandidate(before: LoadedBundle, after: LoadedBundle, targetId: TargetId, region: { start: number; end: number }, retiring: ReadonlySet<TargetId> = new Set()): void {
  const errors = after.diagnostics.filter((d) => d.severity === 'error');
  if (errors.length > 0) {
    const retention = errors.find((d) => d.code === 'E_ID_DUPLICATE');
    if (retention) fail('E_ID_RETENTION', `the replacement repeats target ID ${retention.targetId ?? ''}: ${retention.message}`);
    const first = errors[0]!;
    // Lines of the candidate document that came from the replacement file.
    const raw = after.parsed.rawBytes;
    const lineAt = (byte: number) => 1 + raw.subarray(0, byte).reduce((n, b) => n + (b === 0x0a ? 1 : 0), 0);
    const firstLine = lineAt(region.start);
    const lastLine = lineAt(Math.max(region.start, region.end - 1));
    const inside = first.startLine !== undefined && first.startLine >= firstLine && first.startLine <= lastLine;
    const record = before.model.targets.get(targetId);
    const oldSpan = record ? new TextDecoder().decode(before.parsed.rawBytes.subarray(record.span.startByte, record.span.endByte)) : '';
    if (first.code === 'E_ID_MISSING' && inside && oldSpan.startsWith(`<!-- ex:id ${targetId} -->`)) {
      fail('E_ID_MISSING', `the replacement must start with \`<!-- ex:id ${targetId} -->\`, and every other block in it needs its own marker: ${first.message.replace(/\s*\(line \d+\)$/, '')}`);
    }
    const where = first.startLine === undefined ? '' : inside ? ` (line ${first.startLine - firstLine + 1} of the replacement)` : ` (line ${first.startLine} of the document)`;
    fail(first.code, `the document would be invalid after replacement: ${first.message.replace(/\s*\(line \d+\)$/, '')}${where}`);
  }
  const inRegion = (t: TargetRecord) => t.span.startByte >= region.start && t.span.endByte <= region.end;
  const retained = after.model.targets.get(targetId);
  if (!retained || !inRegion(retained)) fail('E_ID_RETENTION', `the replacement must keep the target ID ${targetId}`);
  // Every nested ID of the old target must remain inside the replacement exactly once.
  for (const id of descendants(before.model.targets, targetId)) {
    const kept = after.model.targets.get(id);
    if (retiring.has(id)) {
      if (kept) fail('E_SEMANTIC', `--retire ${id}: the replacement still contains ${id}`);
      continue;
    }
    if (!kept || !inRegion(kept)) {
      fail('E_ID_RETENTION', `the replacement drops nested target ${id}; add \`--retire ${id} --reason TEXT\` to retire it in the same write`);
    }
  }
  // Roots in the region other than the retained one are new siblings (a split) and must be new IDs.
  const regionRoots = [...after.model.targets.values()].filter((t) => inRegion(t) && (!t.parentId || !inRegion(after.model.targets.get(t.parentId)!)));
  for (const root of regionRoots) {
    if (root.id !== targetId && before.model.targets.has(root.id) && !descendants(before.model.targets, targetId).includes(root.id)) {
      fail('E_ID_RETENTION', `the replacement reuses existing target ID ${root.id}`);
    }
  }
}

// ---------------------------------------------------------------------------
// §11.9 algorithm

export function replaceTarget(packet: ReferencePacket, replacement: Uint8Array, expectedRevision: string, opts: ReplaceOptions): EditResult {
  const located = locateDocument(packet.docId, opts.doc === undefined ? { repoRoot: opts.repoRoot } : { repoRoot: opts.repoRoot, doc: opts.doc });
  if (located.status === 'ambiguous') fail('E_DOC_DUPLICATE', `docId ${packet.docId} appears in ${located.paths.length} primary files`);
  if (located.status === 'missing') fail('E_REF_BROKEN', located.message);
  const indexPath = located.path;

  let before: LoadedBundle | undefined;
  let region = { start: 0, end: 0 };
  const { after, original, candidate } = guardedWrite({ repoRoot: opts.repoRoot, docId: packet.docId, indexPath, ...(opts.fsContext ? { fsContext: opts.fsContext } : {}) }, () => {
    // Step 2: reparse under the lock and require exact resolution.
    const { result, bundle } = resolveReference(packet, { repoRoot: opts.repoRoot, doc: indexPath });
    if (result.status === 'stale') fail('E_REF_STALE', 'the packet is stale; resolve, reconcile, and refresh it before replacing');
    if (result.status !== 'exact' || !bundle) {
      const first = result.diagnostics[0];
      fail(first?.code ?? 'E_REF_INVALID', `the packet does not resolve exactly (${result.status}): ${first?.message ?? ''}`);
    }
    if (bundle.sourceRevision !== expectedRevision) {
      fail('E_REF_STALE', `--expected-revision ${expectedRevision} is not the current revision ${bundle.sourceRevision}`);
    }
    const record = bundle.model.targets.get(packet.targetId)!;
    if (record.kind === 'source') fail('E_REF_INVALID', 'captured evidence cannot be replaced; recapture it instead');
    if (record.kind.startsWith('mermaid-')) {
      fail('E_REF_INVALID', `${packet.targetId} is inside Mermaid figure ${record.parentId ?? ''}; edit the figure (replace ${record.parentId ?? 'the figure'} as a whole)`);
    }
    // Step 3: build the candidate; guardedWrite validates the whole document.
    const bytes = bundle.parsed.rawBytes;
    const { startByte, endByte } = record.span;
    const fitted = fitReplacement(replacement, bytes, bytes.subarray(startByte, endByte));
    const next = new Uint8Array(startByte + fitted.length + (bytes.length - endByte));
    next.set(bytes.subarray(0, startByte), 0);
    next.set(fitted, startByte);
    next.set(bytes.subarray(endByte), startByte + fitted.length);
    // §11.11: --retire applies only to IDs nested in the old span.
    const retire = opts.retire ?? [];
    const nested = new Set(descendants(bundle.model.targets, packet.targetId));
    for (const entry of retire) {
      checkReason(entry.reason);
      if (!nested.has(entry.id)) fail('E_SEMANTIC', `--retire ${entry.id}: only IDs nested in ${packet.targetId} can be retired with refs replace`);
    }
    const entries: RetiredEntry[] = retire.map((entry) => ({ id: entry.id, reason: entry.reason }));
    const withEntries = entries.length > 0 ? withRetiredEntries(next, entries) : next;
    // The frontmatter precedes the span, so inserted entries shift the region.
    const shift = withEntries.length - next.length;
    before = bundle;
    region = { start: startByte + shift, end: startByte + shift + fitted.length };
    const retiring = new Set(retire.map((entry) => entry.id));
    return { original: bytes, candidate: withEntries, validate: (candidateBundle) => validateCandidate(bundle, candidateBundle, packet.targetId, region, retiring) };
  });
  const bundle = before!;

  const changed: TargetId[] = [];
  const containing: TargetId[] = [];
  const retainedAncestors = ancestors(after.model.targets, packet.targetId);
  for (const [id, now] of after.model.targets) {
    const was = bundle.model.targets.get(id);
    if (!was || was.bodySha256 === now.bodySha256) continue;
    if (retainedAncestors.includes(id)) containing.push(id);
    else changed.push(id);
  }
  const added = [...after.model.targets.keys()].filter((id) => !bundle.model.targets.has(id));
  const dependentTargets = [...changed, ...added].map((target) => ({
    target,
    dependents: [...after.model.targets.values()].filter((t) => t.dependencies.includes(target)).map((t) => t.id),
  }));
  const oldText = new TextDecoder().decode(original).replace(/\r\n?/g, '\n');
  const newText = new TextDecoder().decode(candidate).replace(/\r\n?/g, '\n');
  return {
    schema: 'explain-edit/1',
    docId: packet.docId,
    targetId: packet.targetId,
    oldRevision: bundle.sourceRevision!,
    newRevision: after.sourceRevision!,
    changedTargets: changed,
    addedTargets: added,
    containingTargets: containing,
    dependentTargets,
    ...((opts.retire ?? []).length > 0 ? { retiredTargets: (opts.retire ?? []).map((entry) => entry.id) } : {}),
    diff: unifiedDiff(oldText, newText, relative(opts.repoRoot, indexPath).split(sep).join('/')),
  };
}
