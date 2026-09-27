// Fixture helpers for capture and origin-verification tests. Every repository
// lives in a temporary directory, and setup Git runs with an isolated HOME, so
// hostile configuration never reaches the real repository or the user's config.
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type Fixture = {
  root: string;
  sentinels: string;
  git: (dir: string, ...args: string[]) => string;
  repo: (name: string, files?: Record<string, string | Uint8Array>, opts?: { format?: 'sha1' | 'sha256' }) => string;
  doc: (name?: string, body?: string) => string;
  script: (name: string) => string;
  fired: () => string[];
  cleanup: () => void;
};

export const DOC_ID = '4f8ac70c-7e14-4f06-9865-e194f57c7239';

export function frontmatter(): string {
  return `---\nformat: explain/1\ndocId: ${DOC_ID}\ntitle: Capture test\nkind: teaching\ncapturedAt: 2026-09-26T00:00:00Z\nvisibility: private\n---\n`;
}

export function makeFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'explain-capture-'));
  const sentinels = join(root, 'sentinels');
  mkdirSync(sentinels);
  const env = {
    PATH: process.env['PATH'] ?? '',
    HOME: root,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com',
    GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com',
  };
  const git = (dir: string, ...args: string[]): string => {
    const r = spawnSync('git', args, { cwd: dir, env, encoding: 'utf8', shell: false });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
    return r.stdout;
  };
  const repo = (name: string, files: Record<string, string | Uint8Array> = { 'a.txt': 'line1\nline2\nline3\n' }, opts: { format?: 'sha1' | 'sha256' } = {}) => {
    const dir = join(root, name);
    mkdirSync(dir, { recursive: true });
    git(dir, 'init', '-q', '-b', 'main', ...(opts.format ? [`--object-format=${opts.format}`] : []));
    git(dir, 'config', 'core.autocrlf', 'false');
    for (const [path, content] of Object.entries(files)) {
      const full = join(dir, path);
      mkdirSync(join(full, '..'), { recursive: true });
      writeFileSync(full, content);
    }
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'init');
    return dir;
  };
  const doc = (name = 'docs', body = '<!-- ex:id intro -->\nIntro paragraph.\n') => {
    const dir = join(root, name);
    mkdirSync(join(dir, '.git'), { recursive: true }); // repository root marker for the edit lock
    const path = join(dir, 'index.md');
    writeFileSync(path, `${frontmatter()}\n${body}`);
    return path;
  };
  const script = (name: string) => {
    const p = join(root, `evil-${name}.sh`);
    writeFileSync(p, `#!/bin/sh\ntouch "${sentinels}/${name}"\ncat\n`);
    chmodSync(p, 0o755);
    return p;
  };
  const fired = () => (existsSync(sentinels) ? readdirSync(sentinels) : []);
  return { root, sentinels, git, repo, doc, script, fired, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
