import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { git, repo, TMP } from './lib.ts';
import { gitEnvironment, HARDENED_FLAGS } from '../../../packages/core/src/provenance/git.ts';
function hostile() {
  const origin = repo('ap-origin', { 'a.txt': 'lazy\n' });
  git(origin, 'config', 'uploadpack.allowFilter', 'true');
  const clone = join(TMP, 'ap-' + Math.random().toString(36).slice(2));
  execFileSync('git', ['clone', '-q', '--filter=blob:none', '--no-checkout', 'file://' + origin, clone], { env: { PATH: process.env.PATH!, HOME: TMP } });
  const sentinel = join(TMP, 'AP_SENT_' + Math.random().toString(36).slice(2));
  git(clone, 'config', 'remote.origin.url', `ext::sh -c touch% ${sentinel}`);
  git(clone, 'config', 'protocol.ext.allow', 'always');
  git(clone, 'config', 'protocol.file.allow', 'always');
  return { clone, sentinel, oid: git(clone, 'rev-parse', 'HEAD:a.txt') };
}
const variants: Array<[string, Record<string, string>, string[]]> = [
  ['git.ts today', {}, []],
  ['+ GIT_ALLOW_PROTOCOL=none', { GIT_ALLOW_PROTOCOL: 'none' }, []],
  ['+ GIT_ALLOW_PROTOCOL= (empty)', { GIT_ALLOW_PROTOCOL: '' }, []],
  ['+ -c protocol.ext.allow=never -c protocol.file.allow=never', {}, ['-c', 'protocol.ext.allow=never', '-c', 'protocol.file.allow=never']],
];
for (const [label, extraEnv, extraFlags] of variants) {
  const h = hostile();
  const r = spawnSync('git', ['-C', h.clone, ...HARDENED_FLAGS, ...extraFlags, 'cat-file', 'blob', '--end-of-options', h.oid], { env: { ...gitEnvironment(), ...extraEnv } });
  console.log(label.padEnd(60), 'exit', r.status, 'command ran:', existsSync(h.sentinel));
}
