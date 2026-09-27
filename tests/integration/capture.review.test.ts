// Phase 3 code-review fixes for capture (spikes/phase3-code-review/a). Each case
// is a hostile repository that the first Phase 3 implementation accepted.
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HashError } from '../../packages/core/src/model/hash.ts';
import { captureFile, captureGit, identityProblem, openRepository, readBlobAt, resolveCommit, type CaptureGitRequest } from '../../packages/core/src/provenance/index.ts';
import { verifyOrigins } from '../../packages/core/src/provenance/verify.ts';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { makeFixture, type Fixture } from './capture.fixtures.ts';

let fx: Fixture;
beforeEach(() => { fx = makeFixture(); });
afterEach(() => fx.cleanup());

function failure(fn: () => unknown): { code: string; message: string } {
  try {
    fn();
  } catch (error) {
    if (error instanceof HashError) return { code: error.code, message: error.message };
    throw error;
  }
  return { code: 'ok', message: '' };
}

function capture(repo: string, extra: Partial<CaptureGitRequest> = {}) {
  const doc = fx.doc(`docs-${Math.random().toString(36).slice(2)}`);
  return captureGit({ repo, file: 'a.txt', lines: '1:1', doc, id: 'src_a', title: 'A', repositoryLabel: 'app', capturedAt: '2026-09-27T00:00:00Z', ...extra });
}

/** A fresh blob-less partial clone of a new server repository. */
function partialClone(config: Array<[string, string]>): { client: string; oid: string; present: () => boolean } {
  const name = `server-${Math.random().toString(36).slice(2)}`;
  const server = fx.repo(name, { 'a.txt': 'lazy content\n' });
  fx.git(server, 'config', 'uploadpack.allowFilter', 'true');
  fx.git(server, 'config', 'uploadpack.allowAnySHA1InWant', 'true');
  const client = join(fx.root, `client-${name}`);
  fx.git(fx.root, 'clone', '-q', '--filter=blob:none', '--no-checkout', `file://${server}`, client);
  for (const [key, value] of config) fx.git(client, 'config', key, value);
  const oid = fx.git(client, 'rev-parse', 'HEAD:a.txt').trim();
  // The presence check itself must never fetch, whatever the repository config says.
  const present = () => spawnSync('git', ['-C', client, 'cat-file', '-e', oid], {
    env: { PATH: process.env['PATH'] ?? '', HOME: fx.root, GIT_CONFIG_NOSYSTEM: '1', GIT_ALLOW_PROTOCOL: 'none' },
  }).status === 0;
  return { client, oid, present };
}

describe('capture: repository-controlled protocols (review A1) @R07', () => {
  it('an ext:: promisor with protocol.ext.allow=always runs no command and fetches nothing', () => {
    const { client, present } = partialClone([]);
    const sentinel = join(fx.sentinels, 'ext_promisor');
    fx.git(client, 'config', 'remote.origin.url', `ext::sh -c touch% ${sentinel}`);
    fx.git(client, 'config', 'protocol.ext.allow', 'always');
    expect(present()).toBe(false);
    expect(failure(() => capture(client)).code).toBe('E_SOURCE_UNAVAILABLE');
    expect(existsSync(sentinel), 'the promisor command ran').toBe(false);
    expect(present()).toBe(false);
  });

  it('protocol.file.allow=always in repository config does not re-enable a fetch', () => {
    const { client, present } = partialClone([['protocol.file.allow', 'always']]);
    expect(failure(() => capture(client)).code).toBe('E_SOURCE_UNAVAILABLE');
    expect(present()).toBe(false);
  });
});

describe('capture: object location containment (review A2) @R07', () => {
  function secret() {
    const dir = fx.repo('secret', { 'a.txt': 'PRIVATE DATA\n' });
    return { dir, commit: fx.git(dir, 'rev-parse', 'HEAD').trim() };
  }

  it('refuses a symlinked .git/objects that points into another repository', () => {
    const s = secret();
    const repo = fx.repo('redir', { 'a.txt': 'mine\n' });
    rmSync(join(repo, '.git', 'objects'), { recursive: true, force: true });
    symlinkSync(join(s.dir, '.git', 'objects'), join(repo, '.git', 'objects'));
    expect(failure(() => capture(repo, { rev: s.commit })).code).toBe('E_PATH_ESCAPE');
  });

  it('refuses a commondir file that redirects object reads', () => {
    const s = secret();
    const repo = fx.repo('redir', { 'a.txt': 'mine\n' });
    writeFileSync(join(repo, '.git', 'commondir'), join(s.dir, '.git') + '\n');
    expect(failure(() => capture(repo, { rev: s.commit })).code).toBe('E_PATH_ESCAPE');
  });

  it('refuses objects/info/http-alternates', () => {
    const repo = fx.repo('r');
    writeFileSync(join(repo, '.git', 'objects', 'info', 'http-alternates'), 'https://example.invalid/objects\n');
    expect(failure(() => capture(repo)).code).toBe('E_PATH_ESCAPE');
  });
});

describe('capture: every object on the path is rechecked (review A4) @R07', () => {
  it('a forged loose tree under the real tree ID is E_INTEGRITY', () => {
    const repo = fx.repo('forge', { 'a.txt': 'REAL\n', 'b.txt': 'FORGED\n' });
    const tree = fx.git(repo, 'rev-parse', 'HEAD^{tree}').trim();
    const blobB = fx.git(repo, 'rev-parse', 'HEAD:b.txt').trim();
    const entries = Buffer.concat([
      Buffer.from('100644 a.txt\0'), Buffer.from(blobB, 'hex'),
      Buffer.from('100644 b.txt\0'), Buffer.from(blobB, 'hex'),
    ]);
    const raw = Buffer.concat([Buffer.from(`tree ${entries.length}\0`), entries]);
    expect(createHash('sha1').update(raw).digest('hex')).not.toBe(tree);
    const path = join(repo, '.git', 'objects', tree.slice(0, 2), tree.slice(2));
    chmodSync(path, 0o644);
    writeFileSync(path, deflateSync(raw));
    expect(failure(() => capture(repo)).code).toBe('E_INTEGRITY');
  });

  it('a normal SHA-1 and SHA-256 repository still verify along the whole path', () => {
    for (const format of ['sha1', 'sha256'] as const) {
      const repo = fx.repo(`deep-${format}`, { 'dir/sub/a.txt': 'deep\n' }, { format });
      const r = openRepository(repo);
      const read = readBlobAt(r, resolveCommit(r, 'HEAD'), 'dir/sub/a.txt');
      expect(Buffer.from(read.bytes).toString()).toBe('deep\n');
    }
  });
});

describe('capture: diagnostics and argument checks (review A5, A6)', () => {
  it('a Git error message carries no "hint:" advice lines', () => {
    const repo = fx.repo('r');
    const { code, message } = failure(() => capture(repo, { rev: 'HEAD~5' }));
    expect(code).toBe('E_SOURCE_UNAVAILABLE');
    expect(message).not.toMatch(/hint:/);
  });

  it('rejects line separators and control characters in --title, --label, and --symbol up front', () => {
    const repo = fx.repo('r');
    for (const bad of ['sep line', 'para x', 'bell\u0007', 'c1\u0085x', 'del\u007f']) {
      expect(failure(() => capture(repo, { title: bad })).code, JSON.stringify(bad)).toBe('E_USAGE');
      expect(failure(() => capture(repo, { symbol: bad })).code, JSON.stringify(bad)).toBe('E_USAGE');
      const from = join(fx.root, 'note.txt');
      writeFileSync(from, 'note\n');
      const doc = fx.doc(`docs-label-${Math.random().toString(36).slice(2)}`);
      expect(failure(() => captureFile({ from, kind: 'file', doc, id: 'src_n', title: 'N', label: bad, capturedAt: '2026-09-27T00:00:00Z' })).code, JSON.stringify(bad)).toBe('E_USAGE');
    }
  });
});

describe('recorded commits must be full IDs (review A3) @R07', () => {
  const excerpt = 'two\n';
  function docWith(commit: string, repository: string): string {
    const sha = createHash('sha256').update(excerpt).digest('hex');
    return fx.doc(`docs-commit-${Math.random().toString(36).slice(2)}`,
      `<!-- vs:id p -->\nText {% cite ref="s" /%}\n\n{% source id="s" kind="git" title="t" repository="${repository}" commit=${JSON.stringify(commit)} file="a.py" start=2 end=2 excerptSha256="${sha}" %}\n\`\`\`\ntwo\n\`\`\`\n{% /source %}\n`);
  }

  it('check rejects moving refs and abbreviated IDs; verify never reports them as matched', () => {
    const repo = fx.repo('ref', { 'a.py': 'one\ntwo\n' });
    const full = fx.git(repo, 'rev-parse', 'HEAD').trim();
    const map = new Map([['https://x/r.git', repo]]);
    for (const commit of ['HEAD', 'main', ':/one', 'HEAD~1', full.slice(0, 7)]) {
      const bundle = loadBundle(docWith(commit, 'https://x/r.git'));
      expect(bundle.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code), commit).toEqual(['E_SEMANTIC']);
      expect(verifyOrigins(bundle, map).origins.map((o) => o.state), commit).toEqual(['origin-unavailable']);
    }
    const good = loadBundle(docWith(full, 'https://x/r.git'));
    expect(good.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(verifyOrigins(good, map).origins.map((o) => o.state)).toEqual(['origin-matched']);
  });
});

describe('one repository-identity rule for captured and hand-written sources (review B2)', () => {
  it('rejects a token in a query string and accepts an ssh user name', () => {
    expect(identityProblem('https://github.com/o/r.git?token=abc')).toBeDefined();
    expect(identityProblem('https://TOKEN@github.com/o/r.git')).toBeDefined();
    expect(identityProblem('ssh://git@github.com/o/r.git')).toBeUndefined();
    const text = readFileSync(new URL('../../fixtures/positive/repository-ssh-user.md', import.meta.url), 'utf8');
    const dir = fx.doc('docs-ssh', text.slice(text.indexOf('<!-- vs:id')));
    expect(loadBundle(dir).diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });
});

describe('capture relies on the guarded write to refuse an invalid candidate (review B6c)', () => {
  it('a document with an unrelated broken cite is not written', () => {
    const repo = fx.repo('r');
    const doc = fx.doc('docs-broken', '<!-- vs:id intro -->\nIntro {% cite ref="src_missing" /%}\n');
    const before = readFileSync(doc);
    const r = failure(() => captureGit({ repo, file: 'a.txt', lines: '1:1', doc, id: 'src_a', title: 'A', repositoryLabel: 'app', capturedAt: '2026-09-27T00:00:00Z' }));
    expect(r.code).toBe('E_REF_BROKEN');
    expect(readFileSync(doc).equals(before)).toBe(true);
  });
});
