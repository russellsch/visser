// `extension install --from-dir DIR --scope user|repo` and `extension pin`
// (§12.2, §14.2). Installing copies a verified extension into
// .../extensions/DIGEST and NEVER trusts it: an extension is executable code,
// and trust is a separate explicit command. Pinning writes the document lock's
// `extensions` entry with the guarded lock write; it executes nothing.
import { randomBytes } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, renameSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { HashError } from '../model/hash.ts';
import { visserHome, isExtensionTrusted } from '../distribution/trust.ts';
import { lockDiff, writeLockGuarded } from '../distribution/upgrade.ts';
import type { FsContext } from '../references/fs-context.ts';
import { MANIFEST_NAME, verifyExtensionDir } from './manifest.ts';
import { locateExtension, repoExtensionsDir, userExtensionsDir } from './registry.ts';

function fail(code: string, message: string): never {
  throw new HashError(code, code, message);
}

function notSymlinkDir(path: string, label: string): void {
  let stat;
  try {
    stat = lstatSync(path);
  } catch {
    return;
  }
  if (stat.isSymbolicLink()) fail('E_INTEGRITY', `${label} ${path} is a symbolic link`);
  if (!stat.isDirectory()) fail('E_INTEGRITY', `${label} ${path} is not a directory`);
}

function ensureDir(dir: string, label: string, mode = 0o755): void {
  notSymlinkDir(dir, label);
  mkdirSync(dir, { recursive: true, mode });
  notSymlinkDir(dir, label);
}

export type ExtensionInstallOptions = {
  fromDir: string;
  scope: 'user' | 'repo';
  repoRoot?: string;
  env?: NodeJS.ProcessEnv;
  /** Test seam: runs after the exclusive claim of extensions/DIGEST, before the rename. */
  afterClaim?: (target: string) => void;
};

export type ExtensionInstallResult = {
  schema: 'visser-extension-install/1';
  scope: 'user' | 'repo';
  name: string;
  version: string;
  sha256: string;
  path: string;
  alreadyInstalled: boolean;
  trusted: boolean;
};

export function installExtension(opts: ExtensionInstallOptions): ExtensionInstallResult {
  const env = opts.env ?? process.env;
  const source = resolve(opts.fromDir);
  const before = verifyExtensionDir(source);
  let base: string;
  if (opts.scope === 'user') {
    ensureDir(visserHome(env), 'VISSER_HOME', 0o700);
    base = userExtensionsDir(env);
  } else {
    if (!opts.repoRoot) fail('E_SOURCE_UNAVAILABLE', 'no repository root (a directory with .git or .visser) found; pass --root DIR');
    const repo = resolve(opts.repoRoot);
    ensureDir(join(repo, '.visser'), 'the repository .visser directory');
    base = repoExtensionsDir(repo);
  }
  ensureDir(base, 'the extensions directory');

  const target = join(base, before.sha256);
  const result = (alreadyInstalled: boolean): ExtensionInstallResult => ({
    schema: 'visser-extension-install/1', scope: opts.scope, name: before.manifest.name, version: before.manifest.version,
    sha256: before.sha256, path: target, alreadyInstalled, trusted: isExtensionTrusted(before.sha256, env),
  });
  let exists = false;
  try {
    lstatSync(target);
    exists = true;
  } catch { /* not installed yet */ }
  if (exists) {
    try {
      const current = verifyExtensionDir(target);
      if (current.sha256 !== before.sha256) fail('E_INTEGRITY', 'digest mismatch');
    } catch (error) {
      if (!(error instanceof HashError)) throw error;
      fail('E_INTEGRITY', `an installation already exists at ${target} but does not verify (${error.message}); remove it, then install again`);
    }
    return result(true);
  }

  const staging = join(base, `.staging-${randomBytes(8).toString('hex')}`);
  mkdirSync(staging, { mode: 0o755 });
  try {
    writeFileSync(join(staging, MANIFEST_NAME), readFileSync(join(source, MANIFEST_NAME)), { flag: 'wx' });
    for (const file of before.manifest.files) {
      const to = join(staging, ...file.path.split('/'));
      mkdirSync(dirname(to), { recursive: true });
      writeFileSync(to, readFileSync(join(source, ...file.path.split('/'))), { flag: 'wx' });
    }
    const staged = verifyExtensionDir(staging);
    if (staged.sha256 !== before.sha256) fail('E_INTEGRITY', 'the source extension changed while it was copied; nothing was installed');
    // Exclusive claim: rename(2) replaces an empty directory silently.
    try {
      mkdirSync(target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') fail('E_WRITE_CONFLICT', `${target} appeared during the install; nothing was installed`);
      throw error;
    }
    opts.afterClaim?.(target);
    try {
      renameSync(staging, target);
    } catch (error) {
      try { rmdirSync(target); } catch { /* not empty: someone else wrote into our claim */ }
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOTEMPTY' || code === 'EEXIST') fail('E_WRITE_CONFLICT', `${target} changed during the install; nothing was installed`);
      throw error;
    }
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  return result(false);
}

export type PinOptions = {
  bundleRoot: string;
  repoRoot: string;
  docId: string;
  digest: string;
  env?: NodeJS.ProcessEnv;
  dryRun?: boolean;
  fsContext?: FsContext;
};

export type PinResult = {
  schema: 'visser-extension-pin/1';
  doc: string;
  name: string;
  version: string;
  sha256: string;
  changed: boolean;
  diff?: string;
};

/**
 * Pin an installed extension digest in a document's lock. The extension must
 * be installed and verify; it need not be trusted, because pinning runs nothing.
 * An existing entry with the same name is replaced.
 */
export function pinExtension(opts: PinOptions): PinResult {
  const found = locateExtension(opts.digest, opts.repoRoot, opts.env);
  if (found.state === 'missing') fail('E_EXTENSION_MISSING', `extension ${opts.digest} is not installed; run \`visser extension install --from-dir DIR --scope user\` first`);
  const { manifest } = found.ext;
  const lockPath = join(opts.bundleRoot, 'visser.lock.json');
  let original: Uint8Array;
  try {
    original = new Uint8Array(readFileSync(lockPath));
  } catch {
    fail('E_TOOLKIT_MISSING', `no visser.lock.json in ${opts.bundleRoot}; run \`visser init\` first`);
  }
  const text = new TextDecoder().decode(original);
  const lock = JSON.parse(text) as { extensions?: Array<{ name: string; version: string; sha256: string }> };
  const entry = { name: manifest.name, version: manifest.version, sha256: opts.digest };
  const others = (lock.extensions ?? []).filter((e) => e.name !== manifest.name);
  const current = (lock.extensions ?? []).find((e) => e.name === manifest.name);
  const base = { schema: 'visser-extension-pin/1' as const, doc: join(opts.bundleRoot, 'index.md'), ...entry };
  if (current && current.sha256 === entry.sha256 && current.version === entry.version) return { ...base, changed: false };
  const next = { ...lock, extensions: [...others, entry].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) };
  const candidate = JSON.stringify(next, null, 2) + '\n';
  const diff = lockDiff(text, candidate);
  if (!opts.dryRun) {
    writeLockGuarded({ repoRoot: opts.repoRoot, docId: opts.docId, lockPath, original, candidate, ...(opts.fsContext ? { fsContext: opts.fsContext } : {}) });
  }
  return { ...base, changed: true, diff };
}
