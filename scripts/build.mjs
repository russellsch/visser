// Build the CLI bundle and dist/release with a valid release.json (§12.1, §17.2).
// The toolkit digest is sha256(canonicalJSON(release.json)); release.json lists
// every shipped file except itself.
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJSON } from '../packages/core/src/model/hash.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist', 'release');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [join(root, 'packages/cli/src/bin.ts')],
  outfile: join(out, 'bin/explain.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  legalComments: 'none',
  logLevel: 'warning',
});

cpSync(join(root, 'schemas'), join(out, 'schemas'), { recursive: true });
cpSync(join(root, 'skills'), join(out, 'skills'), { recursive: true });

function listFiles(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files.push(...listFiles(full));
    else files.push(full);
  }
  return files;
}

const files = listFiles(out)
  .map((full) => ({
    path: relative(out, full).split(sep).join('/'),
    sha256: createHash('sha256').update(readFileSync(full)).digest('hex'),
  }))
  .filter((f) => f.path !== 'release.json')
  .sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));

const manifest = { schema: 'explain-release/1', version, files };
writeFileSync(join(out, 'release.json'), canonicalJSON(manifest) + '\n');
const digest = createHash('sha256').update(canonicalJSON(manifest)).digest('hex');
console.log(`dist/release ${version} toolkit ${digest} (${files.length} files)`);
