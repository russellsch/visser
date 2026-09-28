// Fixes for docs/validation/install-pressure-1.md (M1–M7, m1–m8). Every test
// sets HOME and VISSER_HOME explicitly under a temporary folder, so no test can
// reach the real ~/.visser. m9 (HOME unset) is covered at the unit level only.
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { packRelease } from '../../packages/core/src/distribution/pack.ts';
import { validateAgainst } from '../../packages/core/src/model/schemas.ts';
import { cli, digestOf, fixture, type Fixture, installUser, release, repoWithDocument, run, toolkitCopy } from './resolution.fixtures.ts';

const RELEASE = digestOf(release);

function withDefault(fx: Fixture, from = release): string {
  const digest = installUser(fx, from);
  writeFileSync(join(fx.home, 'default'), `${digest}\n`);
  return digest;
}

function portOpen(port: number): Promise<boolean> {
  return new Promise((done) => {
    const socket = connect(port, '127.0.0.1');
    socket.once('connect', () => { socket.destroy(); done(true); });
    socket.once('error', () => done(false));
  });
}

describe('install pressure fixes (install-pressure-1)', () => {
  it('M1: SIGTERM to the shim PID stops `serve` and frees the port', async () => {
    const fx = fixture();
    withDefault(fx);
    const { doc } = repoWithDocument(fx, 'repo', RELEASE);
    const child = spawn(process.execPath, [fx.shim, 'serve', doc, '--port', '0'], { env: fx.env, cwd: fx.root, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const port = await new Promise<number>((resolveUrl, reject) => {
      const timer = setTimeout(() => reject(new Error(`serve did not start: ${out}`)), 60_000);
      child.stdout.on('data', (chunk: Buffer) => {
        out += chunk.toString();
        const m = /http:\/\/127\.0\.0\.1:(\d+)\//.exec(out);
        if (m) { clearTimeout(timer); resolveUrl(Number(m[1])); }
      });
      child.stderr.on('data', (chunk: Buffer) => { out += chunk.toString(); });
    });
    expect(await portOpen(port)).toBe(true);
    const exited = new Promise<void>((done) => child.once('exit', () => done()));
    child.kill('SIGTERM');
    await exited;
    let open = true;
    try {
      for (let i = 0; i < 30 && open; i++) {
        open = await portOpen(port);
        if (open) await new Promise((r) => setTimeout(r, 100));
      }
    } finally {
      // Never leave a server behind, whatever the result.
      spawnSync('pkill', ['-f', doc]);
    }
    expect(open, 'the toolkit process still serves after the shim was stopped').toBe(false);
  }, 90_000);

  it('M2: with the default toolchain deleted, `install --from-dir` through the shim still works', () => {
    const fx = fixture();
    const digest = withDefault(fx);
    rmSync(join(fx.home, 'toolchains', digest), { recursive: true });
    const r = run(fx, fx.shim, ['install', '--from-dir', release, '--scope', 'user', '--default']);
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(join(fx.home, 'toolchains', digest, 'release.json'))).toBe(true);
  });

  it('M2: other user commands name a recovery command that works', () => {
    const fx = fixture();
    const digest = withDefault(fx);
    rmSync(join(fx.home, 'toolchains', digest), { recursive: true });
    const other = join(fx.root, 'other');
    const D2 = toolkitCopy(other, (dir) => writeFileSync(join(dir, 'browser', 'reader.css'), readFileSync(join(dir, 'browser', 'reader.css'), 'utf8') + '\n/* other */\n'));
    installUser(fx, other);
    const r = run(fx, fx.shim, ['doctor']);
    expect(r.status).toBe(3);
    const entry = join(fx.home, 'toolchains', D2, 'bin', 'visser.cjs');
    expect(r.stderr).toContain(`node ${entry} install --from-dir ${join(fx.home, 'toolchains', D2)} --scope user --default`);
    const fix = run(fx, entry, ['install', '--from-dir', join(fx.home, 'toolchains', D2), '--scope', 'user', '--default']);
    expect(fix.status, fix.stderr).toBe(0);
    const after = run(fx, fx.shim, ['doctor']);
    expect(after.stderr).not.toContain('E_TOOLKIT_MISSING');
  });

  it('M3: `doctor --doc` through the shim reports an untrusted repository copy instead of stopping', () => {
    const fx = fixture();
    withDefault(fx);
    const other = join(fx.root, 'repo-copy');
    const U = toolkitCopy(other, (dir) => writeFileSync(join(dir, 'browser', 'reader.css'), '/* u */\n'));
    const { repo, doc } = repoWithDocument(fx, 'repo', U);
    toolkitCopy(join(repo, '.visser', 'toolchains', U), (dir) => writeFileSync(join(dir, 'browser', 'reader.css'), '/* u */\n'));
    const r = run(fx, fx.shim, ['doctor', '--doc', doc, '--json']);
    const report = JSON.parse(r.stdout) as { schema: string; document?: { resolution: { code?: string; message?: string } } };
    expect(report.schema).toBe('visser-doctor/1');
    expect(validateAgainst('doctor', report)).toEqual({ ok: true });
    expect(report.document?.resolution.code).toBe('E_TOOLKIT_UNTRUSTED');
    expect(report.document?.resolution.message).toContain(`visser trust toolkit ${U}`);
  });

  it('M4: ~/.visser does not make HOME a repository; the build never writes into the user store', () => {
    const fx = fixture();
    const env = { ...fx.env, VISSER_HOME: join(fx.userHome, '.visser') };
    const inst = spawnSync(process.execPath, [cli, 'install', '--from-dir', release, '--scope', 'user', '--default'], { encoding: 'utf8', env, cwd: fx.root });
    expect(inst.status, inst.stderr).toBe(0);
    const shim = join(fx.userHome, '.visser', 'bin', 'visser.cjs');
    const notes = join(fx.userHome, 'notes');
    mkdirSync(notes, { recursive: true });
    const init = spawnSync(process.execPath, [shim, 'init', 'docs/explanations/q', '--kind', 'plan', '--title', 'Q'], { encoding: 'utf8', env, cwd: notes });
    expect(init.status, init.stderr).toBe(0);
    const build = spawnSync(process.execPath, [shim, 'build', 'docs/explanations/q/index.md'], { encoding: 'utf8', env, cwd: notes });
    expect(build.status, build.stderr).toBe(0);
    expect(existsSync(join(fx.userHome, '.visser', 'output'))).toBe(false);
    expect(build.stdout).toMatch(/no repository/);
  });

  it('M6: a relative VISSER_HOME is refused with E_USAGE', () => {
    const fx = fixture();
    const r = spawnSync(process.execPath, [cli, 'install', '--from-dir', release, '--scope', 'user'], { encoding: 'utf8', env: { ...fx.env, VISSER_HOME: 'relhome/.visser' }, cwd: fx.root });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('E_USAGE');
    expect(r.stderr).toContain('absolute');
    expect(existsSync(join(fx.root, 'relhome'))).toBe(false);
  });

  it('M7: install removes leftovers of interrupted installs; doctor reports a leftover without failing', () => {
    const fx = fixture();
    withDefault(fx);
    const toolchains = join(fx.home, 'toolchains');
    const dead = join(toolchains, '.staging-99999999-0123456789abcdef');
    const old = join(toolchains, '.staging-0123456789abcdef');
    mkdirSync(dead);
    mkdirSync(old);
    const past = new Date(Date.now() - 2 * 3600_000);
    utimesSync(old, past, past);
    const doctor = run(fx, fx.shim, ['doctor', '--json']);
    const report = JSON.parse(doctor.stdout) as { ok: boolean; toolchains: Array<{ name: string; state: string; message?: string }> };
    expect(report.toolchains.find((t) => t.name === '.staging-99999999-0123456789abcdef')?.state).toBe('leftover');
    expect(report.toolchains.find((t) => t.name === '.staging-99999999-0123456789abcdef')?.message).toContain('rm -rf');
    expect(report.ok, JSON.stringify(report.toolchains)).toBe(true);
    const r = run(fx, cli, ['install', '--from-dir', release, '--scope', 'user']);
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(dead)).toBe(false);
    expect(existsSync(old)).toBe(false);
  });

  it('m1: revoking a user-scope toolkit says that it still runs from the user folder', () => {
    const fx = fixture();
    const inst = run(fx, cli, ['install', '--from-dir', release, '--scope', 'user']);
    expect(inst.status, inst.stderr).toBe(0);
    const direct = run(fx, cli, ['trust', 'toolkit', RELEASE, '--revoke']);
    expect(direct.status, direct.stderr).toBe(0);
    expect(direct.stdout).toContain(join(fx.home, 'toolchains', RELEASE));
    expect(direct.stdout).toMatch(/still runs/);
    const json = run(fx, cli, ['trust', 'toolkit', RELEASE, '--revoke', '--json']);
    const result = JSON.parse(json.stdout) as { note?: string };
    expect(validateAgainst('trust', result)).toEqual({ ok: true });
    expect(result.note).toMatch(/still runs/);
  });

  it('m2: an empty VISSER_HOME means unset; a read-only VISSER_HOME gives a diagnostic, not a stack trace', () => {
    const fx = fixture();
    const empty = spawnSync(process.execPath, [cli, 'install', '--from-dir', release, '--scope', 'user'], { encoding: 'utf8', env: { ...fx.env, VISSER_HOME: '' }, cwd: fx.root });
    expect(empty.status, empty.stderr).toBe(0);
    expect(existsSync(join(fx.userHome, '.visser', 'toolchains', RELEASE))).toBe(true);
    const ro = join(fx.root, 'ro-home');
    mkdirSync(ro);
    chmodSync(ro, 0o555);
    try {
      const r = spawnSync(process.execPath, [cli, 'install', '--from-dir', release, '--scope', 'user'], { encoding: 'utf8', env: { ...fx.env, VISSER_HOME: ro }, cwd: fx.root });
      expect(r.status).toBe(3);
      expect(r.stderr).not.toContain('internal error');
      expect(r.stderr).toContain(ro);
    } finally {
      chmodSync(ro, 0o755);
    }
  });

  it('m3: a stale trust lock stops the install before anything is activated', () => {
    const fx = fixture();
    mkdirSync(fx.home, { recursive: true });
    writeFileSync(join(fx.home, 'trust.json.lock'), JSON.stringify({ pid: 99999999, token: 'x' }) + '\n');
    const r = run(fx, cli, ['install', '--from-dir', release, '--scope', 'user']);
    expect(r.status).toBe(5);
    expect(r.stderr).toMatch(/not running/);
    expect(existsSync(join(fx.home, 'toolchains', RELEASE))).toBe(false);
  }, 30_000);

  it('m4 and m5: --archive without --sha256 warns; an upper-case digest is accepted', () => {
    const fx = fixture();
    const packed = packRelease(release);
    const archive = join(fx.root, 'visser.tar.gz');
    writeFileSync(archive, packed.bytes);
    const plain = run(fx, cli, ['install', '--archive', archive, '--scope', 'user']);
    expect(plain.status, plain.stderr).toBe(0);
    expect(plain.stderr).toMatch(/warning: .*--sha256/);
    const fx2 = fixture();
    const upper = run(fx2, cli, ['install', '--archive', archive, '--sha256', packed.archiveSha256.toUpperCase(), '--scope', 'user']);
    expect(upper.status, upper.stderr).toBe(0);
    expect(upper.stderr).not.toMatch(/warning: .*--sha256/);
    const trust = run(fx2, cli, ['trust', 'toolkit', RELEASE.toUpperCase(), '--json']);
    expect(trust.status, trust.stderr).toBe(0);
    expect((JSON.parse(trust.stdout) as { digest: string }).digest).toBe(RELEASE);
  });

  it('m6: --help, help, and --version work for the CLI and for every command', () => {
    const fx = fixture();
    const version = run(fx, cli, ['--version']);
    expect(version.status, version.stderr).toBe(0);
    expect(version.stdout).toContain(RELEASE);
    expect(run(fx, cli, ['help']).status).toBe(0);
    for (const command of ['init', 'ids', 'check', 'build', 'serve', 'export', 'refs', 'capture', 'fork', 'install', 'trust', 'doctor', 'skill', 'upgrade', 'catalogue', 'extension']) {
      const r = run(fx, cli, [command, '--help']);
      expect(r.status, `${command} --help: ${r.stderr}`).toBe(0);
      expect(r.stdout, command).toContain(`visser ${command}`);
      expect(run(fx, cli, ['help', command]).stdout, command).toContain(`visser ${command}`);
    }
  });

  it('m8: an untrusted repository copy is not needed when the same digest is installed for the user', () => {
    const fx = fixture();
    withDefault(fx);
    const { repo, doc } = repoWithDocument(fx, 'repo', RELEASE);
    toolkitCopy(join(repo, '.visser', 'toolchains', RELEASE));
    const r = run(fx, fx.shim, ['check', doc]);
    expect(r.status, r.stderr).toBe(0);
  });
});
