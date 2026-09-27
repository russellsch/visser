// Toolkit release resolution (§12.1, §12.4). Phase 0 supports an explicit
// --toolkit-dir or the release that contains the running bundle.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { HashError } from '../../core/src/model/hash.ts';
import { verifyReleaseDir, type VerifiedRelease } from '../../core/src/distribution/index.ts';
import { CliError, EXIT } from './cli-util.ts';

export type { VerifiedRelease };

export function verifyRelease(dir: string): VerifiedRelease {
  try {
    return verifyReleaseDir(dir);
  } catch (error) {
    if (!(error instanceof HashError)) throw error;
    const exit = error.code === 'E_TOOLKIT_MISSING' ? EXIT.unavailable : EXIT.security;
    throw new CliError(error.code, error.message, exit);
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

export type ToolkitSelection = {
  release: VerifiedRelease;
  development: boolean; // true when --dev-toolkit accepted a digest that differs from the lock
  warnings: string[];
};

/**
 * Resolve the toolkit for an existing document through its lock (§12.4).
 * `--dev-toolkit` accepts a digest that differs from the lock (or a missing
 * lock) and marks the build as a development build.
 */
export function resolveForDocument(bundleRoot: string, toolkitDir: string | undefined, devToolkit: string | undefined): ToolkitSelection {
  const lockPath = join(bundleRoot, 'explain.lock.json');
  const lock = existsSync(lockPath)
    ? (JSON.parse(readFileSync(lockPath, 'utf8')) as { toolkit?: { sha256?: string } })
    : undefined;
  const locked = lock?.toolkit?.sha256;
  if (devToolkit) {
    const release = verifyRelease(resolve(devToolkit));
    const warnings: string[] = [];
    if (locked !== release.sha256) {
      warnings.push(locked
        ? `W_DEV_TOOLKIT: lock pins ${locked.slice(0, 12)}…, using development toolkit ${release.sha256.slice(0, 12)}…`
        : `W_DEV_TOOLKIT: no explain.lock.json; using development toolkit ${release.sha256.slice(0, 12)}…`);
    }
    return { release, development: locked !== release.sha256, warnings };
  }
  if (!locked) {
    throw new CliError('E_TOOLKIT_MISSING', `no explain.lock.json in ${bundleRoot}; run \`explain init\` or pass --dev-toolkit`, EXIT.unavailable);
  }
  const release = resolveToolkitDir(toolkitDir);
  if (release.sha256 !== locked) {
    throw new CliError('E_TOOLKIT_MISSING', `lock pins toolkit ${locked}, but ${release.dir} is ${release.sha256}; install the locked toolkit or pass --dev-toolkit`, EXIT.unavailable);
  }
  return { release, development: false, warnings: [] };
}
