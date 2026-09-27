// The format guide (§9.1, skills/visual-explain/references/format.md) is a contract:
// every `visser-valid` snippet must check with no errors, and every
// `visser-invalid E_CODE` snippet must fail with that code. A snippet without
// frontmatter is wrapped in a minimal valid document.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';

const GUIDE = new URL('../../skills/visual-explain/references/format.md', import.meta.url).pathname;
const WRAPPER = [
  '---',
  'format: visser/1',
  'docId: 4f8ac70c-7e14-4f06-9865-e194f57c7239',
  'title: Format guide snippet',
  'kind: reference',
  'capturedAt: 2026-09-27T00:00:00Z',
  'visibility: private',
  '---',
  '',
  '<!-- vs:id overview -->',
  '# Format guide snippet',
  '',
  '',
].join('\n');

type Snippet = { line: number; valid: boolean; code?: string; body: string };

/** Top-level fences whose info string is `markdown visser-valid` or `markdown visser-invalid E_CODE`. */
function extractSnippets(text: string): Snippet[] {
  const lines = text.split('\n');
  const out: Snippet[] = [];
  for (let i = 0; i < lines.length; i++) {
    const open = /^(`{3,})(.*)$/.exec(lines[i]!);
    if (!open) continue;
    const fence = open[1]!;
    const close = lines.findIndex((l, j) => j > i && l.startsWith(fence) && l.slice(fence.length).trim() === '');
    if (close === -1) throw new Error(`unclosed fence at line ${i + 1}`);
    const info = open[2]!.trim().split(/\s+/);
    if (info[0] === 'markdown' && (info[1] === 'visser-valid' || info[1] === 'visser-invalid')) {
      const valid = info[1] === 'visser-valid';
      if (!valid && !/^[EW]_[A-Z_]+$/.test(info[2] ?? '')) throw new Error(`invalid snippet at line ${i + 1} has no diagnostic code`);
      out.push({ line: i + 1, valid, ...(valid ? {} : { code: info[2]! }), body: lines.slice(i + 1, close).join('\n') + '\n' });
    }
    i = close;
  }
  return out;
}

const work = mkdtempSync(join(tmpdir(), 'visser-format-guide-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

function check(snippet: Snippet): Array<{ code: string; message: string }> {
  const dir = mkdtempSync(join(work, 's-'));
  const source = snippet.body.startsWith('---\n') ? snippet.body : WRAPPER + snippet.body;
  writeFileSync(join(dir, 'index.md'), source);
  return loadBundle(join(dir, 'index.md')).diagnostics
    .filter((d) => d.severity === 'error')
    .map((d) => ({ code: d.code, message: d.message }));
}

const snippets = extractSnippets(readFileSync(GUIDE, 'utf8'));

describe('format guide snippets compile as stated (§9.1) @R16', () => {
  it('the guide has enough valid and invalid snippets to be a real contract', () => {
    expect(snippets.length).toBeGreaterThanOrEqual(20);
    expect(snippets.filter((s) => s.valid).length).toBeGreaterThanOrEqual(8);
    expect(snippets.filter((s) => !s.valid).length).toBeGreaterThanOrEqual(12);
  });

  for (const snippet of snippets) {
    const name = snippet.valid ? `line ${snippet.line}: valid snippet checks with no errors` : `line ${snippet.line}: invalid snippet fails with ${snippet.code}`;
    it(name, () => {
      const errors = check(snippet);
      if (snippet.valid) expect(errors).toEqual([]);
      else expect(errors.map((e) => e.code), JSON.stringify(errors)).toContain(snippet.code);
    });
  }
});
