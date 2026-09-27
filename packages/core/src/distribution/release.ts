// Strict release verification (§12.1): used at install and at every resolution.
// The toolkit digest is sha256(canonicalJSON(release.json)); it is meaningful
// only if the tree on disk is exactly the tree the manifest describes.
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { canonicalJSON, HashError, validateBundlePath } from '../model/hash.ts';
import { validateAgainst } from '../model/schemas.ts';

export type VerifiedRelease = { dir: string; version: string; sha256: string };

type ReleaseManifest = { schema: string; version: string; files: Array<{ path: string; sha256: string }> };

function fail(code: string, message: string): never {
  throw new HashError(code, code, message);
}

/** Every file below `root`, as POSIX paths; symlinks and special files are refused. */
function listTree(root: string, dir = root): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = lstatSync(full);
    const rel = relative(root, full).split(sep).join('/');
    if (stat.isSymbolicLink()) fail('E_INTEGRITY', `release entry ${rel} is a symbolic link`);
    if (stat.isDirectory()) out.push(...listTree(root, full));
    else if (stat.isFile()) out.push(rel);
    else fail('E_INTEGRITY', `release entry ${rel} is not a regular file`);
  }
  return out;
}

export function verifyReleaseDir(dir: string): VerifiedRelease {
  const manifestPath = join(dir, 'release.json');
  if (!existsSync(manifestPath)) fail('E_TOOLKIT_MISSING', `no release.json in ${dir}`);
  if (lstatSync(dir).isSymbolicLink()) fail('E_INTEGRITY', `release directory ${dir} is a symbolic link`);
  if (!lstatSync(manifestPath).isFile()) fail('E_INTEGRITY', 'release.json is not a regular file');

  let manifest: ReleaseManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ReleaseManifest;
  } catch {
    fail('E_INTEGRITY', 'release.json is not valid JSON');
  }
  const schema = validateAgainst('release', manifest);
  if (!schema.ok) fail('E_INTEGRITY', `release.json violates explain-release/1: ${schema.errors.join('; ')}`);

  const listed = new Set<string>();
  for (const file of manifest.files) {
    try {
      validateBundlePath(file.path);
    } catch (error) {
      fail('E_INTEGRITY', `release.json lists an invalid path ${JSON.stringify(file.path)}: ${(error as Error).message}`);
    }
    if (file.path === 'release.json') fail('E_INTEGRITY', 'release.json must not list itself');
    if (listed.has(file.path)) fail('E_INTEGRITY', `release.json lists ${file.path} twice`);
    listed.add(file.path);
  }

  // The on-disk set must equal the manifest set: an unlisted file would share the digest.
  const onDisk = new Set(listTree(dir).filter((p) => p !== 'release.json'));
  for (const path of onDisk) if (!listed.has(path)) fail('E_INTEGRITY', `release file ${path} is not listed in release.json`);
  for (const path of listed) if (!onDisk.has(path)) fail('E_INTEGRITY', `release file ${path} is missing`);

  for (const file of manifest.files) {
    const actual = createHash('sha256').update(readFileSync(join(dir, ...file.path.split('/')))).digest('hex');
    if (actual !== file.sha256) fail('E_INTEGRITY', `release file ${file.path} does not match release.json`);
  }
  return { dir, version: manifest.version, sha256: createHash('sha256').update(canonicalJSON(manifest)).digest('hex') };
}
