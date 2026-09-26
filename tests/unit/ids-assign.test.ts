// `ids assign` (ARCHITECTURE.md §6.3, §17.1).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assignIds, IdsAssignError, MARKER_LINE, parseSource } from '../../packages/core/src/syntax/index.ts';

const enc = new TextEncoder();
const dec = new TextDecoder();
const FM = '---\nformat: explain/1\ntitle: T\n---\n\n';

// Deterministic "random" source: a counter, so tests are reproducible.
const counter = () => {
  let n = 0;
  return (len: number) => {
    n++;
    const b = new Uint8Array(len);
    b[0] = n & 0xff;
    b[1] = (n >> 8) & 0xff;
    return b;
  };
};

const body = `${FM}# Title\n\nFirst paragraph.\n\n<!-- ex:id keep_me -->\nKept paragraph.\n\n- one\n- two\n\n{% detail id="d" label="L" %}\nInside a tag.\n\n- nested list\n{% /detail %}\n\n> quote\n`;

describe('ids assign @R02 @R19', () => {
  it('inserts markers only before unmarked top-level blocks', () => {
    const out = assignIds(enc.encode(body), counter());
    expect(out.added).toHaveLength(4); // heading, first paragraph, list, blockquote
    for (const id of out.added) expect(id).toMatch(/^b_[a-z2-7]{16}$/);
    const p = parseSource(out.bytes, 'index.md');
    expect(p.diagnostics).toEqual([]);
    expect(p.targets.map((t) => t.id)).toEqual([out.added[0], out.added[1], 'keep_me', out.added[2], 'd', out.added[3]]);
    // Nothing was inserted inside the tag body.
    const inside = dec.decode(out.bytes).split('{% detail')[1]!.split('{% /detail %}')[0]!;
    expect(inside).not.toContain('ex:id');
  });

  it('changes no existing bytes other than the inserted marker lines', () => {
    const out = assignIds(enc.encode(body), counter());
    const stripped = dec.decode(out.bytes).split('\n').filter((l) => !(MARKER_LINE.test(l) && /ex:id b_/.test(l))).join('\n');
    expect(stripped).toBe(body);
  });

  it('is idempotent', () => {
    const once = assignIds(enc.encode(body), counter());
    const twice = assignIds(once.bytes, counter());
    expect(twice.added).toEqual([]);
    expect(twice.bytes).toEqual(once.bytes);
  });

  it('preserves CRLF line endings', () => {
    const crlf = enc.encode(body.replace(/\n/g, '\r\n'));
    const out = assignIds(crlf, counter());
    const s = dec.decode(out.bytes);
    expect(s).not.toMatch(/[^\r]\n/);
    expect(parseSource(out.bytes, 'index.md').diagnostics).toEqual([]);
  });

  it('adds a blank line when the previous line is not blank', () => {
    const tight = `${FM}<!-- ex:id p -->\nPara.\n# Heading right after\n`;
    const out = assignIds(enc.encode(tight), counter());
    expect(out.added).toHaveLength(1);
    expect(dec.decode(out.bytes)).toContain(`Para.\n\n<!-- ex:id ${out.added[0]} -->\n# Heading right after\n`);
    expect(parseSource(out.bytes, 'index.md').diagnostics).toEqual([]);
  });

  it('retries on an ID collision', () => {
    let calls = 0;
    const same = (len: number) => { calls++; return new Uint8Array(len).fill(calls <= 2 ? 0 : calls); };
    const out = assignIds(enc.encode(`${FM}One.\n\nTwo.\n`), same);
    expect(new Set(out.added).size).toBe(2);
    expect(calls).toBe(3);
  });

  it('leaves the complete example unchanged', () => {
    const ex = new Uint8Array(readFileSync(new URL('../../examples/bounded-queue/index.md', import.meta.url)));
    const out = assignIds(ex, counter());
    expect(out.added).toEqual([]);
    expect(out.bytes).toEqual(ex);
  });

  it('refuses when the source has errors other than missing IDs', () => {
    expect(() => assignIds(enc.encode(`${FM}<!-- ex:id p --> trailing\nPara.\n`), counter())).toThrow(IdsAssignError);
  });
});
