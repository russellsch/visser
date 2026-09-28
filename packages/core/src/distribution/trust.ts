// The user trust store (§12.4, §14.2): `${VISSER_HOME:-~/.visser}/trust.json`.
// Its location comes only from the process environment, never from repository
// or workspace config, so a repository cannot trust its own code.
import { randomBytes } from 'node:crypto';
import { closeSync, constants, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeSync } from 'node:fs';
import { hostname } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { HashError } from '../model/hash.ts';
import { validateAgainst } from '../model/schemas.ts';

export type TrustEntry = { source: string; addedAt: string };
// `extensions` is optional, so a store written before extensions existed stays valid.
export type TrustStore = { schema: 'visser-trust-store/1'; toolkits: Record<string, TrustEntry>; extensions?: Record<string, TrustEntry> };
export type TrustKind = 'toolkits' | 'extensions';

function fail(code: string, message: string): never {
  throw new HashError(code, code, message);
}

/**
 * The user store: VISSER_HOME, else HOME/.visser. An empty VISSER_HOME means
 * unset. A relative path is refused, because later commands run from other
 * folders would not find it. With neither variable set, Visser never guesses a
 * home folder (Node would fall back to the password database, which a script
 * that clears HOME to isolate itself does not expect).
 */
export function visserHome(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env['VISSER_HOME'];
  if (explicit !== undefined && explicit !== '') {
    if (!isAbsolute(explicit)) fail('E_USAGE', `VISSER_HOME must be an absolute path, not ${JSON.stringify(explicit)}; for example: export VISSER_HOME="$HOME/.visser"`);
    return explicit;
  }
  const home = env['HOME'] || env['USERPROFILE'];
  if (!home) fail('E_USAGE', 'set VISSER_HOME or HOME: neither is set, and Visser never guesses a home folder');
  if (!isAbsolute(home)) fail('E_USAGE', `HOME must be an absolute path, not ${JSON.stringify(home)}`);
  return join(home, '.visser');
}

export function trustPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(visserHome(env), 'trust.json');
}

export function readTrust(env: NodeJS.ProcessEnv = process.env): TrustStore {
  const path = trustPath(env);
  if (!existsSync(path)) return { schema: 'visser-trust-store/1', toolkits: {} };
  if (lstatSync(path).isSymbolicLink()) fail('E_INTEGRITY', `${path} is a symbolic link`);
  let store: TrustStore;
  try {
    store = JSON.parse(readFileSync(path, 'utf8')) as TrustStore;
  } catch {
    fail('E_INTEGRITY', `${path} is not valid JSON`);
  }
  const check = validateAgainst('trustStore', store);
  if (!check.ok) fail('E_INTEGRITY', `${path} violates visser-trust-store/1: ${check.errors.join('; ')}`);
  return store;
}

export function isTrusted(digest: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return Object.hasOwn(readTrust(env).toolkits, digest);
}

function ensureHome(env: NodeJS.ProcessEnv): string {
  const home = visserHome(env);
  if (existsSync(home) && lstatSync(home).isSymbolicLink()) fail('E_INTEGRITY', `${home} is a symbolic link`);
  mkdirSync(home, { recursive: true, mode: 0o700 });
  return home;
}

/** How long a writer waits for the trust-store lock before it stops (ms). */
export const TRUST_LOCK_WAIT_MS = 5_000;

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Run a read-change-write of trust.json under an exclusive lock file
 * (`trust.json.lock`, O_EXCL|O_NOFOLLOW, mode 0600). Without it, two writers
 * lose updates, and a revocation can be undone by a concurrent install.
 * The policy matches the edit lock (§11.9): a lock held by another process is
 * never taken over. The writer retries for TRUST_LOCK_WAIT_MS, then stops with
 * E_WRITE_CONFLICT and names the holder, so the user can remove a stale lock.
 */
function withTrustLock<T>(env: NodeJS.ProcessEnv, change: () => T, waitMs = TRUST_LOCK_WAIT_MS): T {
  const home = ensureHome(env);
  const lockPath = join(home, 'trust.json.lock');
  const token = randomBytes(8).toString('hex');
  const deadline = Date.now() + waitMs;
  let delay = 2;
  let fd: number | undefined;
  for (;;) {
    try {
      fd = openSync(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
      break;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST' && code !== 'ELOOP') throw error;
      if (Date.now() >= deadline) {
        fail('E_WRITE_CONFLICT', `the trust store is locked by another writer: ${lockPath}${describeHolder(lockPath)}. If no writer is active, remove the lock file by hand: rm ${lockPath}`);
      }
      sleepSync(delay);
      delay = Math.min(delay * 2, 50);
    }
  }
  try {
    writeSync(fd, JSON.stringify({ pid: process.pid, host: hostname(), token }) + '\n');
  } finally {
    closeSync(fd);
  }
  try {
    return change();
  } finally {
    try {
      const held = JSON.parse(readFileSync(lockPath, 'utf8')) as { token?: string };
      if (held.token === token) rmSync(lockPath, { force: true });
    } catch {
      // Someone removed the lock by hand; nothing to release.
    }
  }
}

/** Who holds the lock, and whether that process still runs (same host only). */
function describeHolder(lockPath: string): string {
  try {
    if (lstatSync(lockPath).isSymbolicLink()) return ' (the lock path is a symbolic link)';
    const held = JSON.parse(readFileSync(lockPath, 'utf8')) as { pid?: unknown; host?: unknown };
    if (typeof held.pid !== 'number') return '';
    const sameHost = held.host === undefined || held.host === hostname();
    if (sameHost && !processAlive(held.pid)) return ` (held by PID ${held.pid}, which is not running: a stale lock from an interrupted process)`;
    return ` (held by PID ${held.pid}${typeof held.host === 'string' ? ` on ${held.host}` : ''})`;
  } catch {
    return '';
  }
}

export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * Take and release the trust-store lock. Install calls this before it
 * activates anything, so a stale lock stops the install before a toolchain is
 * half installed (active but not trusted).
 */
export function probeTrustLock(env: NodeJS.ProcessEnv = process.env, waitMs = TRUST_LOCK_WAIT_MS): void {
  withTrustLock(env, () => undefined, waitMs);
}

function writeStore(store: TrustStore, env: NodeJS.ProcessEnv): void {
  const check = validateAgainst('trustStore', store);
  if (!check.ok) fail('E_INTEGRITY', `trust store would violate visser-trust-store/1: ${check.errors.join('; ')}`);
  const home = ensureHome(env);
  const path = trustPath(env);
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) fail('E_INTEGRITY', `${path} is a symbolic link`);
  const temp = join(home, `.trust.${randomBytes(8).toString('hex')}.tmp`);
  const fd = openSync(temp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try {
    writeSync(fd, JSON.stringify(store, null, 2) + '\n');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    renameSync(temp, path);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}

export function addTrust(digest: string, source: string, env: NodeJS.ProcessEnv = process.env, now: () => Date = () => new Date(), kind: TrustKind = 'toolkits'): TrustStore {
  const what = kind === 'toolkits' ? 'toolkit' : 'extension';
  if (!/^[0-9a-f]{64}$/.test(digest)) fail('E_USAGE', `a ${what} digest is 64 lowercase hex characters, not ${JSON.stringify(digest)}`);
  return withTrustLock(env, () => {
    const store = readTrust(env);
    const map = kind === 'toolkits' ? store.toolkits : (store.extensions ??= {});
    map[digest] = { source, addedAt: now().toISOString().replace(/\.\d{3}Z$/, 'Z') };
    writeStore(store, env);
    return store;
  });
}

export function revokeTrust(digest: string, env: NodeJS.ProcessEnv = process.env, kind: TrustKind = 'toolkits'): TrustStore {
  return withTrustLock(env, () => {
    const store = readTrust(env);
    if (kind === 'toolkits') delete store.toolkits[digest];
    else if (store.extensions) delete store.extensions[digest];
    writeStore(store, env);
    return store;
  });
}

/** True only for an exact extension digest in the user trust store (§14.2). */
export function isExtensionTrusted(digest: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const map = readTrust(env).extensions;
  return map !== undefined && Object.hasOwn(map, digest);
}
