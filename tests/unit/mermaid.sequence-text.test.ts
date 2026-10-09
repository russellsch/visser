import { expect, it } from 'vitest';
import { sequenceSanitizedMathText } from '../../packages/core/src/mermaid/sequence-text.ts';
import { validateMermaidMathLabel } from '../../packages/core/src/mermaid/math.ts';

it('decodes exactly one serialization layer within existing equations', () => {
  expect(sequenceSanitizedMathText('prose &lt; $$x &lt; y$$<br>$$z &gt; x$$'))
    .toBe('prose &lt; $$x < y$$\n$$z > x$$');
  expect(sequenceSanitizedMathText(String.raw`$$\&amp;$$ $$&nbsp;x$$ $$&amp;lt;$$`))
    .toBe('$$\\&$$ $$\u00a0x$$ $$&lt;$$');
  expect(sequenceSanitizedMathText('&dollar;&dollar;x&dollar;&dollar; &lt;'))
    .toBe('&dollar;&dollar;x&dollar;&dollar; &lt;');
  expect(sequenceSanitizedMathText('$$x<br> &lt; y$$')).toBe('$$x\n &lt; y$$');
});

it('retains complete policy validation after serialization is undone', () => {
  expect(()=>validateMermaidMathLabel(sequenceSanitizedMathText('$$&lt;img src=x&gt;$$'))).toThrow(/HTML markup/);
  expect(()=>validateMermaidMathLabel(sequenceSanitizedMathText('$$&amp;lt;$$'))).toThrow(/KaTeX rejected/);
});
