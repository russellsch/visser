// The user trust store (§12.4, §14.2): `${EXPLAIN_HOME:-~/.explain}/trust.json`.
// Its location comes only from the process environment, never from repository
// or workspace config, so a repository cannot trust its own code.
import { randomBytes } from 'node:crypto';
import { closeSync, constants, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { HashError } from '../model/hash.ts';
import { validateAgainst } from '../model/schemas.ts';

export type TrustEntry = { source: string; addedAt: string };
export type TrustStore = { schema: 'explain-trust-store/1'; toolkits: Record<string, TrustEntry> };

function fail(code: string, message: string): never {
  throw new HashError(code, code, message);
}

export function explainHome(env: NodeJS.ProcessEnv = process.env): string {
  return env['EXPLAIN_HOME'] ?? join(env['HOME'] ?? homedir(), '.explain');
}

export function trustPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(explainHome(env), 'trust.json');
}

export function readTrust(env: NodeJS.ProcessEnv = process.env): TrustStore {
  const path = trustPath(env);
  if (!existsSync(path)) return { schema: 'explain-trust-store/1', toolkits: {} };
  if (lstatSync(path).isSymbolicLink()) fail('E_INTEGRITY', `${path} is a symbolic link`);
  let store: TrustStore;
  try {
    store = JSON.parse(readFileSync(path, 'utf8')) as TrustStore;
  } catch {
    fail('E_INTEGRITY', `${path} is not valid JSON`);
  }
  const check = validateAgainst('trustStore', store);
  if (!check.ok) fail('E_INTEGRITY', `${path} violates explain-trust-store/1: ${check.errors.join('; ')}`);
  return store;
}

export function isTrusted(digest: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return Object.hasOwn(readTrust(env).toolkits, digest);
}

function writeStore(store: TrustStore, env: NodeJS.ProcessEnv): void {
  const check = validateAgainst('trustStore', store);
  if (!check.ok) fail('E_INTEGRITY', `trust store would violate explain-trust-store/1: ${check.errors.join('; ')}`);
  const home = explainHome(env);
  if (existsSync(home) && lstatSync(home).isSymbolicLink()) fail('E_INTEGRITY', `${home} is a symbolic link`);
  mkdirSync(home, { recursive: true, mode: 0o700 });
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

export function addTrust(digest: string, source: string, env: NodeJS.ProcessEnv = process.env, now: () => Date = () => new Date()): TrustStore {
  if (!/^[0-9a-f]{64}$/.test(digest)) fail('E_USAGE', `a toolkit digest is 64 lowercase hex characters, not ${JSON.stringify(digest)}`);
  const store = readTrust(env);
  store.toolkits[digest] = { source, addedAt: now().toISOString().replace(/\.\d{3}Z$/, 'Z') };
  writeStore(store, env);
  return store;
}

export function revokeTrust(digest: string, env: NodeJS.ProcessEnv = process.env): TrustStore {
  const store = readTrust(env);
  delete store.toolkits[digest];
  writeStore(store, env);
  return store;
}
