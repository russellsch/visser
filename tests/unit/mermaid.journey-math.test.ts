import { expect, it } from 'vitest';
import { extractJourneyMath } from '../../packages/core/src/mermaid/journey-math.ts';
import { EMPTY_MATH_RESOURCE_TOTAL, MATH_LIMITS } from '../../packages/core/src/math/policy.ts';

it('validates every authored occurrence including overwritten roots, unused sections and repeated actors', async () => {
  const result = await extractJourneyMath('journey\ntitle $$a$$\ntitle $$b$$\naccTitle: $$c$$\naccDescr: $$d$$\nsection $$e$$\nTask $$f$$: 3: $$g$$, $$g$$\nsection $$h$$\n');
  expect(result.total.occurrences).toBe(9);
  expect(result.records.map(r => r.recordIndex)).toEqual(result.labels.records.map(r => r.recordIndex));
  const origins = result.records.flatMap(r => r.parts.flatMap(p => p.kind === 'math' ? p.origins : []));
  expect(new Set(origins.map(o => o.startByte)).size).toBe(9);
});

it('preserves TeX matrix row separators and literal entities on raw journey paths', async () => {
  const tex = String.raw`\begin{matrix}a&b\\c&d\end{matrix}`;
  const found = await extractJourneyMath(`journey\nsection $$${tex}$$\n$$${tex}$$: 2: $$${tex}$$\nEntity &lt &amp: 1: ﬂ°dollar¶ß\n`);
  expect(found.total.occurrences).toBe(3);
  for (const formula of found.records.flatMap(r => r.parts.filter(p => p.kind === 'math'))) expect(formula.tex).toBe(tex);
  expect(found.records.find(r => r.dbValue.startsWith('Entity'))!.renderedValue).toBe('Entity &lt &amp');
});

it('retains separate DB and formula text after native metadata sanitation', async () => {
  const source = 'journey\ntitle $$x < y$$\naccDescr {\n <br/>&dollar;&dollar;z&dollar;&dollar;\n}\nTask: 2\n';
  const found = await extractJourneyMath(source);
  const title = found.records.find(r => r.role === 'title')!;
  expect(title.dbValue).toBe('$$x &lt; y$$');
  expect(title.renderedValue).toBe('$$x < y$$');
  expect(title.parts).toMatchObject([{ kind:'math',tex:'x < y',origins:[{rawSource:'$$x < y$$'}] }]);
  const description = found.records.find(r => r.role === 'accDescr')!;
  expect(description.parts.filter(p => p.kind === 'math')).toMatchObject([{tex:'z',origins:[{rawSource:'&dollar;&dollar;z&dollar;&dollar;'}]}]);
});

it('uses break barriers for math while preserving actor legend space and tooltip spelling', async () => {
  const found = await extractJourneyMath('journey\nsection $$s$$<br/>next\n$$t$$<br>next: 2: $$a$$<br/>next\n');
  expect(found.records.map(r => r.renderedValue)).toEqual(['$$s$$<br/>next','$$t$$<br>next','$$a$$ next']);
  expect(found.records.map(r => r.validationInput.text)).toEqual(['$$s$$\nnext','$$t$$\nnext','$$a$$\nnext']);
  expect(found.records[2]!.dbValue).toBe('$$a$$<br/>next');
  for (const source of ['journey\nsection $$x<br/>y$$\nTask: 1\n','journey\n$$x<br/>y$$: 1\n','journey\nTask: 1: $$x<br/>y$$\n']) {
    await expect(extractJourneyMath(source)).rejects.toMatchObject({name:'LocatedJourneyMathError',code:'E_MATH_INVALID',startLine:2});
  }
});

it('locates invalid overwritten math and enforces the incoming document resource budget', async () => {
  await expect(extractJourneyMath('journey\ntitle $$\\unknownVisserCommand$$\ntitle safe\nTask: 1\n')).rejects.toMatchObject({name:'LocatedJourneyMathError',startLine:2,intervals:[{rawSource:'$$\\unknownVisserCommand$$'}]});
  await expect(extractJourneyMath('journey\nTask $$x$$: 1\n',{...EMPTY_MATH_RESOURCE_TOTAL,occurrences:MATH_LIMITS.documentOccurrences})).rejects.toMatchObject({name:'LocatedJourneyMathError',code:'E_MATH_DOCUMENT_LIMIT'});
});

it('keeps original equation bytes across BOM, CRLF and fence dedent', async () => {
  const original = '\uFEFF  journey\r\n  title $$x < y$$\r\n  😀 $$x$$: 1: α $$x$$\r\n';
  const found = await extractJourneyMath(original,undefined,'journey\ntitle $$x < y$$\n😀 $$x$$: 1: α $$x$$\n');
  for (const formula of found.records.flatMap(r => r.parts.filter(p => p.kind === 'math'))) {
    expect(formula.synthetic).toBe(false);
    for (const origin of formula.origins) expect(Buffer.from(original).subarray(origin.startByte,origin.endByte).toString()).toBe(origin.rawSource);
  }
});
