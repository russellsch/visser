// Does the capture path trigger fsmonitor/hooks even WITHOUT the -c hardening flags?
import fs from 'node:fs'; import path from 'node:path';
import { git } from './capture.mjs';
const TMP = path.join(path.dirname(new URL(import.meta.url).pathname), 'tmp');
const SENT = path.join(TMP, 'sentinels');
for (const id of ['v1-fsmonitor', 'v1b-include', 'v2-hooks', 'v3-textconv', 'v3d-filters']) {
  for (const f of fs.readdirSync(SENT)) fs.rmSync(path.join(SENT, f));
  const d = path.join(TMP, id);
  const c = git(d, ['rev-parse', '--verify', '--end-of-options', 'HEAD^{commit}'], { harden: [] }).stdout.toString().trim();
  const b = git(d, ['rev-parse', '--verify', '--end-of-options', `${c}:a.txt`], { harden: [] }).stdout.toString().trim();
  git(d, ['cat-file', '-t', '--end-of-options', b], { harden: [] });
  git(d, ['cat-file', 'blob', '--end-of-options', b], { harden: [] });
  // Also: commands a naive implementer might add for "working-tree status" reporting
  git(d, ['ls-files', '--', 'a.txt'], { harden: [] });
  const afterRead = fs.readdirSync(SENT).join(',') || 'none';
  git(d, ['status', '--porcelain'], { harden: [] });
  const afterStatusUnhardened = fs.readdirSync(SENT).join(',') || 'none';
  for (const f of fs.readdirSync(SENT)) fs.rmSync(path.join(SENT, f));
  git(d, ['status', '--porcelain']);
  const afterStatusHardened = fs.readdirSync(SENT).join(',') || 'none';
  console.log(id.padEnd(14), '| capture path w/o -c flags:', afterRead.padEnd(6), '| status unhardened:', afterStatusUnhardened.padEnd(12), '| status WITH -c flags:', afterStatusHardened);
}
