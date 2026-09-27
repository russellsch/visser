import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
const T = new URL('./tmp/', import.meta.url).pathname;
const sh = (args, cwd, env = {}) => { const r = spawnSync('git', args, { cwd, env: { PATH: process.env.PATH, HOME: process.env.HOME, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0', ...env } }); return { s: r.status, out: r.stdout.toString().trim(), err: r.stderr.toString().trim().split('\n').slice(-1)[0] }; };
rmSync(T + 'origin', { recursive: true, force: true }); rmSync(T + 'partial', { recursive: true, force: true });
sh(['init', '-q', 'origin'], T);
sh(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'root'], T + 'origin');

spawnSync('sh', ['-c', 'printf "lazy content\\n" > big.txt'], { cwd: T + 'origin' });
sh(['add', 'big.txt'], T + 'origin'); sh(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'add'], T + 'origin');
sh(['config', 'uploadpack.allowFilter', 'true'], T + 'origin');
console.log('clone:', sh(['clone', '-q', '--no-checkout', '--filter=blob:none', `file://${T}origin`, 'partial'], T).s);
const H = ['--no-pager', '-c', 'core.fsmonitor=', '-c', 'core.hooksPath=/dev/null'];
const oid = sh([...H, 'rev-parse', '--verify', '--end-of-options', 'HEAD:big.txt'], T + 'partial').out;
console.log('object present before?', sh([...H, 'cat-file', '-e', oid], T + 'partial', { GIT_NO_LAZY_FETCH: '1' }).s === 0);
const r = sh([...H, 'cat-file', 'blob', '--end-of-options', oid], T + 'partial', { GIT_OPTIONAL_LOCKS: '0' });
console.log('spike-procedure cat-file blob:', r.s, JSON.stringify(r.out), r.err);
console.log('object present after? ', sh([...H, 'cat-file', '-e', oid], T + 'partial').s === 0, '(a fetch from the promisor remote happened if true)');
console.log('git version:', sh(['--version'], T).out);
