import { beforeAll, describe, expect, it } from 'vitest';
import { parseMermaid } from '../../packages/core/src/mermaid/parse.ts';
import { normalizeMermaidSource } from '../../packages/core/src/mermaid/rules.ts';
import { stateMathSourceMap } from '../../packages/core/src/mermaid/state-source-map.ts';
import type { StateRenderMath } from '../../packages/core/src/mermaid/state-transport.ts';

const encoder = new TextEncoder();
let math: StateRenderMath;
let original: string;
let shown: string;

beforeAll(() => {
  original = '\uFEFF  stateDiagram-v2\r\n  %% private $$hidden$$\r\n  state "$$x$$" as A:$$x$$\r\n  A --> B: $$e$$\r\n';
  shown = normalizeMermaidSource(original);
  const result = parseMermaid([{ figureId: 'state', type: 'state', source: shown, originalSource: original }]).get('state')!;
  if (!result.ok || !result.stateMath) throw new Error(JSON.stringify(result));
  math = result.stateMath;
});

function map(value = math, source = shown, body = original) {
  return stateMathSourceMap({ source, mathBodyStartByte: 0, stateMath: value }, encoder.encode(body));
}

describe('state transport source map', () => {
  it('maps production worker title/body/edge slots without conflating equal formulas', () => {
    const result = map();
    expect(result.format).toBe('state'); expect(result.source).not.toContain('private');
    const title = result.labels.find(label => JSON.parse(label.key)[2] === 'title')!;
    const body = result.labels.find(label => JSON.parse(label.key)[2] === 'body')!;
    expect(title.expressions[0]).toMatchObject({ tex: 'x', rawSource: '$$x$$' });
    expect(body.expressions[0]).toMatchObject({ tex: 'x', rawSource: '$$x$$' });
    expect((title.expressions[0] as { start: number }).start).toBeLessThan((body.expressions[0] as { start: number }).start);
    for (const label of result.labels) for (const expression of label.expressions) if ('rawSource' in expression) {
      expect(result.source.slice(expression.start, expression.end)).toBe(expression.rawSource);
    }
  });

  it('keeps sentinel-decoded provenance encoded at its authored source span', () => {
    const raw = 'stateDiagram-v2\nA: <br/> ﬂ°dollar¶ßﬂ°dollar¶ßxﬂ°dollar¶ßﬂ°dollar¶ß\n';
    const result = parseMermaid([{figureId:'sentinel',type:'state',source:raw,originalSource:raw}]).get('sentinel')!;
    if (!result.ok || !result.stateMath) throw new Error(JSON.stringify(result));
    const mapped = stateMathSourceMap({source:raw,mathBodyStartByte:0,stateMath:result.stateMath},encoder.encode(raw));
    expect(mapped.labels.flatMap(label=>label.expressions)).toEqual(expect.arrayContaining([expect.objectContaining({tex:'x',encoded:true})]));
  });

  it('rejects tampered slot owners, parts, and missing original body bytes', () => {
    const owner: any = structuredClone(math); owner.slots[0]!.ownerId = 'other';
    expect(() => map(owner)).toThrow();
    const parts: any = structuredClone(math); parts.slots.find((slot: any) => slot.parts.some((part: any) => part.kind === 'math'))!.parts[0]!.source = 'tampered';
    expect(() => map(parts)).toThrow();
    expect(() => stateMathSourceMap({source:shown,stateMath:math},encoder.encode(original))).toThrow(/body byte offset/);
  });
});
