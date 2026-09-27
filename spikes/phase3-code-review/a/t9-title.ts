import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { repo, TMP } from './lib.ts';
import { captureGit } from '../../../packages/core/src/provenance/capture.ts';
import { loadBundle } from '../../../packages/core/src/model/bundle.ts';
const src = repo('t9', { 'code.py': 'a = 1\n' });
for (const title of ['Q"uote %} {% /source %} end', 'back\\slash and \\n literal', 'sep line', 'tab\there', 'emoji 😀 and é']) {
  const d = join(TMP, 't9-' + Math.random().toString(36).slice(2));
  mkdirSync(join(d, 'docs/explanations/q'), { recursive: true }); mkdirSync(join(d, '.git'));
  const p = join(d, 'docs/explanations/q/index.md');
  writeFileSync(p, `---\nformat: explain/1\ndocId: 4f8ac70c-7e14-4f06-9865-e194f57c7239\ntitle: T\nkind: teaching\ncapturedAt: 2026-09-27T00:00:00Z\nvisibility: private\n---\n\n<!-- ex:id p -->\nPara.\n`);
  let outcome: string;
  try { captureGit({ repo: src, rev: 'HEAD', file: 'code.py', lines: '1:1', doc: p, id: 's', title, repositoryLabel: 'l', capturedAt: '2026-09-27T00:00:00Z' } as never); outcome = 'captured'; }
  catch (e) { outcome = 'refused ' + (e as { code?: string }).code; }
  const got = loadBundle(p).model.targets.get('s')?.label;
  console.log(JSON.stringify(title).padEnd(36), outcome.padEnd(22), 'round-trip:', got === undefined ? '-' : got === title ? 'equal' : 'DIFFERS ' + JSON.stringify(got));
}
