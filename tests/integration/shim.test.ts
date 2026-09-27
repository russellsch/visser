// The user shim (§12.2, §12.7): it runs the resolved toolkit's own
// bin/visser.cjs, forwards arguments and the exit code, verifies the release
// first, applies the trust gate, and never runs REPO/.visser/bin.
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addTrust } from '../../packages/core/src/distribution/index.ts';
import { fixture, installUser, markerToolkit, repoWithDocument, run } from './resolution.fixtures.ts';

const now = () => new Date('2026-09-27T00:00:00Z');

function markerSetup() {
  const fx = fixture();
  const marker = join(fx.root, 'marker.json');
  const built = join(fx.root, 'marker-toolkit');
  const M = markerToolkit(built, marker, 7);
  return { fx, marker, built, M };
}

const readMarker = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as { file: string; argv: string[] };

describe('user shim dispatch', () => {
  it('runs the locked toolkit\'s own CLI with the same arguments and forwards its exit code', () => {
    const { fx, marker, built, M } = markerSetup();
    installUser(fx, built);
    const { doc } = repoWithDocument(fx, 'repo', M);
    const r = run(fx, fx.shim, ['check', doc, '--json']);
    expect(r.status, r.stderr).toBe(7);
    const seen = readMarker(marker);
    expect(seen.file).toBe(join(fx.home, 'toolchains', M, 'bin', 'visser.cjs'));
    expect(seen.argv).toEqual(['check', doc, '--json']);
  });

  it('finds the document through --doc and through `ids assign DOC` and `refs show DOC ID`', () => {
    const { fx, marker, built, M } = markerSetup();
    installUser(fx, built);
    const { doc } = repoWithDocument(fx, 'repo', M);
    for (const argv of [['capture', 'file', '--doc', doc, '--id', 'x'], ['ids', 'assign', doc], ['refs', 'show', doc, 'overview']]) {
      const r = run(fx, fx.shim, argv);
      expect(r.status, `${argv.join(' ')}: ${r.stderr}`).toBe(7);
      expect(readMarker(marker).argv).toEqual(argv);
    }
  });

  it('never runs REPO/.visser/bin, even when the lock resolves', () => {
    const { fx, marker, built, M } = markerSetup();
    installUser(fx, built);
    const { repo, doc } = repoWithDocument(fx, 'repo', M);
    const sentinel = join(fx.root, 'repo-shim-ran');
    mkdirSync(join(repo, '.visser', 'bin'), { recursive: true });
    writeFileSync(join(repo, '.visser', 'bin', 'visser.cjs'), `require('node:fs').writeFileSync(${JSON.stringify(sentinel)}, 'x')\n`);
    const r = run(fx, fx.shim, ['build', doc], repo);
    expect(r.status, r.stderr).toBe(7);
    expect(existsSync(marker)).toBe(true);
    expect(existsSync(sentinel)).toBe(false);
  });

  it('refuses an untrusted repository toolchain (E_TOOLKIT_UNTRUSTED, nothing runs) and runs it once trusted', () => {
    const { fx, marker, built, M } = markerSetup();
    const { repo, doc } = repoWithDocument(fx, 'repo', M);
    const repoCopy = join(repo, '.visser', 'toolchains', M);
    cpSync(built, repoCopy, { recursive: true });

    const refused = run(fx, fx.shim, ['build', doc, '--json']);
    expect(refused.status).toBe(4);
    expect(JSON.parse(refused.stdout).diagnostics[0].code).toBe('E_TOOLKIT_UNTRUSTED');
    expect(existsSync(marker)).toBe(false);

    addTrust(M, 'test', fx.env, now);
    const trusted = run(fx, fx.shim, ['build', doc]);
    expect(trusted.status, trusted.stderr).toBe(7);
    expect(readMarker(marker).file).toBe(join(repoCopy, 'bin', 'visser.cjs'));
  });

  it('upgrade DOC --to DIGEST runs the TARGET toolkit\'s CLI, through the trust gate', () => {
    const { fx, marker, built, M } = markerSetup();
    installUser(fx, built);
    const targetMarker = join(fx.root, 'target-marker.json');
    const targetBuilt = join(fx.root, 'target-toolkit');
    const T = markerToolkit(targetBuilt, targetMarker, 9);
    expect(T).not.toBe(M);
    const { repo, doc } = repoWithDocument(fx, 'repo', M);

    // An untrusted repository copy of the target: nothing runs.
    const repoCopy = join(repo, '.visser', 'toolchains', T);
    cpSync(targetBuilt, repoCopy, { recursive: true });
    const refused = run(fx, fx.shim, ['upgrade', doc, '--to', T, '--json']);
    expect(refused.status).toBe(4);
    expect(refused.stdout).toContain('E_TOOLKIT_UNTRUSTED');
    expect(existsSync(marker)).toBe(false);
    expect(existsSync(targetMarker)).toBe(false);

    addTrust(T, 'test', fx.env, now);
    const r = run(fx, fx.shim, ['upgrade', doc, '--to', T]);
    expect(r.status, r.stderr).toBe(9);
    expect(readMarker(targetMarker).file).toBe(join(repoCopy, 'bin', 'visser.cjs'));
    expect(existsSync(marker)).toBe(false);
  });

  it('verifies the release before running it: an unlisted file is E_INTEGRITY and nothing runs', () => {
    const { fx, marker, built, M } = markerSetup();
    installUser(fx, built);
    appendFileSync(join(fx.home, 'toolchains', M, 'workers', 'extra.cjs'), 'x\n');
    const { doc } = repoWithDocument(fx, 'repo', M);
    const r = run(fx, fx.shim, ['build', doc]);
    expect(r.status).toBe(4);
    expect(r.stderr).toContain('E_INTEGRITY');
    expect(existsSync(marker)).toBe(false);
  });

  it('a missing locked toolkit is E_TOOLKIT_MISSING with an install hint', () => {
    const { fx } = markerSetup();
    const { doc } = repoWithDocument(fx, 'repo', 'e'.repeat(64));
    const r = run(fx, fx.shim, ['build', doc]);
    expect(r.status).toBe(3);
    expect(r.stderr).toContain('E_TOOLKIT_MISSING');
    expect(r.stderr).toContain('visser install');
  });

  it('commands without a document use only the user default pointer; none is inferred from installed toolchains', () => {
    const { fx, marker, built, M } = markerSetup();
    installUser(fx, built);
    const none = run(fx, fx.shim, ['doctor']);
    expect(none.status).toBe(3);
    expect(none.stderr).toContain('E_TOOLKIT_MISSING');
    expect(existsSync(marker)).toBe(false);

    writeFileSync(join(fx.home, 'default'), `${M}\n`);
    const withDefault = run(fx, fx.shim, ['doctor', '--json']);
    expect(withDefault.status, withDefault.stderr).toBe(7);
    expect(readMarker(marker).argv).toEqual(['doctor', '--json']);
  });

  it('user commands ignore a repository workspace default; init uses it', () => {
    const { fx, marker, built, M } = markerSetup();
    installUser(fx, built);
    const repo = join(fx.root, 'repo');
    mkdirSync(join(repo, '.visser'), { recursive: true });
    writeFileSync(join(repo, '.visser', 'config.json'), JSON.stringify({ schema: 'visser-workspace/1', defaultToolkit: { version: '0.0.0', sha256: M } }));
    const doctor = run(fx, fx.shim, ['doctor'], repo);
    expect(doctor.status).toBe(3);
    expect(existsSync(marker)).toBe(false);
    const init = run(fx, fx.shim, ['init', join(repo, 'docs', 'new'), '--kind', 'plan', '--title', 'T'], repo);
    expect(init.status, init.stderr).toBe(7);
    expect(readMarker(marker).argv[0]).toBe('init');
  });
});
