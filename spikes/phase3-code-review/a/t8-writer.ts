import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { git, repo, TMP, ROOT } from './lib.ts';
import { captureGit } from '../../../packages/core/src/provenance/capture.ts';
import { loadBundle } from '../../../packages/core/src/model/bundle.ts';
const src = repo('w', { 'code.py': 'a = 1\nb = "```"\nc = 3\n' });
function doc(name: string, body: string, crlf = false) {
  const d = join(TMP, 'doc-' + name + '-' + Math.random().toString(36).slice(2));
  mkdirSync(join(d, 'docs/explanations/q'), { recursive: true }); mkdirSync(join(d, '.git'));
  let t = `---\nformat: explain/1\ndocId: 4f8ac70c-7e14-4f06-9865-e194f57c7239\ntitle: T\nkind: teaching\ncapturedAt: 2026-09-27T00:00:00Z\nvisibility: private\n---\n\n${body}`;
  if (crlf) t = t.replace(/\n/g, '\r\n');
  const p = join(d, 'docs/explanations/q/index.md'); writeFileSync(p, t); return p;
}
const base = { repo: src, rev: 'HEAD', file: 'code.py', repositoryLabel: 'lbl', capturedAt: '2026-09-27T00:00:00Z' } as const;
const call = (p: string, extra: Record<string, unknown>) => { try { return captureGit({ ...base, doc: p, ...extra } as never); } catch (e) { return { error: (e as { code?: string }).code + ' ' + (e as Error).message.slice(0, 120) }; } };
// 1. Title round trip through JSON encoding and the Markdoc attribute parser.
const hostileTitle = 'Q"uote %} {% /source %} \\back   sep\nnewline';
const p1 = doc('title', '<!-- ex:id p -->\nPara.\n');
const r1 = call(p1, { id: 's', title: hostileTitle, lines: '1:3' });
const b1 = loadBundle(p1);
const got = b1.model.targets.get('s')?.label;
console.log('1 title round-trip equal:', got === hostileTitle, JSON.stringify(got), 'result:', JSON.stringify(r1).slice(0, 80));
// 2. CRLF document stays CRLF; no bare LF introduced.
const p2 = doc('crlf', '<!-- ex:id p -->\r\nPara.\r\n', true);
call(p2, { id: 's', title: 'T', lines: '1:3' });
const raw2 = readFileSync(p2, 'utf8');
console.log('2 CRLF kept:', !/[^\r]\n/.test(raw2), 'bare LF count:', (raw2.match(/(?<!\r)\n/g) ?? []).length, 'errors:', loadBundle(p2).diagnostics.filter((d) => d.severity === 'error').map((d) => d.code));
// 3. Recapture a source that an annotated figure depends on, with a shorter range.
const body3 = '<!-- ex:id p -->\nPara.\n\n{% annotated id="an" title="T" question="Q?" source="s" %}\nWhy.\n\n{% annotation id="an1" label="L" lines=[2, 3] %}\nNote.\n{% /annotation %}\n{% /annotated %}\n';
const p3 = doc('recap', body3);
console.log('3a first capture:', JSON.stringify(call(p3, { id: 's', title: 'T', lines: '1:3' })).slice(0, 60));
const before3 = readFileSync(p3, 'utf8');
console.log('3b recapture 1:1:', JSON.stringify(call(p3, { id: 's', title: 'T', lines: '1:1', recapture: true })).slice(0, 140), 'file unchanged:', readFileSync(p3, 'utf8') === before3);
// 4. Doc without final newline and no source blocks.
const p4 = doc('noeol', '<!-- ex:id p -->\nPara.');
call(p4, { id: 's', title: 'T', lines: '2:2' });
console.log('4 no-EOL doc valid after capture:', loadBundle(p4).diagnostics.filter((d) => d.severity === 'error').map((d) => d.code));
// 5. Parent GIT_DIR in the environment is ignored.
const other = repo('otherenv', { 'code.py': 'OTHER\n' });
process.env.GIT_DIR = join(other, '.git'); process.env.GIT_INDEX_FILE = join(other, '.git/index');
const p5 = doc('env', '<!-- ex:id p -->\nPara.\n');
call(p5, { id: 's', title: 'T', lines: '1:1' });
console.log('5 captured with hostile GIT_DIR env:', /a = 1/.test(readFileSync(p5, 'utf8')) ? 'requested repo (good)' : 'OTHER repo (BAD)');
void copyFileSync; void git; void ROOT;
