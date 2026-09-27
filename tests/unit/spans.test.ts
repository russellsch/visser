// Byte spans for Appendix A (ARCHITECTURE.md §7.3). Expected values come from
// spikes/markdoc-spans/results.txt and are re-derived here from the example.
// Revision 1.23 renamed `format: explain/1` to `format: visser/1`, one byte
// shorter, so every range is one byte lower than in the spike results.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSource } from '../../packages/core/src/syntax/index.ts';

const EXAMPLE = new URL('../../examples/bounded-queue/index.md', import.meta.url);
const lf = new Uint8Array(readFileSync(EXAMPLE));

// id, kind, parent, startLine-endLine (1-based inclusive), LF byte range.
const EXPECTED: Array<[string, string, string, string, string]> = [
  ['overview', 'heading', '', '15-16', '389-460'],
  ['p_takeaway', 'paragraph', '', '18-21', '461-702'],
  ['p_limits', 'paragraph', '', '23-26', '703-939'],
  ['p_vocabulary', 'paragraph', '', '28-30', '940-1111'],
  ['handoff', 'graph', '', '32-58', '1112-2457'],
  ['producer', 'node', 'handoff', '35-37', '1337-1448'],
  ['queue', 'node', 'handoff', '39-42', '1449-1657'],
  ['worker', 'node', 'handoff', '44-46', '1658-1807'],
  ['enqueue', 'edge', 'handoff', '48-51', '1808-2080'],
  ['dequeue', 'edge', 'handoff', '53-57', '2081-2444'],
  ['p_trace', 'paragraph', '', '60-63', '2458-2700'],
  ['full_queue_trace', 'trace', '', '65-88', '2701-3978'],
  ['actor_producer', 'actor', 'full_queue_trace', '69-69', '2928-2996'],
  ['actor_consumer', 'actor', 'full_queue_trace', '70-70', '2996-3062'],
  ['event_call', 'event', 'full_queue_trace', '72-74', '3063-3234'],
  ['event_wait', 'event', 'full_queue_trace', '76-78', '3235-3448'],
  ['event_remove', 'event', 'full_queue_trace', '80-82', '3449-3647'],
  ['event_resume', 'event', 'full_queue_trace', '84-87', '3648-3965'],
  ['wait_code', 'annotated', '', '90-97', '3979-4467'],
  ['capacity_loop', 'annotation', 'wait_code', '93-96', '4180-4450'],
  ['def_backpressure', 'definition', '', '99-103', '4468-4763'],
  ['src_queue', 'source', '', '105-134', '4764-5717'],
  ['src_condition_docs', 'source', '', '136-136', '5718-5947'],
];

const enc = new TextEncoder();
const dec = new TextDecoder();
const text = dec.decode(lf);
const variants: Record<string, Uint8Array> = {
  lf,
  crlf: enc.encode(text.replace(/\n/g, '\r\n')),
  bom: new Uint8Array([0xef, 0xbb, 0xbf, ...lf]),
  noeol: enc.encode(text.replace(/\n$/, '')),
};

const sliceText = (bytes: Uint8Array, s: number, e: number) => dec.decode(bytes.subarray(s, e)).replace(/\r\n/g, '\n');

describe('Appendix A spans @R02 @R03', () => {
  const lfParsed = parseSource(lf, 'index.md');

  it('binds exactly the 23 expected targets with no diagnostics', () => {
    expect(lfParsed.diagnostics).toEqual([]);
    const rows = lfParsed.targets.map((t) => [t.id, t.kind, t.parentId ?? '', `${t.startLine}-${t.endLine}`, `${t.startByte}-${t.endByte}`]);
    expect(rows).toEqual(EXPECTED);
  });

  it('slices open at the marker or tag and close at the block end', () => {
    for (const t of lfParsed.targets) {
      const body = sliceText(lf, t.startByte, t.endByte);
      const first = body.split('\n')[0]!;
      if (t.origin === 'marker') expect(first).toBe(`<!-- vs:id ${t.id} -->`);
      else expect(first).toMatch(new RegExp(`^\\{% ${t.kind} .*id="${t.id}"`));
      expect(body.endsWith('\n')).toBe(true);
      expect(body).not.toMatch(/\n\s*\n$/);
    }
  });

  it('includes the attached marker in a marker target span', () => {
    const p = lfParsed.targets.find((t) => t.id === 'p_takeaway')!;
    expect(sliceText(lf, p.startByte, p.endByte)).toBe(
      '<!-- vs:id p_takeaway -->\nThe queue bounds the number of stored items by making producers wait when it is\n' +
        'full. A consumer taking an item creates space; it does not mean that processing\n' +
        'of that item has finished. {% cite ref="src_queue" /%}\n',
    );
  });

  for (const [name, bytes] of Object.entries(variants)) {
    it(`gives equivalent spans for the ${name} variant`, () => {
      const p = parseSource(bytes, 'index.md');
      expect(p.diagnostics).toEqual([]);
      expect(p.targets.map((t) => [t.id, t.startLine, t.endLine])).toEqual(lfParsed.targets.map((t) => [t.id, t.startLine, t.endLine]));
      for (const [i, t] of p.targets.entries()) {
        const ref = lfParsed.targets[i]!;
        const got = sliceText(bytes, t.startByte, t.endByte);
        const want = sliceText(lf, ref.startByte, ref.endByte);
        expect(got.replace(/\n$/, '')).toBe(want.replace(/\n$/, ''));
      }
    });
  }

  it('maps BOM and CRLF offsets to original bytes', () => {
    const bom = parseSource(variants.bom!, 'index.md');
    const crlf = parseSource(variants.crlf!, 'index.md');
    expect(bom.targets[0]!.startByte).toBe(lfParsed.targets[0]!.startByte + 3);
    // 14 lines precede the first target, each gaining one CR byte.
    expect(crlf.targets[0]!.startByte).toBe(lfParsed.targets[0]!.startByte + 14);
    const last = crlf.targets[crlf.targets.length - 1]!;
    expect(dec.decode(variants.crlf!.subarray(last.endByte - 2, last.endByte))).toBe('\r\n');
  });

  it('ends the final target at EOF when the file has no final newline', () => {
    const p = parseSource(variants.noeol!, 'index.md');
    expect(p.targets[p.targets.length - 1]!.endByte).toBe(variants.noeol!.length);
  });

  it('parses the frontmatter', () => {
    expect(lfParsed.frontmatter['docId']).toBe('4f8ac70c-7e14-4f06-9865-e194f57c7239');
    expect(lfParsed.frontmatter['kind']).toBe('teaching');
  });

  it('keeps a target and its ID when a paragraph is inserted above it @T02', () => {
    const shifted = enc.encode(text.replace('<!-- vs:id p_limits -->', '<!-- vs:id p_new -->\nInserted.\n\n<!-- vs:id p_limits -->'));
    const p = parseSource(shifted, 'index.md');
    expect(p.diagnostics).toEqual([]);
    const before = lfParsed.targets.find((t) => t.id === 'p_limits')!;
    const after = p.targets.find((t) => t.id === 'p_limits')!;
    expect(after.startLine).toBe(before.startLine + 3);
    expect(sliceText(shifted, after.startByte, after.endByte)).toBe(sliceText(lf, before.startByte, before.endByte));
  });
});
