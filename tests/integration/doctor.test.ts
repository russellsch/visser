// `doctor` (§12.7) never executes repository code and reports resolution and
// trust state; `skill show` prints the pinned skill and guide paths.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addTrust } from '../../packages/core/src/distribution/index.ts';
import { validateAgainst } from '../../packages/core/src/model/schemas.ts';
import { parseArgs } from '../../packages/cli/src/cli-util.ts';
import { CANONICAL_WRAPPER, doctorReport, runDoctor } from '../../packages/cli/src/commands/doctor.ts';
import { runSkill } from '../../packages/cli/src/commands/skill.ts';
import { digestOf, fixture, installUser, release, repoWithDocument, sentinelToolkit } from './resolution.fixtures.ts';

const now = () => new Date('2026-09-27T00:00:00Z');

function captureStdout(): { text: () => string } {
  let out = '';
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    out += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
    return true;
  });
  return { text: () => out };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('doctor', () => {
  it('never executes a repository shim or an untrusted repository toolchain, and reports both', async () => {
    const fx = fixture();
    const sentinel = join(fx.root, 'sentinel');
    const probe = join(fx.root, 'probe');
    const S = sentinelToolkit(probe, sentinel);
    const { repo, doc } = repoWithDocument(fx, 'repo', S);
    cpSync(probe, join(repo, '.visser', 'toolchains', S), { recursive: true });
    mkdirSync(join(repo, '.visser', 'bin'), { recursive: true });
    writeFileSync(join(repo, '.visser', 'bin', 'visser.cjs'), `require('node:fs').writeFileSync(${JSON.stringify(sentinel)}, 'shim')\n`);

    const out = captureStdout();
    const code = await runDoctor(parseArgs(['--doc', doc, '--json']), { env: fx.env, cwd: repo, ownRelease: release });
    const report = JSON.parse(out.text());
    expect(existsSync(sentinel)).toBe(false);
    expect(validateAgainst('doctor', report)).toEqual({ ok: true });
    expect(code).toBe(3);
    expect(report.ok).toBe(false);
    expect(report.document.resolution).toMatchObject({ state: 'error', code: 'E_TOOLKIT_UNTRUSTED' });
    expect(report.toolchains).toContainEqual(expect.objectContaining({ scope: 'repository', name: S, state: 'untrusted', trusted: false }));
    expect(report.userShim.present).toBe(true);
  });

  it('reports a healthy user installation as ok, and a corrupt user toolchain as corrupt', async () => {
    const fx = fixture();
    const D = installUser(fx, release);
    addTrust(D, 'install --from-dir', fx.env, now);
    writeFileSync(join(fx.home, 'default'), `${D}\n`);
    const { repo, doc } = repoWithDocument(fx, 'repo', D);
    const healthy = await doctorReport(parseArgs(['--doc', doc]), { env: fx.env, cwd: repo, ownRelease: undefined });
    expect(healthy.ok, JSON.stringify(healthy, null, 2)).toBe(true);
    expect(healthy.document?.resolution).toMatchObject({ state: 'resolved', source: 'user', sha256: D });
    expect(healthy.defaultToolkit).toMatchObject({ state: 'resolved', sha256: D });
    expect(healthy.toolchains).toEqual([expect.objectContaining({ scope: 'user', name: D, state: 'verified', trusted: true })]);
    expect(healthy.trust.map((t) => t.sha256)).toEqual([D]);
    expect(healthy.userShim.matchesToolkit).toBe(true);

    writeFileSync(join(fx.home, 'toolchains', D, 'workers', 'evil.cjs'), 'x\n');
    const corrupt = await doctorReport(parseArgs([]), { env: fx.env, cwd: fx.root, ownRelease: undefined });
    expect(corrupt.ok).toBe(false);
    expect(corrupt.toolchains[0]).toMatchObject({ state: 'corrupt', code: 'E_INTEGRITY' });
  });

  it('compares repository and user skill wrappers by hash and reports a conflict', async () => {
    const fx = fixture();
    const D = installUser(fx, release);
    const { repo, doc } = repoWithDocument(fx, 'repo', D);
    mkdirSync(join(repo, '.claude', 'skills', 'visser-visual-explain'), { recursive: true });
    writeFileSync(join(repo, '.claude', 'skills', 'visser-visual-explain', 'SKILL.md'), 'repository wrapper\n');
    mkdirSync(join(fx.userHome, '.claude', 'skills', 'visser-visual-explain'), { recursive: true });
    writeFileSync(join(fx.userHome, '.claude', 'skills', 'visser-visual-explain', 'SKILL.md'), 'user wrapper\n');
    const report = await doctorReport(parseArgs(['--doc', doc]), { env: fx.env, cwd: repo, ownRelease: undefined });
    // The pack carries the canonical wrapper (skills/visser-visual-explain/wrapper/SKILL.md).
    expect(existsSync(join(release, CANONICAL_WRAPPER))).toBe(true);
    expect(report.wrappers.map((w) => [w.scope, w.state])).toEqual([
      ['repository', 'differs'],
      ['user', 'differs'],
    ]);
    expect(report.conflicts.some((c) => c.startsWith('claude-code:'))).toBe(true);

    // A repository wrapper that is a copy of the canonical text matches.
    cpSync(join(release, CANONICAL_WRAPPER), join(repo, '.claude', 'skills', 'visser-visual-explain', 'SKILL.md'));
    const again = await doctorReport(parseArgs(['--doc', doc]), { env: fx.env, cwd: repo, ownRelease: undefined });
    expect(again.wrappers.find((w) => w.scope === 'repository')?.state).toBe('matches');
  });
});

describe('skill show', () => {
  it('prints the skill pinned by the document lock and absolute guide paths', async () => {
    const fx = fixture();
    const D = installUser(fx, release);
    const { repo, doc } = repoWithDocument(fx, 'repo', D);
    const out = captureStdout();
    const code = await runSkill(parseArgs(['show', '--doc', doc, '--json']), { env: fx.env, cwd: repo, ownRelease: undefined });
    expect(code).toBe(0);
    const shown = JSON.parse(out.text());
    expect(validateAgainst('skill', shown)).toEqual({ ok: true });
    expect(shown.toolkit).toMatchObject({ sha256: D, source: 'user', dir: join(fx.home, 'toolchains', D) });
    expect(shown.skill.path).toBe(join(fx.home, 'toolchains', D, 'skills', 'visser-visual-explain', 'SKILL.md'));
    expect(shown.skill.text.length).toBeGreaterThan(0);
    for (const guide of shown.guides) expect(guide.startsWith(join(fx.home, 'toolchains', D, 'skills', 'visser-visual-explain', 'references'))).toBe(true);
  });

  it('refuses a document whose lock pins an untrusted repository toolchain', async () => {
    const fx = fixture();
    const D = digestOf(release);
    const { repo, doc } = repoWithDocument(fx, 'repo', D);
    cpSync(release, join(repo, '.visser', 'toolchains', D), { recursive: true });
    await expect(runSkill(parseArgs(['show', '--doc', doc]), { env: fx.env, cwd: repo, ownRelease: release })).rejects.toMatchObject({ code: 'E_TOOLKIT_UNTRUSTED', exitCode: 4 });
  });
});
