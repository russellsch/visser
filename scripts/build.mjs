// Build the CLI bundle and dist/release with a valid release.json (§12.1, §17.2).
// The toolkit digest is sha256(canonicalJSON(release.json)); release.json lists
// every shipped file except itself.
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
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

// Browser runtime: one shared script and stylesheet per toolkit (§2.3, §13.1).
await build({
  entryPoints: [join(root, 'packages/runtime/src/reader.ts')],
  outfile: join(out, 'browser/reader.js'),
  bundle: true,
  format: 'iife',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  logLevel: 'warning',
});
cpSync(join(root, 'packages/runtime/src/reader.css'), join(out, 'browser/reader.css'));

// Mermaid (§9.12): the pinned browser build ships once per toolkit as its own
// asset; pages load it only when they contain a Mermaid figure.
cpSync(join(root, 'node_modules/mermaid/dist/mermaid.min.js'), join(out, 'browser/mermaid.js'));

// Graph layout worker (§5.1): ELK runs only inside this bounded worker.
await build({
  entryPoints: [join(root, 'packages/core/src/compiler/layout-worker.ts')],
  outfile: join(out, 'workers/layout.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  legalComments: 'none',
  logLevel: 'warning',
});

// Mermaid build-time parse worker (§9.12): runs as a separate, bounded process.
const mermaidWorker = join(root, 'packages/core/src/mermaid/parse-worker.ts');
if (existsSync(mermaidWorker)) {
  await build({
    entryPoints: [mermaidWorker],
    outfile: join(out, 'workers/mermaid-parse.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node24',
    legalComments: 'none',
    logLevel: 'warning',
    // The build parses structure only; DOMPurify needs a DOM, so it is replaced
    // by the stub (source mode uses a resolve hook for the same mapping).
    alias: { dompurify: join(root, 'packages/core/src/mermaid/dompurify-stub.ts') },
  });
} else {
  console.warn('warning: packages/core/src/mermaid/parse-worker.ts is missing; the release cannot parse Mermaid figures');
}

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
