import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = new URL('../..', import.meta.url).pathname;
const release = join(root, 'dist/release');
const cli = join(release, 'bin/visser.cjs');
const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });


describe('Phase 0 CLI against the built release', () => {
  it('builds dist/release with a verifiable release.json', () => {
    const manifest = JSON.parse(readFileSync(join(release, 'release.json'), 'utf8'));
    expect(manifest.schema).toBe('visser-release/1');
    expect(manifest.files.map((f: { path: string }) => f.path)).toContain('bin/visser.cjs');
  });

  it('init creates a bundle with a local-dir lock pinned to the release digest', () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'visser-')), 'doc');
    const result = run('init', dir, '--kind', 'teaching', '--title', 'Queue notes');
    expect(result.status, result.stderr).toBe(0);
    const lock = JSON.parse(readFileSync(join(dir, 'visser.lock.json'), 'utf8'));
    expect(lock.toolkit.origin).toEqual({ kind: 'local-dir' });
    expect(lock.toolkit.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.stdout).toContain(lock.toolkit.sha256);
    expect(run('check', join(dir, 'index.md')).status).toBe(0);
    // init never overwrites content.
    expect(run('init', dir, '--kind', 'teaching', '--title', 'Again').status).toBe(2);
  });

  it('ids assign inserts missing markers, and check then passes', () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'visser-')), 'doc');
    expect(run('init', dir, '--kind', 'teaching', '--title', 'Notes').status).toBe(0);
    const doc = join(dir, 'index.md');
    writeFileSync(doc, readFileSync(doc, 'utf8') + '\nA paragraph without an ID.\n');
    const failed = run('check', doc, '--json');
    expect(failed.status).toBe(2);
    expect(JSON.parse(failed.stdout).diagnostics.map((d: { code: string }) => d.code)).toContain('E_ID_MISSING');
    expect(run('ids', 'assign', doc, '--check').status).toBe(2);
    expect(run('ids', 'assign', doc).status).toBe(0);
    expect(readFileSync(doc, 'utf8')).toMatch(/<!-- vs:id b_[a-z2-7]{16} -->\nA paragraph without an ID\./);
    expect(run('check', doc).status).toBe(0);
    expect(run('ids', 'assign', doc).stdout).toContain('no missing IDs');
  });

  it('check and export accept the Appendix A example', () => {
    const doc = join(root, 'examples/bounded-queue/index.md');
    const check = run('check', doc, '--json');
    expect(check.status, check.stdout).toBe(0);
    expect(JSON.parse(check.stdout).targetCount).toBe(24); // 23, and the self-check of revision 1.27
    const exported = run('export', doc, '--format', 'markdown');
    expect(exported.status).toBe(0);
    expect(exported.stdout).toContain('Producer --[blocking-call; put waits while full]--> Bounded queue');
  });

  it('capture with a missing document is E_SOURCE_UNAVAILABLE, not an internal error', () => {
    const missing = join(mkdtempSync(join(tmpdir(), 'visser-')), 'none', 'index.md');
    const result = run('capture', 'git', '--repo', root, '--file', 'README.md', '--lines', '1:1', '--doc', missing, '--id', 'src_x', '--title', 'X');
    expect(result.status).toBe(3);
    expect(result.stderr).toContain('E_SOURCE_UNAVAILABLE');
    expect(result.stderr).not.toContain('internal error');
  });

  it('deferred commands exit 3 with E_UNSUPPORTED instead of succeeding', () => {
    for (const command of ['content', 'vendor']) {
      const result = run(command, '--json');
      expect(result.status).toBe(3);
      expect(result.stdout).toContain('E_UNSUPPORTED');
    }
  });

  it('a missing toolkit directory fails with E_TOOLKIT_MISSING', () => {
    expect(existsSync(release)).toBe(true);
    const dir = mkdtempSync(join(tmpdir(), 'visser-'));
    const result = run('init', join(dir, 'doc'), '--kind', 'plan', '--title', 'T', '--toolkit-dir', join(dir, 'missing'));
    expect(result.status).toBe(3);
    expect(result.stderr).toContain('E_TOOLKIT_MISSING');
  });

  it('a toolkit file that no longer matches release.json fails with E_INTEGRITY', () => {
    const dir = mkdtempSync(join(tmpdir(), 'visser-'));
    const copy = join(dir, 'release');
    cpSync(release, copy, { recursive: true });
    appendFileSync(join(copy, 'skills/visser-visual-explain/SKILL.md'), 'tampered\n');
    const result = run('init', join(dir, 'doc'), '--kind', 'plan', '--title', 'T', '--toolkit-dir', copy);
    expect(result.status).toBe(4);
    expect(result.stderr).toContain('E_INTEGRITY');
  });
});
