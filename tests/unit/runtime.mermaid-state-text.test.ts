// @ts-expect-error jsdom is supplied by the test harness without declarations.
import { JSDOM } from 'jsdom';
import { expect, it } from 'vitest';
import { stateMathText, withStateMathRoot } from '../../packages/runtime/src/mermaid-state-text.ts';

it('normalizes only existing equations beneath the active native SVG, and always releases it', async () => {
  const { document } = new JSDOM('<svg id="a"><g></g></svg><svg id="b"><g></g></svg>').window;
  const a = document.querySelector('#a')!, b = document.querySelector('#b')!;
  const text = '&lt; prose $$x &lt; y &amp; z &gt; w &nbsp;$$ &dollar;&dollar;q&dollar;&dollar;';
  const expected = '&lt; prose $$x < y & z > w \u00a0$$ &dollar;&dollar;q&dollar;&dollar;';
  expect(stateMathText(a.firstElementChild!, text)).toBe(text);
  await expect(withStateMathRoot(a, async () => {
    await Promise.resolve();
    expect(stateMathText(a.firstElementChild!, text)).toBe(expected);
    expect(stateMathText(b.firstElementChild!, text)).toBe(text);
    await withStateMathRoot(b, async () => expect(stateMathText(b, text)).toBe(expected));
    expect(stateMathText(b, text)).toBe(text);
    await expect(withStateMathRoot(a, async () => undefined)).rejects.toThrow('overlapping');
    throw new Error('native render failed');
  })).rejects.toThrow('native render failed');
  expect(stateMathText(a.firstElementChild!, text)).toBe(text);
  await withStateMathRoot(a, async () => expect(stateMathText(a, text)).toBe(expected));
  expect(stateMathText(a, text)).toBe(text);
});

it('does not pair formulas across native line breaks', async () => {
  const { document } = new JSDOM('<svg><g></g></svg>').window;
  const svg = document.querySelector('svg')!;
  await withStateMathRoot(svg, async () => {
    expect(stateMathText(svg, '$$a &lt;<br/> b$$')).toBe('$$a &lt;\n b$$');
  });
});
