// Fixtures for toolkit resolution, the user shim, and doctor (§12.4, §12.7).
// Every fixture uses its own VISSER_HOME and HOME under a temporary folder;
// nothing touches the real ~/.visser.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { canonicalJSON } from '../../packages/core/src/model/hash.ts';

export const release = join(process.cwd(), 'dist', 'release');
export const cli = join(release, 'bin', 'visser.cjs');

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

/** Rewrite release.json for the files in `dir`, as scripts/build.mjs does; returns the new digest. */
export function resign(dir: string): string {
  const files = listFiles(dir)
    .map((full) => ({ path: relative(dir, full).split(sep).join('/'), sha256: createHash('sha256').update(readFileSync(full)).digest('hex') }))
    .filter((f) => f.path !== 'release.json')
    .sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  const manifest = { schema: 'visser-release/1', version: '0.0.0', files };
  writeFileSync(join(dir, 'release.json'), canonicalJSON(manifest) + '\n');
  return createHash('sha256').update(canonicalJSON(manifest)).digest('hex');
}

export function digestOf(dir: string): string {
  return createHash('sha256').update(canonicalJSON(JSON.parse(readFileSync(join(dir, 'release.json'), 'utf8')))).digest('hex');
}

/** A copy of dist/release in `dest`, optionally changed, re-signed. Returns its digest. */
export function toolkitCopy(dest: string, change?: (dir: string) => void): string {
  cpSync(release, dest, { recursive: true });
  if (!change) return digestOf(dest);
  change(dest);
  return resign(dest);
}

/** A toolkit whose CLI and workers write `sentinel` and exit 0. */
export function sentinelToolkit(dest: string, sentinel: string): string {
  const code = `require('node:fs').writeFileSync(${JSON.stringify(sentinel)}, 'ran ' + __filename + '\\n', { flag: 'a' });\n`;
  return toolkitCopy(dest, (dir) => {
    writeFileSync(join(dir, 'bin', 'visser.cjs'), code);
    writeFileSync(join(dir, 'workers', 'layout.cjs'), code);
    writeFileSync(join(dir, 'workers', 'mermaid-parse.cjs'), code);
  });
}

/** A toolkit whose CLI records its argv in `marker` and exits with `exitCode`. */
export function markerToolkit(dest: string, marker: string, exitCode: number): string {
  return toolkitCopy(dest, (dir) => {
    writeFileSync(join(dir, 'bin', 'visser.cjs'),
      `require('node:fs').writeFileSync(${JSON.stringify(marker)}, JSON.stringify({ file: __filename, argv: process.argv.slice(2) }));\nprocess.exitCode = ${exitCode};\n`);
  });
}

export type Fixture = { root: string; home: string; userHome: string; env: NodeJS.ProcessEnv; shim: string };

/** A temporary VISSER_HOME with the user shim installed at bin/visser.cjs. */
export function fixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'visser-resolve-'));
  const home = join(root, 'visser-home');
  const userHome = join(root, 'home');
  mkdirSync(join(home, 'bin'), { recursive: true });
  mkdirSync(userHome, { recursive: true });
  const shim = join(home, 'bin', 'visser.cjs');
  cpSync(join(release, 'bin', 'shim.cjs'), shim);
  const env = { PATH: process.env['PATH'] ?? '', VISSER_HOME: home, HOME: userHome };
  return { root, home, userHome, env, shim };
}

/** Install a verified tree as the user toolchain for its digest (what `install --from-dir` does). */
export function installUser(fx: Fixture, from: string): string {
  const digest = digestOf(from);
  cpSync(from, join(fx.home, 'toolchains', digest), { recursive: true });
  return digest;
}

/** A repository with `.visser/`, and a document at docs/a whose lock pins `digest`. */
export function repoWithDocument(fx: Fixture, name: string, digest: string): { repo: string; doc: string } {
  const repo = join(fx.root, name);
  mkdirSync(join(repo, '.visser'), { recursive: true });
  const doc = join(repo, 'docs', 'a');
  const r = spawnSync(process.execPath, [cli, 'init', doc, '--kind', 'plan', '--title', 'Resolution fixture', '--toolkit-dir', release], { encoding: 'utf8', env: fx.env });
  if (r.status !== 0) throw new Error(`init failed: ${r.stderr}`);
  const lockPath = join(doc, 'visser.lock.json');
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  lock.toolkit.sha256 = digest;
  writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
  return { repo, doc: join(doc, 'index.md') };
}

export function run(fx: Fixture, entry: string, args: string[], cwd?: string) {
  return spawnSync(process.execPath, [entry, ...args], { encoding: 'utf8', env: fx.env, cwd: cwd ?? fx.root, timeout: 120_000 });
}
