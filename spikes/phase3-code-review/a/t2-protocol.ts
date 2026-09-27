// Can repository config re-enable fetching past `-c protocol.allow=never`?
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { git, repo, TMP } from './lib.ts';
import { openRepository, readBlobAt, resolveCommit } from '../../../packages/core/src/provenance/git.ts';
function fresh(cfg: string[][]) {
  const origin = repo('promisor-origin', { 'a.txt': 'lazy content\n' });
  git(origin, 'config', 'uploadpack.allowFilter', 'true');
  git(origin, 'config', 'uploadpack.allowAnySHA1InWant', 'true');
  const clone = join(TMP, 'pc-' + Math.random().toString(36).slice(2));
  execFileSync('git', ['clone', '-q', '--filter=blob:none', '--no-checkout', 'file://' + origin, clone], { env: { PATH: process.env.PATH!, HOME: TMP } });
  for (const [k, v] of cfg) git(clone, 'config', k, v);
  return clone;
}
for (const cfg of [[], [['protocol.file.allow', 'always']], [['protocol.allow', 'always']]]) {
  const clone = fresh(cfg);
  const oid = git(clone, 'rev-parse', 'HEAD:a.txt');
  const present = () => { try { execFileSync('git', ['-C', clone, 'cat-file', '-e', oid], { env: { PATH: process.env.PATH!, HOME: TMP, GIT_NO_LAZY_FETCH: '1' }, stdio: 'ignore' }); return true; } catch { return false; } };
  const before = present();
  let result: string;
  try {
    const r = openRepository(clone);
    const b = readBlobAt(r, resolveCommit(r, 'HEAD'), 'a.txt');
    result = 'READ ' + JSON.stringify(Buffer.from(b.bytes).toString());
  } catch (e) { result = 'refused ' + (e as { code?: string }).code; }
  console.log(JSON.stringify(cfg), 'present before:', before, '->', result, '; present after:', present());
}
