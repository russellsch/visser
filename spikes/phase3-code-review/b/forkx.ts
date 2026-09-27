// Fork edge cases against the archived 8151fd2 code.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { code, tempRepo } from './lib.ts';
import { forkDocument } from './tmp/new/packages/core/src/references/index.ts';

const stray = (dir: string) => readdirSync(dir).filter((n) => n.includes('.fork'));
const docs = (repo: string) => join(repo, 'docs/explanations');

// 1. DEST parent is a symlink to a directory outside the document roots.
{
  const { repo, doc } = tempRepo();
  mkdirSync(join(repo, 'outside'));
  symlinkSync(join(repo, 'outside'), join(docs(repo), 'link'));
  console.log('parent symlink outside roots'.padEnd(34), code(() => forkDocument(doc, join(docs(repo), 'link/copy'), { repoRoot: repo })));
}
// 2. DEST parent is a symlink to a directory inside the roots.
{
  const { repo, doc } = tempRepo();
  mkdirSync(join(docs(repo), 'real'));
  symlinkSync(join(docs(repo), 'real'), join(docs(repo), 'alias'));
  console.log('parent symlink inside roots'.padEnd(34), code(() => forkDocument(doc, join(docs(repo), 'alias/copy'), { repoRoot: repo })));
}
// 3. Source bundle directory reached through a symlink.
{
  const { repo, doc } = tempRepo();
  symlinkSync(dirname(doc), join(docs(repo), 'doclink'));
  console.log('source dir via symlink'.padEnd(34), code(() => forkDocument(join(docs(repo), 'doclink/index.md'), join(docs(repo), 'copy'), { repoRoot: repo })));
}
// 4. DEST inside another document's bundle.
{
  const { repo, doc } = tempRepo();
  mkdirSync(join(docs(repo), 'other'));
  cpSync(doc, join(docs(repo), 'other/index.md'));
  const r = code(() => forkDocument(doc, join(docs(repo), 'other/nested'), { repoRoot: repo }));
  console.log('DEST inside another bundle'.padEnd(34), r.slice(0, 90));
}
// 5. DEST equal to a document root, and relative DEST.
{
  const { repo, doc } = tempRepo();
  console.log('DEST = document root'.padEnd(34), code(() => forkDocument(doc, docs(repo), { repoRoot: repo })).slice(0, 90));
  const cwd = process.cwd();
  process.chdir(repo);
  console.log('relative DEST'.padEnd(34), code(() => forkDocument(doc, 'docs/explanations/rel', { repoRoot: repo })).slice(0, 90));
  process.chdir(cwd);
}
// 6. NFD destination name.
{
  const { repo, doc } = tempRepo();
  const nfd = 'café';
  console.log('NFD DEST name'.padEnd(34), code(() => forkDocument(doc, join(docs(repo), nfd), { repoRoot: repo })).slice(0, 90), JSON.stringify(readdirSync(docs(repo))));
}
// 7. Byte diff: only the docId value may change.
{
  const { repo, doc } = tempRepo();
  const r = forkDocument(doc, join(docs(repo), 'copy'), { repoRoot: repo, newDocId: '99999999-2222-4333-8444-555555555555' });
  const a = readFileSync(doc, 'utf8').split('\n');
  const b = readFileSync(r.path, 'utf8').split('\n');
  const diffs = a.map((l, i) => (l === b[i] ? null : [i, l, b[i]])).filter(Boolean);
  console.log('byte diff lines'.padEnd(34), JSON.stringify(diffs), 'lenEqual=', a.length === b.length);
}
// 8. Failure paths leave no staging directory.
{
  const { repo, doc } = tempRepo();
  const dest = join(docs(repo), 'copy');
  const r1 = code(() => forkDocument(doc, dest, { repoRoot: repo, fsContext: { beforeRename: () => { mkdirSync(dest); } } }));
  const r2 = code(() => forkDocument(doc, join(docs(repo), 'copy2'), { repoRoot: repo, fsContext: { beforeRename: () => { throw new Error('boom'); } } }));
  console.log('staging after failures'.padEnd(34), r1.slice(0, 40), '|', r2.slice(0, 30), 'stray=', JSON.stringify(stray(docs(repo))));
}
// 9. A real concurrent creator: a claim rename target that fills the claimed directory.
{
  const { repo, doc } = tempRepo();
  const dest = join(docs(repo), 'copy');
  let r = '';
  r = code(() => forkDocument(doc, dest, { repoRoot: repo, fsContext: { beforeRename: () => {
    // After this hook the fork mkdirs DEST; simulate a writer that races into it by
    // replacing the staging-to-DEST rename source is not possible here, so pre-create a sibling.
  } } }));
  console.log('fork with hook no-op'.padEnd(34), r.slice(0, 40), existsSync(join(dest, 'index.md')));
}
