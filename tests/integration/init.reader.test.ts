// `visser init --must-understand` (IMPROVEMENTS.md §12.3 item 1): each value
// becomes one item of `reader.mustUnderstand`, the document checks, and
// `check --review` gives no W_READER. Without the flag, init prints a reminder.
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseArgs } from '../../packages/cli/src/cli-util.ts';
import { runInit } from '../../packages/cli/src/commands/init.ts';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { reviewDocument } from '../../packages/core/src/review/index.ts';

const release = new URL('../../dist/release', import.meta.url).pathname;

afterEach(() => {
  vi.restoreAllMocks();
});

async function init(argv: string[]): Promise<{ code: number; stdout: string }> {
  let stdout = '';
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    stdout += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
    return true;
  });
  const code = await runInit(parseArgs([...argv, '--toolkit-dir', release]));
  vi.restoreAllMocks();
  return { code, stdout };
}

describe('@R16 init --must-understand', () => {
  it('writes each value as one mustUnderstand item, and the document checks with no W_READER', async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'visser-init-reader-')), 'doc');
    const { code, stdout } = await init([dir, '--kind', 'teaching', '--title', 'Queue notes',
      '--must-understand', 'say where a producer waits', '--must-understand', 'name what "ends" the wait: a take']);
    expect(code).toBe(0);
    expect(stdout).not.toContain('reminder');
    const bundle = loadBundle(join(dir, 'index.md'));
    expect(bundle.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(bundle.parsed.frontmatter['reader']).toEqual({ mustUnderstand: ['say where a producer waits', 'name what "ends" the wait: a take'] });
    expect(reviewDocument(bundle).filter((d) => d.code === 'W_READER')).toEqual([]);
  });

  it('prints a reminder when the flag is missing, and review then asks for the list', async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'visser-init-reader-')), 'doc');
    const { code, stdout } = await init([dir, '--kind', 'architecture', '--title', 'Parts']);
    expect(code).toBe(0);
    expect(stdout).toContain('reminder: add reader.mustUnderstand');
    expect(readFileSync(join(dir, 'index.md'), 'utf8')).not.toContain('reader:');
    expect(reviewDocument(loadBundle(join(dir, 'index.md'))).map((d) => d.code)).toContain('W_READER');
  });

  it('refuses an empty value', async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'visser-init-reader-')), 'doc');
    await expect(init([dir, '--kind', 'teaching', '--title', 'T', '--must-understand', ' '])).rejects.toMatchObject({ code: 'E_USAGE' });
  });
});
