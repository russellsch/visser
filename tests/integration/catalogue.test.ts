// `catalogue list|show` against the built release (§9.1, §17.1), and the
// handoff guide's flow run through the built CLI with the exit codes that
// references/handoff.md documents.
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { guideTemplate, patternSchema, PATTERNS } from '../../packages/core/src/catalogue/index.ts';
import { validateAgainst } from '../../packages/core/src/model/schemas.ts';
import { CliError, parseArgs } from '../../packages/cli/src/cli-util.ts';
import { runCatalogue } from '../../packages/cli/src/commands/catalogue.ts';

const root = new URL('../..', import.meta.url).pathname;
const release = join(root, 'dist/release');
const cli = join(release, 'bin/visser.cjs');
const env = () => ({ ...process.env, VISSER_HOME: mkdtempSync(join(tmpdir(), 'visser-home-')) });


afterEach(() => {
  vi.restoreAllMocks();
});

function capture(): () => string {
  let out = '';
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    out += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
    return true;
  });
  return () => out;
}

async function catalogue(...argv: string[]): Promise<{ code: number; json: Record<string, unknown> }> {
  const out = capture();
  const code = await runCatalogue(parseArgs([...argv, '--json']), { env: env(), cwd: tmpdir(), ownRelease: release });
  const text = out();
  vi.restoreAllMocks();
  return { code, json: JSON.parse(text) as Record<string, unknown> };
}

describe('catalogue list|show (§17.1) @R16', () => {
  it('the release ships every guide, the handoff guide, and the canonical wrapper', () => {
    for (const p of PATTERNS) expect(existsSync(join(release, 'skills/visual-explain/references/catalogue', `${p.name}.md`)), p.name).toBe(true);
    expect(existsSync(join(release, 'skills/visual-explain/references/handoff.md'))).toBe(true);
    expect(existsSync(join(release, 'skills/visual-explain/wrapper/SKILL.md'))).toBe(true);
  });

  it('list prints every pattern with its question, from the resolved toolkit', async () => {
    const { code, json } = await catalogue('list');
    expect(code).toBe(0);
    expect(validateAgainst('catalogue', json)).toEqual({ ok: true });
    const entries = json['entries'] as Array<{ name: string; question: string; path: string }>;
    expect(entries.map((e) => e.name)).toEqual(PATTERNS.map((p) => p.name));
    for (const e of entries) expect(e.path.startsWith(join(release, 'skills'))).toBe(true);
  });

  it('show prints the guide, the template, or the attribute rules', async () => {
    const guide = await catalogue('show', 'trace');
    expect(validateAgainst('catalogue', guide.json)).toEqual({ ok: true });
    const text = guide.json['guide'] as string;
    expect(text).toContain('# Execution trace');

    const template = await catalogue('show', 'trace', '--part', 'template');
    expect(validateAgainst('catalogue', template.json)).toEqual({ ok: true });
    expect(template.json['template']).toBe(guideTemplate(text));

    const schema = await catalogue('show', 'state', '--part', 'schema');
    expect(validateAgainst('catalogue', schema.json)).toEqual({ ok: true });
    expect(schema.json['tags']).toEqual(JSON.parse(JSON.stringify(patternSchema(PATTERNS.find((p) => p.name === 'state')!))));
  });

  it('an unknown pattern or part is E_USAGE (exit 2)', async () => {
    for (const argv of [['show', 'pie-chart'], ['show', 'trace', '--part', 'example'], ['list', 'extra'], ['remove']]) {
      await expect(runCatalogue(parseArgs(argv), { env: env(), ownRelease: release })).rejects.toSatisfy(
        (e: unknown) => e instanceof CliError && e.code === 'E_USAGE' && e.exitCode === 2,
      );
    }
  });

  it('schema JSON rejects a show without its part payload', () => {
    const entry = { name: 'trace', title: 'T', question: 'Q?', path: '/x' };
    const toolkit = { sha256: 'a'.repeat(64), version: '0.0.0', dir: '/x' };
    expect(validateAgainst('catalogue', { schema: 'visser-catalogue/1', toolkit, entry, part: 'guide' }).ok).toBe(false);
    expect(validateAgainst('catalogue', { schema: 'visser-catalogue/1', toolkit, entry, part: 'guide', template: 'x' }).ok).toBe(false);
  });
});

describe('handoff guide flow through the built CLI', () => {
  it('resolve, replace, stale, refresh, and retire give the documented exit codes', () => {
    const e = env();
    const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: e, cwd: repo });
    const repo = mkdtempSync(join(tmpdir(), 'visser-handoff-'));
    mkdirSync(join(repo, '.git'));
    const bundle = join(repo, 'docs', 'explanations', 'notes');
    expect(run('init', bundle, '--kind', 'teaching', '--title', 'Notes', '--toolkit-dir', release).status).toBe(0);
    const doc = join(bundle, 'index.md');
    appendFileSync(doc, '\n<!-- vs:id p_one -->\nFirst claim.\n\n<!-- vs:id p_two -->\nSecond claim.\n');
    expect(run('check', doc).status).toBe(0);

    const show = run('refs', 'show', doc, 'p_one');
    expect(show.status, show.stderr).toBe(0);
    const packet = join(repo, 'ref.yaml');
    writeFileSync(packet, show.stdout);

    const exact = run('refs', 'resolve', '--packet', packet, '--json');
    expect(exact.status).toBe(0);
    const resolved = JSON.parse(exact.stdout);
    expect(resolved.status).toBe('exact');

    const replacement = join(repo, 'new.md');
    writeFileSync(replacement, '<!-- vs:id p_one -->\nFirst claim, restated.\n');
    const replaced = run('refs', 'replace', '--packet', packet, '--replacement', replacement, '--expected-revision', resolved.currentRevision ?? resolved.viewedRevision, '--json');
    expect(replaced.status, replaced.stderr + replaced.stdout).toBe(0);

    // The old packet is now stale (exit 5).
    const stale = run('refs', 'resolve', '--packet', packet, '--json');
    expect(stale.status).toBe(5);
    const staleJson = JSON.parse(stale.stdout);
    expect(staleJson.status).toBe('stale');

    // The body changed, so refresh needs --acknowledge-body-change (exit 5 without it).
    const refused = run('refs', 'refresh', '--packet', packet, '--expected-current', staleJson.currentRevision, '--acknowledge-stale');
    expect(refused.status).toBe(5);
    expect(refused.stderr + refused.stdout).toContain('E_REF_STALE');
    const refreshed = run('refs', 'refresh', '--packet', packet, '--expected-current', staleJson.currentRevision, '--acknowledge-stale', '--acknowledge-body-change');
    expect(refreshed.status, refreshed.stderr).toBe(0);
    const packet2 = join(repo, 'ref2.yaml');
    writeFileSync(packet2, refreshed.stdout);

    // Retire p_two into p_one, then the p_two packet resolves as deleted (exit 2).
    const other = join(repo, 'other.yaml');
    writeFileSync(other, run('refs', 'show', doc, 'p_two').stdout);
    const retired = run('refs', 'retire', '--packet', other, '--reason', 'merged into p_one', '--replacement', 'p_one', '--expected-revision', staleJson.currentRevision);
    expect(retired.status, retired.stderr + retired.stdout).toBe(0);
    const deleted = run('refs', 'resolve', '--packet', other, '--json');
    expect(JSON.parse(deleted.stdout).status).toBe('deleted');
    expect(deleted.status).toBe(2);
    expect(readFileSync(doc, 'utf8')).toContain('merged into p_one');
    expect(run('check', doc).status).toBe(0);
  });
});
