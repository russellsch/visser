// Math command paths through the built, verified release. All documents and
// VISSER_HOME state are local temporary fixtures; no network is configured.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { compileWithToolkit } from '../../packages/cli/src/commands/build.ts';
import { verifyRelease } from '../../packages/cli/src/toolkit.ts';
import { toolkitCopy } from './resolution.fixtures.ts';

const root = new URL('../..', import.meta.url).pathname;
const release = join(root, 'dist/release');
const cli = join(release, 'bin/visser.cjs');
const temps: string[] = [];
afterEach(() => { for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function context() {
  const base = mkdtempSync(join(tmpdir(), 'visser-math-integration-'));
  temps.push(base);
  const repo = join(base, 'repo');
  mkdirSync(join(repo, '.git'), { recursive: true });
  const env = { ...process.env, VISSER_HOME: join(base, 'home'), HOME: join(base, 'home') };
  const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args],
    { cwd: repo, env, encoding: 'utf8', timeout: 30_000 });
  const dir = join(repo, 'docs', 'math');
  const init = run('init', dir, '--kind', 'teaching', '--title', 'Math integration', '--toolkit-dir', release);
  expect(init.status, `${init.stdout}\n${init.stderr}`).toBe(0);
  const index = join(dir, 'index.md');
  const header = /^---\n[\s\S]*?\n---\n/.exec(readFileSync(index, 'utf8'))?.[0];
  expect(header).toBeDefined();
  const write = (body: string) => { writeFileSync(index, `${header}\n${body}`); return index; };
  return { base, repo, dir, index, run, write };
}

function outputTree(dir: string): Record<string, string> {
  if (!existsSync(dir)) return {};
  const files = (folder: string): string[] => readdirSync(folder).flatMap(name => {
    const path = join(folder, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
  return Object.fromEntries(files(dir).map(path => [relative(dir, path), createHash('sha256').update(readFileSync(path)).digest('hex')]));
}

function jsonResult(result: ReturnType<ReturnType<typeof context>['run']>) {
  try { return JSON.parse(result.stdout) as Record<string, any>; }
  catch { throw new Error(`Expected JSON result, got:\n${result.stdout}\n${result.stderr}`); }
}

const validBody = '<!-- vs:id intro -->\nUse $x_i$ and {% eqref ref="eq_energy" /%}.\n\n{% equation id="eq_energy" %}\nE = mc^2\n{% /equation %}\n';
const invalidBody = '<!-- vs:id intro -->\nUse $\\unknownVisserCommand{x}$ and {% eqref ref="eq_energy" /%}.\n\n{% equation id="eq_energy" %}\nE = mc^2\n{% /equation %}\n';

describe('installed-release math command integration @M01 @M05 @M06 @M07 @M12 @M14', () => {
  it('ordinary check, release check, build, and both exports report the same unsupported source line without publishing', () => {
    const ctx = context();
    ctx.write(validBody);
    const buildOut = join(ctx.repo, 'built');
    const htmlOut = join(ctx.repo, 'prior.html');
    const siteOut = join(ctx.repo, 'prior-site');
    for (const args of [
      ['build', ctx.index, '--out', buildOut],
      ['export', ctx.index, '--out', htmlOut],
      ['export', ctx.index, '--format', 'site', '--out', siteOut],
    ]) {
      const result = ctx.run(...args);
      expect(result.status, `${args.join(' ')}\n${result.stdout}\n${result.stderr}`).toBe(0);
    }
    const beforeBuild = outputTree(buildOut);
    const beforeHtml = readFileSync(htmlOut);
    const beforeSite = outputTree(siteOut);
    ctx.write(invalidBody);
    const sourceLine = readFileSync(ctx.index, 'utf8').slice(0, readFileSync(ctx.index, 'utf8').indexOf('\\unknownVisserCommand')).split('\n').length;
    for (const args of [
      ['check', ctx.index, '--json'],
      ['check', ctx.index, '--release', '--toolkit-dir', release, '--json'],
      ['build', ctx.index, '--out', buildOut, '--json'],
      ['export', ctx.index, '--out', join(ctx.repo, 'new.html'), '--json'],
      ['export', ctx.index, '--format', 'site', '--out', join(ctx.repo, 'new-site'), '--json'],
    ]) {
      const result = ctx.run(...args);
      expect(result.status, `${args.join(' ')}\n${result.stdout}\n${result.stderr}`).not.toBe(0);
      const combined = `${result.stdout}\n${result.stderr}`;
      expect(combined, args.join(' ')).toContain('E_MATH');
      expect(combined, args.join(' ')).toContain('index.md');
      expect(combined, args.join(' ')).toMatch(new RegExp(`:${sourceLine}\\b|"startLine":\\s*${sourceLine}\\b`));
    }
    expect(outputTree(buildOut)).toEqual(beforeBuild);
    expect(readFileSync(htmlOut)).toEqual(beforeHtml);
    expect(outputTree(siteOut)).toEqual(beforeSite);
    expect(existsSync(join(ctx.repo, 'new.html'))).toBe(false);
    expect(existsSync(join(ctx.repo, 'new-site'))).toBe(false);
  }, 120_000);

  it('exports stable numbered references and only the needed math asset', () => {
    const ctx = context();
    ctx.write(validBody);
    const htmlOut = join(ctx.repo, 'math.html');
    const htmlResult = ctx.run('export', ctx.index, '--out', htmlOut, '--json');
    expect(htmlResult.status, htmlResult.stderr).toBe(0);
    const html = readFileSync(htmlOut, 'utf8');
    expect(html).toMatch(/<a\b(?=[^>]*\bhref="#x-eq_energy")[^>]*>Equation \(1\)<\/a>/);
    expect(html.match(/id="x-eq_energy"/g)).toHaveLength(1);
    expect(html).toContain('name="vs-math-expressions"');
    expect(html).toContain('worker-src blob:');
    expect(html.match(/<script src="data:text\/javascript/g)).toHaveLength(2);
    expect(html).not.toContain('_visser/assets');
    const siteOut = join(ctx.repo, 'math-site');
    const siteResult = ctx.run('export', ctx.index, '--format', 'site', '--out', siteOut, '--json');
    expect(siteResult.status, siteResult.stderr).toBe(0);
    const report = jsonResult(siteResult);
    expect(report.assetPacks[0].files).toEqual(['math.js', 'reader.css', 'reader.js']);
    const snapshot = join(siteOut, report.documents[0].path);
    const siteHtml = readFileSync(snapshot, 'utf8');
    expect(siteHtml).toContain('/math.js" defer integrity="sha256-');
    expect(siteHtml).toMatch(/<a\b(?=[^>]*\bhref="#x-eq_energy")[^>]*>Equation \(1\)<\/a>/);
    expect(existsSync(join(siteOut, report.assetPacks[0].path, 'math.js'))).toBe(true);
  }, 60_000);

  it('keeps a no-math export and asset pack free of math delivery bytes', () => {
    const ctx = context();
    ctx.write('<!-- vs:id intro -->\nOrdinary prose and `$x$` in code.\n');
    const htmlOut = join(ctx.repo, 'plain.html');
    const standalone = ctx.run('export', ctx.index, '--out', htmlOut);
    expect(standalone.status, standalone.stderr).toBe(0);
    const html = readFileSync(htmlOut, 'utf8');
    expect(html).not.toContain('vs-math-expressions');
    expect(html).not.toContain('worker-src blob:');
    expect(html.match(/<script src="data:text\/javascript/g)).toHaveLength(1);
    const siteOut = join(ctx.repo, 'plain-site');
    const exported = ctx.run('export', ctx.index, '--format', 'site', '--out', siteOut, '--json');
    expect(exported.status, exported.stderr).toBe(0);
    const report = jsonResult(exported);
    expect(report.assetPacks[0].files).toEqual(['reader.css', 'reader.js']);
    expect(outputTree(siteOut)).not.toHaveProperty(`${report.assetPacks[0].path}/math.js`);
  }, 60_000);

  it('source-mode compilation rejects a re-signed browser pack with a different math policy', async () => {
    const ctx = context();
    ctx.write(validBody);
    const altered = join(ctx.base, 'altered-release');
    toolkitCopy(altered, dir => {
      const path = join(dir, 'browser', 'math.js');
      const text = readFileSync(path, 'utf8');
      expect(text).toMatch(/^\/\*visser-math-policy:[a-f0-9]{64}\*\//);
      writeFileSync(path, text.replace(/^\/\*visser-math-policy:[a-f0-9]{64}\*\//, `/*visser-math-policy:${'0'.repeat(64)}*/`));
    });
    const selected = verifyRelease(altered);
    await expect(compileWithToolkit(loadBundle(ctx.index), {
      release: selected, development: true, warnings: [], source: 'dev-toolkit',
    }, { audience: 'private', includeSource: false, layoutFallback: false, nodeVersion: process.version }))
      .rejects.toMatchObject({ code: 'E_INTEGRITY' });
  }, 60_000);
});
