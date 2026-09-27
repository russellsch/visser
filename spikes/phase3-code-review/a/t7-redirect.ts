// Redirect object reads from inside a contained .git directory.
import { rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { git, repo } from './lib.ts';
import { openRepository, readBlobAt, resolveCommit } from '../../../packages/core/src/provenance/git.ts';
const secret = repo('secret', { 'x.txt': 'PRIVATE DATA\n' });
const secretCommit = git(secret, 'rev-parse', 'HEAD');
function attempt(label: string, setup: (r: string) => void) {
  const r = repo('redir', { 'a.txt': 'mine\n' });
  setup(r);
  try {
    const o = openRepository(r);
    const b = readBlobAt(o, resolveCommit(o, secretCommit), 'x.txt');
    console.log(label.padEnd(34), 'READ', JSON.stringify(Buffer.from(b.bytes).toString()));
  } catch (e) { console.log(label.padEnd(34), 'refused', (e as { code?: string }).code); }
}
attempt('objects dir -> symlink to other', (r) => {
  rmSync(join(r, '.git/objects'), { recursive: true, force: true });
  symlinkSync(join(secret, '.git/objects'), join(r, '.git/objects'));
});
attempt('commondir file -> other .git', (r) => writeFileSync(join(r, '.git/commondir'), join(secret, '.git') + '\n'));
attempt('info/alternates (control)', (r) => writeFileSync(join(r, '.git/objects/info/alternates'), join(secret, '.git/objects') + '\n'));
