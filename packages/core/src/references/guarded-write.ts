// Guarded single-file write (§11.9), shared by every command that writes
// source: refs replace, refs retire, capture, and the fork's docId rewrite.
// It coordinates cooperating Visser writers and detects external edits seen
// at the final pre-write check; it is not compare-and-swap against a
// noncooperating editor.
import { constants, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, writeSync, chmodSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { loadBundle, type LoadedBundle } from '../model/bundle.ts';
import { HashError, sha256Hex } from '../model/hash.ts';
import { type FsContext, lockTime, lockToken } from './fs-context.ts';

export function fail(code: string, message: string): never {
  throw new HashError(code, code, message);
}

export function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!isAbsolute(rel) && rel.split(sep)[0] !== '..');
}

// ---------------------------------------------------------------------------
// Advisory lock (§11.9 step 1)

export type Lock = { path: string; token: string };

export function acquireLock(repoRoot: string, docId: string, ctx: FsContext | undefined): Lock {
  const realRepo = realpathSync(repoRoot);
  const visserDir = join(repoRoot, '.visser');
  const lockDir = join(visserDir, 'edit-locks');
  for (const dir of [visserDir, lockDir]) {
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

export function releaseLock(lock: Lock): void {
  try {
    const content = JSON.parse(readFileSync(lock.path, 'utf8')) as { token?: string };
    if (content.token === lock.token) unlinkSync(lock.path);
  } catch {
    // Never break a lock this process does not own.
  }
}

// ---------------------------------------------------------------------------
// Line diff for the edit report

export function unifiedDiff(oldText: string, newText: string, name: string, context = 3): string {
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
// The guarded write itself (§11.9 steps 1 and 3–6)

export type GuardedCandidate = {
  /** The raw bytes the candidate was built from (read under the lock). */
  original: Uint8Array;
  /** The complete new file content. */
  candidate: Uint8Array;
  /** Extra checks on the candidate document; throw to abort. They run before the generic error check, so they can see a candidate with errors. */
  validate?: (after: LoadedBundle) => void;
};

export type GuardedWriteOptions = {
  repoRoot: string;
  docId: string;
  indexPath: string;
  fsContext?: FsContext;
};

export type GuardedWriteResult = { after: LoadedBundle; original: Uint8Array; candidate: Uint8Array };

/**
 * Lock the document, let `produce` build the candidate under the lock, validate
 * the whole candidate document in memory, recheck the raw file, and rename.
 * Any error diagnostic in the candidate aborts the write with its code.
 */
export function guardedWrite(opts: GuardedWriteOptions, produce: () => GuardedCandidate): GuardedWriteResult {
  const { indexPath } = opts;
  if (lstatSync(indexPath).isSymbolicLink()) fail('E_PATH_ESCAPE', 'the primary file is a symbolic link');
  const lock = acquireLock(opts.repoRoot, opts.docId, opts.fsContext);
  let tempPath: string | undefined;
  try {
    const { original, candidate, validate } = produce();
    const rawHash = sha256Hex(original);

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
    // The caller's check runs first: it can map a candidate error to a more
    // exact code (refs replace maps a duplicate ID to E_ID_RETENTION, §15.6).
    validate?.(after);
    const firstError = after.diagnostics.find((d) => d.severity === 'error');
    if (firstError) fail(firstError.code, `the edited document would not be valid: ${firstError.message}${firstError.startLine ? ` (line ${firstError.startLine})` : ''}`);

    opts.fsContext?.beforeRename?.(indexPath);
    if (lstatSync(indexPath).isSymbolicLink() || sha256Hex(new Uint8Array(readFileSync(indexPath))) !== rawHash) {
      fail('E_WRITE_CONFLICT', 'the document changed on disk during the edit; nothing was written');
    }
    renameSync(tempPath, indexPath);
    tempPath = undefined;
    return { after, original, candidate };
  } finally {
    if (tempPath) rmSync(tempPath, { force: true });
    releaseLock(lock);
  }
}

