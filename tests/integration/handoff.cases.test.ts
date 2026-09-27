// The cases of references/handoff.md that the main flow test does not reach,
// through the built CLI: missing, invalid, and ambiguous resolve results, and
// a refused refresh in text mode while stdout is redirected to a packet file.
import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

const release = join(new URL('../..', import.meta.url).pathname, 'dist/release');
const cli = join(release, 'bin/visser.cjs');

let repo: string;
let doc: string;
let packetText: string;
let run: (...args: string[]) => ReturnType<typeof spawnSync> & { stdout: string; stderr: string };

beforeEach(() => {
  const root = mkdtempSync(join(tmpdir(), 'visser-handoff-cases-'));
  repo = join(root, 'repo');
  mkdirSync(join(repo, '.git'), { recursive: true });
  const env = { ...process.env, VISSER_HOME: join(root, 'home') };
  run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env, cwd: repo }) as ReturnType<typeof spawnSync> & { stdout: string; stderr: string };
  const bundle = join(repo, 'docs', 'explanations', 'notes');
  expect(run('init', bundle, '--kind', 'teaching', '--title', 'Notes', '--toolkit-dir', release).status).toBe(0);
  doc = join(bundle, 'index.md');
  appendFileSync(doc, '\n<!-- vs:id p_one -->\nFirst claim.\n');
  const show = run('refs', 'show', doc, 'p_one');
  expect(show.status, show.stderr).toBe(0);
  packetText = show.stdout;
});

function resolveWith(name: string, text: string) {
  const path = join(repo, name);
  writeFileSync(path, text);
  const r = run('refs', 'resolve', '--packet', path, '--json');
  return { exit: r.status, status: (JSON.parse(r.stdout) as { status: string }).status };
}

describe('handoff.md cases through the built CLI', () => {
  it('missing, invalid, and ambiguous each exit 2 with the documented status', () => {
    expect(resolveWith('missing.yaml', packetText.replace('targetId: p_one', 'targetId: p_nope').replace('/p_one?', '/p_nope?'))).toEqual({ exit: 2, status: 'missing' });
    expect(resolveWith('invalid.yaml', packetText.replace(/^sourceRevision: ./m, 'sourceRevision: f'))).toEqual({ exit: 2, status: 'invalid' });
    cpSync(join(repo, 'docs', 'explanations', 'notes'), join(repo, 'docs', 'explanations', 'copy'), { recursive: true });
    expect(resolveWith('ambiguous.yaml', packetText)).toEqual({ exit: 2, status: 'ambiguous' });
  });

  it('a refused refresh keeps stdout for packets: the current text goes to stderr, so `> ref2.yaml` never holds it', () => {
    const packet = join(repo, 'ref.yaml');
    writeFileSync(packet, packetText);
    writeFileSync(doc, readFileSync(doc, 'utf8').replace('First claim.', 'First claim, changed.'));
    const stale = run('refs', 'resolve', '--packet', packet, '--json');
    const rev = (JSON.parse(stale.stdout) as { currentRevision: string }).currentRevision;
    const refused = run('refs', 'refresh', '--packet', packet, '--expected-current', rev, '--acknowledge-stale');
    expect(refused.status).toBe(5);
    expect(refused.stdout).toBe('');
    expect(refused.stderr).toContain('E_REF_STALE');
    expect(refused.stderr).toContain('First claim, changed.');
  });
});
