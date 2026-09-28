// W_UNDECLARED_FILE (§7.4, §15.4): a file in the bundle folder that no target
// declares is a warning, but the build's own `.visser/` output is not source
// and must never earn one (dogfood-3 F12a).
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';

const INDEX = `---\nformat: visser/1\ndocId: 4f8ac70c-7e14-4f06-9865-e194f57c7239\ntitle: T\nkind: teaching\ncapturedAt: 2026-09-27T00:00:00Z\nvisibility: private\n---\n\n<!-- vs:id p1 -->\nIntro.\n`;

function bundleDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'visser-bundle-'));
  writeFileSync(join(dir, 'index.md'), INDEX);
  return dir;
}

describe('W_UNDECLARED_FILE (§15.4) @F12a', () => {
  it('warns about a stray file the document does not declare', () => {
    const dir = bundleDir();
    writeFileSync(join(dir, 'notes.txt'), 'scratch\n');
    const bundle = loadBundle(join(dir, 'index.md'));
    const warnings = bundle.diagnostics.filter((d) => d.code === 'W_UNDECLARED_FILE');
    expect(warnings.map((w) => w.path)).toEqual(['notes.txt']);
  });

  it('never warns about the build folder .visser/ writes for itself', () => {
    const dir = bundleDir();
    const outDir = join(dir, '.visser', 'output');
    mkdirSync(join(outDir, '_visser', 'assets', 'deadbeef'), { recursive: true });
    writeFileSync(join(outDir, '_visser', 'assets', 'deadbeef', 'reader.css'), 'body{}');
    writeFileSync(join(outDir, '_visser', 'assets', 'deadbeef', 'reader.js'), '//js');
    const snapshotDir = join(outDir, 'd', 'doc1', 'rev1', 'build1');
    mkdirSync(snapshotDir, { recursive: true });
    writeFileSync(join(snapshotDir, 'build.json'), '{}');
    writeFileSync(join(snapshotDir, 'document.md'), '# doc\n');
    writeFileSync(join(snapshotDir, 'index.html'), '<html></html>');
    const bundle = loadBundle(join(dir, 'index.md'));
    expect(bundle.diagnostics.filter((d) => d.code === 'W_UNDECLARED_FILE')).toEqual([]);
  });

  it('still warns about a stray file next to a .visser/ output folder', () => {
    const dir = bundleDir();
    mkdirSync(join(dir, '.visser', 'output'), { recursive: true });
    writeFileSync(join(dir, 'stray.txt'), 'x');
    const bundle = loadBundle(join(dir, 'index.md'));
    expect(bundle.diagnostics.filter((d) => d.code === 'W_UNDECLARED_FILE').map((w) => w.path)).toEqual(['stray.txt']);
  });
});
