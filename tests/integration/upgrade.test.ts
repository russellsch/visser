// `visser upgrade DOC --to DIGEST` (§12.3, §17.1, §11.9): the target toolkit
// is resolved with the trust gate, its own CLI checks and rebuilds, versions
// come from release.json, and the lock changes only through a guarded write.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canonicalJSON } from '../../packages/core/src/model/hash.ts';
import { compareVersions } from '../../packages/core/src/distribution/upgrade.ts';
import { validateAgainst } from '../../packages/core/src/model/schemas.ts';
import { CliError, parseArgs } from '../../packages/cli/src/cli-util.ts';
import { runUpgrade, type UpgradeOptions } from '../../packages/cli/src/commands/upgrade.ts';
import { digestOf, fixture, installUser, release, repoWithDocument, type Fixture } from './resolution.fixtures.ts';
import { createHash } from 'node:crypto';

/** A copy of dist/release with `version` in release.json (a distinct digest), optionally changed first. */
function toolkit(dest: string, version: string, change?: (dir: string) => void): string {
  cpSync(release, dest, { recursive: true });
  change?.(dest);
  const listed = JSON.parse(readFileSync(join(dest, 'release.json'), 'utf8')) as { files: Array<{ path: string; sha256: string }> };
  const files = listed.files.map((f) => ({ path: f.path, sha256: createHash('sha256').update(readFileSync(join(dest, ...f.path.split('/')))).digest('hex') }));
  writeFileSync(join(dest, 'release.json'), canonicalJSON({ schema: 'visser-release/1', version, files }) + '\n');
  return digestOf(dest);
}

type Outcome = { code: number; out: string; err: string };

async function upgrade(fx: Fixture, argv: string[], opts: Partial<UpgradeOptions> = {}): Promise<Outcome> {
  let out = '';
  let err = '';
  const o = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => { out += String(chunk); return true; });
  const e = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => { err += String(chunk); return true; });
  try {
    const code = await runUpgrade(parseArgs(argv), { env: fx.env, ownRelease: undefined, ...opts });
    return { code, out, err };
  } catch (error) {
    if (error instanceof CliError) return { code: error.exitCode, out, err: `${error.code}: ${error.message}` };
    throw error;
  } finally {
    o.mockRestore();
    e.mockRestore();
  }
}

afterEach(() => vi.restoreAllMocks());

/** Two installed user toolkits (0.1.0 and 0.2.0) and a document pinned to `pinned`. */
function setup(pinned: 'old' | 'new' = 'old') {
  const fx = fixture();
  const A = toolkit(join(fx.root, 'tk-a'), '0.1.0');
  const B = toolkit(join(fx.root, 'tk-b'), '0.2.0');
  installUser(fx, join(fx.root, 'tk-a'));
  installUser(fx, join(fx.root, 'tk-b'));
  const { repo, doc } = repoWithDocument(fx, 'repo', pinned === 'old' ? A : B);
  const lockPath = join(repo, 'docs', 'a', 'visser.lock.json');
  return { fx, A, B, repo, doc, lockPath };
}

const lockOf = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as { toolkit: { sha256: string; version: string; origin: { kind: string }; archiveSha256?: string } };

describe('compareVersions (Semantic Versioning 2.0.0 precedence)', () => {
  it('orders core versions numerically and prereleases below releases', () => {
    const ordered = ['0.9.0', '0.10.0', '1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0', '1.0.1', '2.0.0'];
    for (let i = 0; i + 1 < ordered.length; i++) {
      expect(compareVersions(ordered[i]!, ordered[i + 1]!), `${ordered[i]} < ${ordered[i + 1]}`).toBeLessThan(0);
      expect(compareVersions(ordered[i + 1]!, ordered[i]!)).toBeGreaterThan(0);
    }
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
    expect(compareVersions('1.2.3+build.1', '1.2.3+build.2')).toBe(0);
    expect(() => compareVersions('1.2', '1.2.3')).toThrow();
  });
});

describe('visser upgrade', () => {
  it('moves the lock to a newer installed toolkit, runs its check and rebuild, and keeps old snapshots', async () => {
    const { fx, A, B, repo, doc, lockPath } = setup('old');
    const outDir = join(repo, '.visser', 'output');
    mkdirSync(join(outDir, 'd', 'old-snapshot'), { recursive: true });
    writeFileSync(join(outDir, 'd', 'old-snapshot', 'index.html'), 'old');
    const r = await upgrade(fx, [doc, '--to', B, '--json']);
    expect(r.code, r.err).toBe(0);
    const report = JSON.parse(r.out);
    expect(validateAgainst('upgrade', report)).toEqual({ ok: true });
    expect(report).toMatchObject({ from: { sha256: A, version: '0.1.0' }, to: { sha256: B, version: '0.2.0' }, changed: true, downgrade: false, rebuilt: true });
    expect(report.diff).toContain(`+    "sha256": "${B}"`);
    expect(lockOf(lockPath).toolkit).toEqual({ version: '0.2.0', sha256: B, origin: { kind: 'local-dir' } });
    // The rebuild ran through toolkit B and wrote a snapshot; the old one stays.
    expect(readFileSync(join(outDir, 'd', 'old-snapshot', 'index.html'), 'utf8')).toBe('old');
    const builds = readdirSync(join(outDir, 'd')).filter((n) => n !== 'old-snapshot');
    expect(builds.length).toBe(1);
  }, 120_000);

  it('refuses a downgrade (E_DOWNGRADE, nothing written) and accepts it with --allow-downgrade', async () => {
    const { fx, A, doc, lockPath } = setup('new');
    const before = readFileSync(lockPath);
    const refused = await upgrade(fx, [doc, '--to', A]);
    expect(refused.code).toBe(2);
    expect(refused.err).toContain('E_DOWNGRADE');
    expect(readFileSync(lockPath).equals(before)).toBe(true);
    const accepted = await upgrade(fx, [doc, '--to', A, '--allow-downgrade', '--json']);
    expect(accepted.code, accepted.err).toBe(0);
    expect(JSON.parse(accepted.out)).toMatchObject({ downgrade: true, changed: true });
    expect(lockOf(lockPath).toolkit.sha256).toBe(A);
  }, 120_000);

  it('refuses an untrusted repository target (E_TOOLKIT_UNTRUSTED); its code never runs', async () => {
    const { fx, repo, doc, lockPath } = setup('old');
    const sentinel = join(fx.root, 'sentinel');
    const code = `require('node:fs').writeFileSync(${JSON.stringify(sentinel)}, 'ran');\n`;
    const S = toolkit(join(fx.root, 'tk-s'), '9.0.0', (dir) => {
      for (const f of ['bin/visser.cjs', 'workers/layout.cjs', 'workers/mermaid-parse.cjs']) writeFileSync(join(dir, f), code);
    });
    cpSync(join(fx.root, 'tk-s'), join(repo, '.visser', 'toolchains', S), { recursive: true });
    const before = readFileSync(lockPath);
    const r = await upgrade(fx, [doc, '--to', S]);
    expect(r.code).toBe(4);
    expect(r.err).toContain('E_TOOLKIT_UNTRUSTED');
    expect(existsSync(sentinel)).toBe(false);
    expect(readFileSync(lockPath).equals(before)).toBe(true);
  }, 120_000);

  it('stops when the target toolkit\'s own check fails; the lock is unchanged', async () => {
    const { fx, doc, lockPath } = setup('old');
    const marker = join(fx.root, 'marker.json');
    const F = toolkit(join(fx.root, 'tk-f'), '0.3.0', (dir) => {
      writeFileSync(join(dir, 'bin', 'visser.cjs'), `require('node:fs').writeFileSync(${JSON.stringify(marker)}, JSON.stringify(process.argv.slice(2)));\nprocess.stdout.write(JSON.stringify({ schema: 'visser-check/1', ok: false, targetCount: 0, diagnostics: [{ code: 'E_SEMANTIC', severity: 'error', message: 'rejected by 0.3.0' }] }));\nprocess.exitCode = 2;\n`);
    });
    installUser(fx, join(fx.root, 'tk-f'));
    const before = readFileSync(lockPath);
    const r = await upgrade(fx, [doc, '--to', F]);
    expect(r.code).toBe(2);
    expect(r.err).toContain('rejected by 0.3.0');
    expect(JSON.parse(readFileSync(marker, 'utf8'))).toEqual(['check', doc, '--json']);
    expect(readFileSync(lockPath).equals(before)).toBe(true);
  }, 120_000);

  it('a concurrent writer before the rename is E_WRITE_CONFLICT, and the other writer\'s bytes stay', async () => {
    const { fx, B, doc, lockPath } = setup('old');
    const external = readFileSync(lockPath, 'utf8').replace('"imports"', '"imports" ').trimEnd() + '\n\n';
    const r = await upgrade(fx, [doc, '--to', B], { fsContext: { beforeRename: () => writeFileSync(lockPath, external) } });
    expect(r.code).toBe(5);
    expect(r.err).toContain('E_WRITE_CONFLICT');
    expect(readFileSync(lockPath, 'utf8')).toBe(external);
    expect(readdirSync(join(lockPath, '..')).filter((n) => n.endsWith('.tmp'))).toEqual([]);
  }, 120_000);

  it('refuses while another writer holds the document\'s edit lock', async () => {
    const { fx, B, repo, doc, lockPath } = setup('old');
    const docId = /docId: ([0-9a-f-]+)/.exec(readFileSync(doc, 'utf8'))![1]!;
    mkdirSync(join(repo, '.visser', 'edit-locks'), { recursive: true });
    writeFileSync(join(repo, '.visser', 'edit-locks', `${docId}.lock`), '{"pid":1}\n');
    const before = readFileSync(lockPath);
    const r = await upgrade(fx, [doc, '--to', B]);
    expect(r.code).toBe(5);
    expect(r.err).toContain('locked by another writer');
    expect(readFileSync(lockPath).equals(before)).toBe(true);
  }, 120_000);

  it('the same digest is a no-op, and --dry-run prints the diff without writing', async () => {
    const { fx, A, B, doc, lockPath } = setup('old');
    const before = readFileSync(lockPath);
    const same = await upgrade(fx, [doc, '--to', A, '--json']);
    expect(same.code, same.err).toBe(0);
    expect(JSON.parse(same.out)).toMatchObject({ changed: false });
    const dry = await upgrade(fx, [doc, '--to', B, '--dry-run', '--json']);
    expect(dry.code, dry.err).toBe(0);
    const report = JSON.parse(dry.out);
    expect(validateAgainst('upgrade', report)).toEqual({ ok: true });
    expect(report).toMatchObject({ changed: false, dryRun: true });
    expect(report.diff).toContain(B);
    expect(readFileSync(lockPath).equals(before)).toBe(true);
  }, 120_000);

  it('usage and missing-toolkit errors', async () => {
    const { fx, B, repo, doc, lockPath } = setup('old');
    expect((await upgrade(fx, [doc, '--to', 'nope'])).err).toContain('E_USAGE');
    expect((await upgrade(fx, [doc])).code).toBe(2);
    const missing = 'c'.repeat(64);
    const notInstalled = await upgrade(fx, [doc, '--to', missing]);
    expect(notInstalled.code).toBe(3);
    expect(notInstalled.err).toContain('E_TOOLKIT_MISSING');

    // The current toolkit is not installed: its version is unknown.
    const lock = lockOf(lockPath);
    lock.toolkit.sha256 = missing;
    writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
    const unknown = await upgrade(fx, [doc, '--to', B]);
    expect(unknown.code).toBe(3);
    expect(unknown.err).toContain('version is unknown');
    const skipped = await upgrade(fx, [doc, '--to', B, '--allow-downgrade', '--json']);
    expect(skipped.code, skipped.err).toBe(0);
    expect(JSON.parse(skipped.out).from).toEqual({ sha256: missing });

    // No lock at all.
    const bare = join(repo, 'docs', 'bare');
    mkdirSync(bare);
    cpSync(doc, join(bare, 'index.md'));
    const noLock = await upgrade(fx, [join(bare, 'index.md'), '--to', B]);
    expect(noLock.code).toBe(3);
    expect(noLock.err).toContain('no visser.lock.json');
  }, 120_000);
});
