// `install --from-dir|--archive --scope user|repo` and `trust toolkit`
// (§12.1, §12.2, §12.4, §12.6). Every test uses a temporary EXPLAIN_HOME and
// a release tree built in-test; nothing touches the real ~/.explain.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installRelease, packRelease, readTrust } from '../../packages/core/src/distribution/index.ts';
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
  env = { ...process.env, EXPLAIN_HOME: home };
  release = join(box, 'release');
  digest = makeRelease(release);
});

function archiveOf(dir: string): { path: string; sha256: string } {
  const packed = packRelease(dir);
  const path = join(box, `explain-${packed.version}.tar.gz`);
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
    expect(readFileSync(join(result.path, 'bin/explain.cjs'), 'utf8')).toBe(RELEASE_FILES['bin/explain.cjs']);
    expect(result.shim).toBe(join(home, 'bin', 'explain.cjs'));
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
      { name: 'bin/explain.cjs', type: '2', linkname: '/bin/sh' },
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
    writeFileSync(real, RELEASE_FILES['bin/explain.cjs']!);
    execFileSync('rm', [join(linked, 'bin/explain.cjs')]);
    symlinkSync(real, join(linked, 'bin/explain.cjs'));
    await expect(installRelease({ fromDir: linked, scope: 'user', env })).rejects.toMatchObject({ code: 'E_INTEGRITY', message: expect.stringMatching(/symbolic link/) });
    nothingInstalled();
  });

  it('refuses to replace a corrupt existing installation', async () => {
    const target = join(home, 'toolchains', digest);
    cpSync(release, target, { recursive: true });
    writeFileSync(join(target, 'bin/explain.cjs'), 'tampered');
    await expect(installRelease({ fromDir: release, scope: 'user', env })).rejects.toMatchObject({ code: 'E_INTEGRITY', message: expect.stringMatching(/does not verify/) });
    expect(readFileSync(join(target, 'bin/explain.cjs'), 'utf8')).toBe('tampered');
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
    expect(result.path).toBe(join(repoDir, '.explain', 'toolchains', digest));
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
  const saved = process.env['EXPLAIN_HOME'];
  beforeEach(() => {
    process.env['EXPLAIN_HOME'] = home;
    out = [];
    err = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => { out.push(String(chunk)); return true; });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => { err.push(String(chunk)); return true; });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    if (saved === undefined) delete process.env['EXPLAIN_HOME'];
    else process.env['EXPLAIN_HOME'] = saved;
  });

  it('install --json prints a valid explain-install/1 result and the invocation', async () => {
    expect(await runInstall(parseArgs(['--from-dir', release, '--scope', 'user', '--json']))).toBe(0);
    const result = JSON.parse(out.join(''));
    expect(validateAgainst('install', result)).toEqual({ ok: true });
    expect(result.invocation).toBe(`node ${join(home, 'bin', 'explain.cjs')}`);
    out.length = 0;
    expect(await runInstall(parseArgs(['--from-dir', release, '--scope', 'user']))).toBe(0);
    expect(out.join('')).toMatch(/already installed[\s\S]*PATH and shell startup files were not changed/);
  });

  it('install exit codes: usage 2, missing source 3, integrity 4, --from-release unsupported 3', async () => {
    await expect(runInstall(parseArgs(['--from-dir', release]))).rejects.toMatchObject({ code: 'E_USAGE', exitCode: 2 });
    await expect(runInstall(parseArgs(['--from-dir', release, '--archive', 'x', '--scope', 'user']))).rejects.toMatchObject({ exitCode: 2 });
    expect(await runInstall(parseArgs(['--archive', join(box, 'absent.tar.gz'), '--scope', 'user']))).toBe(3);
    writeFileSync(join(release, 'extra'), 'x');
    expect(await runInstall(parseArgs(['--from-dir', release, '--scope', 'user', '--json']))).toBe(4);
    expect(JSON.parse(out.join('')).diagnostics[0].code).toBe('E_INTEGRITY');
    await expect(runInstall(parseArgs(['--from-release', 'o/r', '--scope', 'user']))).rejects.toMatchObject({ code: 'E_UNSUPPORTED', exitCode: 3 });
  });

  it('trust toolkit adds and revokes a digest, and gates a repository toolchain', async () => {
    const repoDir = repo('repo-t');
    cpSync(release, join(repoDir, '.explain', 'toolchains', digest), { recursive: true });
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
