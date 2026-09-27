// §12.4 exact release resolution: the order (--toolkit-dir, trusted repository
// toolchain, user toolchain, running release), the trust gate, no fallback past
// a corrupt higher-priority copy, and "whose code runs" in the CLI.
import { appendFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { addTrust } from '../../packages/core/src/distribution/index.ts';
import { validateAgainst } from '../../packages/core/src/model/schemas.ts';
import { CliError } from '../../packages/cli/src/cli-util.ts';
import { resolveDigest, resolveForDocument } from '../../packages/cli/src/toolkit.ts';
import { cli, digestOf, fixture, installUser, markerToolkit, release, repoWithDocument, run, sentinelToolkit, toolkitCopy } from './resolution.fixtures.ts';

const now = () => new Date('2026-09-27T00:00:00Z');

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof CliError) return `${error.code}/${error.exitCode}`;
    throw error;
  }
  return 'ok';
}

let D: string;
beforeAll(() => {
  expect(existsSync(cli), 'run `npm run build` first').toBe(true);
  D = digestOf(release);
});

describe('resolution order (§12.4)', () => {
  it('prefers --toolkit-dir, then a trusted repository toolchain, then the user toolchain, then the running release', () => {
    const fx = fixture();
    const repo = join(fx.root, 'repo');
    const repoCopy = join(repo, '.explain', 'toolchains', D);
    toolkitCopy(repoCopy);
    const userCopy = join(fx.home, 'toolchains', D);
    toolkitCopy(userCopy);
    const explicit = join(fx.root, 'explicit');
    toolkitCopy(explicit);
    addTrust(D, 'test', fx.env, now);
    const base = { digest: D, repoRoot: repo, ownRelease: release, env: fx.env };

    expect(resolveDigest({ ...base, toolkitDir: explicit })).toMatchObject({ source: 'toolkit-dir', release: { dir: explicit } });
    expect(resolveDigest(base)).toMatchObject({ source: 'repository', release: { dir: repoCopy } });
    expect(resolveDigest({ ...base, repoRoot: undefined })).toMatchObject({ source: 'user', release: { dir: userCopy } });
    expect(resolveDigest({ ...base, repoRoot: undefined, env: { ...fx.env, EXPLAIN_HOME: join(fx.root, 'empty-home') } })).toMatchObject({ source: 'running', release: { dir: release } });
  });

  it('an untrusted repository toolchain is E_TOOLKIT_UNTRUSTED (exit 4), even when a user copy exists', () => {
    const fx = fixture();
    const repo = join(fx.root, 'repo');
    toolkitCopy(join(repo, '.explain', 'toolchains', D));
    installUser(fx, release);
    expect(codeOf(() => resolveDigest({ digest: D, repoRoot: repo, env: fx.env }))).toBe('E_TOOLKIT_UNTRUSTED/4');
  });

  it('a committed .explain/trust.json in the repository has no effect', () => {
    const fx = fixture();
    const repo = join(fx.root, 'repo');
    toolkitCopy(join(repo, '.explain', 'toolchains', D));
    writeFileSync(join(repo, '.explain', 'trust.json'), JSON.stringify({ schema: 'explain-trust-store/1', toolkits: { [D]: { source: 'repo', addedAt: '2026-09-27T00:00:00Z' } } }));
    expect(codeOf(() => resolveDigest({ digest: D, repoRoot: repo, env: fx.env }))).toBe('E_TOOLKIT_UNTRUSTED/4');
  });

  it('a corrupt higher-priority copy is E_INTEGRITY; the search never falls back to a valid lower copy', () => {
    const fx = fixture();
    const repo = join(fx.root, 'repo');
    const repoCopy = join(repo, '.explain', 'toolchains', D);
    toolkitCopy(repoCopy);
    appendFileSync(join(repoCopy, 'browser', 'reader.css'), '/* tampered */\n');
    installUser(fx, release);
    addTrust(D, 'test', fx.env, now);
    expect(codeOf(() => resolveDigest({ digest: D, repoRoot: repo, ownRelease: release, env: fx.env }))).toBe('E_INTEGRITY/4');

    // A corrupt user copy does not fall back to the running release either.
    appendFileSync(join(fx.home, 'toolchains', D, 'browser', 'reader.css'), '/* tampered */\n');
    expect(codeOf(() => resolveDigest({ digest: D, ownRelease: release, env: fx.env }))).toBe('E_INTEGRITY/4');
  });

  it('an extra unlisted file or a re-signed tree under the wrong digest name is E_INTEGRITY', () => {
    const fx = fixture();
    const extra = join(fx.home, 'toolchains', D);
    toolkitCopy(extra);
    writeFileSync(join(extra, 'workers', 'evil.cjs'), 'process.exit(9)\n');
    expect(codeOf(() => resolveDigest({ digest: D, env: fx.env }))).toBe('E_INTEGRITY/4');

    const fx2 = fixture();
    const renamed = join(fx2.home, 'toolchains', D);
    sentinelToolkit(renamed, join(fx2.root, 'sentinel'));
    expect(codeOf(() => resolveDigest({ digest: D, env: fx2.env }))).toBe('E_INTEGRITY/4');
  });

  it('a symlinked user toolchain is E_INTEGRITY', () => {
    const fx = fixture();
    mkdirSync(join(fx.home, 'toolchains'), { recursive: true });
    symlinkSync(release, join(fx.home, 'toolchains', D));
    expect(codeOf(() => resolveDigest({ digest: D, env: fx.env }))).toBe('E_INTEGRITY/4');
  });

  it('an absent digest is E_TOOLKIT_MISSING (exit 3) with an install hint', () => {
    const fx = fixture();
    try {
      resolveDigest({ digest: 'f'.repeat(64), env: fx.env, origin: { kind: 'local-dir' } });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).code).toBe('E_TOOLKIT_MISSING');
      expect((error as CliError).exitCode).toBe(3);
      expect((error as CliError).message).toContain('explain install --from-dir');
    }
  });

  it('@R09 two repositories that pin one digest resolve to one user installation', () => {
    const fx = fixture();
    const digest = installUser(fx, release);
    const a = repoWithDocument(fx, 'repo-a', digest);
    const b = repoWithDocument(fx, 'repo-b', digest);
    const env = { env: fx.env, ownRelease: undefined };
    const ra = resolveForDocument(join(a.doc, '..'), undefined, undefined, env);
    const rb = resolveForDocument(join(b.doc, '..'), undefined, undefined, env);
    expect(ra.source).toBe('user');
    expect(ra.release.dir).toBe(join(fx.home, 'toolchains', digest));
    expect(rb.release.dir).toBe(ra.release.dir);

    // Both build through the user shim with the one installed toolkit.
    for (const { doc, repo } of [a, b]) {
      const r = run(fx, fx.shim, ['build', doc]);
      expect(r.status, r.stderr).toBe(0);
      expect(readdirSync(join(repo, '.explain', 'output', '_explain', 'assets'))).toEqual([digest]);
    }
    expect(readdirSync(join(fx.home, 'toolchains'))).toEqual([digest]);
  });

  it('@R09 a trusted repository installation is used for that repository only', () => {
    const fx = fixture();
    const a = repoWithDocument(fx, 'repo-a', D);
    toolkitCopy(join(a.repo, '.explain', 'toolchains', D));
    addTrust(D, 'test', fx.env, now);
    expect(resolveForDocument(join(a.doc, '..'), undefined, undefined, { env: fx.env, ownRelease: undefined }).source).toBe('repository');
    const b = repoWithDocument(fx, 'repo-b', D);
    expect(codeOf(() => resolveForDocument(join(b.doc, '..'), undefined, undefined, { env: fx.env, ownRelease: undefined }))).toBe('E_TOOLKIT_MISSING/3');
  });
});

describe('whose code runs (§12.4)', () => {
  it('build with an untrusted repository toolchain that writes a sentinel: E_TOOLKIT_UNTRUSTED, no sentinel', () => {
    const fx = fixture();
    const sentinel = join(fx.root, 'sentinel');
    const probe = join(fx.root, 'probe');
    const S = sentinelToolkit(probe, sentinel);
    const { repo, doc } = repoWithDocument(fx, 'repo', S);
    cpSync(probe, join(repo, '.explain', 'toolchains', S), { recursive: true });

    const direct = run(fx, cli, ['build', doc]);
    expect(direct.status, direct.stderr).toBe(4);
    expect(direct.stderr).toContain('E_TOOLKIT_UNTRUSTED');
    const viaShim = run(fx, fx.shim, ['build', doc]);
    expect(viaShim.status, viaShim.stderr).toBe(4);
    expect(viaShim.stderr).toContain('E_TOOLKIT_UNTRUSTED');
    const serve = run(fx, fx.shim, ['serve', doc, '--port', '0']);
    expect(serve.status).toBe(4);
    expect(existsSync(sentinel)).toBe(false);
  });

  it('a release CLI does not run a different toolkit\'s workers: it stops and points to the user shim', () => {
    const fx = fixture();
    const sentinel = join(fx.root, 'sentinel');
    const probe = join(fx.root, 'probe');
    const S = sentinelToolkit(probe, sentinel);
    installUser(fx, probe);
    const { doc } = repoWithDocument(fx, 'repo', S);
    const r = run(fx, cli, ['build', doc]);
    expect(r.status, r.stderr).toBe(3);
    expect(r.stderr).toContain('E_TOOLKIT_MISSING');
    expect(r.stderr).toContain('user shim');
    expect(existsSync(sentinel)).toBe(false);
  });

  it('--dev-toolkit marks build.json development: true; a locked build gets its own build ID and never replaces the development snapshot', () => {
    const fx = fixture();
    const { repo, doc } = repoWithDocument(fx, 'repo', 'e'.repeat(64));
    const dev = run(fx, cli, ['build', doc, '--dev-toolkit', release]);
    expect(dev.status, dev.stderr).toBe(0);
    expect(dev.stderr).toContain('W_DEV_TOOLKIT');
    const docs = join(repo, '.explain', 'output', 'd');
    const builds = () => {
      const [docId] = readdirSync(docs);
      const [rev] = readdirSync(join(docs, docId!));
      const dir = join(docs, docId!, rev!);
      return readdirSync(dir).map((id) => ({ id, path: join(dir, id, 'build.json'), json: JSON.parse(readFileSync(join(dir, id, 'build.json'), 'utf8')) }));
    };
    const [devBuild] = builds();
    expect(devBuild!.json.development).toBe(true);
    expect(validateAgainst('build', devBuild!.json)).toEqual({ ok: true });
    const devBytes = readFileSync(devBuild!.path);

    // Pin the lock to the toolkit that built it: same source and toolkit, but
    // the development mark is part of the build ID, so a second folder appears.
    const lockPath = join(doc, '..', 'explain.lock.json');
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    lock.toolkit.sha256 = D;
    writeFileSync(lockPath, JSON.stringify(lock));
    const locked = run(fx, cli, ['build', doc]);
    expect(locked.status, locked.stderr).toBe(0);
    const all = builds();
    expect(all).toHaveLength(2);
    const lockedBuild = all.find((b) => b.id !== devBuild!.id)!;
    expect(lockedBuild.json.development).toBeUndefined();
    expect(lockedBuild.json.buildId).not.toBe(devBuild!.json.buildId);
    // The development snapshot is untouched.
    expect(readFileSync(devBuild!.path).equals(devBytes)).toBe(true);
  });

  it('--dev-toolkit with a toolkit other than the running CLI is refused (E_USAGE)', () => {
    const fx = fixture();
    const other = join(fx.root, 'other');
    markerToolkit(other, join(fx.root, 'marker'), 0);
    const { doc } = repoWithDocument(fx, 'repo', D);
    const r = run(fx, cli, ['build', doc, '--dev-toolkit', other]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('E_USAGE');
    expect(existsSync(join(fx.root, 'marker'))).toBe(false);
  });
});

describe('check --release (§12.4, §17.1)', () => {
  it('passes for a satisfied lock, refuses --dev-toolkit, and fails for a missing or unsatisfied lock', () => {
    const fx = fixture();
    const { doc } = repoWithDocument(fx, 'repo', D);
    const ok = run(fx, cli, ['check', '--release', doc]);
    expect(ok.status, ok.stderr).toBe(0);

    const dev = run(fx, cli, ['check', doc, '--release', '--dev-toolkit', release, '--json']);
    expect(dev.status).toBe(2);
    expect(JSON.parse(dev.stdout).diagnostics[0].code).toBe('E_USAGE');

    const plain = run(fx, cli, ['check', doc, '--dev-toolkit', release]);
    expect(plain.status, 'plain check ignores the toolkit').toBe(0);

    const lockPath = join(doc, '..', 'explain.lock.json');
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    lock.toolkit.sha256 = 'e'.repeat(64);
    writeFileSync(lockPath, JSON.stringify(lock));
    const unsatisfied = run(fx, cli, ['check', '--release', doc]);
    expect(unsatisfied.status).toBe(3);
    expect(unsatisfied.stderr).toContain('E_TOOLKIT_MISSING');
    expect(run(fx, cli, ['check', doc]).status, 'without --release the lock is not checked').toBe(0);
  });
});
