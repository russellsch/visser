// `npm run release:pack` (§12.1): pack dist/release into a reproducible
// dist/visser-VERSION.tar.gz. Two runs over the same tree give the same bytes.
// Prints the archive digest (for `install --archive FILE --sha256 DIGEST`) and
// the toolkit digest (what a lock pins).
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packRelease } from '../packages/core/src/distribution/pack.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.argv[2] ?? join(root, 'dist', 'release');
try {
  const packed = packRelease(dir);
  const out = process.argv[3] ?? join(root, 'dist', `visser-${packed.version}.tar.gz`);
  writeFileSync(out, packed.bytes);
  console.log(`${out}\n  archive sha256: ${packed.archiveSha256}\n  toolkit sha256: ${packed.toolkitSha256}\n  version: ${packed.version}`);
} catch (error) {
  console.error(`${error.code ?? 'error'}: ${error.message}`);
  process.exit(error.code === 'E_TOOLKIT_MISSING' ? 3 : error.code === 'E_INTEGRITY' ? 4 : 1);
}
