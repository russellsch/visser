// `explain export --format site` (§13.1, §13.5, §17.7 4b) through the built
// CLI. Every test uses its own EXPLAIN_HOME and a temporary repository.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateAgainst } from '../../packages/core/src/model/schemas.ts';

const root = new URL('../..', import.meta.url).pathname;
const release = join(root, 'dist/release');
const cli = join(release, 'bin/explain.cjs');


type Ctx = { env: NodeJS.ProcessEnv; repo: string; run: (...args: string[]) => ReturnType<typeof spawnSync> & { stdout: string; stderr: string } };

function context(): Ctx {
  const base = mkdtempSync(join(tmpdir(), 'explain-export-'));
  const repo = join(base, 'repo');
  mkdirSync(join(repo, '.git'), { recursive: true });
  const env = { ...process.env, EXPLAIN_HOME: join(base, 'home') };
  const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env, cwd: repo }) as ReturnType<Ctx['run']>;
  return { env, repo, run };
}

function initDoc(ctx: Ctx, name: string, opts: { title?: string; visibility?: 'public' | 'private' } = {}): string {
  const dir = join(ctx.repo, 'docs', name);
  const result = ctx.run('init', dir, '--kind', 'teaching', '--title', opts.title ?? `Notes ${name}`);
  expect(result.status, result.stderr).toBe(0);
  const index = join(dir, 'index.md');
  if (opts.visibility === 'public') writeFileSync(index, readFileSync(index, 'utf8').replace('visibility: private', 'visibility: public'));
  return index;
}

/** A git source captured from a small local repository, recorded under `label`. */
function captureGitSource(ctx: Ctx, index: string, label: string): void {
  const lib = mkdtempSync(join(tmpdir(), 'explain-lib-'));
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', ...args], { cwd: lib, stdio: 'pipe' });
  git('init', '-q');
  writeFileSync(join(lib, 'a.py'), 'one = 1\ntwo = 2\n');
  git('add', 'a.py');
  git('commit', '-qm', 'x');
  const result = ctx.run('capture', 'git', '--repo', lib, '--file', 'a.py', '--lines', '1:2', '--doc', index, '--id', 'src_a', '--title', 'A', '--repository-label', label);
  expect(result.status, result.stderr).toBe(0);
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

function exportJson(result: { status: number | null; stdout: string; stderr: string }) {
  expect(result.status, result.stderr).toBe(0);
  const report = JSON.parse(result.stdout);
  expect(validateAgainst('export', report)).toEqual({ ok: true });
  return report;
}

describe('export --format site', () => {
  it('@R10 twenty documents share one asset pack, and every page URL is relative and resolves', () => {
    const ctx = context();
    const docs = Array.from({ length: 20 }, (_, i) => initDoc(ctx, `doc${String(i).padStart(2, '0')}`));
    const collection = join(ctx.repo, 'docs', 'collection.json');
    writeFileSync(collection, JSON.stringify({ schema: 'explain-collection/1', title: 'All notes', documents: docs.map((d) => ({ path: relative(dirname(collection), dirname(d)) })) }));
    const site = join(ctx.repo, 'site');
    const report = exportJson(ctx.run('export', '--collection', collection, '--format', 'site', '--out', site, '--json'));
    expect(report.documents).toHaveLength(20);
    expect(report.assetPacks).toHaveLength(1);
    expect(report.assetPacks[0].files).toEqual(['reader.css', 'reader.js']);

    expect(readdirSync(join(site, '_explain', 'assets'))).toEqual([report.assetPacks[0].toolkitSha256]);
    const files = walk(site);
    const readers = files.filter((f) => f.endsWith('/reader.js') || f.endsWith('/reader.css'));
    expect(readers.map((f) => relative(site, f)).sort()).toEqual([`${report.assetPacks[0].path}/reader.css`, `${report.assetPacks[0].path}/reader.js`]);
    expect(files.some((f) => f.endsWith('/mermaid.js'))).toBe(false);

    const pages = files.filter((f) => f.endsWith('.html'));
    expect(pages).toHaveLength(21);
    for (const page of pages) {
      const html = readFileSync(page, 'utf8');
      const urls = [...html.matchAll(/\s(?:src|href)="([^"]*)"/g)].map((m) => m[1]!);
      expect(urls.length, page).toBeGreaterThan(0);
      for (const url of urls) {
        if (url.startsWith('#') || /^https?:/.test(url)) continue;
        expect(url.startsWith('/'), `${relative(site, page)}: ${url}`).toBe(false);
        // Each same-site URL resolves inside the site, as it would under a project subpath.
        const target = resolve(dirname(page), url.split('#')[0]!);
        expect(target.startsWith(site + '/'), url).toBe(true);
        expect(existsSync(target), `${relative(site, page)} -> ${url}`).toBe(true);
      }
    }
  }, 60_000);

  it('writes the §13.1 snapshot layout for one document into an empty directory', () => {
    const ctx = context();
    const index = initDoc(ctx, 'one');
    const site = join(ctx.repo, 'site');
    mkdirSync(site);
    const report = exportJson(ctx.run('export', index, '--format', 'site', '--out', site, '--json'));
    const doc = report.documents[0];
    const snapshot = join(site, 'd', doc.docId, doc.sourceRevision, doc.buildId);
    expect(readdirSync(snapshot).sort()).toEqual(['build.json', 'document.md', 'index.html']);
    expect(doc.path).toBe(`d/${doc.docId}/${doc.sourceRevision}/${doc.buildId}/index.html`);
    expect(existsSync(join(site, 'index.html'))).toBe(false);
    expect(report.warnings.map((w: { code: string }) => w.code)).toEqual(expect.arrayContaining(['W_STATIC_HOST_FRAMING', 'W_STATIC_HOST_SRI']));
  });

  it('never overwrites a non-empty directory and leaves no staging directory', () => {
    const ctx = context();
    const index = initDoc(ctx, 'one');
    const site = join(ctx.repo, 'site');
    mkdirSync(site);
    writeFileSync(join(site, 'keep.txt'), 'mine');
    const result = ctx.run('export', index, '--format', 'site', '--out', site);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('not empty');
    expect(readdirSync(site)).toEqual(['keep.txt']);
    expect(readdirSync(ctx.repo).filter((n) => n.includes('.export-'))).toEqual([]);
  });

  it('@R20 a public export stops on a private document unless --allow-private-content', () => {
    const ctx = context();
    const index = initDoc(ctx, 'secret');
    const site = join(ctx.repo, 'site');
    const refused = ctx.run('export', index, '--format', 'site', '--out', site, '--audience', 'public', '--json');
    expect(refused.status).toBe(2);
    expect(JSON.parse(refused.stdout).diagnostics.map((d: { code: string }) => d.code)).toEqual(['E_PRIVATE_EXPORT']);
    expect(existsSync(site)).toBe(false);

    const report = exportJson(ctx.run('export', index, '--format', 'site', '--out', site, '--audience', 'public', '--allow-private-content', '--json'));
    expect(report.allowPrivateContent).toBe(true);
    expect(report.documents[0].visibility).toBe('private');
  });

  it('@R20 a source repository must be in the user-config allowlist; repository config is ignored', () => {
    const ctx = context();
    const index = initDoc(ctx, 'pub', { visibility: 'public' });
    captureGitSource(ctx, index, 'public-lib');

    // Repository config cannot declare its own sources public.
    mkdirSync(join(ctx.repo, '.explain'), { recursive: true });
    writeFileSync(join(ctx.repo, '.explain', 'config.json'), JSON.stringify({ publicRepositories: ['public-lib'] }));
    const refused = ctx.run('export', index, '--format', 'site', '--out', join(ctx.repo, 'site1'), '--audience', 'public', '--json');
    expect(refused.status).toBe(2);
    const diagnostics = JSON.parse(refused.stdout).diagnostics;
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ code: 'E_PRIVATE_EXPORT', targetId: 'src_a' });
    expect(diagnostics[0].message).toContain('public-lib');

    mkdirSync(ctx.env.EXPLAIN_HOME!, { recursive: true });
    writeFileSync(join(ctx.env.EXPLAIN_HOME!, 'config.json'), JSON.stringify({ publicRepositories: ['public-lib'] }));
    const report = exportJson(ctx.run('export', index, '--format', 'site', '--out', join(ctx.repo, 'site2'), '--audience', 'public', '--json'));
    expect(report.sources).toEqual([expect.objectContaining({ id: 'src_a', kind: 'git', repository: 'public-lib', publicRepository: true })]);
    expect(report.warnings.map((w: { code: string }) => w.code)).not.toContain('W_PRIVATE_ORIGIN');
  });

  it('@R20 a source that passes the allowlist only by its recorded name gets W_PUBLIC_BY_NAME', () => {
    const ctx = context();
    const index = initDoc(ctx, 'pub', { visibility: 'public' });
    // The label is free text from `capture git --repository-label`; nothing ties it to the real origin.
    captureGitSource(ctx, index, 'public-lib');
    mkdirSync(ctx.env.EXPLAIN_HOME!, { recursive: true });
    writeFileSync(join(ctx.env.EXPLAIN_HOME!, 'config.json'), JSON.stringify({ publicRepositories: ['public-lib'] }));
    const report = exportJson(ctx.run('export', index, '--format', 'site', '--out', join(ctx.repo, 'site'), '--audience', 'public', '--json'));
    const warning = report.warnings.find((w: { code: string }) => w.code === 'W_PUBLIC_BY_NAME');
    expect(warning, 'W_PUBLIC_BY_NAME').toBeDefined();
    expect(warning.message).toContain('src_a (public-lib)');
    expect(warning.message).toContain('trusts recorded names, not origins');
    // A private export does not need the allowlist, so it gets no such warning.
    const privateReport = exportJson(ctx.run('export', index, '--format', 'site', '--out', join(ctx.repo, 'site-private'), '--json'));
    expect(privateReport.warnings.map((w: { code: string }) => w.code)).not.toContain('W_PUBLIC_BY_NAME');
  });

  it('@R20 the report lists private-origin sources with a warning in a private export', () => {
    const ctx = context();
    const index = initDoc(ctx, 'priv');
    captureGitSource(ctx, index, 'internal-lib');
    const report = exportJson(ctx.run('export', index, '--format', 'site', '--out', join(ctx.repo, 'site'), '--json'));
    expect(report.sources).toEqual([expect.objectContaining({ id: 'src_a', repository: 'internal-lib', publicRepository: false })]);
    expect(report.warnings.map((w: { code: string }) => w.code)).toContain('W_PRIVATE_ORIGIN');
  });

  it('@R20 a public export refuses a development build; a private export marks it', () => {
    const ctx = context();
    const index = initDoc(ctx, 'dev', { visibility: 'public' });
    const lockPath = join(dirname(index), 'explain.lock.json');
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    lock.toolkit.sha256 = 'f'.repeat(64);
    writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');

    const refused = ctx.run('export', index, '--format', 'site', '--out', join(ctx.repo, 'site1'), '--audience', 'public', '--dev-toolkit', release);
    expect(refused.status).toBe(2);
    expect(refused.stderr).toContain('development');
    expect(existsSync(join(ctx.repo, 'site1'))).toBe(false);

    const report = exportJson(ctx.run('export', index, '--format', 'site', '--out', join(ctx.repo, 'site2'), '--dev-toolkit', release, '--json'));
    const buildJson = JSON.parse(readFileSync(join(ctx.repo, 'site2', dirname(report.documents[0].path), 'build.json'), 'utf8'));
    expect(buildJson.development).toBe(true);
  });

  it('@R20 a public export records only the Node major version and leaks no local path or sourceHint', () => {
    const ctx = context();
    const index = initDoc(ctx, 'pub', { visibility: 'public' });
    const site = join(ctx.repo, 'site');
    const report = exportJson(ctx.run('export', index, '--format', 'site', '--out', site, '--audience', 'public', '--json'));
    const snapshot = join(site, dirname(report.documents[0].path));
    const buildJson = JSON.parse(readFileSync(join(snapshot, 'build.json'), 'utf8'));
    expect(buildJson.nodeVersion).toMatch(/^v[0-9]+$/);
    expect(buildJson.effectiveRenderOptions.audience).toBe('public');
    expect(validateAgainst('build', buildJson)).toEqual({ ok: true });
    for (const file of walk(site)) {
      if (file.endsWith('.js') || file.endsWith('.css')) continue;
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toContain('sourceHint');
      expect(text, file).not.toContain(ctx.repo);
    }

    const privateSite = join(ctx.repo, 'site-private');
    const privateReport = exportJson(ctx.run('export', index, '--format', 'site', '--out', privateSite, '--json'));
    const privateBuild = JSON.parse(readFileSync(join(privateSite, dirname(privateReport.documents[0].path), 'build.json'), 'utf8'));
    expect(privateBuild.nodeVersion).toMatch(/^v[0-9]+\.[0-9]+\.[0-9]+$/);
  });

  it('--include-source copies only declared bundle files', () => {
    const ctx = context();
    const index = initDoc(ctx, 'src');
    writeFileSync(join(dirname(index), 'notes.txt'), 'undeclared private notes');
    const site = join(ctx.repo, 'site');
    const report = exportJson(ctx.run('export', index, '--format', 'site', '--out', site, '--include-source', '--json'));
    expect(report.includeSource).toBe(true);
    const snapshot = join(site, dirname(report.documents[0].path));
    expect(readdirSync(join(snapshot, 'source'))).toEqual(['index.md']);
    expect(walk(site).some((f) => f.endsWith('notes.txt'))).toBe(false);
  });

  it('the collection index escapes titles, has its own CSP meta, and has no script', () => {
    const ctx = context();
    const index = initDoc(ctx, 'x', { title: 'Queues & "more"' });
    const collection = join(ctx.repo, 'collection.json');
    writeFileSync(collection, JSON.stringify({ schema: 'explain-collection/1', title: 'A <b>bold</b> "title"', documents: [{ path: 'docs/x/index.md' }] }));
    const site = join(ctx.repo, 'site');
    const report = exportJson(ctx.run('export', '--collection', collection, '--format', 'site', '--out', site, '--json'));
    expect(report.collection).toEqual({ title: 'A <b>bold</b> "title"', path: 'index.html' });
    const html = readFileSync(join(site, 'index.html'), 'utf8');
    expect(html).toContain('<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;self&#39;');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<b>');
    expect(html).toContain('A &lt;b&gt;bold&lt;/b&gt;');
    expect(html).toContain('>Queues &amp; "more"</a>');
    expect(html).toContain(`href="${report.documents[0].path}"`);
  });

  it('a collection path outside the repository is E_PATH_ESCAPE', () => {
    const ctx = context();
    initDoc(ctx, 'x');
    const outside = mkdtempSync(join(tmpdir(), 'explain-outside-'));
    const collection = join(ctx.repo, 'collection.json');
    writeFileSync(collection, JSON.stringify({ schema: 'explain-collection/1', title: 'T', documents: [{ path: relative(ctx.repo, outside) }] }));
    writeFileSync(join(outside, 'index.md'), '---\n---\n');
    const result = ctx.run('export', '--collection', collection, '--format', 'site', '--out', join(ctx.repo, 'site'));
    expect(result.status).toBe(4);
    expect(result.stderr).toContain('E_PATH_ESCAPE');
    expect(existsSync(join(ctx.repo, 'site'))).toBe(false);
  });

  it('--format markdown still prints the projection', () => {
    const ctx = context();
    const index = initDoc(ctx, 'md');
    const result = ctx.run('export', index, '--format', 'markdown');
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('<!-- ex:target overview -->');
  });
});
