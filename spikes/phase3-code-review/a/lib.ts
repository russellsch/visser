import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
export const ROOT = '/home/r/Documents/MyStuff/random_ts/visser';
export const TMP = join(ROOT, 'spikes/phase3-code-review/a/tmp');
mkdirSync(TMP, { recursive: true });
export const git = (dir: string, ...args: string[]) =>
  execFileSync('git', ['-C', dir, '-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { encoding: 'utf8', env: { PATH: process.env.PATH!, HOME: TMP, GIT_CONFIG_NOSYSTEM: '1' } }).trim();
export function repo(name: string, files: Record<string, string>): string {
  const dir = mkdtempSync(join(TMP, name + '-'));
  git(dir, 'init', '-q');
  for (const [p, c] of Object.entries(files)) writeFileSync(join(dir, p), c);
  git(dir, 'add', '.');
  git(dir, 'commit', '-qm', 'one');
  return dir;
}
