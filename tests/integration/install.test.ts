// `install --from-dir|--archive --scope user|repo` and `trust toolkit`
// (§12.1, §12.2, §12.4, §12.6). Every test uses a temporary VISSER_HOME and
// a release tree built in-test; nothing touches the real ~/.visser.
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addTrust, installRelease, packRelease, readTrust, revokeTrust } from '../../packages/core/src/distribution/index.ts';
import { TRUST_LOCK_WAIT_MS } from '../../packages/core/src/distribution/trust.ts';
import { gzipFixed, tarBytes } from '../../packages/core/src/distribution/ustar.ts';
import { validateAgainst } from '../../packages/core/src/model/schemas.ts';
import { parseArgs } from '../../packages/cli/src/cli-util.ts';
import { runInstall } from '../../packages/cli/src/commands/install.ts';
import { runTrust } from '../../packages/cli/src/commands/trust.ts';
import { resolveDigest } from '../../packages/cli/src/toolkit.ts';
import { makeRelease, RELEASE_FILES, tempDir } from './install.fixtures.ts';

const root = new URL('../..', import.meta.url).pathname;

let box: string;
let home: string;
let env: NodeJS.ProcessEnv;
let release: string;
let digest: string;

beforeEach(() => {
  box = tempDir();
  home = join(box, 'home');
  env = { ...process.env, VISSER_HOME: home };
  release = join(box, 'release');
  digest = makeRelease(release);
});

function archiveOf(dir: string): { path: string; sha256: string } {
  const packed = packRelease(dir);
  const path = join(box, `visser-${packed.version}.tar.gz`);
  writeFileSync(path, packed.bytes);
  return { path, sha256: packed.archiveSha256 };
}

function repo(name: string): string {
  const dir = join(box, name);
  mkdirSync(join(dir, '.git'), { recursive: true });
  return dir;
}

/** Nothing was installed or trusted: no toolchain, no staging directory, no trust entry. */
function nothingInstalled(base = join(home, 'toolchains')): void {
  expect(existsSync(base) ? readdirSync(base) : []).toEqual([]);
  expect(existsSync(join(home, 'trust.json')) ? Object.keys(readTrust(env).toolkits) : []).toEqual([]);
}

describe('install --from-dir and --archive (§12.1, §12.2) @R09', () => {
  it('installs from a directory into user scope, trusts the digest, and installs the user shim', async () => {
    const result = await installRelease({ fromDir: release, scope: 'user', env });
    expect(validateAgainst('install', result)).toEqual({ ok: true });
    expect(result).toMatchObject({ scope: 'user', toolkitSha256: digest, origin: { kind: 'local-dir' }, alreadyInstalled: false, trusted: true });
    expect(result.path).toBe(join(home, 'toolchains', digest));
    expect(readFileSync(join(result.path, 'bin/visser.cjs'), 'utf8')).toBe(RELEASE_FILES['bin/visser.cjs']);
    expect(result.shim).toBe(join(home, 'bin', 'visser.cjs'));
    expect(readFileSync(result.shim!, 'utf8')).toBe(RELEASE_FILES['bin/shim.cjs']);
    expect(readTrust(env).toolkits[digest]?.source).toContain('install --from-dir');
    expect(readdirSync(join(home, 'toolchains'))).toEqual([digest]); // no staging left behind
  });

  it('installs from an archive, checks the expected archive digest, and is idempotent', async () => {
    const archive = archiveOf(release);
    const first = await installRelease({ archive: archive.path, archiveSha256: archive.sha256, scope: 'user', env });
    expect(first).toMatchObject({ toolkitSha256: digest, archiveSha256: archive.sha256, origin: { kind: 'archive', archiveSha256: archive.sha256 }, alreadyInstalled: false });
    const again = await installRelease({ archive: archive.path, scope: 'user', env });
    expect(again.alreadyInstalled).toBe(true);
    expect(readdirSync(join(home, 'toolchains'))).toEqual([digest]);
  });

  it('refuses an archive whose digest does not match --sha256 before extracting anything', async () => {
    const archive = archiveOf(release);
    await expect(installRelease({ archive: archive.path, archiveSha256: 'f'.repeat(64), scope: 'user', env }))
      .rejects.toMatchObject({ code: 'E_INTEGRITY', message: expect.stringMatching(/nothing was extracted/) });
    nothingInstalled();
  });

  it('rejects a hostile archive as a whole and leaves no staging directory @R10', async () => {
    const hostile = join(box, 'hostile.tar.gz');
    writeFileSync(hostile, gzipFixed(tarBytes([
      { name: 'release.json', data: readFileSync(join(release, 'release.json')) },
      { name: 'bin/visser.cjs', type: '2', linkname: '/bin/sh' },
    ])));
    await expect(installRelease({ archive: hostile, scope: 'user', env })).rejects.toMatchObject({ code: 'E_INTEGRITY' });
    nothingInstalled();
  });

  it('rejects an archive whose files do not equal its manifest', async () => {
    const extra = join(box, 'extra.tar.gz');
    const files = Object.entries(RELEASE_FILES).map(([name, text]) => ({ name, data: new TextEncoder().encode(text) }));
    writeFileSync(extra, gzipFixed(tarBytes([
      { name: 'release.json', data: readFileSync(join(release, 'release.json')) },
      ...files,
      { name: 'workers/evil.cjs', data: new TextEncoder().encode('evil') },
    ])));
    await expect(installRelease({ archive: extra, scope: 'user', env })).rejects.toMatchObject({ code: 'E_INTEGRITY', message: expect.stringMatching(/workers\/evil\.cjs is not listed/) });
    nothingInstalled();
  });

  it('refuses a --from-dir source with an extra file or a symlinked file', async () => {
    writeFileSync(join(release, 'workers/evil.cjs'), 'evil');
    await expect(installRelease({ fromDir: release, scope: 'user', env })).rejects.toMatchObject({ code: 'E_INTEGRITY', message: expect.stringMatching(/not listed/) });
    nothingInstalled();

    const linked = join(box, 'linked');
    makeRelease(linked);
    const real = join(box, 'real-cli.cjs');
    writeFileSync(real, RELEASE_FILES['bin/visser.cjs']!);
    execFileSync('rm', [join(linked, 'bin/visser.cjs')]);
    symlinkSync(real, join(linked, 'bin/visser.cjs'));
    await expect(installRelease({ fromDir: linked, scope: 'user', env })).rejects.toMatchObject({ code: 'E_INTEGRITY', message: expect.stringMatching(/symbolic link/) });
    nothingInstalled();
  });

  it('refuses to replace a corrupt existing installation', async () => {
    const target = join(home, 'toolchains', digest);
    cpSync(release, target, { recursive: true });
    writeFileSync(join(target, 'bin/visser.cjs'), 'tampered');
    await expect(installRelease({ fromDir: release, scope: 'user', env })).rejects.toMatchObject({ code: 'E_INTEGRITY', message: expect.stringMatching(/does not verify/) });
    expect(readFileSync(join(target, 'bin/visser.cjs'), 'utf8')).toBe('tampered');
    expect(readdirSync(join(home, 'toolchains'))).toEqual([digest]);
  });

  it('does not rename over a claim that another writer filled', async () => {
    await expect(installRelease({
      fromDir: release, scope: 'user', env,
      afterClaim: (target) => writeFileSync(join(target, 'intruder'), 'x'),
    })).rejects.toMatchObject({ code: 'E_WRITE_CONFLICT' });
    expect(readdirSync(join(home, 'toolchains', digest))).toEqual(['intruder']);
    expect(readdirSync(join(home, 'toolchains')).filter((n) => n.startsWith('.staging'))).toEqual([]);
  });

  it('installs into repository scope without a user shim, and records trust', async () => {
    const repoDir = repo('repo-c');
    const result = await installRelease({ archive: archiveOf(release).path, scope: 'repo', repoRoot: repoDir, env });
    expect(result.path).toBe(join(repoDir, '.visser', 'toolchains', digest));
    expect(result.shim).toBeUndefined();
    expect(existsSync(join(home, 'bin'))).toBe(false);
    expect(Object.keys(readTrust(env).toolkits)).toEqual([digest]);
    expect(resolveDigest({ digest, repoRoot: repoDir, env }).source).toBe('repository');
  });

  it('R09: two repositories share one user installation of the same toolkit', async () => {
    await installRelease({ archive: archiveOf(release).path, scope: 'user', env });
    const a = resolveDigest({ digest, repoRoot: repo('repo-a'), env });
    const b = resolveDigest({ digest, repoRoot: repo('repo-b'), env });
    expect(a.source).toBe('user');
    expect(b.source).toBe('user');
    expect(a.release.dir).toBe(join(home, 'toolchains', digest));
    expect(b.release.dir).toBe(a.release.dir);
    expect(readdirSync(join(home, 'toolchains'))).toEqual([digest]);
  });

  it('refuses a symlinked toolchains directory', async () => {
    mkdirSync(home, { recursive: true });
    mkdirSync(join(box, 'elsewhere'));
    symlinkSync(join(box, 'elsewhere'), join(home, 'toolchains'));
    await expect(installRelease({ fromDir: release, scope: 'user', env })).rejects.toMatchObject({ code: 'E_INTEGRITY', message: expect.stringMatching(/symbolic link/) });
    expect(readdirSync(join(box, 'elsewhere'))).toEqual([]);
  });
});

describe('the install and trust commands', () => {
  let out: string[];
  let err: string[];
  const saved = process.env['VISSER_HOME'];
  beforeEach(() => {
    process.env['VISSER_HOME'] = home;
    out = [];
    err = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => { out.push(String(chunk)); return true; });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => { err.push(String(chunk)); return true; });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    if (saved === undefined) delete process.env['VISSER_HOME'];
    else process.env['VISSER_HOME'] = saved;
  });

  it('install --json prints a valid visser-install/1 result and the invocation', async () => {
    expect(await runInstall(parseArgs(['--from-dir', release, '--scope', 'user', '--json']))).toBe(0);
    const result = JSON.parse(out.join(''));
    expect(validateAgainst('install', result)).toEqual({ ok: true });
    expect(result.invocation).toBe(`node ${join(home, 'bin', 'visser.cjs')}`);
    out.length = 0;
    expect(await runInstall(parseArgs(['--from-dir', release, '--scope', 'user']))).toBe(0);
    expect(out.join('')).toMatch(/already installed[\s\S]*PATH and shell startup files were not changed/);
  });

  it('install exit codes: usage 2, missing source 3, integrity 4', async () => {
    await expect(runInstall(parseArgs(['--from-dir', release]))).rejects.toMatchObject({ code: 'E_USAGE', exitCode: 2 });
    await expect(runInstall(parseArgs(['--from-dir', release, '--archive', 'x', '--scope', 'user']))).rejects.toMatchObject({ exitCode: 2 });
    expect(await runInstall(parseArgs(['--archive', join(box, 'absent.tar.gz'), '--scope', 'user']))).toBe(3);
    writeFileSync(join(release, 'extra'), 'x');
    expect(await runInstall(parseArgs(['--from-dir', release, '--scope', 'user', '--json']))).toBe(4);
    expect(JSON.parse(out.join('')).diagnostics[0].code).toBe('E_INTEGRITY');
    // --from-release needs --version and --sha256 (install.release.test.ts covers the download).
    await expect(runInstall(parseArgs(['--from-release', 'o/r', '--scope', 'user']))).rejects.toMatchObject({ code: 'E_USAGE', exitCode: 2 });
  });

  it('trust toolkit adds and revokes a digest, and gates a repository toolchain', async () => {
    const repoDir = repo('repo-t');
    cpSync(release, join(repoDir, '.visser', 'toolchains', digest), { recursive: true });
    expect(() => resolveDigest({ digest, repoRoot: repoDir, env })).toThrow(expect.objectContaining({ code: 'E_TOOLKIT_UNTRUSTED' }));

    expect(await runTrust(parseArgs(['toolkit', digest, '--json']))).toBe(0);
    const added = JSON.parse(out.join(''));
    expect(validateAgainst('trust', added)).toEqual({ ok: true });
    expect(added).toMatchObject({ digest, trusted: true, changed: true, source: 'trust toolkit' });
    expect(resolveDigest({ digest, repoRoot: repoDir, env }).source).toBe('repository');

    out.length = 0;
    expect(await runTrust(parseArgs(['toolkit', digest, '--json']))).toBe(0);
    expect(JSON.parse(out.join(''))).toMatchObject({ trusted: true, changed: false });

    out.length = 0;
    expect(await runTrust(parseArgs(['toolkit', digest, '--revoke', '--json']))).toBe(0);
    expect(JSON.parse(out.join(''))).toMatchObject({ trusted: false, changed: true });
    expect(() => resolveDigest({ digest, repoRoot: repoDir, env })).toThrow(expect.objectContaining({ code: 'E_TOOLKIT_UNTRUSTED' }));

    await expect(runTrust(parseArgs(['toolkit', 'HEAD']))).rejects.toMatchObject({ code: 'E_USAGE', exitCode: 2 });
    await expect(runTrust(parseArgs(['extension', digest]))).rejects.toMatchObject({ code: 'E_USAGE' });
  });
});

describe('release:pack (§12.1)', () => {
  it('writes the same archive bytes on two runs, and the strict installer accepts it', async () => {
    const one = join(box, 'one.tar.gz');
    const two = join(box, 'two.tar.gz');
    const run = (out: string) => execFileSync(process.execPath, [join(root, 'scripts/release.mjs'), release, out], { encoding: 'utf8' });
    const log = run(one);
    run(two);
    expect(readFileSync(one).equals(readFileSync(two))).toBe(true);
    expect(log).toContain(`toolkit sha256: ${digest}`);
    const archiveSha256 = /archive sha256: ([0-9a-f]{64})/.exec(log)![1]!;
    const result = await installRelease({ archive: one, archiveSha256, scope: 'user', env });
    expect(result.toolkitSha256).toBe(digest);
  });

  it('refuses to pack a release tree with an unlisted file', () => {
    writeFileSync(join(release, 'workers/evil.cjs'), 'evil');
    expect(() => packRelease(release)).toThrow(expect.objectContaining({ code: 'E_INTEGRITY' }));
  });
});

describe('install and trust: review fixes (§12.4, §12.7)', () => {
  const worker = join(root, 'tests/integration/trust-race.worker.mjs');
  const spawnWorker = (...args: string[]) => new Promise<number | null>((resolve) => {
    const child = spawn(process.execPath, [worker, ...args], { stdio: 'inherit' });
    child.on('exit', resolve);
  });

  it('@R09 parallel writers keep every trust entry (no lost update)', async () => {
    const codes = await Promise.all([spawnWorker('add', home, '60'), spawnWorker('add', home, '60'), spawnWorker('add', home, '60')]);
    expect(codes).toEqual([0, 0, 0]);
    expect(Object.keys(readTrust(env).toolkits)).toHaveLength(180);
    expect(existsSync(join(home, 'trust.json.lock'))).toBe(false);
  }, 60_000);

  it('@R09 a revocation is never undone by a concurrent install (adds never re-add a revoked digest)', async () => {
    const X = 'f'.repeat(64);
    // The race is timing-dependent on the unlocked code, so run it three times.
    for (let round = 0; round < 3; round++) {
      const roundHome = join(box, `race-${round}`);
      const roundEnv = { ...env, VISSER_HOME: roundHome };
      addTrust(X, 'test', roundEnv);
      const codes = await Promise.all([spawnWorker('add', roundHome, '150'), spawnWorker('revoke', roundHome, '1'), spawnWorker('add', roundHome, '150')]);
      expect(codes).toEqual([0, 0, 0]);
      expect(Object.hasOwn(readTrust(roundEnv).toolkits, X), `round ${round}`).toBe(false);
      expect(Object.keys(readTrust(roundEnv).toolkits)).toHaveLength(300);
    }
  }, 120_000);

  it('a held trust-store lock is never taken over: the writer stops with E_WRITE_CONFLICT and names the holder', () => {
    mkdirSync(home, { recursive: true });
    writeFileSync(join(home, 'trust.json.lock'), JSON.stringify({ pid: 999999, token: 'held' }) + '\n');
    const started = Date.now();
    expect(() => addTrust('a'.repeat(64), 'test', env)).toThrow(/trust store is locked by another writer.*999999/);
    expect(Date.now() - started).toBeGreaterThanOrEqual(TRUST_LOCK_WAIT_MS - 100);
    expect(readFileSync(join(home, 'trust.json.lock'), 'utf8')).toContain('held');
  }, 20_000);

  it('@R09 a user-scope release without bin/shim.cjs, and no user shim, fails before activation or trust', async () => {
    const noShim = join(box, 'noshim');
    const files = { ...RELEASE_FILES };
    delete files['bin/shim.cjs'];
    makeRelease(noShim, files, '0.0.2');
    await expect(installRelease({ fromDir: noShim, scope: 'user', env })).rejects.toMatchObject({ code: 'E_INTEGRITY', message: expect.stringMatching(/no bin\/shim\.cjs.*Nothing was installed/) });
    nothingInstalled();
  });

  it('@R09 a release without bin/shim.cjs installs next to an existing user shim and keeps it', async () => {
    await installRelease({ fromDir: release, scope: 'user', env });
    const noShim = join(box, 'noshim');
    const files = { ...RELEASE_FILES };
    delete files['bin/shim.cjs'];
    const old = makeRelease(noShim, files, '0.0.2');
    const result = await installRelease({ fromDir: noShim, scope: 'user', env });
    expect(result.toolkitSha256).toBe(old);
    expect(result.shimReplaced).toBe(false);
    expect(result.shim).toBeUndefined();
    expect(readFileSync(join(home, 'bin', 'visser.cjs'), 'utf8')).toBe(RELEASE_FILES['bin/shim.cjs']);
    expect(validateAgainst('install', result)).toEqual({ ok: true });
  });

  it('@R09 installing another release keeps the user shim unless --default is given', async () => {
    const first = await installRelease({ fromDir: release, scope: 'user', env });
    expect(first.shimReplaced).toBe(true);
    const older = join(box, 'older');
    makeRelease(older, { ...RELEASE_FILES, 'bin/shim.cjs': '// shim 0.0.0\n' }, '0.0.0');
    const kept = await installRelease({ fromDir: older, scope: 'user', env });
    expect(kept.shimReplaced).toBe(false);
    expect(readFileSync(join(home, 'bin', 'visser.cjs'), 'utf8')).toBe(RELEASE_FILES['bin/shim.cjs']);
    const chosen = await installRelease({ fromDir: older, scope: 'user', env, setDefault: true });
    expect(chosen.shimReplaced).toBe(true);
    expect(readFileSync(join(home, 'bin', 'visser.cjs'), 'utf8')).toBe('// shim 0.0.0\n');
  });
});
