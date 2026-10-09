import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { ProvenanceText } from '../../packages/core/src/mermaid/source-provenance.js';
import { loadWithProvenance } from '../../packages/core/src/mermaid/yaml-provenance.js';
// @ts-expect-error pinned Mermaid JavaScript module
import { load, JSON_SCHEMA } from '../../node_modules/mermaid/dist/chunks/mermaid.core/chunk-LNGE3PJU.mjs';
const inputs = [
  'label: hello', "label: 'it''s hello'", 'label: "hi\\nthere\\u003c\\U0001F600"',
  'label: >\n  hello\n  world\n', 'label: |-\n  hello\n  world\n',
  'label: |+\n  hello\n\n', 'label: >2-\n  hello\n    indented\n  end\n',
  'label: "hello\\\n  world"', 'label: \'hello\n  world\'',
  'a: &x [1, true, null]\nb: *x', 'a: &x {self: *x}',
  '&anchor key: value', '&anchor scalar', '&anchor [*anchor]', '? &a key\n: *a', 'a: 1\nb: false\nc: null', '[a, {b: c}, d: e]',
];
describe('pinned YAML provenance', () => {
  it('loads the source adapter with native Node 24 module resolution', () => {
    expect(Number(process.versions.node.split('.')[0])).toBe(24);
    const adapter = new URL('../../packages/core/src/mermaid/yaml-provenance.ts', import.meta.url).href;
    const provenance = new URL('../../packages/core/src/mermaid/source-provenance.ts', import.meta.url).href;
    const result = execFileSync(process.execPath, ['--input-type=module', '-e',
      `import {loadWithProvenance} from ${JSON.stringify(adapter)};
       import {ProvenanceText} from ${JSON.stringify(provenance)};
       console.log(loadWithProvenance(ProvenanceText.identity('label: hello')).value.label);`], { encoding: 'utf8' });
    expect(result.trim()).toBe('hello');
  });
  it('maps a near-limit keep-chomp scalar with linear origin cardinality', () => {
    const input = 'label: |+\n  x\n' + '  \n'.repeat(21_800);
    expect(input.length).toBeLessThan(65_536);
    const decoded = loadWithProvenance(ProvenanceText.identity(input)).trace!.entries![0]!.value!.decoded!;
    expect(decoded.text).toBe('x' + '\n'.repeat(21_801));
    let total = 0;
    for (let index = 0; index < decoded.length; index++) {
      const origin = decoded.originAt(index);
      expect(origin.intervals).toHaveLength(1);
      expect(origin.synthetic).toBe(false);
      total += origin.intervals.length;
    }
    expect(total).toBe(decoded.length);
    expect(decoded.mapRange(0, decoded.length).intervals).toHaveLength(21_801);
  });
  const characterCases: [string, string, number[][][]][] = [
    ['label: ab', 'ab', [[[7, 8]], [[8, 9]]]],
    ["label: 'a''b'", "a'b", [[[8, 9]], [[9, 11]], [[11, 12]]]],
    ['label: "a\\nb"', 'a\nb', [[[8, 9]], [[9, 11]], [[11, 12]]]],
    ['label: "a\\u003cb"', 'a<b', [[[8, 9]], [[9, 15]], [[15, 16]]]],
    ['label: "a\\\n  b"', 'ab', [[[8, 9]], [[13, 14]]]],
    ['label: a\n  b', 'a b', [[[7, 8]], [[8, 9]], [[11, 12]]]],
    ["label: 'a\n  b'", 'a b', [[[8, 9]], [[9, 10]], [[12, 13]]]],
    ['label: >-\n  a\n  b\n', 'a b', [[[12, 13]], [[13, 14]], [[16, 17]]]],
    ['label: |-\n  a\n  b\n', 'a\nb', [[[12, 13]], [[13, 14]], [[16, 17]]]],
    ['label: |+\n  a\n  \n', 'a\n\n', [[[12, 13]], [[13, 14]], [[16, 17]]]],
    ['label: |\n  a\n  \n', 'a\n', [[[11, 12]], [[12, 13]]]],
    ['label: |-\r\n  a\r\n  b\r\n', 'a\nb', [[[13, 14]], [[14, 16]], [[18, 19]]]],
  ];
  for (const [input, expected, origins] of characterCases) it(`maps every character: ${JSON.stringify(input)}`, () => {
    const decoded = loadWithProvenance(ProvenanceText.identity(input)).trace!.entries![0]!.value!.decoded!;
    expect(decoded.text).toBe(expected);
    for (let index = 0; index < decoded.length; index++) {
      expect(decoded.mapRange(index, index + 1)).toEqual({
        synthetic: false,
        intervals: origins[index]!.map(([start, end]) => ({ start, end })),
      });
    }
  });
  for (const input of inputs) it(`matches parser: ${JSON.stringify(input)}`, () => {
    expect(loadWithProvenance(ProvenanceText.identity(input)).value).toEqual(load(input, { schema: JSON_SCHEMA }));
  });
  for (const input of ['a: 1\na: 2', 'label: "\\uZZZZ"', 'a: [one', 'label: |0\n x', '*missing']) it(`matches failure: ${input}`, () => {
    expect(() => loadWithProvenance(ProvenanceText.identity(input))).toThrow();
    expect(() => load(input, { schema: JSON_SCHEMA })).toThrow();
  });
  it('maps sequence items and mapping keys through successful structural relations', () => {
    const input = '{key: [ab, "cd"]}';
    const trace = loadWithProvenance(ProvenanceText.identity(input)).trace!;
    const entry = trace.entries![0]!;
    for (const [decoded, start] of [[entry.key!.decoded!, 1], [entry.value!.items![0]!.decoded!, 7], [entry.value!.items![1]!.decoded!, 12]] as const) {
      for (let index = 0; index < decoded.length; index++) {
        expect(decoded.mapRange(index, index + 1)).toEqual({ synthetic: false, intervals: [{ start: start + index, end: start + index + 1 }] });
      }
    }
  });
  it('retains decoded scalar before numeric coercion and successful relations', () => {
    const { trace } = loadWithProvenance(ProvenanceText.identity('a: 12\nb: "\\u003c"'));
    expect(trace?.entries?.map(e => [e.name, e.value?.decoded?.text])).toEqual([['a', '12'], ['b', '<']]);
    expect(trace?.entries?.[1]?.value?.decoded?.mapRange(0, 1).intervals).toEqual([{ start: 10, end: 16 }]);
  });
  for (const [input, decoded] of [
    ['label: >\n  hello\n  world\n', 'hello world\n'],
    ['label: |-\n  hello\n  world\n', 'hello\nworld'],
    ['label: |+\n  hello\n\n', 'hello\n\n'],
    ['label: "hello\\\n  world"', 'helloworld'],
    ["label: 'hello\n  world'", 'hello world'],
    ['label: hello\n  world', 'hello world'],
  ]) it(`decodes mapped scalar: ${input}`, () => {
    const { trace } = loadWithProvenance(ProvenanceText.identity(input!));
    expect(trace?.entries?.[0]?.value?.decoded?.text).toBe(decoded);
  });
  it('maps doubled apostrophes to both source units', () => {
    const { trace } = loadWithProvenance(ProvenanceText.identity("'it''s'"));
    expect(trace?.decoded?.text).toBe("it's");
    expect(trace?.decoded?.mapRange(2, 3).intervals).toEqual([{ start: 3, end: 5 }]);
  });
  it('retains only successful property fallback relations', () => {
    const { trace } = loadWithProvenance(ProvenanceText.identity('&anchor key: value'));
    expect(trace?.kind).toBe('mapping');
    expect(trace?.entries?.map(e => [e.key?.decoded?.text, e.value?.decoded?.text])).toEqual([['key', 'value']]);
  });
  it('retains synthetic origins through wrapper parsing', () => {
    const input = ProvenanceText.identity('label: "\\u003c"');
    const wrapped = input.synthetic('{\n').concat(input, input.synthetic('\n}'));
    const { trace } = loadWithProvenance(wrapped);
    expect(trace?.raw.synthetic).toBe(true);
    expect(trace?.entries?.[0]?.value?.decoded?.mapRange(0, 1)).toEqual({ intervals: [{start: 8, end: 14}], synthetic: false });
  });
  it('keeps alias use site and scalar definition separate', () => {
    const input = 'a: &x "hello"\nb: *x';
    const { trace } = loadWithProvenance(ProvenanceText.identity(input));
    const alias = trace?.entries?.[1]?.value;
    expect(alias?.kind).toBe('alias');
    expect(alias?.definition?.decoded?.text).toBe('hello');
    expect(alias?.raw.intervals).toEqual([{ start: input.indexOf('*'), end: input.length }]);
  });
  it('keeps alias references without expanding cycles', () => {
    const { trace } = loadWithProvenance(ProvenanceText.identity('&x {self: *x}'));
    expect(trace?.entries?.[0]?.value?.kind).toBe('alias');
    expect(trace?.entries?.[0]?.value?.definition).toBe(trace);
  });
});
