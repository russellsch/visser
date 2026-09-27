// `explain upgrade DOC --to DIGEST [--allow-downgrade] [--dry-run] [--toolkit-dir DIR] [--json]`
// (§12.3, §17.1). Moves a document's lock to another installed toolkit.
//
// Whose code runs (§12.4): the target toolkit is resolved by the §12.4 order
// with the trust gate and verified strictly. Its own CLI runs `check` on the
// document before the lock changes and `build` after it; this CLI only reads
// release.json files and writes the lock through a guarded write (§11.9).
//
// Exit codes: a malformed digest or DOC is E_USAGE (2); a missing lock is
// E_TOOLKIT_MISSING (3), because there is no toolkit to upgrade from; a lower
// target version without --allow-downgrade is E_DOWNGRADE (2); a current
// toolkit that is not installed is E_TOOLKIT_MISSING (3) unless
// --allow-downgrade skips the version comparison; a failing target check
// exits with the check's code and writes nothing; a concurrent writer is
// E_WRITE_CONFLICT (5). A failed rebuild after the lock write exits with the
// build's code; the new lock stays written and the report says so.
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { readBoundedBytes } from '../../../core/src/model/bounded-read.ts';
import { dirname, join, resolve } from 'node:path';
import { loadBundle } from '../../../core/src/model/bundle.ts';
import { HashError } from '../../../core/src/model/hash.ts';
import { compareVersions, isSemver, lockDiff, upgradedLockText, writeLockGuarded } from '../../../core/src/distribution/upgrade.ts';
import { findRepoRoot } from '../../../core/src/references/registry.ts';
import type { FsContext } from '../../../core/src/references/fs-context.ts';
import type { Diagnostic } from '../../../core/src/types.ts';
import { CliError, EXIT, exitCodeFor, type ParsedArgs, printDiagnostics, printJson, stringFlag } from '../cli-util.ts';
import { bundledReleaseDir, findRepositoryRoot, readLock, resolveDigest, type Resolved } from '../toolkit.ts';

const USAGE = 'usage: explain upgrade DOC --to DIGEST [--allow-downgrade] [--dry-run] [--toolkit-dir DIR] [--json]';

export type UpgradeOptions = {
  env?: NodeJS.ProcessEnv;
  /** The release that contains the running CLI; defaults to the bundled release. */
  ownRelease?: string | undefined;
  fsContext?: FsContext;
};

type Side = { sha256: string; version?: string };

function flag(args: ParsedArgs, name: string): boolean {
  const value = args.flags.get(name);
  if (value === undefined) return false;
  if (value !== true) throw new CliError('E_USAGE', `--${name} takes no value (put it last or before another flag)\n${USAGE}`, EXIT.invalid);
  return true;
}

function releaseVersion(dir: string): string {
  return (JSON.parse(readFileSync(join(dir, 'release.json'), 'utf8')) as { version: string }).version;
}

/** Run a toolkit's own CLI; never a shell. */
function runToolkit(release: string, argv: string[], env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [join(release, 'bin', 'explain.cjs'), ...argv], { encoding: 'utf8', env, timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
}

export async function runUpgrade(args: ParsedArgs, opts: UpgradeOptions = {}): Promise<number> {
  const json = args.flags.get('json') === true;
  const env = opts.env ?? process.env;
  const own = 'ownRelease' in opts ? opts.ownRelease : bundledReleaseDir();
  const [docArg, ...extra] = args.positional;
  if (!docArg || extra.length > 0) throw new CliError('E_USAGE', USAGE, EXIT.invalid);
  const to = stringFlag(args, 'to');
  if (to === undefined || !/^[0-9a-f]{64}$/.test(to)) throw new CliError('E_USAGE', `--to needs a toolkit digest (64 lowercase hex characters)\n${USAGE}`, EXIT.invalid);
  const allowDowngrade = flag(args, 'allow-downgrade');
  const dryRun = flag(args, 'dry-run');
  const toolkitDir = stringFlag(args, 'toolkit-dir');

  let indexPath = resolve(docArg);
  try {
    if (lstatSync(indexPath).isDirectory()) indexPath = join(indexPath, 'index.md');
  } catch {
    throw new CliError('E_SOURCE_UNAVAILABLE', `cannot read the document ${docArg}`, EXIT.unavailable);
  }
  if (!existsSync(indexPath)) throw new CliError('E_SOURCE_UNAVAILABLE', `cannot read the document ${docArg}`, EXIT.unavailable);
  const bundleRoot = dirname(indexPath);
  const lockPath = join(bundleRoot, 'explain.lock.json');

  // 1. The current lock, read once; the guarded write rechecks these bytes.
  // Repository-controlled: no symbolic link, a regular file, bounded.
  let original: Uint8Array | undefined;
  try {
    original = readBoundedBytes(lockPath, 'explain.lock.json');
  } catch (error) {
    if (error instanceof HashError) throw new CliError(error.code, error.message, EXIT.security);
    throw error;
  }
  if (original === undefined) {
    throw new CliError('E_TOOLKIT_MISSING', `no explain.lock.json in ${bundleRoot}; there is no toolkit to upgrade from (run \`explain init\` for a new document)`, EXIT.unavailable);
  }
  const current = readLock(bundleRoot)!;
  const originalText = new TextDecoder().decode(original);
  const repoRoot = findRepositoryRoot(bundleRoot);
  const from: Side = { sha256: current.sha256 };

  // 2. The target, by the §12.4 order with the trust gate, verified strictly.
  const target: Resolved = resolveDigest({ digest: to, repoRoot, toolkitDir, ownRelease: own, env });
  const toSide: Side & { version: string } = { sha256: to, version: releaseVersion(target.release.dir) };
  // A lock records only semantic versions (explain-lock/1), so no flag can pin such a target.
  if (!isSemver(toSide.version)) {
    throw new CliError('E_SYNTAX', `the target toolkit's version ${JSON.stringify(toSide.version)} is not a semantic version, so a lock cannot pin it`, EXIT.invalid);
  }

  if (current.sha256 === to) {
    const report = { schema: 'explain-upgrade/1' as const, doc: indexPath, from: { ...from, version: toSide.version }, to: toSide, changed: false, downgrade: false, dryRun };
    if (json) printJson('upgrade', report);
    else process.stdout.write(`explain.lock.json already pins toolkit ${to} (${toSide.version}); nothing to do\n`);
    return EXIT.ok;
  }

  // 3. Versions come from each pack's release.json, never from the lock.
  // The current toolkit is only read for its version; it never runs.
  let downgrade = false;
  const currentQuery = { digest: current.sha256, repoRoot, ownRelease: own, env, origin: current.origin, version: current.version };
  if (allowDowngrade) {
    // --allow-downgrade skips the comparison: a current toolkit that is
    // missing, untrusted, or corrupt, or a version that is not semver, does
    // not block moving the document to a trusted target.
    try {
      from.version = releaseVersion(resolveDigest(currentQuery).release.dir);
    } catch (error) {
      if (!(error instanceof CliError)) throw error;
    }
    if (from.version !== undefined) {
      try {
        downgrade = compareVersions(toSide.version, from.version) < 0;
      } catch (error) {
        if (!(error instanceof HashError)) throw error;
      }
    }
  } else {
    let found: Resolved;
    try {
      found = resolveDigest(currentQuery);
    } catch (error) {
      if (error instanceof CliError && error.code === 'E_TOOLKIT_MISSING') {
        throw new CliError('E_TOOLKIT_MISSING', `the current toolkit ${current.sha256} is not installed, so its version is unknown; install it to compare versions, or pass --allow-downgrade to skip the comparison (${error.message})`, EXIT.unavailable);
      }
      if (error instanceof CliError && error.code === 'E_TOOLKIT_UNTRUSTED') {
        throw new CliError('E_TOOLKIT_UNTRUSTED', `${error.message}; upgrade only reads its version: pass --allow-downgrade to skip the comparison without trusting it`, error.exitCode);
      }
      throw error;
    }
    from.version = releaseVersion(found.release.dir);
    try {
      downgrade = compareVersions(toSide.version, from.version) < 0;
    } catch (error) {
      if (!(error instanceof HashError)) throw error;
      throw new CliError('E_SYNTAX', `cannot compare the toolkit versions: ${error.message}; pass --allow-downgrade to skip the comparison`, EXIT.invalid);
    }
  }
  if (downgrade && !allowDowngrade) {
    throw new CliError('E_DOWNGRADE', `toolkit ${toSide.version} is older than the current ${from.version}; pass --allow-downgrade to accept it`, EXIT.invalid);
  }

  const candidate = upgradedLockText(originalText, toSide);
  const diff = lockDiff(originalText, candidate);

  // 4. The target toolkit's own CLI checks the document; nothing is written on failure.
  const check = runToolkit(target.release.dir, ['check', indexPath, '--json'], env);
  if (check.status !== 0) {
    let diagnostics: Diagnostic[] = [];
    try {
      diagnostics = (JSON.parse(check.stdout) as { diagnostics?: Diagnostic[] }).diagnostics ?? [];
    } catch {
      // Not JSON: report the raw output below.
    }
    if (diagnostics.length === 0) {
      diagnostics = [{ code: 'E_BUILD', severity: 'error', message: `the target toolkit's check failed (exit ${check.status ?? check.signal}): ${(check.stderr || check.stdout).trim()}` }];
    }
    printDiagnostics(diagnostics, json);
    if (!json) process.stderr.write('upgrade stopped: the target toolkit rejects the document; explain.lock.json is unchanged\n');
    return check.status && check.status > 0 ? check.status : EXIT.internal;
  }

  if (dryRun) {
    const report = { schema: 'explain-upgrade/1' as const, doc: indexPath, from, to: toSide, changed: false, downgrade, dryRun: true, diff };
    if (json) printJson('upgrade', report);
    else process.stdout.write(`dry run: explain.lock.json would change\n${diff}`);
    return EXIT.ok;
  }

  // 5. Guarded write of the lock.
  const bundle = loadBundle(indexPath);
  if (!bundle.docId) throw new CliError('E_SYNTAX', 'the document has no docId', EXIT.invalid);
  try {
    writeLockGuarded({
      repoRoot: findRepoRoot(bundleRoot) ?? bundleRoot,
      docId: bundle.docId,
      lockPath,
      original,
      candidate,
      ...(opts.fsContext ? { fsContext: opts.fsContext } : {}),
    });
  } catch (error) {
    if (!(error instanceof HashError)) throw error;
    const diagnostic = { code: error.code, severity: 'error' as const, message: error.message };
    printDiagnostics([diagnostic], json);
    return exitCodeFor([diagnostic]);
  }

  // 6–7. Rebuild through the target toolkit's own CLI; old snapshots stay.
  const build = runToolkit(target.release.dir, ['build', indexPath], env);
  const rebuilt = build.status === 0;
  const report = {
    schema: 'explain-upgrade/1' as const,
    doc: indexPath,
    from,
    to: toSide,
    changed: true,
    downgrade,
    dryRun: false,
    diff,
    rebuilt,
    ...(rebuilt ? {} : { rebuildError: (build.stderr || build.stdout || `exit ${build.status ?? build.signal}`).trim().slice(0, 4000) }),
  };
  if (json) {
    printJson('upgrade', report);
  } else {
    process.stdout.write(`upgraded ${indexPath}\n  from ${from.sha256}${from.version ? ` (${from.version})` : ''}\n  to   ${to} (${toSide.version})${downgrade ? ' [downgrade]' : ''}\n${diff}`);
    if (rebuilt) process.stdout.write(build.stdout);
    else process.stderr.write(`the new lock is written, but the rebuild failed:\n${build.stderr || build.stdout}`);
  }
  return rebuilt ? EXIT.ok : (build.status && build.status > 0 ? build.status : EXIT.internal);
}
