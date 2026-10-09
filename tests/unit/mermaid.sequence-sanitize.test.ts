import { beforeAll, expect, it } from 'vitest';
import { prepareSequenceSanitizer, sanitizeSequenceField } from '../../packages/core/src/mermaid/sequence-sanitize.ts';
import { ProvenanceText } from '../../packages/core/src/mermaid/source-provenance.ts';

beforeAll(prepareSequenceSanitizer);
const sanitize = (source: string) => sanitizeSequenceField(ProvenanceText.identity(source));

it('preserves the native entity-only fast path and activates decoding only with markup', () => {
  expect(sanitize('&dollar;&dollar;x&dollar;&dollar;').text).toBe('&dollar;&dollar;x&dollar;&dollar;');
  expect(sanitize('<BR/> &dollar;&dollar;x&dollar;&dollar;').text).toBe('<br> $$x$$');
  expect(sanitize('<br>&amp;dollar;&amp;dollar;x&amp;dollar;&amp;dollar;').text)
    .toBe('<br>&amp;dollar;&amp;dollar;x&amp;dollar;&amp;dollar;');
});

it('preserves distinct source intervals for repeated encoded and ordinary formulas', () => {
  const source = '<br/> $$x$$ &dollar;&dollar;x&dollar;&dollar; $$x$$';
  const mapped = sanitize(source);
  expect(mapped.text).toBe('<br> $$x$$ $$x$$ $$x$$');
  const spans = [...mapped.text.matchAll(/\$\$x\$\$/g)].map(match => mapped.mapRange(match.index, match.index + match[0].length));
  expect(spans.every(span => !span.synthetic && span.intervals.length === 1)).toBe(true);
  expect(spans.map(span => source.slice(span.intervals[0]!.start, span.intervals[0]!.end)))
    .toEqual(['$$x$$', '&dollar;&dollar;x&dollar;&dollar;', '$$x$$']);
  expect(spans[0]!.intervals[0]!.start).toBeLessThan(spans[1]!.intervals[0]!.start);
  expect(spans[1]!.intervals[0]!.start).toBeLessThan(spans[2]!.intervals[0]!.start);
});

it('tracks exact entity consumption, HTML escapes, astral codepoints and normalized breaks', () => {
  const source = ' \r\n<br />&notit; &#x1f600; &#36&#36;x&#36;&#36; &lt; &nbsp;';
  const mapped = sanitize(source);
  expect(mapped.text).toBe(' \r\n<br>¬it; 😀 $$x$$ &lt; &nbsp;');
  const emoji = mapped.text.indexOf('😀');
  expect(mapped.mapRange(emoji, emoji + 2)).toEqual({ synthetic: false,
    intervals: [{ start: source.indexOf('&#x1f600;'), end: source.indexOf('&#x1f600;') + 9 }] });
  const firstDollar = mapped.text.indexOf('$$');
  expect(mapped.mapRange(firstDollar, firstDollar + 2)).toEqual({ synthetic: false,
    intervals: [{ start: source.indexOf('&#36&#36;'), end: source.indexOf('&#36&#36;') + 9 }] });
  expect(mapped.mapRange(mapped.text.indexOf('it;'), mapped.text.indexOf('it;') + 3)).toEqual({ synthetic: false,
    intervals: [{ start: source.indexOf('it;'), end: source.indexOf('it;') + 3 }] });
});

it('keeps native complex HTML output without inventing source spans', () => {
  for (const source of ['a <<interface>> $$x$$', '<!--removed--> $$x$$', '<b>$$x$$</b>']) {
    const mapped = sanitize(source);
    expect(mapped.text).toContain('$$x$$');
    const start = mapped.text.indexOf('$$x$$');
    expect(mapped.mapRange(start, start + 5)).toEqual({ synthetic: true, intervals: [] });
  }
});

it('does not install window or document globals', () => {
  expect('window' in globalThis).toBe(false);
  expect('document' in globalThis).toBe(false);
});

it('maps literal comparison signs without treating them as HTML elements', () => {
  const source = '$$x < y$$';
  const mapped = sanitize(source);
  expect(mapped.text).toBe('$$x &lt; y$$');
  expect(mapped.mapRange(0, mapped.length)).toEqual({synthetic:false, intervals:[{start:0,end:source.length}]});
});
