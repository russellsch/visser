// `npm run test:clean-machine` (§17.7 exit check): a scripted run on a clean
// machine. It packs dist/release, installs the archive into an empty
// EXPLAIN_HOME with an empty HOME and a PATH that holds only the node binary,
// and then uses only the installed user shim to init, check, build, and export
// a document. Finally it reads the exported page as a static file.
//
// Exit 0 if every step passes; 1 on the first failure. The script also fails if
// the run writes into this working tree or into the temporary HOME.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const release = join(root, 'dist/release');

function fail(message) {
  process.stderr.write(`clean-machine: FAIL: ${message}\n`);
  process.exit(1);
}

function gitStatus() {
  return execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, encoding: 'utf8' });
}

if (!existsSync(join(release, 'release.json'))) {
  execFileSync(process.execPath, [join(root, 'scripts/build.mjs')], { cwd: root, stdio: 'inherit' });
}
const before = gitStatus();

const machine = mkdtempSync(join(tmpdir(), 'explain-clean-'));
const home = join(machine, 'home');
const explainHome = join(machine, 'explain-home');
const repo = join(machine, 'repo');
for (const dir of [home, explainHome, join(repo, '.explain')]) mkdirSync(dir, { recursive: true });
// Only the node binary: no npm, no git, nothing from the author's shell.
const env = { HOME: home, EXPLAIN_HOME: explainHome, PATH: dirname(process.execPath), LANG: 'C.UTF-8' };

function step(label, entry, args, cwd = repo) {
  const result = spawnSync(process.execPath, [entry, ...args], { cwd, env, encoding: 'utf8' });
  if (result.status !== 0) fail(`${label} exited ${result.status}\n${result.stdout}\n${result.stderr}`);
  process.stdout.write(`ok: ${label}\n`);
  return result.stdout;
}

try {
  // 1. Pack the release archive, as a user would download it.
  const archive = join(machine, 'explain.tar.gz');
  const packed = step('release:pack', join(root, 'scripts/release.mjs'), [release, archive], root);
  const archiveSha256 = /archive sha256: ([0-9a-f]{64})/.exec(packed)?.[1];
  const toolkitSha256 = /toolkit sha256: ([0-9a-f]{64})/.exec(packed)?.[1];
  if (!archiveSha256 || !toolkitSha256) fail(`release:pack printed no digests:\n${packed}`);

  // 2. Install from the archive into the empty EXPLAIN_HOME.
  const install = JSON.parse(step('install --archive', join(release, 'bin/explain.cjs'),
    ['install', '--archive', archive, '--sha256', archiveSha256, '--scope', 'user', '--default', '--json'], machine));
  if (install.toolkitSha256 !== toolkitSha256) fail(`installed ${install.toolkitSha256}, packed ${toolkitSha256}`);
  const shim = join(explainHome, 'bin/explain.cjs');
  if (!existsSync(shim)) fail('install did not write the user shim');

  // 3. From here on, only the installed shim runs.
  const docDir = join(repo, 'docs/explanations/notes');
  step('init', shim, ['init', docDir, '--kind', 'teaching', '--title', 'Clean machine notes']);
  const indexPath = join(docDir, 'index.md');
  writeFileSync(indexPath, readFileSync(indexPath, 'utf8') + '\nThe clean machine reads this paragraph offline.\n');
  step('ids assign', shim, ['ids', 'assign', indexPath]);
  step('check --release', shim, ['check', indexPath, '--release']);
  step('build', shim, ['build', indexPath]);
  const site = join(machine, 'site');
  const exported = JSON.parse(step('export --format site', shim, ['export', indexPath, '--format', 'site', '--out', site, '--json']));

  // 4. Read the exported page as a static file.
  const page = exported.documents?.[0]?.path;
  if (!page) fail('the export report lists no document');
  const html = readFileSync(join(site, page), 'utf8');
  for (const text of ['Clean machine notes', 'The clean machine reads this paragraph offline.']) {
    if (!html.includes(text)) fail(`the exported page does not contain ${JSON.stringify(text)}`);
  }
  const reader = /src="([^"]*reader\.js)"/.exec(html)?.[1];
  if (!reader || reader.startsWith('/')) fail(`the exported page has no relative reader.js URL (${reader})`);
  if (!existsSync(join(site, dirname(page), reader))) fail(`reader.js is missing at ${reader}`);
  const buildJson = JSON.parse(readFileSync(join(site, dirname(page), 'build.json'), 'utf8'));
  if (buildJson.toolkitSha256 !== toolkitSha256) fail(`build.json toolkitSha256 ${buildJson.toolkitSha256}, expected ${toolkitSha256}`);
  if (buildJson.development === true) fail('the clean-machine build is marked as a development build');
  process.stdout.write('ok: read the exported page\n');

  // 5. Nothing was written outside the temporary machine.
  if (readdirSync(home).length > 0) fail(`the run wrote into HOME: ${readdirSync(home).join(', ')}`);
  const after = gitStatus();
  if (after !== before) fail(`the run changed the working tree:\n--- before\n${before}--- after\n${after}`);
  process.stdout.write(`clean-machine: ok (toolkit ${toolkitSha256})\n`);
} finally {
  rmSync(machine, { recursive: true, force: true });
}
