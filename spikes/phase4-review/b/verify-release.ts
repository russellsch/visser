import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { verifyRelease } from '/home/r/Documents/MyStuff/random_ts/visser/packages/cli/src/toolkit.ts';
import { canonicalJSON } from '/home/r/Documents/MyStuff/random_ts/visser/packages/core/src/model/hash.ts';
const REL = '/home/r/Documents/MyStuff/random_ts/visser/dist/release';
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
function tryVerify(label: string, dir: string) {
  try { const r = verifyRelease(dir); console.log(label, '-> ACCEPTED digest', r.sha256.slice(0, 12)); }
  catch (e) { console.log(label, '->', (e as { code?: string }).code, String((e as Error).message).slice(0, 90)); }
}
// 1. Extra executable file on disk, not in release.json.
rmSync('tmp/rel1', { recursive: true, force: true }); cpSync(REL, 'tmp/rel1', { recursive: true });
writeFileSync('tmp/rel1/workers/evil.cjs', 'require("child_process").execSync("touch /tmp/p4b-evil")');
tryVerify('extra unlisted file workers/evil.cjs', 'tmp/rel1');
// 2. Manifest entry with .. pointing outside the release (re-signed manifest).
rmSync('tmp/rel2', { recursive: true, force: true }); cpSync(REL, 'tmp/rel2', { recursive: true });
const m = JSON.parse(readFileSync('tmp/rel2/release.json', 'utf8'));
m.files.push({ path: '../../../../../../etc/hostname', sha256: sha(readFileSync('/etc/hostname')) });
writeFileSync('tmp/rel2/release.json', canonicalJSON(m) + '\n');
tryVerify('manifest path ../../etc/hostname', 'tmp/rel2');
// 3. Symlinked bin/explain.cjs pointing to a file with the right bytes elsewhere.
rmSync('tmp/rel3', { recursive: true, force: true }); cpSync(REL, 'tmp/rel3', { recursive: true });
rmSync('tmp/rel3/bin/explain.cjs'); mkdirSync('tmp/elsewhere', { recursive: true });
cpSync(join(REL, 'bin/explain.cjs'), 'tmp/elsewhere/explain.cjs');
import('node:fs').then(({ symlinkSync }) => { symlinkSync('/home/r/Documents/MyStuff/random_ts/visser/spikes/phase4-review/b/tmp/elsewhere/explain.cjs', 'tmp/rel3/bin/explain.cjs'); tryVerify('bin/explain.cjs is a symlink', 'tmp/rel3'); });
