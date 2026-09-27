// Guarded single-file replacement (§11.9). Coordinates cooperating Explain
// writers and detects external edits seen at the final pre-write check; it is
// not compare-and-swap against a noncooperating editor.
import { constants, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, writeSync, chmodSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import type { TargetId, TargetRecord } from '../types.ts';
import { loadBundle, type LoadedBundle } from '../model/bundle.ts';
import { HashError, sha256Hex } from '../model/hash.ts';
import { detectNewline } from '../syntax/index.ts';
import { type FsContext, lockTime, lockToken } from './fs-context.ts';
import type { ReferencePacket } from './packet.ts';
import { locateDocument } from './registry.ts';
import { resolveReference, type ResolveOptions } from './resolve.ts';

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
  diff: string;
};

export type ReplaceOptions = ResolveOptions & { fsContext?: FsContext };

function fail(code: string, message: string): never {
  throw new HashError(code, code, message);
}

function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!isAbsolute(rel) && rel.split(sep)[0] !== '..');
}

// ---------------------------------------------------------------------------
// Advisory lock (§11.9 step 1)

type Lock = { path: string; token: string };

function acquireLock(repoRoot: string, docId: string, ctx: FsContext | undefined): Lock {
  const realRepo = realpathSync(repoRoot);
  const explainDir = join(repoRoot, '.explain');
  const lockDir = join(explainDir, 'edit-locks');
  for (const dir of [explainDir, lockDir]) {
    if (existsSync(dir)) {
      if (lstatSync(dir).isSymbolicLink()) fail('E_PATH_ESCAPE', `${relative(repoRoot, dir)} is a symbolic link`);
      if (!isInside(realpathSync(dir), realRepo)) fail('E_PATH_ESCAPE', `${relative(repoRoot, dir)} is outside the repository`);
    } else {
      mkdirSync(dir, { mode: 0o700 });
    }
  }
  const path = join(lockDir, `${docId}.lock`);
  const token = lockToken(ctx);
  let fd: number;
  try {
    fd = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST' || (error as NodeJS.ErrnoException).code === 'ELOOP') {
      let holder = '';
      try {
        holder = lstatSync(path).isSymbolicLink() ? ' (the lock path is a symbolic link)' : ` ${readFileSync(path, 'utf8').trim()}`;
      } catch {
        // The lock disappeared between the failed create and this read.
      }
      fail('E_WRITE_CONFLICT', `document is locked by another writer: ${path}${holder}. If no writer is active, remove the lock file by hand.`);
    }
    throw error;
  }
  try {
    writeSync(fd, JSON.stringify({ pid: process.pid, startedAt: lockTime(ctx), token }) + '\n');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  return { path, token };
}

function releaseLock(lock: Lock): void {
  try {
    const content = JSON.parse(readFileSync(lock.path, 'utf8')) as { token?: string };
    if (content.token === lock.token) unlinkSync(lock.path);
  } catch {
    // Never break a lock this process does not own.
  }
}

// ---------------------------------------------------------------------------
// Line diff for the edit report

function unifiedDiff(oldText: string, newText: string, name: string, context = 3): string {
  const a = oldText.split('\n');
  const b = newText.split('\n');
  // Trim the common prefix and suffix, then run LCS on the middle.
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const am = a.slice(pre, a.length - suf);
  const bm = b.slice(pre, b.length - suf);
  if (am.length === 0 && bm.length === 0) return '';
  const ops: Array<[' ' | '-' | '+', string]> = [];
  if (am.length * bm.length > 4_000_000) {
    for (const l of am) ops.push(['-', l]);
    for (const l of bm) ops.push(['+', l]);
  } else {
    const n = am.length;
    const m = bm.length;
    const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i]![j] = am[i] === bm[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && am[i] === bm[j]) { ops.push([' ', am[i]!]); i++; j++; }
      else if (i < n && (j === m || dp[i + 1]![j]! >= dp[i]![j + 1]!)) { ops.push(['-', am[i]!]); i++; }
      else { ops.push(['+', bm[j]!]); j++; }
    }
  }
  const before = a.slice(Math.max(0, pre - context), pre);
  const after = a.slice(a.length - suf, Math.min(a.length, a.length - suf + context));
  const lines = [...before.map((l) => ' ' + l), ...ops.map(([op, l]) => op + l), ...after.map((l) => ' ' + l)];
  const oldStart = pre - before.length + 1;
  const oldCount = before.length + ops.filter(([op]) => op !== '+').length + after.length;
  const newCount = before.length + ops.filter(([op]) => op !== '-').length + after.length;
  return [`--- a/${name}`, `+++ b/${name}`, `@@ -${oldStart},${oldCount} +${oldStart},${newCount} @@`, ...lines].join('\n') + '\n';
}

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

function validateCandidate(before: LoadedBundle, after: LoadedBundle, targetId: TargetId, region: { start: number; end: number }): void {
  const errors = after.diagnostics.filter((d) => d.severity === 'error');
  if (errors.length > 0) {
    const retention = errors.find((d) => d.code === 'E_ID_DUPLICATE');
    if (retention) fail('E_ID_RETENTION', `the replacement repeats target ID ${retention.targetId ?? ''}: ${retention.message}`);
    const first = errors[0]!;
    fail(first.code, `the document would be invalid after replacement: ${first.message}${first.startLine ? ` (line ${first.startLine})` : ''}`);
  }
  const inRegion = (t: TargetRecord) => t.span.startByte >= region.start && t.span.endByte <= region.end;
  const retained = after.model.targets.get(targetId);
  if (!retained || !inRegion(retained)) fail('E_ID_RETENTION', `the replacement must keep the target ID ${targetId}`);
  // Every nested ID of the old target must remain inside the replacement exactly once.
  for (const id of descendants(before.model.targets, targetId)) {
    const kept = after.model.targets.get(id);
    if (!kept || !inRegion(kept)) {
      fail('E_ID_RETENTION', `the replacement drops nested target ${id}; retire it first (refs retire, Phase 3)`);
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
  if (lstatSync(indexPath).isSymbolicLink()) fail('E_PATH_ESCAPE', 'the primary file is a symbolic link');

  const lock = acquireLock(opts.repoRoot, packet.docId, opts.fsContext);
  let tempPath: string | undefined;
  try {
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

    // Step 3: build the candidate and validate the whole resulting document.
    const original = bundle.parsed.rawBytes;
    const rawHash = sha256Hex(original);
    const { startByte, endByte } = record.span;
    const fitted = fitReplacement(replacement, original, original.subarray(startByte, endByte));
    const candidate = new Uint8Array(startByte + fitted.length + (original.length - endByte));
    candidate.set(original.subarray(0, startByte), 0);
    candidate.set(fitted, startByte);
    candidate.set(original.subarray(endByte), startByte + fitted.length);

    // Step 4: write the candidate to a new temporary file in the same directory.
    tempPath = join(dirname(indexPath), `.${basename(indexPath)}.${lockToken(opts.fsContext)}.tmp`);
    const fd = openSync(tempPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    try {
      writeSync(fd, candidate);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    chmodSync(tempPath, statSync(indexPath).mode & 0o7777);

    const after = loadBundle(tempPath);
    validateCandidate(bundle, after, packet.targetId, { start: startByte, end: startByte + fitted.length });

    // Step 5: re-read the original immediately before rename; abort on change.
    opts.fsContext?.beforeRename?.(indexPath);
    if (lstatSync(indexPath).isSymbolicLink() || sha256Hex(new Uint8Array(readFileSync(indexPath))) !== rawHash) {
      fail('E_WRITE_CONFLICT', 'the document changed on disk during the edit; nothing was written');
    }

    // Step 6: rename and report.
    renameSync(tempPath, indexPath);
    tempPath = undefined;

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
      oldRevision: bundle.sourceRevision,
      newRevision: after.sourceRevision!,
      changedTargets: changed,
      addedTargets: added,
      containingTargets: containing,
      dependentTargets,
      diff: unifiedDiff(oldText, newText, relative(opts.repoRoot, indexPath).split(sep).join('/')),
    };
  } finally {
    if (tempPath) rmSync(tempPath, { force: true });
    releaseLock(lock);
  }
}
