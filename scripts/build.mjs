import { FLOWCHART_READER_MARKER } from '../packages/core/src/compiler/flowchart-contract.ts';
import {agentflowContractPlugin} from './mermaid-agentflow-contract.mjs';
import {erLayoutContractPlugin} from './mermaid-er-layout-contract.mjs';
import { erContractPlugin } from './mermaid-er-contract.mjs';
import { kanbanContractPlugin } from './mermaid-kanban-contract.mjs';
import { requirementContractPlugin } from './mermaid-requirement-contract.mjs';
import { radarContractPlugin } from './mermaid-radar-contract.mjs';
import { radarParserContractPlugin } from './mermaid-radar-parser-contract.mjs';
import { sankeyContractPlugin } from './mermaid-sankey-contract.mjs';
import { xyContractPlugin } from './mermaid-xychart-contract.mjs';
import { quadrantSnapshotPlugin } from './mermaid-quadrant-snapshot.mjs';
// Build the CLI bundle and dist/release with a valid release.json (§12.1, §17.2).
// The toolkit digest is sha256(canonicalJSON(release.json)); release.json lists
// every shipped file except itself.
import { stateObserverPlugin } from './mermaid-state-observer-loader.mjs';
import { sequenceDomAliases, sequenceDomPlugin } from './sequence-dom-build.mjs';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJSON } from '../packages/core/src/model/hash.ts';
import { mathPolicyFingerprint } from '../packages/core/src/math/fingerprint.ts';
import { mermaidMathPlugin } from './mermaid-build.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// Recreate the worker-only provenance decoder from the fingerprinted upstream
// source before bundling; no runtime filesystem lookup or code generation.
const { generateMermaidYaml } = await import('./mermaid-yaml-build.mjs');
await generateMermaidYaml();
const final = join(root, 'dist', 'release');
// Build into a staging directory, then swap it into place with two renames, so
// a reader of dist/release (a parallel test, a running CLI) never sees a
// partial or missing tree.
const out = join(root, 'dist', `.release-${process.pid}-${Date.now()}`);
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

mkdirSync(out, { recursive: true });
process.on('exit', () => rmSync(out, { recursive: true, force: true }));

// Each esbuild bundle reports its inputs; LICENSES.txt lists every bundled package.
const bundled = new Map(); // package directory -> Set of release files
const vendoredYamlFiles = new Set();
const mathFingerprint = mathPolicyFingerprint();
async function bundle(options) {
  const result = await build({ ...options, absWorkingDir: root, metafile: true });
  const file = relative(out, options.outfile).split(sep).join('/');
  for (const input of Object.keys(result.metafile.inputs)) {
    if (input.replaceAll('\\', '/').endsWith('packages/core/src/mermaid/vendor/yaml-provenance.mjs')) vendoredYamlFiles.add(file);
    const dir = packageDirOf(join(root, input));
    if (dir) bundled.set(dir, (bundled.get(dir) ?? new Set()).add(file));
  }
}
/** The package directory (…/node_modules/NAME or …/node_modules/@SCOPE/NAME) of a file, if any. */
function packageDirOf(file) {
  const parts = file.split(sep);
  const i = parts.lastIndexOf('node_modules');
  if (i === -1) return undefined;
  const n = parts[i + 1]?.startsWith('@') ? 2 : 1;
  return parts.slice(0, i + 1 + n).join(sep);
}

await bundle({
  entryPoints: [join(root, 'packages/cli/src/bin.ts')],
  outfile: join(out, 'bin/visser.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  legalComments: 'none',
  logLevel: 'warning',
  define: { __VISSER_MATH_FINGERPRINT__: JSON.stringify(mathFingerprint) },
  // markdown-it 12 uses the deprecated Node builtin name; ship its maintained dependency.
  alias: { punycode: 'punycode/' },
});

// Browser runtime: one shared script and stylesheet per toolkit (§2.3, §13.1).
await bundle({
  entryPoints: [join(root, 'packages/runtime/src/reader.ts')],
  outfile: join(out, 'browser/reader.js'),
  banner: { js: FLOWCHART_READER_MARKER },
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
await bundle({
  entryPoints: [join(root, 'packages/runtime/src/mermaid-bundle.ts')],
  outfile: join(out, 'browser/mermaid.js'),
  bundle: true, format: 'iife', target: 'es2022', minify: true,
  legalComments: 'none', logLevel: 'warning',
  plugins: [mermaidMathPlugin(root)],
});

// An integrity-checked outer script transports a classic worker as a string.
// The reader starts a blob worker: large data-URL Workers fail under file://.
await bundle({
  entryPoints: [join(root, 'packages/runtime/src/math-worker.ts')],
  outfile: join(out, 'browser/math.js'),
  bundle: true, format: 'iife', target: 'es2022', minify: true,
  legalComments: 'none', logLevel: 'warning',
  alias: { '#default-font/svg/default.js': join(root, 'node_modules/@mathjax/mathjax-tex-font/mjs/svg/default.js') },
});
const mathWorkerSource = readFileSync(join(out, 'browser/math.js'), 'utf8');
writeFileSync(join(out, 'browser/math.js'), `/*visser-math-policy:${mathFingerprint}*/\nglobalThis.__visserMathWorkerSource=${JSON.stringify(mathWorkerSource)};\n`);

// Math validation uses the same pinned engine/font configuration as the browser.
await bundle({
  entryPoints: [join(root, 'packages/core/src/math/validate-worker.ts')],
  outfile: join(out, 'workers/math-validate.cjs'),
  bundle: true, platform: 'node', format: 'cjs', target: 'node24',
  legalComments: 'none', logLevel: 'warning',
  alias: { '#default-font/svg/default.js': join(root, 'node_modules/@mathjax/mathjax-tex-font/mjs/svg/default.js') },
});

// Graph layout worker (§5.1): ELK runs only inside this bounded worker.
await bundle({
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
  await bundle({
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
    alias: sequenceDomAliases(root),
    plugins: [agentflowContractPlugin(), erLayoutContractPlugin(), erContractPlugin(), kanbanContractPlugin(), requirementContractPlugin(), radarParserContractPlugin(), radarContractPlugin(), sankeyContractPlugin(), xyContractPlugin(), quadrantSnapshotPlugin(), stateObserverPlugin(root), sequenceDomPlugin(root)],
  });
} else {
  console.warn('warning: packages/core/src/mermaid/parse-worker.ts is missing; the release cannot parse Mermaid figures');
}

// The user shim (§12.2, §12.4): installed to VISSER_HOME/bin/visser.cjs; it
// dispatches every command to the resolved toolkit's own bin/visser.cjs.
const shim = join(root, 'packages/cli/src/shim.ts');
if (!existsSync(shim)) throw new Error('packages/cli/src/shim.ts is missing; the release needs bin/shim.cjs');
await bundle({
  entryPoints: [shim],
  outfile: join(out, 'bin/shim.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  legalComments: 'none',
  logLevel: 'warning',
});

cpSync(join(root, 'schemas'), join(out, 'schemas'), { recursive: true });
// skills/visser-visual-explain/SKILL.md and skills/visser-visual-explain/references/** (the format guide, §12.1).
cpSync(join(root, 'skills'), join(out, 'skills'), { recursive: true });

// LICENSES.txt (§12.1): generated from the license metadata of every bundled
// package. Mermaid's published ESM chunks already contain bundled dependencies;
// retain their upstream source-map inventory in addition to esbuild's inputs.
// A bundled package without license information fails the build.
const mermaidMap = JSON.parse(readFileSync(join(root, 'node_modules/mermaid/dist/mermaid.min.js.map'), 'utf8'));
bundled.set(join(root, 'node_modules/mermaid'), new Set(['browser/mermaid.js']));
// Packages that mermaid bundles but npm does not install here. Checked by hand
// against each package's published package.json for the version in the map.
const NOT_INSTALLED = { fastdom: 'MIT', 'js-yaml': 'MIT' };
const mermaidExtra = new Map(); // name -> version from the source map path
for (const source of mermaidMap.sources) {
  const i = source.lastIndexOf('node_modules/');
  if (i === -1) continue;
  const rest = source.slice(i + 'node_modules/'.length).split('/');
  const name = rest[0].startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0];
  const pnpm = /\.pnpm\/((?:@[^+/]+\+)?[^@/]+)@([^_/]+)/.exec(source);
  const dir = join(root, 'node_modules', ...name.split('/'));
  if (existsSync(join(dir, 'package.json'))) bundled.set(dir, (bundled.get(dir) ?? new Set()).add('browser/mermaid.js'));
  else mermaidExtra.set(name, pnpm?.[2] ?? 'unknown');
}
if (mermaidMap.sources.some((s) => s.startsWith('../../parser/'))) {
  bundled.set(join(root, 'node_modules/@mermaid-js/parser'), (bundled.get(join(root, 'node_modules/@mermaid-js/parser')) ?? new Set()).add('browser/mermaid.js'));
}

const LICENSE_FILE = /^(licen[cs]e|copying|notice)(\.(md|txt|markdown|mit|bsd|apache))?$/i;
const notices = [];
const missing = [];
for (const [dir, files] of bundled) {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const license = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type ?? (Array.isArray(pkg.licenses) ? pkg.licenses.map((l) => l.type).join(' OR ') : undefined);
  const texts = readdirSync(dir).filter((f) => LICENSE_FILE.test(f)).sort().map((f) => readFileSync(join(dir, f), 'utf8').trim());
  if (!license && texts.length === 0) missing.push(pkg.name);
  notices.push({ name: pkg.name, version: pkg.version, license: license ?? 'see license text', files: [...files].sort(), text: texts.join('\n\n') });
}
for (const [name, version] of mermaidExtra) {
  const license = NOT_INSTALLED[name];
  if (!license) { missing.push(`${name} (bundled in mermaid.min.js, not installed)`); continue; }
  notices.push({ name, version, license, files: ['browser/mermaid.js'], text: `The ${license} license applies. This package is bundled inside mermaid.min.js and is not installed in the toolkit repository, so its license file is not reproduced here.` });
}
if (vendoredYamlFiles.size) notices.push({ name: 'js-yaml (provenance instrumentation)', version: '4.3.0', license: 'MIT',
  files: [...vendoredYamlFiles].sort(), text: readFileSync(join(root, 'packages/core/src/mermaid/vendor/yaml-provenance.LICENSE'), 'utf8').trim() });
if (missing.length > 0) throw new Error(`bundled packages without license information: ${missing.join(', ')}`);
const byKey = (n) => `${n.name}\u0000${n.version}`;
notices.sort((a, b) => (byKey(a) < byKey(b) ? -1 : byKey(a) > byKey(b) ? 1 : 0));
const rule = '='.repeat(72);
writeFileSync(join(out, 'LICENSES.txt'), [
  `Visser toolkit ${version}: third-party license notices.`,
  'Generated by scripts/build.mjs from the license metadata of every bundled package.',
  '',
  ...notices.flatMap((n) => [rule, `${n.name} ${n.version}`, `License: ${n.license}`, `Bundled in: ${n.files.join(', ')}`, '-'.repeat(72), n.text || `(The package has no license file; its package.json declares ${n.license}.)`, '']),
].join('\n'));

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

const manifest = { schema: 'visser-release/1', version, files };
// release.json has a normative schema (§5.4, §12.1); never ship an invalid one.
const { validateAgainst } = await import('../packages/core/src/model/schemas.ts');
const releaseCheck = validateAgainst('release', manifest);
if (!releaseCheck.ok) throw new Error(`release.json violates visser-release/1: ${releaseCheck.errors.join('; ')}`);
writeFileSync(join(out, 'release.json'), canonicalJSON(manifest) + '\n');
const previous = `${out}.old`;
// Another build can swap in between the two renames; retry until ours lands.
for (let attempt = 0; ; attempt++) {
  try {
    if (existsSync(final)) renameSync(final, previous);
    renameSync(out, final);
    break;
  } catch (error) {
    if (attempt >= 20 || !['ENOTEMPTY', 'EEXIST', 'ENOENT'].includes(error.code)) throw error;
    rmSync(previous, { recursive: true, force: true });
  }
}
rmSync(previous, { recursive: true, force: true });
const digest = createHash('sha256').update(canonicalJSON(manifest)).digest('hex');
console.log(`dist/release ${version} toolkit ${digest} (${files.length} files)`);
