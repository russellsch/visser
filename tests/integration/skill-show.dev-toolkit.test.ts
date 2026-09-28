// `skill show` and `catalogue` honour `--dev-toolkit` (skill-prompts-review-1, F1).
// The shim runs the `--dev-toolkit` release's CLI. That CLI must then print the
// skill text and the guides of the same release, not the text of the workspace
// or user default. The fixture has an "old" user default toolkit with a changed
// SKILL.md, and a temp copy of a repository with its own dist/release.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseArgs } from '../../packages/cli/src/cli-util.ts';
import { runSkill } from '../../packages/cli/src/commands/skill.ts';
import { runCatalogue } from '../../packages/cli/src/commands/catalogue.ts';
import { cli, fixture, installUser, repoWithDocument, toolkitCopy, type Fixture } from './resolution.fixtures.ts';

const OLD = 'OLD DEFAULT SKILL TEXT: an agent must not read this.\n';

afterEach(() => {
  vi.restoreAllMocks();
});

async function capture(run: () => Promise<number>): Promise<{ code: number; out: string }> {
  let out = '';
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    out += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
    return true;
  });
  const code = await run();
  vi.restoreAllMocks();
  return { code, out };
}

let fx: Fixture;
let repo: string;
let devRelease: string;
let oldDigest: string;

beforeAll(() => {
  expect(existsSync(cli), 'run `npm run build` first').toBe(true);
  fx = fixture();
  // The user default: a toolkit whose SKILL.md is the old text.
  const old = join(fx.root, 'old-toolkit');
  toolkitCopy(old, (dir) => writeFileSync(join(dir, 'skills', 'visual-explain', 'SKILL.md'), OLD));
  oldDigest = installUser(fx, old);
  writeFileSync(join(fx.home, 'default'), `${oldDigest}\n`);
  // A temp copy of a repository that holds its own build in dist/release.
  repo = join(fx.root, 'visser-copy');
  mkdirSync(join(repo, '.git'), { recursive: true });
  devRelease = join(repo, 'dist', 'release');
  toolkitCopy(devRelease);
});

describe('skill show and catalogue honour --dev-toolkit (F1)', () => {
  it('without --dev-toolkit, skill show prints the user default (the fixture is not trivial)', async () => {
    const { code, out } = await capture(() => runSkill(parseArgs(['show']), { env: fx.env, cwd: repo, ownRelease: undefined }));
    expect(code).toBe(0);
    expect(out).toContain(OLD);
  });

  it('skill show --dev-toolkit dist/release prints the dist/release skill text', async () => {
    const { code, out } = await capture(() => runSkill(parseArgs(['show', '--dev-toolkit', 'dist/release']), { env: fx.env, cwd: repo, ownRelease: undefined }));
    expect(code).toBe(0);
    const dist = readFileSync(join(devRelease, 'skills', 'visual-explain', 'SKILL.md'), 'utf8');
    expect(out).toContain(`(dev-toolkit: ${devRelease})`);
    expect(out).toContain(dist);
    expect(out).not.toContain(OLD);
    expect(out).toContain(join(devRelease, 'skills', 'visual-explain', 'references', 'format.md'));
  });

  it('skill show --json reports source dev-toolkit', async () => {
    const { out } = await capture(() => runSkill(parseArgs(['show', '--dev-toolkit', 'dist/release', '--json']), { env: fx.env, cwd: repo, ownRelease: undefined }));
    const json = JSON.parse(out) as { toolkit: { dir: string; source: string }; skill: { path: string } };
    expect(json.toolkit).toMatchObject({ dir: devRelease, source: 'dev-toolkit' });
    expect(json.skill.path.startsWith(devRelease)).toBe(true);
  });

  it('--dev-toolkit wins over the lock of --doc', async () => {
    const { doc } = repoWithDocument(fx, 'with-doc', oldDigest);
    const locked = await capture(() => runSkill(parseArgs(['show', '--doc', doc]), { env: fx.env, cwd: fx.root, ownRelease: undefined }));
    expect(locked.out).toContain(OLD);
    const dev = await capture(() => runSkill(parseArgs(['show', '--doc', doc, '--dev-toolkit', devRelease]), { env: fx.env, cwd: fx.root, ownRelease: undefined }));
    expect(dev.code).toBe(0);
    expect(dev.out).not.toContain(OLD);
    expect(dev.out).toContain(`(dev-toolkit: ${devRelease})`);
  });

  it('catalogue list and show --dev-toolkit read the dist/release guides', async () => {
    const list = await capture(() => runCatalogue(parseArgs(['list', '--dev-toolkit', 'dist/release', '--json']), { env: fx.env, cwd: repo, ownRelease: undefined }));
    expect(list.code).toBe(0);
    const listed = JSON.parse(list.out) as { toolkit: { dir: string }; entries: Array<{ path: string }> };
    expect(listed.toolkit.dir).toBe(devRelease);
    for (const e of listed.entries) expect(e.path.startsWith(devRelease)).toBe(true);
    const show = await capture(() => runCatalogue(parseArgs(['show', 'mermaid', '--dev-toolkit', 'dist/release', '--json']), { env: fx.env, cwd: repo, ownRelease: undefined }));
    const shown = JSON.parse(show.out) as { toolkit: { dir: string }; guide: string };
    expect(shown.toolkit.dir).toBe(devRelease);
    expect(shown.guide).toBe(readFileSync(join(devRelease, 'skills', 'visual-explain', 'references', 'catalogue', 'mermaid.md'), 'utf8'));
  });
});
