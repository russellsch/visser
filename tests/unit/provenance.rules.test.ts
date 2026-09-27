// Argument grammars, text rules, fence selection, and repository identity (§8.2).
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { HashError } from '../../packages/core/src/model/hash.ts';
import {
  blobObjectId, checkCapturedBytes, checkRepoPath, excerptText, extractExcerpt, fenceFor, identityProblem,
  parseLineRange, portableRemote, sourceBlock,
} from '../../packages/core/src/provenance/index.ts';
import { parseSource } from '../../packages/core/src/syntax/index.ts';

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof HashError) return error.code;
    throw error;
  }
  return 'ok';
}

const enc = (s: string) => new TextEncoder().encode(s);

describe('--lines grammar (§8.2 step 5) @R07', () => {
  it.each([
    ['1:2', 'ok'], ['12:12', 'ok'], ['1e3:5', 'E_USAGE'], ['0x1:2', 'E_USAGE'], ['5:3', 'E_USAGE'], [' 3:4', 'E_USAGE'],
    ['07:9', 'E_USAGE'], ['0:5', 'E_USAGE'], ['-1:2', 'E_USAGE'], ['2.5:3', 'E_USAGE'], ['1:', 'E_USAGE'], ['1:9999999999', 'E_USAGE'],
  ])('%s → %s', (input, code) => {
    expect(codeOf(() => parseLineRange(input))).toBe(code);
  });
});

describe('--file grammar (§8.2 step 5) @R07', () => {
  it.each([
    ['src/a.py', 'ok'], ['dir é/𝒳 file.txt', 'ok'], ['../a', 'E_USAGE'], ['a/../b', 'E_USAGE'], [':(glob)*', 'E_USAGE'],
    ['-x', 'E_USAGE'], ['/a', 'E_USAGE'], ['a//b', 'E_USAGE'], ['./a', 'E_USAGE'], ['a\\b', 'E_USAGE'], ['', 'E_USAGE'],
    ['cafe\u0301.txt', 'E_USAGE'],
  ])('%s → %s', (input, code) => {
    expect(codeOf(() => checkRepoPath(input))).toBe(code);
  });
});

describe('captured text rules (§8.2)', () => {
  it('accepts TAB, LF, and CRLF, and rejects lone CR, NUL, and C0 bytes', () => {
    expect(codeOf(() => checkCapturedBytes(enc('a\tb\r\nc\n')))).toBe('ok');
    expect(codeOf(() => checkCapturedBytes(enc('a\rb\n')))).toBe('E_SEMANTIC');
    expect(codeOf(() => checkCapturedBytes(enc('a\0b\n')))).toBe('E_SEMANTIC');
    expect(codeOf(() => checkCapturedBytes(enc('a\u001bb\n')))).toBe('E_SEMANTIC');
    expect(codeOf(() => checkCapturedBytes(new Uint8Array([0xc3, 0x28])))).toBe('E_SEMANTIC');
  });

  it('counts LF-terminated lines of the raw bytes, and a last line without LF', () => {
    expect(extractExcerpt(enc('a\nb\nc'), 3, 3).text).toBe('c\n');
    expect(extractExcerpt(enc('a\r\nb\r\n'), 1, 2).text).toBe('a\nb\n');
    expect(codeOf(() => extractExcerpt(enc('a\nb\n'), 1, 3))).toBe('E_USAGE');
  });

  it('stores exactly one terminal LF and hashes that form', () => {
    expect(excerptText(enc('x'))).toBe('x\n');
    expect(excerptText(enc('x\n\n'))).toBe('x\n\n');
    const e = extractExcerpt(enc('only'), 1, 1);
    expect(e.excerptSha256).toBe(createHash('sha256').update('only\n').digest('hex'));
  });
});

describe('fence selection and attribute encoding cannot change document structure', () => {
  const doc = (block: string) => `---\nformat: visser/1\ndocId: 4f8ac70c-7e14-4f06-9865-e194f57c7239\ntitle: T\nkind: teaching\ncapturedAt: 2026-09-26T00:00:00Z\nvisibility: private\n---\n\n<!-- vs:id intro -->\nIntro.\n\n${block}`;
  const hostile = [
    'a\n```\n{% /source %}\n\n<!-- vs:id injected -->\nInjected.\n\n{% source id="src_evil" kind="example" title="x" %}\n```\n',
    'b\n`````\n{% /source %}\n',
    'c\n~~~\n{% /source %}\n',
  ];
  for (const text of hostile) {
    it(`keeps the target set for text ${JSON.stringify(text.slice(0, 12))}`, () => {
      const block = sourceBlock({ id: 'src_x', kind: 'example', title: 'T "q" %} {% $x %}\nnext', excerptSha256: '0'.repeat(64) }, { text });
      const parsed = parseSource(enc(doc(block)), 'index.md');
      expect(parsed.targets.map((t) => t.id)).toEqual(['intro', 'src_x']);
      expect(parsed.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    });
  }

  it('uses a fence longer than any backtick run, minimum three', () => {
    expect(fenceFor('plain')).toBe('```');
    expect(fenceFor('x ``` y')).toBe('````');
    expect(fenceFor('`````')).toBe('``````');
  });
});

describe('repository identity (§8.2) @R07', () => {
  it('strips credentials, query, and fragment, and refuses local paths', () => {
    expect(portableRemote('https://u:p@example.com/org/app.git?t=1#x')).toBe('https://example.com/org/app.git');
    expect(portableRemote('git@github.com:org/app.git')).toBe('git@github.com:org/app.git');
    expect(portableRemote('/srv/git/app.git')).toBeUndefined();
    expect(portableRemote('file:///srv/git/app.git')).toBeUndefined();
    expect(identityProblem('/home/me/app')).toBeDefined();
    expect(identityProblem('~/app')).toBeDefined();
    expect(identityProblem('C:\\repo')).toBeDefined();
    expect(identityProblem('https://u:p@example.com/x')).toBeDefined();
    expect(identityProblem('app')).toBeUndefined();
  });
});

describe('object-hash recheck (§8.2 step 8)', () => {
  it('matches Git blob hashes in SHA-1 and SHA-256', () => {
    // `printf 'line1\n' | git hash-object --stdin` and the SHA-256 equivalent.
    expect(blobObjectId(enc('line1\n'), 'sha1')).toBe(createHash('sha1').update('blob 6\0line1\n').digest('hex'));
    expect(blobObjectId(enc(''), 'sha1')).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
    expect(blobObjectId(enc(''), 'sha256')).toBe('473a0f4c3be8a93681a267e3b1e9a7dcda1185436fe141f7749120a303721813');
  });
});
