// Fixture discovery (ARCHITECTURE.md §18.8): fixtures/negative/<E_CODE>/<name>.md must
// produce that code; fixtures/positive/*.md must parse with no errors.
// A negative fixture may also produce E_ID_MISSING for a block whose marker it rejected,
// but no other code.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSource } from '../../packages/core/src/syntax/index.ts';

const ROOT = new URL('../../fixtures/', import.meta.url).pathname;
const read = (p: string) => new Uint8Array(readFileSync(p));

describe('negative fixtures @R11', () => {
  const dir = join(ROOT, 'negative');
  for (const code of readdirSync(dir).sort()) {
    for (const name of readdirSync(join(dir, code)).filter((f) => f.endsWith('.md')).sort()) {
      it(`${code}/${name}`, () => {
        const got = new Set(parseSource(read(join(dir, code, name)), 'index.md').diagnostics.filter((d) => d.severity === 'error').map((d) => d.code));
        expect(got.has(code)).toBe(true);
        const allowed = new Set([code, 'E_ID_MISSING']);
        expect([...got].filter((c) => !allowed.has(c))).toEqual([]);
      });
    }
  }
});

describe('positive fixtures', () => {
  const dir = join(ROOT, 'positive');
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
    it(name, () => {
      expect(parseSource(read(join(dir, name)), 'index.md').diagnostics).toEqual([]);
    });
    it(`${name} (CRLF)`, () => {
      const crlf = new TextEncoder().encode(new TextDecoder().decode(read(join(dir, name))).replace(/\n/g, '\r\n'));
      expect(parseSource(crlf, 'index.md').diagnostics).toEqual([]);
    });
  }
});
