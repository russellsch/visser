// Native-flowchart delivery contract: exercise the built CLI and the selected
// release, including the reader marker and catalogue's owner-aware schema.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FLOWCHART_READER_MARKER } from '../../packages/core/src/compiler/flowchart-contract.ts';
import { toolkitCopy } from './resolution.fixtures.ts';

const root = new URL('../..', import.meta.url).pathname;
const release = join(root, 'dist/release');
const cli = join(release, 'bin/visser.cjs');
const fixture = join(root, 'tests/fixtures/positive/native-flowchart.md');

type Context = { root: string; repo: string; doc: string; env: NodeJS.ProcessEnv; run: (...args: string[]) => ReturnType<typeof spawnSync> & { stdout: string; stderr: string } };

function context(): Context {
  const base = mkdtempSync(join(tmpdir(), 'visser-flowchart-delivery-'));
  const repo = join(base, 'repo');
  mkdirSync(join(repo, '.git'), { recursive: true });
  const doc = join(repo, 'index.md');
  cpSync(fixture, doc);
  const env = { ...process.env, VISSER_HOME: join(base, 'home') };
  const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { cwd: repo, env, encoding: 'utf8', timeout: 120_000 }) as ReturnType<Context['run']>;
  return { root: base, repo, doc, env, run };
}

function tree(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const visit = (path: string): void => {
    for (const name of readdirSync(path)) {
      const child = join(path, name);
      if (statSync(child).isDirectory()) visit(child);
      else out[relative(dir, child)] = readFileSync(child, 'utf8');
    }
  };
  visit(dir);
  return out;
}

function outputPaths(html: string): string[] {
  return [...html.matchAll(/\s(?:src|href)="([^"]*)"/g)].map((match) => match[1]!);
}

function embeddedAssets(html: string): string[] {
  return outputPaths(html)
    .filter((url) => url.startsWith('data:'))
    .map((url) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64').toString('utf8'));
}

describe('native flowchart delivery @FCdelivery @T08 @T09 @T10', () => {
  it('the built release checks, builds, exports a relocatable standalone file, and does not deliver Mermaid', () => {
    const ctx = context();
    const checked = ctx.run('check', ctx.doc, '--toolkit-dir', release, '--json');
    expect(checked.status, checked.stderr).toBe(0);

    const built = join(ctx.repo, 'built');
    const build = ctx.run('build', ctx.doc, '--dev-toolkit', release, '--out', built, '--json');
    expect(build.status, `${build.stdout}\n${build.stderr}`).toBe(0);
    expect(Object.keys(tree(built)).some((path) => path.endsWith('/index.html'))).toBe(true);

    const out = join(ctx.repo, 'flowchart.html');
    const exported = ctx.run('export', ctx.doc, '--dev-toolkit', release, '--out', out, '--json');
    expect(exported.status, `${exported.stdout}\n${exported.stderr}`).toBe(0);
    const html = readFileSync(out, 'utf8');
    expect(embeddedAssets(html)).toEqual(expect.arrayContaining([expect.stringContaining(FLOWCHART_READER_MARKER)]));
    expect(html).not.toContain('mermaid.js');
    for (const url of outputPaths(html)) expect(url.startsWith('data:') || url.startsWith('#')).toBe(true);

    const relocated = join(ctx.root, 'relocated');
    mkdirSync(relocated);
    cpSync(out, join(relocated, 'flowchart.html'));
    const moved = readFileSync(join(relocated, 'flowchart.html'), 'utf8');
    expect(moved).toBe(html);
    expect(readdirSync(relocated)).toEqual(['flowchart.html']);
  }, 120_000);

  it('rejects a selected release whose reader lacks either flowchart contract marker', () => {
    const ctx = context();
    const old = join(ctx.root, 'old-release');
    toolkitCopy(old, (dir) => {
      for (const name of ['reader.js', 'reader.css']) {
        const asset = join(dir, 'browser', name);
        writeFileSync(asset, readFileSync(asset, 'utf8').replace(FLOWCHART_READER_MARKER, '/* old reader */'));
      }
    });
    const out = join(ctx.repo, 'built');
    const result = spawnSync(process.execPath, [join(old, 'bin/visser.cjs'), 'build', ctx.doc, '--dev-toolkit', old, '--out', out, '--json'], {
      cwd: ctx.repo, env: ctx.env, encoding: 'utf8', timeout: 120_000,
    });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain('E_INTEGRITY');
    expect(existsSync(out)).toBe(false);
  }, 120_000);

  it('retains a prior build when source validation or resource limits reject a changed flowchart', () => {
    const ctx = context();
    const out = join(ctx.repo, 'built');
    const first = ctx.run('build', ctx.doc, '--dev-toolkit', release, '--out', out);
    expect(first.status, first.stderr).toBe(0);
    const before = tree(out);
    const source = readFileSync(ctx.doc, 'utf8');

    writeFileSync(ctx.doc, source.replace('direction="down"', 'direction="diagonal"'));
    const syntax = ctx.run('build', ctx.doc, '--dev-toolkit', release, '--out', out, '--json');
    expect(syntax.status).not.toBe(0);
    expect(`${syntax.stdout}\n${syntax.stderr}`).toContain('E_SYNTAX');
    expect(tree(out)).toEqual(before);

    const groups = Array.from({ length: 17 }, (_, i) => `{% group id="g${i}" label="G${i}" /%}`).join('\n');
    writeFileSync(ctx.doc, source
      .replace('{% group id="validation" label="Validation" color="teal" /%}\n{% group id="repair" label="Repair" parent="validation" color="amber" collapsed=true /%}', groups)
      .replaceAll(' group="validation"', '')
      .replaceAll(' group="repair"', ''));
    const limited = ctx.run('build', ctx.doc, '--dev-toolkit', release, '--out', out, '--json');
    expect(limited.status).not.toBe(0);
    expect(`${limited.stdout}\n${limited.stderr}`).toContain('E_LAYOUT_LIMIT');
    expect(tree(out)).toEqual(before);
  }, 120_000);

  it('returns owner-specific group schemas through the public catalogue command', () => {
    const ctx = context();
    const flowchart = ctx.run('catalogue', 'show', 'flowchart', '--part', 'schema', '--toolkit-dir', release, '--json');
    expect(flowchart.status, flowchart.stderr).toBe(0);
    const flowchartGroup = (JSON.parse(flowchart.stdout).tags as Array<{ tag: string; optional: Record<string, string> }>).find((tag) => tag.tag === 'group');
    expect(flowchartGroup?.optional).toHaveProperty('color');

    const architecture = ctx.run('catalogue', 'show', 'architecture', '--part', 'schema', '--toolkit-dir', release, '--json');
    expect(architecture.status, architecture.stderr).toBe(0);
    const architectureGroup = (JSON.parse(architecture.stdout).tags as Array<{ tag: string; optional: Record<string, string> }>).find((tag) => tag.tag === 'group');
    expect(architectureGroup?.optional).not.toHaveProperty('color');
  });
});
