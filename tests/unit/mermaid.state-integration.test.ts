import { expect, it } from 'vitest';
import { parseMermaid, clearMermaidParseCache } from '../../packages/core/src/mermaid/parse.ts';
import { normalizeMermaidSource } from '../../packages/core/src/mermaid/rules.ts';

function parse(original: string, withOriginal=true) {
  clearMermaidParseCache();
  return parseMermaid([{figureId:'figure',type:'state',source:normalizeMermaidSource(original),
    ...(withOriginal?{originalSource:original}:{})}]).get('figure')!;
}
it('transports state title/body/note/edge equations and accessibility through the production worker', () => {
  const source = 'stateDiagram-v2\r\naccTitle: <br/> &dollar;&dollar;t&dollar;&dollar;\r\naccDescr {\r\n first\r\n  $$d$$\r\n}\r\nstate "$$x < y$$" as A\r\nA: 😀 $$z$$\r\nnote right of A: $$n$$\r\nA --> B: $$e$$\r\n';
  const result=parse(source);
  expect(result).toMatchObject({ok:true});
  if (!result.ok) return;
  const math=result.stateMath!;
  expect(math.total.occurrences).toBe(6);
  expect(math.accessibility?.accTitle.value).toBe('<br> $$t$$');
  expect(math.accessibility?.accDescr.value).toBe('first\n$$d$$');
  expect(math.slots.flatMap(slot=>slot.parts.filter(part=>part.kind==='math').map(part=>part.tex)).sort()).toEqual(['e','n','x < y','z']);
  const bytes=new TextEncoder().encode(source);
  const expressions=math.slots.flatMap(slot=>slot.parts.filter(part=>part.kind==='math'));
  for(const expression of expressions) if(expression.kind==='math') {
    expect(expression.synthetic).toBe(false);
    expect(expression.origins.map(span=>new TextDecoder().decode(bytes.slice(span.startByte,span.endByte))).join('')).toBe(expression.source);
  }
  expect(JSON.stringify(math)).not.toContain('mappedInput');
  expect(math.recordCosts.reduce((n,record)=>n+record.cost.occurrences,0)).toBe(6);
});
it('finds equations introduced only by native labelHelper sentinel decoding', () => {
  const result=parse('stateDiagram\nA: <br/> ﬂ°dollar¶ßﬂ°dollar¶ßxﬂ°dollar¶ßﬂ°dollar¶ß\n');
  expect(result).toMatchObject({ok:true});
  if(result.ok) {
    expect(result.stateMath?.total.occurrences).toBe(1);
    expect(result.stateMath?.slots[0]?.parts).toEqual(expect.arrayContaining([expect.objectContaining({kind:'math',tex:'x'})]));
  }
});
it('retains overwritten explicit math and rejects it at its source location', () => {
  const result=parse('stateDiagram-v2\naccTitle: $$\\badcommand$$\naccTitle: plain\nA\n');
  expect(result).toMatchObject({ok:false,code:'E_MATH',line:2});
});
it('preserves plain undefined-shape notes but rejects math in that unrenderable diagram', () => {
  expect(parse('stateDiagram-v2\nnote right of A: plain\n')).toMatchObject({ok:true});
  expect(parse('stateDiagram-v2\nnote right of A: $$n$$\n')).toMatchObject({ok:false,code:'E_MATH',error:expect.stringContaining('no renderable shape')});
  expect(parse('stateDiagram-v2\nnote right of A: plain\nB: <br/> ﬂ°dollar¶ßﬂ°dollar¶ßxﬂ°dollar¶ßﬂ°dollar¶ß\n')).toMatchObject({ok:false,code:'E_MATH',error:expect.stringContaining('no renderable shape')});
});
it('preserves plain states, both declarations, direction statements and composite semantic input', () => {
  for(const declaration of ['stateDiagram','stateDiagram-v2']) {
    const result=parse(`${declaration}\ndirection LR\ndirection TB\nstate " " as A\nA --> B: plain\n`);
    expect(result).toMatchObject({ok:true});
    if(result.ok) expect(result.stateMath).toBeUndefined();
  }
  const composite=parse('stateDiagram-v2\nstate Group {\n A\n}\n');
  expect(composite).toMatchObject({ok:true,state:{states:expect.arrayContaining([expect.objectContaining({composite:true})])}});
});
it('requires original source for decoded math, while retaining source-less plain parsing', () => {
  expect(parse('stateDiagram-v2\nA: plain\n',false)).toMatchObject({ok:true});
  expect(parse('stateDiagram-v2\nstate "<br/> &dollar;&dollar;x&dollar;&dollar;" as A\n',false)).toMatchObject({ok:false,code:'E_MATH',error:expect.stringContaining('original fenced source')});
});
