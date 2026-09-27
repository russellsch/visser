// `release:pack` (§12.1): a reproducible tar.gz of a verified release tree.
// The archive digest identifies the transport file only; the toolkit digest
// (sha256 of canonical release.json) identifies the installed tree.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJSON, HashError } from '../model/hash.ts';
import { verifyReleaseDir } from './release.ts';
import { packFiles } from './ustar.ts';

export type PackedRelease = { version: string; toolkitSha256: string; archiveSha256: string; bytes: Uint8Array };

export function packRelease(dir: string): PackedRelease {
  const release = verifyReleaseDir(dir);
  const manifestBytes = new Uint8Array(readFileSync(join(dir, 'release.json')));
  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as { files: Array<{ path: string; sha256: string }> };
  if (createHash('sha256').update(canonicalJSON(manifest)).digest('hex') !== release.sha256) {
    throw new HashError('E_INTEGRITY', 'E_INTEGRITY', 'release.json changed during packing');
  }
  // Re-check each file as it is read, so a change after verification cannot enter the archive.
  const files = [{ path: 'release.json', data: manifestBytes }, ...manifest.files.map((f) => {
    const data = new Uint8Array(readFileSync(join(dir, ...f.path.split('/'))));
    if (createHash('sha256').update(data).digest('hex') !== f.sha256) throw new HashError('E_INTEGRITY', 'E_INTEGRITY', `release file ${f.path} changed during packing`);
    return { path: f.path, data };
  })];
  const bytes = packFiles(files);
  return {
    version: release.version,
    toolkitSha256: release.sha256,
    archiveSha256: createHash('sha256').update(bytes).digest('hex'),
    bytes,
  };
}
