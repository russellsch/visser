// Does verify accept a moving ref (HEAD, branch, :/search) as the recorded commit?
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { git, repo, ROOT } from './lib.ts';
import { openRepository, readBlobAt, resolveCommit } from '../../../packages/core/src/provenance/git.ts';
import { verifyOrigins } from '../../../packages/core/src/provenance/verify.ts';
import { parseSource } from '../../../packages/core/src/syntax/index.ts';
const r = repo('ref', { 'a.py': 'one\ntwo\n' });
// A document whose `commit` is a moving ref, written by hand (documents are untrusted data).
for (const commit of ['HEAD', 'master', ':/one']) {
  const src = `---\nformat: explain/1\ndocId: 4f8ac70c-7e14-4f06-9865-e194f57c7239\ntitle: T\nkind: teaching\ncapturedAt: 2026-09-27T00:00:00Z\nvisibility: private\n---\n\n<!-- ex:id p -->\nText {% cite ref="s" /%}\n\n{% source id="s" kind="git" title="t" repository="https://x/r.git" commit=${JSON.stringify(commit)} file="a.py" start=2 end=2 excerptSha256="SHA" %}\n\`\`\`\ntwo\n\`\`\`\n{% /source %}\n`;
  const { loadBundle } = await import('../../../packages/core/src/model/bundle.ts');
  const { sha256Hex } = await import('../../../packages/core/src/model/hash.ts');
  const text = src.replace('SHA', sha256Hex(Buffer.from('two\n')));
  const dir = `${r}-doc-${commit.replace(/\W/g, '_')}`;
  (await import('node:fs')).mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.md'), text);
  const b = loadBundle(join(dir, 'index.md'));
  const errs = b.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code);
  const v = verifyOrigins(b, new Map([['https://x/r.git', r]]));
  console.log(JSON.stringify(commit), 'check errors:', errs, 'verify:', v.origins.map((o) => o.state));
}
// Now move master: the same documents still "verify" against the new content?
writeFileSync(join(r, 'a.py'), 'one\nTWO CHANGED\n'); git(r, 'commit', '-qam', 'two');
void openRepository; void readBlobAt; void resolveCommit; void parseSource; void ROOT;
