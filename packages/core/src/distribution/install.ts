// `explain install --from-dir|--archive --scope user|repo` (§12.1, §12.2,
// §12.4, §12.6). The installer verifies the source, stages a copy inside the
// target toolchains directory, verifies the staged tree, and activates it by
// rename to toolchains/DIGEST/. Both scopes record the digest in the user trust
// store. It never edits shell startup files or PATH.
import { createHash, randomBytes } from 'node:crypto';
import { closeSync, constants, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, rmdirSync, rmSync, statSync, writeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { HashError } from '../model/hash.ts';
import { verifyReleaseDir, type VerifiedRelease } from './release.ts';
import { addTrust, explainHome } from './trust.ts';
import { type ArchiveLimits, DEFAULT_LIMITS, extractArchive } from './ustar.ts';

export type InstallScope = 'user' | 'repo';

export type InstallOptions = {
  fromDir?: string;
  archive?: string;
  /** Expected archive digest; checked before any extraction. */
  archiveSha256?: string;
  scope: InstallScope;
  /** User scope only: also make this toolkit the user default (§12.2). */
  setDefault?: boolean;
  /** Required for repo scope. */
  repoRoot?: string;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  limits?: ArchiveLimits;
  /** Test seam: runs after the exclusive claim of toolchains/DIGEST, before the rename. */
  afterClaim?: (target: string) => void;
};

export type InstallResult = {
  schema: 'explain-install/1';
  scope: InstallScope;
  version: string;
  toolkitSha256: string;
  archiveSha256?: string;
  origin: { kind: 'local-dir' } | { kind: 'archive'; archiveSha256: string };
  path: string;
  alreadyInstalled: boolean;
  trusted: true;
  shim?: string;
  default?: true;
  invocation: string;
};

function fail(code: string, message: string): never {
  throw new HashError(code, code, message);
}

function notSymlink(path: string, label: string): void {
  let stat;
  try {
    stat = lstatSync(path);
  } catch {
    return;
  }
  if (stat.isSymbolicLink()) fail('E_INTEGRITY', `${label} ${path} is a symbolic link`);
  if (!stat.isDirectory()) fail('E_INTEGRITY', `${label} ${path} is not a directory`);
}

/** Create `dir` and its missing parents, refusing a symlink at any created level. */
function ensureDir(dir: string, label: string, mode = 0o755): void {
  notSymlink(dir, label);
  mkdirSync(dir, { recursive: true, mode });
  notSymlink(dir, label);
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** Copy the manifest and every listed file of a verified release into `staging`. */
function copyRelease(source: string, staging: string): void {
  const manifestBytes = readFileSync(join(source, 'release.json'));
  const manifest = JSON.parse(manifestBytes.toString('utf8')) as { files: Array<{ path: string; sha256: string }> };
  const write = (rel: string, bytes: Uint8Array) => {
    const to = join(staging, ...rel.split('/'));
    mkdirSync(dirname(to), { recursive: true });
    const fd = openSync(to, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, rel.startsWith('bin/') ? 0o755 : 0o644);
    try {
      writeSync(fd, bytes);
    } finally {
      closeSync(fd);
    }
  };
  write('release.json', manifestBytes);
  for (const file of manifest.files) write(file.path, readFileSync(join(source, ...file.path.split('/'))));
}

/** Install the user shim atomically at EXPLAIN_HOME/bin/explain.cjs. */
function installShim(release: string, home: string): string {
  const shim = join(release, 'bin', 'shim.cjs');
  if (!existsSync(shim)) fail('E_INTEGRITY', `the release at ${release} has no bin/shim.cjs`);
  const binDir = join(home, 'bin');
  ensureDir(binDir, 'the user bin directory');
  const target = join(binDir, 'explain.cjs');
  const temp = join(binDir, `.explain.${randomBytes(8).toString('hex')}.tmp`);
  const fd = openSync(temp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o755);
  try {
    writeSync(fd, readFileSync(shim));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    // rename replaces a symlink at `target` itself; it never writes through it.
    renameSync(temp, target);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
  return target;
}

/** Write EXPLAIN_HOME/default (one digest line) atomically; read by the user shim. */
function writeDefaultPointer(home: string, digest: string): void {
  const target = join(home, 'default');
  const temp = join(home, `.default.${randomBytes(8).toString('hex')}.tmp`);
  const fd = openSync(temp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o644);
  try {
    writeSync(fd, `${digest}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    renameSync(temp, target);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}

function trustSource(opts: InstallOptions): string {
  const what = opts.fromDir !== undefined ? `install --from-dir ${resolve(opts.fromDir)}` : `install --archive ${resolve(opts.archive!)}`;
  const text = `${what} --scope ${opts.scope}`;
  return text.length <= 500 ? text : `${text.slice(0, 497)}...`;
}

export async function installRelease(opts: InstallOptions): Promise<InstallResult> {
  const env = opts.env ?? process.env;
  if ((opts.fromDir === undefined) === (opts.archive === undefined)) fail('E_USAGE', 'pass exactly one of --from-dir DIR or --archive FILE');
  if (opts.archiveSha256 !== undefined && opts.archive === undefined) fail('E_USAGE', '--sha256 applies to --archive only');
  if (opts.archiveSha256 !== undefined && !/^[0-9a-f]{64}$/.test(opts.archiveSha256)) fail('E_USAGE', '--sha256 must be 64 lowercase hex characters');

  const home = explainHome(env);
  let base: string;
  if (opts.scope === 'user') {
    ensureDir(home, 'EXPLAIN_HOME', 0o700);
    base = join(home, 'toolchains');
  } else {
    if (!opts.repoRoot) fail('E_SOURCE_UNAVAILABLE', 'no repository root (a directory with .git or .explain) found; pass --root DIR');
    const repo = resolve(opts.repoRoot);
    notSymlink(repo, 'the repository root');
    ensureDir(join(repo, '.explain'), 'the repository .explain directory');
    base = join(repo, '.explain', 'toolchains');
  }
  ensureDir(base, 'the toolchains directory');

  // The expected archive digest is checked before anything is extracted.
  let archiveSha256: string | undefined;
  if (opts.archive !== undefined) {
    const archive = resolve(opts.archive);
    let stat;
    try {
      stat = statSync(archive);
    } catch {
      fail('E_SOURCE_UNAVAILABLE', `cannot read the archive ${opts.archive}`);
    }
    const limits = opts.limits ?? DEFAULT_LIMITS;
    if (!stat.isFile()) fail('E_INTEGRITY', `${opts.archive} is not a regular file`);
    if (stat.size > limits.maxArchiveBytes) fail('E_INTEGRITY', `archive rejected: the archive is larger than ${limits.maxArchiveBytes} bytes`);
    archiveSha256 = sha256File(archive);
    if (opts.archiveSha256 !== undefined && archiveSha256 !== opts.archiveSha256) {
      fail('E_INTEGRITY', `the archive digest is ${archiveSha256}, but --sha256 expects ${opts.archiveSha256}; nothing was extracted`);
    }
  } else {
    const source = resolve(opts.fromDir!);
    if (!existsSync(source)) fail('E_SOURCE_UNAVAILABLE', `${opts.fromDir} does not exist`);
  }

  const staging = join(base, `.staging-${randomBytes(8).toString('hex')}`);
  mkdirSync(staging, { mode: 0o755 });
  let staged: VerifiedRelease;
  let target: string;
  let alreadyInstalled = false;
  try {
    if (opts.archive !== undefined) {
      const extracted = await extractArchive(resolve(opts.archive), staging, opts.limits ?? DEFAULT_LIMITS);
      // The bytes extracted must be the bytes whose digest was checked.
      if (extracted.archiveSha256 !== archiveSha256) fail('E_INTEGRITY', 'the archive changed while it was installed; nothing was installed');
    } else {
      const source = resolve(opts.fromDir!);
      const before = verifyReleaseDir(source);
      copyRelease(source, staging);
      staged = verifyReleaseDir(staging);
      if (staged.sha256 !== before.sha256) fail('E_INTEGRITY', 'the source release changed while it was copied; nothing was installed');
    }
    // The staged tree must equal its manifest exactly (§12.1).
    staged = verifyReleaseDir(staging);
    target = join(base, staged.sha256);
    let exists = false;
    try {
      lstatSync(target);
      exists = true;
    } catch { /* not installed yet */ }
    if (exists) {
      try {
        const current = verifyReleaseDir(target);
        if (current.sha256 !== staged.sha256) fail('E_INTEGRITY', 'digest mismatch');
      } catch (error) {
        if (!(error instanceof HashError)) throw error;
        fail('E_INTEGRITY', `an installation already exists at ${target} but does not verify (${error.message}); remove it, then install again`);
      }
      alreadyInstalled = true;
      rmSync(staging, { recursive: true, force: true });
    } else {
      // Claim with an exclusive mkdir: rename(2) silently replaces an empty
      // directory, so an existence check alone could replace a concurrent one.
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
        try { rmdirSync(target); } catch { /* not empty: someone else wrote into the claim; leave it */ }
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ENOTEMPTY' || code === 'EEXIST') fail('E_WRITE_CONFLICT', `${target} changed during the install; nothing was installed`);
        throw error;
      }
      verifyReleaseDir(target);
    }
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }

  addTrust(staged.sha256, trustSource(opts), env, opts.now);
  const shim = opts.scope === 'user' ? installShim(target, home) : undefined;
  if (opts.setDefault) writeDefaultPointer(home, staged.sha256);
  const userShim = join(home, 'bin', 'explain.cjs');
  const invocation = shim ?? (existsSync(userShim) ? userShim : join(target, 'bin', 'explain.cjs'));
  return {
    schema: 'explain-install/1',
    scope: opts.scope,
    version: staged.version,
    toolkitSha256: staged.sha256,
    ...(archiveSha256 !== undefined ? { archiveSha256 } : {}),
    origin: archiveSha256 !== undefined ? { kind: 'archive', archiveSha256 } : { kind: 'local-dir' },
    path: target,
    alreadyInstalled,
    trusted: true,
    ...(shim !== undefined ? { shim } : {}),
    ...(opts.setDefault ? { default: true as const } : {}),
    invocation: `node ${invocation}`,
  };
}
