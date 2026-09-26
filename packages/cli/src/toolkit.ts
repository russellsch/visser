// Toolkit release resolution (§12.1, §12.4). Phase 0 supports an explicit
// --toolkit-dir or the release that contains the running bundle.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { canonicalJSON } from '../../core/src/model/hash.ts';
import { CliError, EXIT } from './cli-util.ts';

export type VerifiedRelease = {
  dir: string;
  version: string;
  sha256: string;
};

type ReleaseManifest = {
  schema: string;
  version: string;
  files: Array<{ path: string; sha256: string }>;
};

export function verifyRelease(dir: string): VerifiedRelease {
  const manifestPath = join(dir, 'release.json');
  if (!existsSync(manifestPath)) {
    throw new CliError('E_TOOLKIT_MISSING', `no release.json in ${dir}; run \`npm run build\` first`, EXIT.unavailable);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ReleaseManifest;
  if (manifest.schema !== 'explain-release/1') {
    throw new CliError('E_INTEGRITY', `unknown release schema ${manifest.schema}`, EXIT.security);
  }
  for (const file of manifest.files) {
    const full = join(dir, file.path);
    const actual = existsSync(full) ? createHash('sha256').update(readFileSync(full)).digest('hex') : 'missing';
    if (actual !== file.sha256) {
      throw new CliError('E_INTEGRITY', `release file ${file.path} does not match release.json`, EXIT.security);
    }
  }
  const sha256 = createHash('sha256').update(canonicalJSON(manifest)).digest('hex');
  return { dir, version: manifest.version, sha256 };
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
