import { beforeAll, describe, expect, it } from 'vitest';
import DOMPurify from 'dompurify';
// @ts-expect-error test-only jsdom package has no declarations.
import { JSDOM } from 'jsdom';
import { MathPolicyError } from '../../packages/core/src/math/policy.ts';
import { sanitizeKanbanField, traceKanbanSanitation, type KanbanSanitation } from '../../packages/core/src/mermaid/kanban-sanitize.ts';
import { prepareSequenceSanitizer } from '../../packages/core/src/mermaid/sequence-sanitize.ts';
import { ProvenanceText } from '../../packages/core/src/mermaid/source-provenance.ts';

beforeAll(prepareSequenceSanitizer);

function strictNative(input: string, htmlLabels: boolean): readonly string[] {
  const purifier = DOMPurify(new JSDOM('', { url: 'about:blank' }).window as any);
  const temporary = 'data-temp-href-target';
  purifier.addHook('beforeSanitizeAttributes', node => {
    if (node.tagName === 'A' && node.hasAttribute('target')) node.setAttribute(temporary, node.getAttribute('target') ?? '');
  });
  purifier.addHook('afterSanitizeAttributes', node => {
    if (node.tagName === 'A' && node.hasAttribute(temporary)) {
      node.setAttribute('target', node.getAttribute(temporary) ?? '');
      node.removeAttribute(temporary);
      if (node.getAttribute('target') === '_blank') node.setAttribute('rel', 'noopener');
    }
  });
  const passes: string[] = [];
  if (htmlLabels) passes.push(purifier.sanitize(input));
  passes.push(purifier.sanitize(passes.at(-1) ?? input, { FORBID_TAGS: ['style'] }));
  return passes;
}

describe('Kanban strict sanitizer', () => {
  it.each([
    '<b>safe</b><script>alert(1)</script><style>.x{color:red}</style>',
    '<a href="https://example.test" target="_blank">link</a>',
    '<BR/> &dollar;&dollar;x&dollar;&dollar; &amp; &#x1f600;',
    '&dollar;&dollar;x&dollar;&dollar;',
    'a <<interface>> $$x$$',
  ])('matches real native strict DOMPurify for htmlLabels true: %s', async source => {
    const result = await sanitizeKanbanField(ProvenanceText.identity(source), true);
    const expected = strictNative(source, true);
    expect(result.witness).toEqual({ htmlLabels: true, passes: expected });
    expect(result.value.text).toBe(expected.at(-1));
  });

  it.each([
    '<b>safe</b><script>alert(1)</script><style>.x{color:red}</style>',
    '<BR/> &dollar;&dollar;x&dollar;&dollar; &amp; &#x1f600;',
    '&dollar;&dollar;x&dollar;&dollar;',
    'a <<interface>> $$x$$',
  ])('matches one native strict DOMPurify pass for htmlLabels false: %s', async source => {
    const result = await sanitizeKanbanField(ProvenanceText.identity(source), false);
    const expected = strictNative(source, false);
    expect(result.witness).toEqual({ htmlLabels: false, passes: expected });
    expect(result.value.text).toBe(expected[0]);
  });

  it('bypasses both native passes for empty fields', async () => {
    for (const htmlLabels of [true, false]) {
      const input = ProvenanceText.identity('');
      const result = await sanitizeKanbanField(input, htmlLabels);
      expect(result.witness).toEqual({ htmlLabels, passes: [] });
      expect(result.value).toBe(input);
      expect(Object.isFrozen(result.witness)).toBe(true);
      expect(Object.isFrozen(result.witness.passes)).toBe(true);
    }
  });

  it('retains formula provenance through normalized HTML and entity decoding', async () => {
    const source = '<br/> &dollar;&dollar;x&dollar;&dollar;';
    const result = await sanitizeKanbanField(ProvenanceText.identity(source));
    expect(result.value.text).toBe('<br> $$x$$');
    const start = result.value.text.indexOf('$$x$$');
    expect(result.value.mapRange(start, start + 5)).toEqual({ synthetic: false,
      intervals: [{ start: source.indexOf('&dollar;'), end: source.length }] });
  });

  it('rejects malformed or dishonest witnesses before tracing provenance', async () => {
    const input = ProvenanceText.identity('<b>formula</b>');
    const invalid = (witness: KanbanSanitation) => expect(() => traceKanbanSanitation(input, witness))
      .toThrowError(MathPolicyError);
    for (const witness of [null, undefined, [], 'invalid']) invalid(witness as unknown as KanbanSanitation);
    invalid({ htmlLabels: false, passes: [42] } as unknown as KanbanSanitation);
    invalid({ htmlLabels: true, passes: ['<b>formula</b>'] });
    invalid({ htmlLabels: false, passes: ['<b>formula</b>', '<b>formula</b>'] });
    invalid({ htmlLabels: 'true' as unknown as boolean, passes: ['<b>formula</b>', '<b>formula</b>'] });
    expect(() => traceKanbanSanitation(ProvenanceText.identity('plain'), { htmlLabels: false, passes: ['changed'] }))
      .toThrowError(MathPolicyError);
    await expect(sanitizeKanbanField(input, 'true' as unknown as boolean)).rejects.toMatchObject({ code: 'E_MATH_INVALID' });
  });

  it('keeps concurrent calls isolated across modes and HTML shapes', async () => {
    const cases = [
      ['<b>one</b><style>x</style>', true],
      ['<i>two</i><script>x</script>', false],
      ['<br/> &dollar;&dollar;z&dollar;&dollar;', true],
      ['plain', false],
    ] as const;
    const results = await Promise.all(cases.map(([source, htmlLabels]) =>
      sanitizeKanbanField(ProvenanceText.identity(source), htmlLabels)));
    for (let index = 0; index < cases.length; index++) {
      const [source, htmlLabels] = cases[index]!;
      const expected = strictNative(source, htmlLabels);
      expect(results[index]!.witness.passes).toEqual(expected);
      expect(results[index]!.value.text).toBe(expected.at(-1));
    }
  });
});
