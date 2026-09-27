import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { git, repo, TMP } from './lib.ts';
import { gitEnvironment, HARDENED_FLAGS } from '../../../packages/core/src/provenance/git.ts';
for (const extra of [{}, { GIT_ALLOW_PROTOCOL: 'none' }]) {
  const origin = repo('fp-origin', { 'a.txt': 'lazy content\n' });
  git(origin, 'config', 'uploadpack.allowFilter', 'true');
  const clone = join(TMP, 'fp-' + Math.random().toString(36).slice(2));
  execFileSync('git', ['clone', '-q', '--filter=blob:none', '--no-checkout', 'file://' + origin, clone], { env: { PATH: process.env.PATH!, HOME: TMP } });
  git(clone, 'config', 'protocol.file.allow', 'always');
  const oid = git(clone, 'rev-parse', 'HEAD:a.txt');
  const r = spawnSync('git', ['-C', clone, ...HARDENED_FLAGS, 'cat-file', 'blob', '--end-of-options', oid], { env: { ...gitEnvironment(), ...extra } });
  console.log(JSON.stringify(extra).padEnd(32), 'exit', r.status, 'bytes', JSON.stringify(r.stdout.toString()));
}
