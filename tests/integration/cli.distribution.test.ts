// Phase 4a end to end (§12, §17.1): install the built release, then run every
// new command through the built CLI and through the installed user shim. Each
// test uses its own EXPLAIN_HOME; nothing touches the real ~/.explain.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { validateAgainst } from '../../packages/core/src/model/schemas.ts';

const root = new URL('../..', import.meta.url).pathname;
const release = join(root, 'dist/release');
const cli = join(release, 'bin/explain.cjs');

function home(): NodeJS.ProcessEnv {
  return { ...process.env, EXPLAIN_HOME: mkdtempSync(join(tmpdir(), 'explain-home-')) };
}
const run = (env: NodeJS.ProcessEnv, entry: string, ...args: string[]) =>
  spawnSync(process.execPath, [entry, ...args], { encoding: 'utf8', env });

beforeAll(() => {
  execFileSync(process.execPath, [join(root, 'scripts/build.mjs')], { cwd: root, stdio: 'pipe' });
}, 60_000);

describe('Phase 4a commands through the built CLI and the user shim', () => {
  it('@R09 install --scope user --default, then the shim runs init, check, skill show, and doctor', () => {
    const env = home();
    const installed = run(env, cli, 'install', '--from-dir', release, '--scope', 'user', '--default', '--json');
    expect(installed.status, installed.stderr).toBe(0);
    const result = JSON.parse(installed.stdout);
    expect(validateAgainst('install', result)).toEqual({ ok: true });
    expect(result.default).toBe(true);
    const shim = join(env.EXPLAIN_HOME!, 'bin/explain.cjs');
    expect(result.shim).toBe(shim);
    expect(readFileSync(join(env.EXPLAIN_HOME!, 'default'), 'utf8').trim()).toBe(result.toolkitSha256);
    const trust = JSON.parse(readFileSync(join(env.EXPLAIN_HOME!, 'trust.json'), 'utf8'));
    expect(Object.keys(trust.toolkits)).toEqual([result.toolkitSha256]);

    // Two repositories share the one user installation.
    for (const name of ['repo-a', 'repo-b']) {
      const repo = mkdtempSync(join(tmpdir(), `explain-${name}-`));
      mkdirSync(join(repo, '.git'));
      const doc = join(repo, 'docs', 'notes');
      const init = run(env, shim, 'init', doc, '--kind', 'teaching', '--title', 'Notes');
      expect(init.status, init.stderr).toBe(0);
      const lock = JSON.parse(readFileSync(join(doc, 'explain.lock.json'), 'utf8'));
      expect(lock.toolkit.sha256).toBe(result.toolkitSha256);
      const check = run(env, shim, 'check', join(doc, 'index.md'), '--release');
      expect(check.status, check.stderr).toBe(0);
    }

    const skill = run(env, shim, 'skill', 'show', '--json');
    expect(skill.status, skill.stderr).toBe(0);
    const skillJson = JSON.parse(skill.stdout);
    expect(validateAgainst('skill', skillJson)).toEqual({ ok: true });
    expect(JSON.stringify(skillJson)).toContain('references/format.md');

    const doctor = run(env, shim, 'doctor', '--json');
    expect([0, 3], doctor.stderr).toContain(doctor.status);
    expect(validateAgainst('doctor', JSON.parse(doctor.stdout))).toEqual({ ok: true });

    // A second install is idempotent.
    const again = run(env, cli, 'install', '--from-dir', release, '--scope', 'user', '--json');
    expect(again.status, again.stderr).toBe(0);
    expect(JSON.parse(again.stdout).alreadyInstalled).toBe(true);
  });

  it('the shim without a default or a document stops with E_TOOLKIT_MISSING and guidance', () => {
    const env = home();
    expect(run(env, cli, 'install', '--from-dir', release, '--scope', 'user').status).toBe(0);
    const result = run(env, join(env.EXPLAIN_HOME!, 'bin/explain.cjs'), 'doctor');
    expect(result.status).toBe(3);
    expect(result.stderr).toContain('E_TOOLKIT_MISSING');
    expect(result.stderr).toContain('--default');
  });

  it('--default needs the user scope', () => {
    const env = home();
    const repo = mkdtempSync(join(tmpdir(), 'explain-repo-'));
    const result = run(env, cli, 'install', '--from-dir', release, '--scope', 'repo', '--root', repo, '--default');
    expect(result.status).toBe(2);
    expect(existsSync(join(env.EXPLAIN_HOME!, 'default'))).toBe(false);
  });

  it('@R09 a repository installation is trusted by install; trust toolkit --revoke marks it untrusted', () => {
    const env = home();
    const repo = mkdtempSync(join(tmpdir(), 'explain-repo-'));
    mkdirSync(join(repo, '.git'));
    const installed = run(env, cli, 'install', '--from-dir', release, '--scope', 'repo', '--root', repo, '--json');
    expect(installed.status, installed.stderr).toBe(0);
    const digest = JSON.parse(installed.stdout).toolkitSha256 as string;
    expect(existsSync(join(repo, '.explain/toolchains', digest, 'release.json'))).toBe(true);

    const revoked = run(env, cli, 'trust', 'toolkit', digest, '--revoke', '--json');
    expect(revoked.status, revoked.stderr).toBe(0);
    expect(validateAgainst('trust', JSON.parse(revoked.stdout))).toEqual({ ok: true });
    expect(JSON.parse(revoked.stdout).trusted).toBe(false);

    // doctor finds the repository from its working directory.
    const doctor = spawnSync(process.execPath, [cli, 'doctor', '--json'], { encoding: 'utf8', env, cwd: repo });
    // An untrusted toolchain that no lock uses is reported, not an error (§12.7).
    expect(doctor.status, doctor.stderr).toBe(0);
    const report = JSON.parse(doctor.stdout);
    expect(validateAgainst('doctor', report)).toEqual({ ok: true });
    expect(JSON.stringify(report)).toMatch(new RegExp(`${digest}[^}]*untrusted|untrusted[^}]*${digest}`));

    const trusted = run(env, cli, 'trust', 'toolkit', digest, '--json');
    expect(trusted.status, trusted.stderr).toBe(0);
    expect(JSON.parse(trusted.stdout).trusted).toBe(true);
  });

  it('release:pack gives the same archive twice, and install --archive accepts it', () => {
    const out = mkdtempSync(join(tmpdir(), 'explain-pack-'));
    const pack = (name: string) => {
      execFileSync(process.execPath, [join(root, 'scripts/release.mjs'), release, join(out, name)], { cwd: root, encoding: 'utf8' });
      return join(out, name);
    };
    const archive = pack('a.tar.gz');
    expect(readFileSync(pack('b.tar.gz')).equals(readFileSync(archive))).toBe(true);
    const env = home();
    const result = run(env, cli, 'install', '--archive', archive, '--scope', 'user', '--json');
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).origin.kind).toBe('archive');
  });
});
