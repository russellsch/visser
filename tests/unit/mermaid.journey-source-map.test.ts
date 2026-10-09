import { beforeAll, describe, expect, it } from 'vitest';
import { parseMermaid } from '../../packages/core/src/mermaid/parse.ts';
import { normalizeMermaidSource } from '../../packages/core/src/mermaid/rules.ts';
import { journeyMathSourceMap } from '../../packages/core/src/mermaid/journey-source-map.ts';
import { mermaidMathTotal } from '../../packages/core/src/mermaid/index.ts';
import { buildMermaidFigure } from '../../packages/core/src/mermaid/figure.ts';
import type { JourneyRenderMath } from '../../packages/core/src/mermaid/journey-transport.ts';

const encoder = new TextEncoder();
const original = '\uFEFF  journey\r\n  %% private $$hidden$$\r\n  title old $$old$$\r\n  title 雪 $$x$$\r\n  section $$s$$\r\n  雪 $$x$$: 2: $$a$$, 10, 2\r\n  section $$s$$\r\n  $$x$$: 3: $$a$$\r\n  section unused $$unused$$\r\n';
const source = normalizeMermaidSource(original);
let math: JourneyRenderMath;
beforeAll(() => {
  const result = parseMermaid([{figureId:'journey',type:'other',journey:true,source,originalSource:original}]).get('journey')!;
  if (!result.ok || !result.journeyMath) throw new Error(JSON.stringify(result));
  math = result.journeyMath;
});
const map = (journeyMath = math) => journeyMathSourceMap({source, mathBodyStartByte:0,journeyMath},encoder.encode(original));

describe('journey source ownership', () => {
  it('retains distinct authored offsets and canonical visible owners after normalization', () => {
    const result = map();
    expect(result.format).toBe('journey');
    expect(result.source).not.toContain('private');
    expect(result.labels.map(label=>label.key).sort()).toEqual(['actor:0','section:0','task:0','task:1','title']);
    const expression = (key:string) => result.labels.find(label=>label.key===key)!.expressions[0]!;
    expect(expression('title')).toMatchObject({tex:'x',rawSource:'$$x$$'});
    expect(expression('section:0')).toMatchObject({tex:'s',start:result.source.indexOf('$$s$$')});
    expect(expression('actor:0')).toMatchObject({tex:'a',start:result.source.indexOf('$$a$$')});
    const offsets = ['title','task:0','task:1'].map(key=> { const part = expression(key); return 'start' in part ? part.start : undefined; });
    expect(new Set(offsets).size).toBe(3);
    for(const label of result.labels) for(const part of label.expressions) if ('rawSource' in part) {
      expect(result.source.slice(part.start,part.end)).toBe(part.rawSource);
    }
  });
  it('passes through the model and accounts for overwritten and unused formulas', () => {
    const figure = buildMermaidFigure('journey',source,'journey','other',{ok:true,journeyMath:math} as any).figure;
    expect(figure.journeyMath).toBe(math);
    expect(mermaidMathTotal([figure])).toEqual(math.total);
    expect(math.total.occurrences).toBe(9);
  });
  it('rejects invalid transport and missing or stale original bytes', () => {
    const changed = structuredClone(math) as any;
    changed.slots[0].recordIndex = 99999;
    expect(()=>map(changed)).toThrow();
    expect(()=>journeyMathSourceMap({source,journeyMath:math},encoder.encode(original))).toThrow(/body byte offset/);
    expect(()=>journeyMathSourceMap({source,mathBodyStartByte:0,journeyMath:math},encoder.encode(original.replace('雪','changed')))).toThrow();
  });
});
