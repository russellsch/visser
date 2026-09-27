// Toolkit release resolution (§12.1, §12.4). The user shim (shim.ts) and the
// CLI share this module, so both apply the same order and the same trust gate:
// explicit --toolkit-dir, then REPO/.explain/toolchains/DIGEST (only when the
// digest is in the user trust store), then ${EXPLAIN_HOME}/toolchains/DIGEST,
// then the release that contains the running CLI. A corrupt higher-priority
// copy is E_INTEGRITY; the search never falls back past it.
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { HashError } from '../../core/src/model/hash.ts';
import { validateAgainst } from '../../core/src/model/schemas.ts';
import { readBoundedJson } from '../../core/src/model/bounded-read.ts';
import { explainHome, isTrusted, verifyReleaseDir, type VerifiedRelease } from '../../core/src/distribution/index.ts';
import { CliError, EXIT } from './cli-util.ts';

export type { VerifiedRelease };

const DIGEST = /^[0-9a-f]{64}$/;

export function verifyRelease(dir: string): VerifiedRelease {
  try {
    return verifyReleaseDir(dir);
  } catch (error) {
    if (!(error instanceof HashError)) throw error;
    const exit = error.code === 'E_TOOLKIT_MISSING' ? EXIT.unavailable : EXIT.security;
    throw new CliError(error.code, error.message, exit);
  }
}

function trusted(digest: string, env: NodeJS.ProcessEnv): boolean {
  try {
    return isTrusted(digest, env);
  } catch (error) {
    if (error instanceof HashError) throw new CliError(error.code, error.message, EXIT.security);
    throw error;
  }
}

// The release that contains a bundled CLI at <release>/bin/explain.cjs.
export function bundledReleaseDir(): string | undefined {
  const script = process.argv[1];
  if (!script || !script.endsWith('explain.cjs')) return undefined;
  return resolve(dirname(script), '..');
}

export function resolveToolkitDir(explicit: string | undefined): VerifiedRelease {
  const dir = explicit ? resolve(explicit) : bundledReleaseDir();
  if (!dir) {
    throw new CliError('E_TOOLKIT_MISSING', 'no toolkit found; pass --toolkit-dir PATH (for example dist/release)', EXIT.unavailable);
  }
  return verifyRelease(dir);
}

/** Nearest ancestor with .git or .explain, else undefined. */
export function findRepositoryRoot(start: string): string | undefined {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, '.git')) || existsSync(join(dir, '.explain'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

export type LockOrigin = { kind: string; repository?: string; tag?: string; asset?: string };
export type ToolkitLock = { version?: string; sha256: string; archiveSha256?: string; origin?: LockOrigin };

/**
 * A repository-controlled JSON file (lock, workspace config, collection):
 * no symbolic link, a regular file, at most 1 MiB, and no file content in
 * errors. Undefined when there is no file.
 */
export function readRepositoryJson(path: string): unknown {
  try {
    return readBoundedJson(path);
  } catch (error) {
    if (!(error instanceof HashError)) throw error;
    throw new CliError(error.code, error.message, error.code === 'E_INTEGRITY' ? EXIT.security : EXIT.invalid);
  }
}

/** The `toolkit` member of a bundle's explain.lock.json, or undefined when there is no lock. */
export function readLock(bundleRoot: string): ToolkitLock | undefined {
  const lockPath = join(bundleRoot, 'explain.lock.json');
  const lock = readRepositoryJson(lockPath);
  if (lock === undefined) return undefined;
  const check = validateAgainst('lock', lock);
  if (!check.ok) throw new CliError('E_SYNTAX', `${lockPath} violates explain-lock/1: ${check.errors.join('; ')}`, EXIT.invalid);
  return (lock as { toolkit: ToolkitLock }).toolkit;
}

/** The workspace default toolkit digest in REPO/.explain/config.json, used only when no document lock applies. */
export function workspaceDefault(repoRoot: string | undefined): string | undefined {
  if (!repoRoot) return undefined;
  const path = join(repoRoot, '.explain', 'config.json');
  const config = readRepositoryJson(path);
  if (config === undefined) return undefined;
  const check = validateAgainst('workspace', config);
  if (!check.ok) throw new CliError('E_SYNTAX', `${path} violates explain-workspace/1: ${check.errors.join('; ')}`, EXIT.invalid);
  const digest = (config as { defaultToolkit?: { sha256?: string } }).defaultToolkit?.sha256;
  return digest && DIGEST.test(digest) ? digest : undefined;
}

/**
 * The user's default toolkit: `${EXPLAIN_HOME}/default` holds one digest line.
 * `install` writes it only when the user asks. It is never inferred from the
 * installed toolchains.
 */
export function defaultPointerPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(explainHome(env), 'default');
}

export function readDefaultPointer(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const path = defaultPointerPath(env);
  let stat;
  try { stat = lstatSync(path); } catch { return undefined; }
  if (!stat.isFile()) throw new CliError('E_INTEGRITY', `${path} is not a regular file`, EXIT.security);
  const digest = readFileSync(path, 'utf8').trim();
  if (!DIGEST.test(digest)) throw new CliError('E_INTEGRITY', `${path} does not hold a toolkit digest`, EXIT.security);
  return digest;
}

export type ResolutionSource = 'toolkit-dir' | 'repository' | 'user' | 'running';

export type ResolveOptions = {
  digest: string;
  repoRoot?: string | undefined;
  toolkitDir?: string | undefined;
  /** The release that contains the running CLI; the user shim passes none. */
  ownRelease?: string | undefined;
  env?: NodeJS.ProcessEnv;
  origin?: LockOrigin | undefined;
  version?: string | undefined;
};

export type Resolved = { release: VerifiedRelease; source: ResolutionSource };

function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!isAbsolute(rel) && rel.split(sep)[0] !== '..');
}

function present(path: string): boolean {
  try { lstatSync(path); return true; } catch { return false; }
}

/** Verify a candidate that must hold exactly `digest`; anything else is E_INTEGRITY. */
function verifyCandidate(dir: string, digest: string, label: string): VerifiedRelease {
  if (lstatSync(dir).isSymbolicLink()) throw new CliError('E_INTEGRITY', `${label} ${dir} is a symbolic link`, EXIT.security);
  if (!lstatSync(dir).isDirectory()) throw new CliError('E_INTEGRITY', `${label} ${dir} is not a directory`, EXIT.security);
  const release = verifyRelease(dir);
  if (release.sha256 !== digest) {
    throw new CliError('E_INTEGRITY', `${label} ${dir} holds toolkit ${release.sha256}, not ${digest}`, EXIT.security);
  }
  return release;
}

export function installHint(digest: string, origin?: LockOrigin, version?: string): string {
  if (origin?.kind === 'github-release' && origin.repository && version) {
    return `install it with: explain install --from-release ${origin.repository} --version ${version} --sha256 ARCHIVE_DIGEST --scope user`;
  }
  return `only a copy of the release tree with digest ${digest} can satisfy this lock; install one with: explain install --from-dir PATH --scope user`;
}

/** Find the exact toolkit `digest` by the §12.4 order and verify it (§12.1). */
export function resolveDigest(opts: ResolveOptions): Resolved {
  const { digest } = opts;
  const env = opts.env ?? process.env;
  if (!DIGEST.test(digest)) throw new CliError('E_SYNTAX', `${JSON.stringify(digest)} is not a toolkit digest`, EXIT.invalid);

  // 1. An explicit --toolkit-dir is the user's choice for this invocation.
  if (opts.toolkitDir) {
    const release = verifyRelease(resolve(opts.toolkitDir));
    if (release.sha256 !== digest) {
      throw new CliError('E_TOOLKIT_MISSING', `lock pins toolkit ${digest}, but ${release.dir} is ${release.sha256}; install the locked toolkit or pass --dev-toolkit`, EXIT.unavailable);
    }
    return { release, source: 'toolkit-dir' };
  }

  // 2. A repository toolchain is repository-controlled code: eligible only
  // when the user trusts its digest. The trust check reads nothing from it.
  if (opts.repoRoot) {
    const dir = join(opts.repoRoot, '.explain', 'toolchains', digest);
    if (present(dir)) {
      if (!trusted(digest, env)) {
        throw new CliError('E_TOOLKIT_UNTRUSTED', `the repository toolchain ${dir} (${digest}) is not in the user trust store; review it, then run: explain trust toolkit ${digest}`, EXIT.security);
      }
      const release = verifyCandidate(dir, digest, 'repository toolchain');
      if (!isInside(realpathSync(dir), realpathSync(opts.repoRoot))) {
        throw new CliError('E_INTEGRITY', `repository toolchain ${dir} resolves outside the repository`, EXIT.security);
      }
      return { release, source: 'repository' };
    }
  }

  // 3. The user installation is trusted because the user installed it.
  const userDir = join(explainHome(env), 'toolchains', digest);
  if (present(userDir)) return { release: verifyCandidate(userDir, digest, 'user toolchain'), source: 'user' };

  // 4. The release that contains the running CLI (a development convenience).
  if (opts.ownRelease) {
    const release = verifyRelease(opts.ownRelease);
    if (release.sha256 === digest) return { release, source: 'running' };
  }

  throw new CliError('E_TOOLKIT_MISSING', `toolkit ${digest} is not installed; ${installHint(digest, opts.origin, opts.version)}`, EXIT.unavailable);
}

export type ToolkitSelection = {
  release: VerifiedRelease;
  development: boolean; // true when --dev-toolkit accepted a digest that differs from the lock
  warnings: string[];
  source: ResolutionSource | 'dev-toolkit';
  /** The release whose workers this CLI may run: its own, never another toolkit's (§12.4). */
  workerRelease?: string | undefined;
};

export type DocumentResolveOptions = { env?: NodeJS.ProcessEnv; ownRelease?: string | undefined };

/**
 * Resolve the toolkit for an existing document through its lock (§12.4).
 * `--dev-toolkit` accepts a digest that differs from the lock (or a missing
 * lock) and marks the build as a development build.
 *
 * Whose code runs: a command never runs code from a toolkit other than the
 * CLI that is running. When this CLI is a release and the selected toolkit has
 * a different digest, the command stops and points to the user shim, which
 * runs the selected toolkit's own CLI.
 */
export function resolveForDocument(bundleRoot: string, toolkitDir: string | undefined, devToolkit: string | undefined, opts: DocumentResolveOptions = {}): ToolkitSelection {
  const own = 'ownRelease' in opts ? opts.ownRelease : bundledReleaseDir();
  const lock = readLock(bundleRoot);
  const locked = lock?.sha256;
  let selection: ToolkitSelection;
  if (devToolkit) {
    const release = verifyRelease(resolve(devToolkit));
    const warnings: string[] = [];
    if (locked !== release.sha256) {
      warnings.push(locked
        ? `W_DEV_TOOLKIT: lock pins ${locked.slice(0, 12)}…, using development toolkit ${release.sha256.slice(0, 12)}…`
        : `W_DEV_TOOLKIT: no explain.lock.json; using development toolkit ${release.sha256.slice(0, 12)}…`);
    }
    selection = { release, development: locked !== release.sha256, warnings, source: 'dev-toolkit' };
  } else {
    if (!locked) {
      throw new CliError('E_TOOLKIT_MISSING', `no explain.lock.json in ${bundleRoot}; run \`explain init\` or pass --dev-toolkit`, EXIT.unavailable);
    }
    const found = resolveDigest({
      digest: locked,
      repoRoot: findRepositoryRoot(bundleRoot),
      toolkitDir,
      ownRelease: own,
      ...(opts.env ? { env: opts.env } : {}),
      origin: lock?.origin,
      version: lock?.version,
    });
    selection = { release: found.release, development: false, warnings: [], source: found.source };
  }
  if (own) {
    const ownRelease = selection.release.dir === resolve(own) ? selection.release : verifyRelease(own);
    if (ownRelease.sha256 !== selection.release.sha256) {
      throw devToolkit
        ? new CliError('E_USAGE', `--dev-toolkit ${selection.release.dir} is toolkit ${selection.release.sha256}, but this CLI is ${ownRelease.sha256}; run that toolkit's own bin/explain.cjs`, EXIT.invalid)
        : new CliError('E_TOOLKIT_MISSING', `the document pins toolkit ${selection.release.sha256}, but this CLI is ${ownRelease.sha256}; run the command through the user shim (\${EXPLAIN_HOME:-~/.explain}/bin/explain.cjs), which runs the pinned toolkit's own CLI`, EXIT.unavailable);
    }
    selection.workerRelease = ownRelease.dir;
  }
  return selection;
}
