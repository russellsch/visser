// A small, valid release tree built in-test. The real dist/release is rebuilt
// by other test files in parallel, so install tests never read it.
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { canonicalJSON } from '../../packages/core/src/model/hash.ts';

export function tempDir(prefix = 'visser-install-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export const RELEASE_FILES: Record<string, string> = {
  'bin/visser.cjs': "process.stdout.write('fake toolkit\\n');\n",
  'bin/shim.cjs': "process.stdout.write('fake shim\\n');\n",
  'workers/layout.cjs': '// layout worker\n',
  'browser/reader.js': '// reader\n',
  'schemas/visser-ref-1.schema.json': '{}\n',
  'skills/visser-visual-explain/SKILL.md': '# skill\n',
  'LICENSES.txt': 'notices\n',
};

/** Write a release tree with a canonical release.json; returns its toolkit digest. */
export function makeRelease(dir: string, files: Record<string, string> = RELEASE_FILES, version = '0.0.1'): string {
  const entries = Object.entries(files).map(([path, text]) => {
    const full = join(dir, ...path.split('/'));
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
    return { path, sha256: createHash('sha256').update(text).digest('hex') };
  }).sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  const manifest = { schema: 'visser-release/1', version, files: entries };
  writeFileSync(join(dir, 'release.json'), canonicalJSON(manifest) + '\n');
  return createHash('sha256').update(canonicalJSON(manifest)).digest('hex');
}
