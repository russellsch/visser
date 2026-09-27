// `explain upgrade` core (§12.3, §17.1): semver precedence for release
// versions, and the guarded write of explain.lock.json (§11.9). Toolkit
// resolution and the target toolkit's check and rebuild live in the CLI.
import { constants, closeSync, fsyncSync, lstatSync, openSync, readFileSync, renameSync, rmSync, statSync, chmodSync, writeSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { sha256Hex } from '../model/hash.ts';
import { validateAgainst } from '../model/schemas.ts';
import { type FsContext, lockToken } from '../references/fs-context.ts';
import { acquireLock, fail, releaseLock, unifiedDiff } from '../references/guarded-write.ts';

const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/;

function parse(version: string): { core: [bigint, bigint, bigint]; pre: string[] } {
  const m = SEMVER.exec(version);
  if (!m) fail('E_SYNTAX', `${JSON.stringify(version)} is not a semantic version`);
  return { core: [BigInt(m[1]!), BigInt(m[2]!), BigInt(m[3]!)], pre: m[4] ? m[4].split('.') : [] };
}

/** Semantic Versioning 2.0.0 precedence: negative if a < b, 0 if equal, positive if a > b. Build metadata is ignored. */
export function compareVersions(a: string, b: string): number {
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) {
    if (x.core[i]! !== y.core[i]!) return x.core[i]! < y.core[i]! ? -1 : 1;
  }
  // A version without a prerelease has higher precedence than one with.
  if (x.pre.length === 0 || y.pre.length === 0) return y.pre.length - x.pre.length === 0 ? 0 : x.pre.length === 0 ? 1 : -1;
  const numeric = /^[0-9]+$/;
  for (let i = 0; i < Math.min(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i]!;
    const q = y.pre[i]!;
    if (p === q) continue;
    const pn = numeric.test(p);
    const qn = numeric.test(q);
    if (pn && qn) return BigInt(p) < BigInt(q) ? -1 : 1;
    if (pn !== qn) return pn ? -1 : 1; // numeric identifiers are lower than alphanumeric ones
    return p < q ? -1 : 1; // ASCII order
  }
  return x.pre.length === y.pre.length ? 0 : x.pre.length < y.pre.length ? -1 : 1;
}

export type LockTarget = { sha256: string; version: string };

/**
 * The new lock text: only `toolkit` changes. The origin becomes `local-dir`
 * (and `archiveSha256` is dropped), because upgrade resolves an installed
 * copy by digest and does not know how that copy was acquired; the digest
 * stays the authority (§12.3). Key order and 2-space JSON match `init`.
 */
export function upgradedLockText(originalText: string, target: LockTarget): string {
  let lock: Record<string, unknown>;
  try {
    lock = JSON.parse(originalText) as Record<string, unknown>;
  } catch (error) {
    fail('E_SYNTAX', `explain.lock.json is not valid JSON: ${(error as Error).message}`);
  }
  lock['toolkit'] = { version: target.version, sha256: target.sha256, origin: { kind: 'local-dir' } };
  const next = { ...lock };
  const check = validateAgainst('lock', next);
  if (!check.ok) fail('E_SYNTAX', `the new lock would violate explain-lock/1: ${check.errors.join('; ')}`);
  return JSON.stringify(next, null, 2) + '\n';
}

export type LockWriteOptions = {
  repoRoot: string;
  docId: string;
  lockPath: string;
  /** The raw bytes the candidate was built from. */
  original: Uint8Array;
  candidate: string;
  fsContext?: FsContext;
};

/**
 * Guarded write of explain.lock.json (§11.9): the document's edit lock, a
 * raw-hash recheck under the lock, schema validation, and an atomic rename.
 * A change by anyone else between the first read and the rename is
 * E_WRITE_CONFLICT, and the other writer's bytes stay.
 */
export function writeLockGuarded(opts: LockWriteOptions): void {
  const { lockPath } = opts;
  if (lstatSync(lockPath).isSymbolicLink()) fail('E_PATH_ESCAPE', 'explain.lock.json is a symbolic link');
  const parsed = JSON.parse(opts.candidate) as unknown;
  const check = validateAgainst('lock', parsed);
  if (!check.ok) fail('E_SYNTAX', `the new lock would violate explain-lock/1: ${check.errors.join('; ')}`);
  const rawHash = sha256Hex(opts.original);
  const lock = acquireLock(opts.repoRoot, opts.docId, opts.fsContext);
  let tempPath: string | undefined;
  try {
    // A writer that finished before we took the lock is also a conflict.
    if (sha256Hex(new Uint8Array(readFileSync(lockPath))) !== rawHash) {
      fail('E_WRITE_CONFLICT', 'explain.lock.json changed since upgrade read it; nothing was written');
    }
    tempPath = join(dirname(lockPath), `.${basename(lockPath)}.${lockToken(opts.fsContext)}.tmp`);
    const fd = openSync(tempPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    try {
      writeSync(fd, opts.candidate);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    chmodSync(tempPath, statSync(lockPath).mode & 0o7777);
    opts.fsContext?.beforeRename?.(lockPath);
    if (lstatSync(lockPath).isSymbolicLink() || sha256Hex(new Uint8Array(readFileSync(lockPath))) !== rawHash) {
      fail('E_WRITE_CONFLICT', 'explain.lock.json changed during the upgrade; nothing was written');
    }
    renameSync(tempPath, lockPath);
    tempPath = undefined;
  } finally {
    if (tempPath) rmSync(tempPath, { force: true });
    releaseLock(lock);
  }
}

export function lockDiff(oldText: string, newText: string): string {
  return unifiedDiff(oldText, newText, 'explain.lock.json');
}
