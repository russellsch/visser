// Frontmatter text edits for retire and fork (§11.11, §11.5).
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkReason, insertRetiredTargets, rewriteDocId } from '../../packages/core/src/references/frontmatter-edit.ts';
import { HashError } from '../../packages/core/src/model/hash.ts';
import { parseSource } from '../../packages/core/src/syntax/index.ts';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';

const fm = (extra: string) => `---\nformat: explain/1\ndocId: 4f8ac70c-7e14-4f06-9865-e194f57c7239\ntitle: T\nkind: teaching\ncapturedAt: 2026-09-27T00:00:00Z\nvisibility: private\n${extra}---\n\n<!-- ex:id p1 -->\nIntro.\n`;
const frontmatter = (text: string) => parseSource(new TextEncoder().encode(text), 'index.md').frontmatter;

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
    return undefined;
  } catch (error) {
    if (error instanceof HashError) return error.code;
    throw error;
  }
}

describe('retiredTargets insertion (§11.11) @R19', () => {
  it('appends a new block mapping when none exists, leaving every other key unchanged', () => {
    const before = fm('');
    const after = insertRetiredTargets(before, [{ id: 'old_a', reason: 'merged', replacement: 'p1' }]);
    const parsed = frontmatter(after);
    expect(parsed['retiredTargets']).toEqual({ old_a: { reason: 'merged', replacement: 'p1' } });
    const { retiredTargets: _, ...rest } = parsed;
    expect(rest).toEqual(frontmatter(before));
    // Only the new lines differ: the body is byte-identical.
    expect(after.slice(after.indexOf('\n---\n'))).toBe(before.slice(before.indexOf('\n---\n')));
  });

  it('inserts into a two-space block mapping, also one with comments', () => {
    for (const existing of ['retiredTargets:\n  a1:\n    reason: "x"\n', 'retiredTargets: # old ones\n  a1:\n    reason: "x"\n  # trailing comment\n']) {
      const after = insertRetiredTargets(fm(existing), [{ id: 'b2', reason: 'new' }]);
      expect(frontmatter(after)['retiredTargets'], existing).toEqual({ a1: { reason: 'x' }, b2: { reason: 'new' } });
    }
  });

  it('refuses the shapes an appended entry would break: {}, flow style, four-space indentation', () => {
    for (const existing of ['retiredTargets: {}\n', 'retiredTargets: { a1: { reason: "x" } }\n', 'retiredTargets:\n    a1:\n        reason: "x"\n']) {
      expect(codeOf(() => insertRetiredTargets(fm(existing), [{ id: 'b2', reason: 'new' }])), existing).toBe('E_SEMANTIC');
    }
  });

  it('keeps a following top-level key after the mapping untouched', () => {
    const text = fm('').replace('visibility: private\n', 'retiredTargets:\n  a1:\n    reason: "x"\nvisibility: private\n');
    const after = insertRetiredTargets(text, [{ id: 'b2', reason: 'new' }]);
    expect(frontmatter(after)['visibility']).toBe('private');
    expect(frontmatter(after)['retiredTargets']).toEqual({ a1: { reason: 'x' }, b2: { reason: 'new' } });
  });

  it('keeps CRLF line endings and a BOM', () => {
    const text = '﻿' + fm('').replace(/\n/g, '\r\n');
    const after = insertRetiredTargets(text, [{ id: 'b2', reason: 'new' }]);
    expect(after.startsWith('﻿---\r\n')).toBe(true);
    expect(after.includes('\n') && after.replace(/\r\n/g, '').includes('\n')).toBe(false);
    expect(frontmatter(after)['retiredTargets']).toEqual({ b2: { reason: 'new' } });
  });

  it('refuses an ID that is already retired', () => {
    expect(codeOf(() => insertRetiredTargets(fm('retiredTargets:\n  a1:\n    reason: "x"\n'), [{ id: 'a1', reason: 'again' }]))).toBe('E_SEMANTIC');
  });

  it('round-trips hostile but allowed reasons exactly, adding no keys', () => {
    const allowed = ['plain', 'x: y', '# not a comment', '--- visibility: public', 'quote " and \\ back', 'emoji \u{1F600}', 'amp &a *a', 'tab-free {% /source %} %}', '"leading quote', "it's"];
    for (const reason of allowed) {
      const after = insertRetiredTargets(fm(''), [{ id: 'old_target', reason }]);
      const parsed = frontmatter(after);
      expect((parsed['retiredTargets'] as Record<string, { reason: string }>)['old_target']!.reason, reason).toBe(reason);
      expect(Object.keys(parsed).sort(), reason).toEqual(['capturedAt', 'docId', 'format', 'kind', 'retiredTargets', 'title', 'visibility']);
    }
  });

  it('rejects reasons with line breaks, control characters, lone surrogates, or over 200 characters (E_USAGE)', () => {
    const rejected = ['a\nb', '---\nvisibility: public', 'tab\there', 'line sep', '\u0085 NEL', '\u007f DEL', '\u0000 NUL', '\ud800 lone', 'x'.repeat(201), ''];
    for (const reason of rejected) expect(codeOf(() => checkReason(reason)), JSON.stringify(reason)).toBe('E_USAGE');
    expect(codeOf(() => checkReason('y'.repeat(200)))).toBeUndefined();
  });

  it('refuses an insertion that would change an existing entry (review B6b)', () => {
    // The "# second" line is block-scalar text, not a comment. Inserting after the last
    // non-comment line would move it out of a1.reason; the parse-and-compare check refuses.
    const text = fm('retiredTargets:\n  a1:\n    reason: |\n      first\n      # second\n');
    expect(codeOf(() => insertRetiredTargets(text, [{ id: 'b2', reason: 'new' }]))).toBe('E_SEMANTIC');
  });
});

describe('docId rewrite for fork (§11.5)', () => {
  it('changes only docId', () => {
    const before = fm('retiredTargets:\n  a1:\n    reason: "x"\n');
    const after = rewriteDocId(before, '11111111-2222-4333-8444-555555555555');
    const parsed = frontmatter(after);
    expect(parsed['docId']).toBe('11111111-2222-4333-8444-555555555555');
    const { docId: _a, ...restAfter } = parsed;
    const { docId: _b, ...restBefore } = frontmatter(before);
    expect(restAfter).toEqual(restBefore);
  });

  it('refuses an invalid docId', () => {
    expect(codeOf(() => rewriteDocId(fm(''), 'not-a-uuid'))).toBe('E_SEMANTIC');
  });
});

describe('retirement and repository fixtures (fixtures/negative/<CODE>/retire/) @T07', () => {
  const root = new URL('../../fixtures/', import.meta.url).pathname;
  const load = (text: string) => {
    const dir = mkdtempSync(join(tmpdir(), 'explain-retire-fixture-'));
    writeFileSync(join(dir, 'index.md'), text);
    return loadBundle(join(dir, 'index.md'));
  };
  for (const code of readdirSync(join(root, 'negative')).filter((c) => existsSync(join(root, 'negative', c, 'retire'))).sort()) {
    for (const name of readdirSync(join(root, 'negative', code, 'retire')).filter((f) => f.endsWith('.md')).sort()) {
      it(`${code}/retire/${name}`, () => {
        const codes = [...new Set(load(readFileSync(join(root, 'negative', code, 'retire', name), 'utf8')).diagnostics.filter((d) => d.severity === 'error').map((d) => d.code))];
        expect(codes).toEqual([code]);
      });
    }
  }
  it('the valid retirement fixture loads with no errors', () => {
    const bundle = load(readFileSync(join(root, 'positive', 'retire-valid.md'), 'utf8'));
    expect(bundle.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });
});
