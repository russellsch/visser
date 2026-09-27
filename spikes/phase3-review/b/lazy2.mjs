import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
const T = new URL('./tmp/', import.meta.url).pathname;
const env = { PATH: process.env.PATH, HOME: process.env.HOME, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' };
for (const extra of [[], ['-c', 'protocol.allow=never'], ['-c', 'protocol.file.allow=never', '-c', 'protocol.allow=never']]) {
  rmSync(T + 'p4', { recursive: true, force: true });
  spawnSync('git', ['clone', '-q', '--no-checkout', '--filter=blob:none', `file://${T}origin`, 'p4'], { cwd: T, env });
  const oid = spawnSync('git', ['-C', T + 'p4', 'rev-parse', 'HEAD:big.txt'], { env }).stdout.toString().trim();
  const r = spawnSync('git', ['--no-pager', '-C', T + 'p4', ...extra, '-c', 'core.fsmonitor=', '-c', 'core.hooksPath=/dev/null', 'cat-file', 'blob', '--end-of-options', oid], { env });
  const present = spawnSync('git', ['-C', T + 'p4', 'cat-file', '-e', oid], { env }).status === 0;
  console.log(JSON.stringify(extra).padEnd(62), 'exit', r.status, 'out', JSON.stringify(r.stdout.toString()), 'fetched', present, r.stderr.toString().trim().split('\n').slice(-1)[0].slice(0, 90));
}
