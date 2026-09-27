// `check --verify-origins` (§8.5): states, comparison, and no fetching.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { captureFile, captureGit, documentRepository, sourceBlock, verifyOrigins } from '../../packages/core/src/provenance/index.ts';
import { frontmatter, makeFixture, type Fixture } from './capture.fixtures.ts';

let fx: Fixture;
beforeEach(() => { fx = makeFixture(); });
afterEach(() => fx.cleanup());

const AT = '2026-09-27T00:00:00Z';
const NOW = () => new Date('2026-09-28T10:00:00Z');

function verify(doc: string, map: Record<string, string>) {
  return verifyOrigins(loadBundle(doc), new Map(Object.entries(map)), NOW);
}

describe('check --verify-origins @R07', () => {
  it('matches a committed capture, and still matches after later commits change the file', () => {
    const repo = fx.repo('r');
    const doc = fx.doc('d');
    captureGit({ repo, file: 'a.txt', lines: '1:2', doc, id: 'src_a', title: 'A', repositoryLabel: 'app', capturedAt: AT });
    expect(verify(doc, { app: repo }).origins).toEqual([{ id: 'src_a', kind: 'git', state: 'origin-matched' }]);
    writeFileSync(join(repo, 'a.txt'), 'rewritten\n');
    fx.git(repo, 'commit', '-qam', 'later');
    const out = verify(doc, { app: repo });
    expect(out.origins[0]!.state).toBe('origin-matched');
    expect(out.diagnostics).toEqual([]);
  });

  it('reports origin-unavailable as a warning when the commit is missing or no clone is mapped', () => {
    const repo = fx.repo('r');
    const doc = fx.doc('d');
    captureGit({ repo, file: 'a.txt', lines: '1:2', doc, id: 'src_a', title: 'A', repositoryLabel: 'app', capturedAt: AT });
    const unrelated = fx.repo('unrelated', { 'a.txt': 'line1\nline2\nline3\n', 'other.txt': 'x\n' });
    const missing = verify(doc, { app: unrelated });
    expect(missing.origins[0]).toMatchObject({ state: 'origin-unavailable' });
    expect(missing.diagnostics.map((d) => [d.code, d.severity])).toEqual([['W_ORIGIN_UNAVAILABLE', 'warning']]);
    const unmapped = verify(doc, {});
    expect(unmapped.origins[0]!.reason).toContain('--repo-map app=PATH');
  });

  it('gives one W_ORIGIN_UNAVAILABLE for each unmapped repository, naming its sources', () => {
    const repo = fx.repo('r');
    const doc = fx.doc('d');
    for (const [id, lines] of [['src_a', '1:1'], ['src_b', '2:2'], ['src_c', '1:3']] as const) {
      captureGit({ repo, file: 'a.txt', lines, doc, id, title: id, repositoryLabel: 'app', capturedAt: AT });
    }
    const out = verify(doc, {});
    expect(out.origins.map((o) => o.state)).toEqual(['origin-unavailable', 'origin-unavailable', 'origin-unavailable']);
    expect(out.diagnostics).toHaveLength(1);
    expect(out.diagnostics[0]).toMatchObject({ code: 'W_ORIGIN_UNAVAILABLE', severity: 'warning' });
    expect(out.diagnostics[0]!.message).toContain('src_a, src_b, src_c');
    expect(out.diagnostics[0]!.message).toContain('--repo-map app=PATH');
  });

  it('check --verify-origins uses the clone that holds the document when its remote matches, without --repo-map', () => {
    const repo = fx.repo('app', { 'a.txt': 'line1\nline2\nline3\n' });
    fx.git(repo, 'remote', 'add', 'origin', 'https://github.com/acme/app.git');
    const bundle = join(repo, 'docs', 'explanations', 'notes');
    mkdirSync(bundle, { recursive: true });
    const doc = join(bundle, 'index.md');
    writeFileSync(doc, `${frontmatter()}\n<!-- ex:id intro -->\nIntro paragraph.\n`);
    captureGit({ repo, file: 'a.txt', lines: '1:2', doc, id: 'src_a', title: 'A', capturedAt: AT });
    const recorded = loadBundle(doc).parsed.targets.find((t) => t.id === 'src_a')!.attributes['repository'];
    expect(documentRepository(bundle)).toEqual([recorded, repo]);
    const cli = join(new URL('../..', import.meta.url).pathname, 'dist/release/bin/explain.cjs');
    const r = spawnSync(process.execPath, [cli, 'check', doc, '--verify-origins', '--json'], { encoding: 'utf8', env: { ...process.env, EXPLAIN_HOME: join(fx.root, 'home') } });
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout).origins).toEqual([{ id: 'src_a', kind: 'git', state: 'origin-matched' }]);
  });

  it('reports a mismatch as E_ORIGIN_MISMATCH when the stored excerpt differs from the commit', () => {
    const repo = fx.repo('r');
    const commit = fx.git(repo, 'rev-parse', 'HEAD').trim();
    const doc = fx.doc('d');
    // A consistent excerpt (its own hash matches) whose text is not what the commit holds.
    const text = 'line1\nEDITED\n';
    const sha = createHash('sha256').update(text).digest('hex');
    writeFileSync(doc, readFileSync(doc, 'utf8') + '\n' + sourceBlock({ id: 'src_a', kind: 'git', title: 'A', repository: 'app', commit, file: 'a.txt', start: 1, end: 2, capturedAt: AT, excerptSha256: sha }, { text }));
    expect(loadBundle(doc).diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const out = verify(doc, { app: repo });
    expect(out.origins[0]).toMatchObject({ state: 'origin-mismatch' });
    expect(out.diagnostics.map((d) => d.code)).toEqual(['E_ORIGIN_MISMATCH']);
  });

  it('labels a working-tree match with its time and reports a later edit as a mismatch', () => {
    const repo = fx.repo('r');
    fx.git(repo, 'remote', 'add', 'origin', 'https://example.com/org/app.git');
    writeFileSync(join(repo, 'a.txt'), 'wip1\nwip2\n');
    const doc = fx.doc('d');
    captureGit({ repo, file: 'a.txt', lines: '1:2', doc, id: 'src_a', title: 'A', workingTree: true, capturedAt: AT });
    const map = { 'https://example.com/org/app.git': repo };
    const matched = verify(doc, map).origins[0]!;
    expect(matched).toMatchObject({ state: 'working-tree-matched', checkedAt: '2026-09-28T10:00:00Z' });
    expect(matched.state).not.toBe('origin-matched');
    writeFileSync(join(repo, 'a.txt'), 'wip1\nchanged\n');
    expect(verify(doc, map).origins[0]!.state).toBe('origin-mismatch');
  });

  it('does not claim origins for example, supplied, file, web, or link-only sources', () => {
    const doc = fx.doc('d');
    const from = join(fx.root, 'n.txt');
    writeFileSync(from, 'n\n');
    captureFile({ from, kind: 'example', doc, id: 'src_ex', title: 'E' });
    captureFile({ from, kind: 'file', doc, id: 'src_file', title: 'F', capturedAt: AT });
    captureFile({ from, kind: 'web', doc, id: 'src_web', title: 'W', url: 'https://example.com', capturedAt: AT });
    writeFileSync(doc, readFileSync(doc, 'utf8') + '\n{% source id="src_link" kind="web" title="L" url="https://example.com/x" capturedAt="2026-09-27T00:00:00Z" availability="link-only" /%}\n');
    const states = Object.fromEntries(verify(doc, {}).origins.map((o) => [o.id, o.state]));
    expect(states).toEqual({ src_ex: 'capture-consistent', src_file: 'origin-unavailable', src_web: 'origin-unavailable', src_link: 'link-only' });
  });

  it('never fetches from a partial clone during verification', () => {
    const server = fx.repo('server', { 'a.txt': 'lazy\nmore\n' });
    fx.git(server, 'config', 'uploadpack.allowFilter', 'true');
    fx.git(server, 'config', 'uploadpack.allowAnySHA1InWant', 'true');
    const doc = fx.doc('d');
    captureGit({ repo: server, file: 'a.txt', lines: '1:2', doc, id: 'src_a', title: 'A', repositoryLabel: 'app', capturedAt: AT });
    const client = join(fx.root, 'client');
    fx.git(fx.root, 'clone', '-q', '--filter=blob:none', '--no-checkout', `file://${server}`, client);
    const oid = fx.git(client, 'rev-parse', 'HEAD:a.txt').trim();
    const present = () => spawnSync('git', ['-C', client, '-c', 'protocol.allow=never', 'cat-file', '-e', oid], { env: { PATH: process.env['PATH'] ?? '', HOME: fx.root, GIT_CONFIG_NOSYSTEM: '1' } }).status === 0;
    expect(present()).toBe(false);
    expect(verify(doc, { app: client }).origins[0]!.state).toBe('origin-unavailable');
    expect(present()).toBe(false);
  });

  it('ignores refs/replace in the mapped repository', () => {
    const repo = fx.repo('r');
    const doc = fx.doc('d');
    captureGit({ repo, file: 'a.txt', lines: '1:2', doc, id: 'src_a', title: 'A', repositoryLabel: 'app', capturedAt: AT });
    const real = fx.git(repo, 'rev-parse', 'HEAD:a.txt').trim();
    writeFileSync(join(fx.root, 'forged.txt'), 'FORGED\nlines\n');
    fx.git(repo, 'replace', real, fx.git(repo, 'hash-object', '-w', join(fx.root, 'forged.txt')).trim());
    expect(verify(doc, { app: repo }).origins[0]!.state).toBe('origin-matched');
  });
});
