// Fixes for the Phase 4–5 code review (resolution, shim, upgrade). Each test
// failed on the code before its fix.
import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalJSON } from '../../packages/core/src/model/hash.ts';
import { cli, fixture, installUser, markerToolkit, release, repoWithDocument, run, toolkitCopy, type Fixture } from './resolution.fixtures.ts';

const SECRET = 'aws_secret_access_key=AKIAEXAMPLESECRET';

/** Run the shim under a 4 GB address-space limit and a 30 s timeout, so a regression cannot exhaust the machine. */
function bounded(fx: Fixture, args: string[], cwd?: string) {
  return spawnSync('/bin/sh', ['-c', 'ulimit -v 4000000; exec "$0" "$@"', process.execPath, fx.shim, ...args], { encoding: 'utf8', env: fx.env, cwd: cwd ?? fx.root, timeout: 30_000 });
}

/** A re-signed copy of dist/release with `version` in release.json; returns its digest. */
function versioned(dest: string, version: string, tag: string): string {
  toolkitCopy(dest, (d) => appendFileSync(join(d, 'browser', 'reader.css'), `\n/*${tag}*/\n`));
  const manifest = JSON.parse(readFileSync(join(dest, 'release.json'), 'utf8'));
  manifest.version = version;
  writeFileSync(join(dest, 'release.json'), canonicalJSON(manifest) + '\n');
  return createHash('sha256').update(canonicalJSON(manifest)).digest('hex');
}

/** A second document docs/NAME in `repo` whose lock pins `digest`. */
function secondDocument(fx: Fixture, repo: string, name: string, digest: string): string {
  const doc = join(repo, 'docs', name);
  const r = spawnSync(process.execPath, [cli, 'init', doc, '--kind', 'plan', '--title', `Doc ${name}`, '--toolkit-dir', release], { encoding: 'utf8', env: fx.env });
  if (r.status !== 0) throw new Error(r.stderr);
  const lockPath = join(doc, 'visser.lock.json');
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  lock.toolkit.sha256 = digest;
  writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
  return join(doc, 'index.md');
}

describe('B1: repository-controlled JSON is read bounded and without following symlinks', () => {
  it('a lock that links to /dev/zero stops at once with E_INTEGRITY', () => {
    const fx = fixture();
    const A = installUser(fx, release);
    const { doc } = repoWithDocument(fx, 'repo', A);
    const lock = join(dirname(doc), 'visser.lock.json');
    rmSync(lock);
    symlinkSync('/dev/zero', lock);
    const started = Date.now();
    const r = bounded(fx, ['check', doc]);
    expect(Date.now() - started).toBeLessThan(20_000);
    expect(r.status, r.stderr).toBe(4);
    expect(r.stderr).toContain('E_INTEGRITY');
  });

  it('a lock or workspace config that links to a private file never prints its content', () => {
    const fx = fixture();
    const A = installUser(fx, release);
    const { repo, doc } = repoWithDocument(fx, 'repo', A);
    const secret = join(fx.root, 'secret.txt');
    writeFileSync(secret, SECRET + '\n');
    const lock = join(dirname(doc), 'visser.lock.json');
    rmSync(lock);
    symlinkSync(secret, lock);
    const viaLock = bounded(fx, ['check', doc]);
    expect(viaLock.status).toBe(4);
    expect(viaLock.stdout + viaLock.stderr).not.toContain('aws_secret');

    const config = join(repo, '.visser', 'config.json');
    symlinkSync(secret, config);
    const viaConfig = bounded(fx, ['skill', 'show'], repo);
    expect(viaConfig.status).toBe(4);
    expect(viaConfig.stdout + viaConfig.stderr).not.toContain('aws_secret');
  });

  it('invalid JSON in a lock is reported without echoing the file', () => {
    const fx = fixture();
    const A = installUser(fx, release);
    const { doc } = repoWithDocument(fx, 'repo', A);
    writeFileSync(join(dirname(doc), 'visser.lock.json'), SECRET + '\n');
    const r = bounded(fx, ['check', doc]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('is not valid JSON');
    expect(r.stdout + r.stderr).not.toContain('aws_secret');
  });

  it('upgrade refuses a symlinked lock with E_INTEGRITY', () => {
    const fx = fixture();
    const A = installUser(fx, release);
    const { doc } = repoWithDocument(fx, 'repo', A);
    const secret = join(fx.root, 'secret.json');
    writeFileSync(secret, JSON.stringify({ note: SECRET }));
    const lock = join(dirname(doc), 'visser.lock.json');
    rmSync(lock);
    symlinkSync(secret, lock);
    const r = run(fx, cli, ['upgrade', doc, '--to', 'a'.repeat(64)]);
    expect(r.status).toBe(4);
    expect(r.stderr).toContain('E_INTEGRITY');
    expect(r.stdout + r.stderr).not.toContain('aws_secret');
  });
});

describe('B2: export --collection through the shim', () => {
  it('runs the one toolkit that every document pins, even if it is not the default', () => {
    const fx = fixture();
    const A = installUser(fx, release);
    const bDir = join(fx.root, 'b');
    const B = toolkitCopy(bDir, (d) => appendFileSync(join(d, 'browser', 'reader.css'), '\n/*b*/\n'));
    installUser(fx, bDir);
    writeFileSync(join(fx.home, 'default'), A + '\n');
    const { repo } = repoWithDocument(fx, 'repo', B);
    secondDocument(fx, repo, 'b', B);
    writeFileSync(join(repo, 'c.json'), JSON.stringify({ schema: 'visser-collection/1', title: 'C', documents: [{ path: 'docs/a' }, { path: 'docs/b' }] }));
    const r = run(fx, fx.shim, ['export', '--collection', join(repo, 'c.json'), '--format', 'site', '--out', join(fx.root, 'out')], repo);
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(join(fx.root, 'out', '_visser', 'assets', B))).toBe(true);
  });

  it('stops with E_USAGE and names the digests when documents pin different toolkits', () => {
    const fx = fixture();
    const A = installUser(fx, release);
    const bDir = join(fx.root, 'b');
    const B = toolkitCopy(bDir, (d) => appendFileSync(join(d, 'browser', 'reader.css'), '\n/*b*/\n'));
    installUser(fx, bDir);
    const { repo } = repoWithDocument(fx, 'repo', A);
    secondDocument(fx, repo, 'b', B);
    writeFileSync(join(repo, 'c.json'), JSON.stringify({ schema: 'visser-collection/1', title: 'C', documents: [{ path: 'docs/a' }, { path: 'docs/b' }] }));
    const r = run(fx, fx.shim, ['export', '--collection', join(repo, 'c.json'), '--format', 'site', '--out', join(fx.root, 'out')], repo);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('E_USAGE');
    expect(r.stderr).toContain(A);
    expect(r.stderr).toContain(B);
    expect(existsSync(join(fx.root, 'out'))).toBe(false);
  });
});

describe('B3: --doc that names a different document than the positional one', () => {
  it('ids assign A --doc B is refused before any toolkit runs; a matching --doc is fine', () => {
    const fx = fixture();
    const markerA = join(fx.root, 'marker-a.json');
    const markerB = join(fx.root, 'marker-b.json');
    const MA = markerToolkit(join(fx.root, 'ta'), markerA, 0);
    const MB = markerToolkit(join(fx.root, 'tb'), markerB, 0);
    installUser(fx, join(fx.root, 'ta'));
    installUser(fx, join(fx.root, 'tb'));
    const { repo, doc: docA } = repoWithDocument(fx, 'repo', MA);
    const docB = secondDocument(fx, repo, 'b', MB);
    for (const args of [['ids', 'assign', docA, '--doc', docB], ['check', docA, '--doc', docB]]) {
      const r = run(fx, fx.shim, args);
      expect(r.status, args.join(' ')).toBe(2);
      expect(r.stderr).toContain('E_USAGE');
    }
    expect(existsSync(markerA)).toBe(false);
    expect(existsSync(markerB)).toBe(false);
    const same = run(fx, fx.shim, ['check', docA, '--doc', docA]);
    expect(same.status, same.stderr).toBe(0);
    expect(JSON.parse(readFileSync(markerA, 'utf8')).argv[0]).toBe('check');
  });
});

describe('B4 and B5: upgrade version and trust edge cases', () => {
  it('B4: a target version that is not semver is E_SYNTAX (exit 2), with or without --allow-downgrade', () => {
    const fx = fixture();
    const A = installUser(fx, release);
    const bDir = join(fx.root, 'b');
    const B = versioned(bDir, '2026.09', 'b');
    installUser(fx, bDir);
    const { doc } = repoWithDocument(fx, 'repo', A);
    const refused = run(fx, fx.shim, ['upgrade', doc, '--to', B]);
    expect(refused.status, refused.stderr).toBe(2);
    expect(refused.stderr).toContain('E_SYNTAX');
    expect(refused.stderr).not.toContain('internal error');
    // The lock schema accepts only semantic versions, so the flag cannot make this target pinnable.
    const flagged = run(fx, fx.shim, ['upgrade', doc, '--to', B, '--allow-downgrade']);
    expect(flagged.status, flagged.stderr).toBe(2);
    expect(flagged.stderr).toContain('E_SYNTAX');
    expect(flagged.stderr).not.toContain('internal error');
    expect(JSON.parse(readFileSync(join(dirname(doc), 'visser.lock.json'), 'utf8')).toolkit.sha256).toBe(A);
  });

  it('B4: --allow-downgrade skips the comparison when the CURRENT version is not semver', () => {
    const fx = fixture();
    const T = installUser(fx, release);
    const oDir = join(fx.root, 'old');
    const O = versioned(oDir, '2026.09', 'old');
    installUser(fx, oDir);
    const { doc } = repoWithDocument(fx, 'repo', O);
    const refused = run(fx, fx.shim, ['upgrade', doc, '--to', T]);
    expect(refused.status, refused.stderr).toBe(2);
    expect(refused.stderr).toContain('E_SYNTAX');
    const moved = run(fx, fx.shim, ['upgrade', doc, '--to', T, '--allow-downgrade']);
    expect(moved.status, moved.stderr).toBe(0);
    expect(JSON.parse(readFileSync(join(dirname(doc), 'visser.lock.json'), 'utf8')).toolkit.sha256).toBe(T);
  });

  it('B5: --allow-downgrade moves a document off an untrusted current toolkit without trusting it', () => {
    const fx = fixture();
    const T = installUser(fx, release);
    const uDir = join(fx.root, 'u');
    const U = versioned(uDir, '0.0.0', 'u');
    const { repo, doc } = repoWithDocument(fx, 'repo', U);
    mkdirSync(join(repo, '.visser', 'toolchains'), { recursive: true });
    cpSync(uDir, join(repo, '.visser', 'toolchains', U), { recursive: true });
    const refused = run(fx, fx.shim, ['upgrade', doc, '--to', T]);
    expect(refused.status).toBe(4);
    expect(refused.stderr).toContain('--allow-downgrade');
    const moved = run(fx, fx.shim, ['upgrade', doc, '--to', T, '--allow-downgrade']);
    expect(moved.status, moved.stderr).toBe(0);
    expect(JSON.parse(readFileSync(join(dirname(doc), 'visser.lock.json'), 'utf8')).toolkit.sha256).toBe(T);
    const trustPath = join(fx.home, 'trust.json');
    const trust = existsSync(trustPath) ? JSON.parse(readFileSync(trustPath, 'utf8')) : { toolkits: {} };
    expect(trust.toolkits[U]).toBeUndefined();
  });
});
