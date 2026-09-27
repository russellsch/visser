// Hostile repositories and correctness cases for `capture git` (§8.2, §18.3,
// §18.5). Ported from spikes/git-hardening/attack.mjs and the Phase 3 review
// (spikes/phase3-review/b). Each case asserts that no repository-controlled
// program ran (no sentinel) and that the capture read the real bytes or
// failed with the expected code.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, appendFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HashError } from '../../packages/core/src/model/hash.ts';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { captureGit, type CaptureGitRequest } from '../../packages/core/src/provenance/index.ts';
import { makeFixture, type Fixture } from './capture.fixtures.ts';

let fx: Fixture;
beforeEach(() => { fx = makeFixture(); });
afterEach(() => fx.cleanup());

function capture(repo: string, extra: Partial<CaptureGitRequest> = {}) {
  const doc = fx.doc(`docs-${Math.random().toString(36).slice(2)}`);
  const result = captureGit({ repo, file: 'a.txt', lines: '1:2', doc, id: 'src_a', title: 'A', repositoryLabel: 'app', capturedAt: '2026-09-27T00:00:00Z', ...extra });
  return { result, doc };
}

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof HashError) return error.code;
    throw error;
  }
  return 'ok';
}

function capturedText(doc: string): string {
  const bundle = loadBundle(doc);
  expect(bundle.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const node = bundle.model.nodes.get('src_a')!;
  return String(node.children.find((c) => c.type === 'fence')!.attributes['content']);
}

describe('capture git against hostile repositories @R07 (§18.5)', () => {
  const vectors: Array<[string, (d: string) => void]> = [
    ['core.fsmonitor', (d) => fx.git(d, 'config', 'core.fsmonitor', fx.script('fsmonitor'))],
    ['fsmonitor through include.path', (d) => {
      const inc = join(fx.root, 'inc.cfg');
      writeFileSync(inc, `[core]\n\tfsmonitor = ${fx.script('fsmonitor_inc')}\n`);
      fx.git(d, 'config', 'include.path', inc);
    }],
    ['fsmonitor through includeIf', (d) => {
      const inc = join(fx.root, 'incif.cfg');
      writeFileSync(inc, `[core]\n\tfsmonitor = ${fx.script('fsmonitor_incif')}\n`);
      fx.git(d, 'config', `includeIf.gitdir:${d}/.git.path`, inc);
    }],
    ['hooks', (d) => {
      const hooks = join(d, '.evilhooks');
      mkdirSync(hooks);
      for (const h of ['post-checkout', 'reference-transaction', 'post-index-change', 'pre-auto-gc']) {
        copyFileSync(fx.script(`hook_${h}`), join(hooks, h));
        chmodSync(join(hooks, h), 0o755);
      }
      fx.git(d, 'config', 'core.hooksPath', hooks);
    }],
    ['textconv and filters', (d) => {
      writeFileSync(join(d, '.gitattributes'), '*.txt diff=evil filter=evil\n');
      fx.git(d, 'add', '.gitattributes');
      fx.git(d, 'commit', '-q', '-m', 'attrs');
      fx.git(d, 'config', 'diff.evil.textconv', fx.script('textconv'));
      fx.git(d, 'config', 'filter.evil.smudge', fx.script('smudge'));
      fx.git(d, 'config', 'filter.evil.clean', fx.script('clean'));
    }],
    ['diff.external with a dirty tree', (d) => {
      fx.git(d, 'config', 'diff.external', fx.script('diffext'));
      appendFileSync(join(d, 'a.txt'), 'dirty\n');
    }],
    ['pager, editor, credential, ssh, proxy, alternateRefs, packObjectsHook', (d) => {
      fx.git(d, 'config', 'core.pager', fx.script('pager'));
      fx.git(d, 'config', 'core.editor', fx.script('editor'));
      fx.git(d, 'config', 'credential.helper', `!${fx.script('cred')}`);
      fx.git(d, 'config', 'core.sshCommand', fx.script('ssh'));
      fx.git(d, 'config', 'core.gitProxy', fx.script('proxy'));
      fx.git(d, 'config', 'core.alternateRefsCommand', fx.script('altrefs'));
      fx.git(d, 'config', 'uploadpack.packObjectsHook', fx.script('pack'));
    }],
  ];
  for (const [name, setup] of vectors) {
    it(`runs no repository program and reads committed bytes: ${name}`, () => {
      const repo = fx.repo('r');
      setup(repo);
      const { doc } = capture(repo);
      expect(fx.fired()).toEqual([]);
      expect(capturedText(doc)).toBe('line1\nline2\n');
    });
  }

  it('ignores an inherited GIT_DIR', () => {
    const repo = fx.repo('r');
    const other = fx.repo('other', { 'a.txt': 'OTHER1\nOTHER2\n' });
    const saved = process.env['GIT_DIR'];
    process.env['GIT_DIR'] = join(other, '.git');
    try {
      const { doc } = capture(repo);
      expect(capturedText(doc)).toBe('line1\nline2\n');
    } finally {
      if (saved === undefined) delete process.env['GIT_DIR'];
      else process.env['GIT_DIR'] = saved;
    }
  });

  it('refuses a .git gitfile that points to another repository', () => {
    const repo = fx.repo('r');
    const other = fx.repo('other', { 'a.txt': 'OTHER1\nOTHER2\n' });
    rmSync(join(repo, '.git'), { recursive: true });
    writeFileSync(join(repo, '.git'), `gitdir: ${join(other, '.git')}\n`);
    expect(codeOf(() => capture(repo))).toBe('E_PATH_ESCAPE');
  });

  it('refuses objects/info/alternates unless allowed', () => {
    const repo = fx.repo('r');
    const other = fx.repo('other');
    writeFileSync(join(repo, '.git', 'objects', 'info', 'alternates'), join(other, '.git', 'objects') + '\n');
    expect(codeOf(() => capture(repo))).toBe('E_PATH_ESCAPE');
    expect(codeOf(() => capture(repo, { allowAlternates: true }))).toBe('ok');
  });

  it('ignores refs/replace: a forged replacement never becomes evidence', () => {
    const repo = fx.repo('r');
    const real = fx.git(repo, 'rev-parse', 'HEAD:a.txt').trim();
    writeFileSync(join(fx.root, 'forged.txt'), 'FORGED by replace\nsecond\n');
    const forged = fx.git(repo, 'hash-object', '-w', join(fx.root, 'forged.txt')).trim();
    fx.git(repo, 'replace', real, forged);
    // A naive read shows the forged bytes; the capture must not.
    expect(fx.git(repo, 'cat-file', 'blob', real)).toContain('FORGED');
    const { doc } = capture(repo);
    expect(capturedText(doc)).toBe('line1\nline2\n');
  });

  it('ignores grafts when resolving --rev', () => {
    const repo = fx.repo('r', { 'a.txt': 'v1\n' });
    const c1 = fx.git(repo, 'rev-parse', 'HEAD').trim();
    writeFileSync(join(repo, 'a.txt'), 'v2\n');
    fx.git(repo, 'commit', '-qam', 'c2');
    writeFileSync(join(repo, 'a.txt'), 'v3\n');
    fx.git(repo, 'commit', '-qam', 'c3');
    const c3 = fx.git(repo, 'rev-parse', 'HEAD').trim();
    mkdirSync(join(repo, '.git', 'info'), { recursive: true });
    writeFileSync(join(repo, '.git', 'info', 'grafts'), `${c3} ${c1}\n`);
    const { doc } = capture(repo, { rev: 'HEAD~1', lines: '1:1' });
    expect(capturedText(doc)).toBe('v2\n');
  });

  it('never fetches a missing object from a partial clone (fresh clone per case)', () => {
    const server = fx.repo('server', { 'a.txt': 'lazy content\nmore\n' });
    fx.git(server, 'config', 'uploadpack.allowFilter', 'true');
    fx.git(server, 'config', 'uploadpack.allowAnySHA1InWant', 'true');
    const client = join(fx.root, 'client');
    fx.git(fx.root, 'clone', '-q', '--filter=blob:none', '--no-checkout', `file://${server}`, client);
    const oid = fx.git(client, 'rev-parse', 'HEAD:a.txt').trim();
    const present = () => spawnSync('git', ['-C', client, '-c', 'protocol.allow=never', 'cat-file', '-e', oid], { env: { PATH: process.env['PATH'] ?? '', HOME: fx.root, GIT_CONFIG_NOSYSTEM: '1' } }).status === 0;
    expect(present()).toBe(false);
    expect(codeOf(() => capture(client))).toBe('E_SOURCE_UNAVAILABLE');
    expect(present()).toBe(false);
  });
});

describe('capture git correctness @R07 (§18.3)', () => {
  it('captures from a SHA-256 repository', () => {
    const repo = fx.repo('r', undefined, { format: 'sha256' });
    const { result, doc } = capture(repo);
    expect(result.attributes.commit).toMatch(/^[0-9a-f]{64}$/);
    expect(capturedText(doc)).toBe('line1\nline2\n');
  });

  it('captures committed bytes from a detached HEAD and ignores a dirty tree', () => {
    const repo = fx.repo('r');
    fx.git(repo, 'checkout', '-q', '--detach');
    writeFileSync(join(repo, 'a.txt'), 'DIRTY\n');
    const { doc } = capture(repo);
    expect(capturedText(doc)).toBe('line1\nline2\n');
  });

  it('captures a non-ASCII path with a space and a character beyond U+FFFF', () => {
    const name = 'dir é/𝒳 file.txt';
    const repo = fx.repo('r', { [name]: 'alpha\nbeta\n' });
    const { doc } = capture(repo, { file: name });
    expect(capturedText(doc)).toBe('alpha\nbeta\n');
  });

  it('rejects a non-NFC (NFD) path argument', () => {
    const repo = fx.repo('r');
    expect(codeOf(() => capture(repo, { file: 'café.txt' }))).toBe('E_USAGE');
  });

  it('normalizes CRLF in the stored excerpt and keeps line numbers', () => {
    const repo = fx.repo('r', { 'a.txt': 'one\r\ntwo\r\nthree\r\n' });
    const { result, doc } = capture(repo, { lines: '2:3' });
    expect(capturedText(doc)).toBe('two\nthree\n');
    expect([result.attributes.start, result.attributes.end]).toEqual([2, 3]);
  });

  it('adds one terminal LF when the last line has none, and check passes', () => {
    const repo = fx.repo('r', { 'a.txt': 'first\nlast' });
    const { doc } = capture(repo, { lines: '2:2' });
    expect(capturedText(doc)).toBe('last\n');
  });

  it('rejects a lone CR, NUL, and other control bytes', () => {
    expect(codeOf(() => capture(fx.repo('cr', { 'a.txt': 'a\rb\nc\n' })))).toBe('E_SEMANTIC');
    expect(codeOf(() => capture(fx.repo('nul', { 'a.txt': 'a\0b\nc\n' })))).toBe('E_SEMANTIC');
    expect(codeOf(() => capture(fx.repo('bel', { 'a.txt': 'a\u0007b\nc\n' })))).toBe('E_SEMANTIC');
  });

  it('rejects invalid UTF-8', () => {
    expect(codeOf(() => capture(fx.repo('bin', { 'a.txt': new Uint8Array([0x61, 0xff, 0x0a, 0x62, 0x0a]) })))).toBe('E_SEMANTIC');
  });

  it('rejects a Git LFS pointer', () => {
    const pointer = 'version https://git-lfs.github.com/spec/v1\noid sha256:' + '0'.repeat(64) + '\nsize 12\n';
    expect(codeOf(() => capture(fx.repo('lfs', { 'a.txt': pointer })))).toBe('E_SOURCE_UNAVAILABLE');
  });

  it('rejects a file over the size limit and a line over 64 KiB', () => {
    const big = 'x'.repeat(1024) + '\n';
    expect(codeOf(() => capture(fx.repo('big', { 'a.txt': big.repeat(10 * 1024 + 8) }), { lines: '1:1' }))).toBe('E_LIMIT');
    expect(codeOf(() => capture(fx.repo('long', { 'a.txt': 'y'.repeat(64 * 1024 + 1) + '\nz\n' })))).toBe('E_LIMIT');
  });

  it('rejects a range past the end, a tree path, a missing file, and a committed symlink', () => {
    const repo = fx.repo('r', { 'a.txt': 'one\ntwo\n', 'sub/b.txt': 'b\n' });
    expect(codeOf(() => capture(repo, { lines: '1:3' }))).toBe('E_USAGE');
    expect(codeOf(() => capture(repo, { file: 'sub' }))).toBe('E_SOURCE_UNAVAILABLE');
    expect(codeOf(() => capture(repo, { file: 'missing.txt' }))).toBe('E_SOURCE_UNAVAILABLE');
    symlinkSync('a.txt', join(repo, 'link.txt'));
    fx.git(repo, 'add', 'link.txt');
    fx.git(repo, 'commit', '-q', '-m', 'link');
    expect(codeOf(() => capture(repo, { file: 'link.txt', lines: '1:1' }))).toBe('E_SOURCE_UNAVAILABLE');
  });

  it('refuses a working-tree symlink and captures a working-tree file with its base commit', () => {
    const repo = fx.repo('r');
    const head = fx.git(repo, 'rev-parse', 'HEAD').trim();
    writeFileSync(join(repo, 'a.txt'), 'changed\nlines\n');
    const { result, doc } = capture(repo, { workingTree: true });
    expect(result.attributes).toMatchObject({ kind: 'working-tree', baseCommit: head, file: 'a.txt' });
    expect(capturedText(doc)).toBe('changed\nlines\n');
    symlinkSync('a.txt', join(repo, 'wl.txt'));
    expect(codeOf(() => capture(repo, { workingTree: true, file: 'wl.txt', lines: '1:1' }))).toBe('E_PATH_ESCAPE');
  });

  it('rejects a --repo that is not the working-tree root', () => {
    const repo = fx.repo('r', { 'a.txt': 'x\ny\n', 'sub/c.txt': 'c\n' });
    expect(codeOf(() => capture(join(repo, 'sub')))).toBe('E_PATH_ESCAPE');
  });

  it('never records a local path or credentials as the repository', () => {
    const repo = fx.repo('r');
    const doc = fx.doc('d');
    // No remote and no label: the capture refuses instead of recording a path.
    expect(codeOf(() => captureGit({ repo, file: 'a.txt', lines: '1:1', doc, id: 'src_a', title: 'A' }))).toBe('E_USAGE');
    fx.git(repo, 'remote', 'add', 'origin', 'https://user:secret@example.com/org/app.git?x=1');
    const r = captureGit({ repo, file: 'a.txt', lines: '1:1', doc, id: 'src_a', title: 'A', capturedAt: '2026-09-27T00:00:00Z' });
    expect(r.attributes.repository).toBe('https://example.com/org/app.git');
    expect(readFileSync(doc, 'utf8')).not.toContain('secret');
    expect(codeOf(() => captureGit({ repo, file: 'a.txt', lines: '1:1', doc: fx.doc('d2'), id: 'src_b', title: 'B', repositoryLabel: '/home/me/app' }))).toBe('E_USAGE');
  });
});
