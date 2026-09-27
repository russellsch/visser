// A bundle without explain.lock.json (dogfood P6): the error tells the user to
// restore the lock or pass a development toolkit, never to run `init`, which
// refuses an existing bundle.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const release = join(new URL('../..', import.meta.url).pathname, 'dist/release');
const cli = join(release, 'bin/explain.cjs');

describe('a bundle without a lock', () => {
  it('build and the shim say how to recover, and never advise init', () => {
    const root = mkdtempSync(join(tmpdir(), 'explain-nolock-'));
    const env = { ...process.env, EXPLAIN_HOME: join(root, 'home') };
    const repo = join(root, 'repo');
    mkdirSync(join(repo, '.git'), { recursive: true });
    const run = (entry: string, ...args: string[]) => spawnSync(process.execPath, [entry, ...args], { encoding: 'utf8', env, cwd: repo });
    const bundle = join(repo, 'docs', 'explanations', 'notes');
    expect(run(cli, 'init', bundle, '--kind', 'teaching', '--title', 'Notes').status).toBe(0);
    rmSync(join(bundle, 'explain.lock.json'));
    const doc = join(bundle, 'index.md');
    expect(run(cli, 'install', '--from-dir', release, '--scope', 'user', '--default').status).toBe(0);
    const shim = join(root, 'home', 'bin', 'explain.cjs');
    for (const [entry, command] of [[cli, 'build'], [shim, 'check'], [shim, 'build']] as const) {
      const r = run(entry, command, doc);
      expect(r.status, `${command}: ${r.stderr}`).toBe(3);
      expect(r.stderr).toContain('E_TOOLKIT_MISSING');
      expect(r.stderr).toContain('restore explain.lock.json from version control, or pass --dev-toolkit DIR');
      expect(r.stderr).not.toMatch(/run `explain init`/);
    }
    // The advice works: --dev-toolkit builds the document.
    expect(run(cli, 'build', doc, '--dev-toolkit', release).status).toBe(0);
  });
});
