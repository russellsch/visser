import { expect, it } from 'vitest';
import { clearMermaidParseCache, parseMermaid, type ParseRequest } from '../../packages/core/src/mermaid/parse.ts';
import { normalizeMermaidSource } from '../../packages/core/src/mermaid/rules.ts';
import { reserveJourneyTransportMath } from '../../packages/core/src/mermaid/journey-transport.ts';

function request(source: string, figureId='j'): ParseRequest {
  return {figureId,type:'other',journey:true,source:normalizeMermaidSource(source),originalSource:source};
}
function parse(source: string) {
  clearMermaidParseCache();
  return parseMermaid([request(source)]).get('j')!;
}

it('transports reconciled all-role journey math through the isolated native worker', () => {
  const source = '\uFEFFjourney\r\n%% ignored $$bad$$\r\ntitle $$x < y$$\r\naccTitle: $$a$$\r\naccDescr {\r\n <br/>&dollar;&dollar;d&dollar;&dollar;\r\n}\r\nsection $$s$$\r\nTask $$t$$<br/>next: 3: Actor $$p$$, Actor $$p$$\r\n';
  const result = parse(source);
  expect(result).toMatchObject({ok:true});
  if (!result.ok) return;
  const math = result.journeyMath!;
  expect(math.total.occurrences).toBe(7);
  expect(math.snapshot.tasks).toHaveLength(1);
  expect(math.snapshot.title).toBe('$$x &lt; y$$');
  expect(math.slots.map(slot => slot.role)).toEqual(['title','actor','section','task']);
  expect(math.records.find(record => record.role === 'task')!.renderedValue).toBe('Task $$t$$<br/>next');
  expect(reserveJourneyTransportMath(math)).toEqual(math.total);
  expect(JSON.stringify(math)).not.toMatch(/mappedInput|validationInput|mappedValue|parserSource/);
  for (const record of math.records) for (const part of record.parts) if (part.kind === 'math') {
    expect(part.synthetic).toBe(false);
    for (const origin of part.origins) expect(Buffer.from(source).subarray(origin.startByte,origin.endByte).toString()).toBe(origin.rawSource);
  }
});

it('preserves equal section and unusual actor identity without accumulating native tasks across figures', () => {
  clearMermaidParseCache();
  const source = 'journey\nsection $$s$$\nA: 1: __proto__, , constructor, __proto__\nsection $$s$$\nB: 2: normal\n';
  const results = parseMermaid([request(source,'first'),request('journey\nNext $$n$$: 2: fresh\n','next')]);
  const first = results.get('first')!, next = results.get('next')!;
  expect(first).toMatchObject({ok:true}); expect(next).toMatchObject({ok:true});
  if (first.ok && next.ok) {
    expect(first.journeyMath?.snapshot.tasks).toHaveLength(2);
    expect(first.journeyMath?.snapshot.actors).toEqual(['','__proto__','constructor','normal']);
    expect(first.journeyMath?.slots.filter(slot => slot.role === 'section')).toHaveLength(1);
    expect(next.journeyMath?.snapshot.tasks).toHaveLength(1);
    expect(next.journeyMath?.snapshot.actors).toEqual(['fresh']);
    expect(next.journeyMath?.snapshot.title).toBe('');
  }
});

it('recovers after syntax, located math, source reconciliation and nonfinite layout failures', () => {
  clearMermaidParseCache();
  const badMapping = request('journey\nNative: 1\n','mismatch');
  badMapping.originalSource = 'journey\nOther: 1\n';
  const results = parseMermaid([
    request('journey\nMissing score\n','syntax'),
    request('journey\ntitle $$\\badVisserCommand$$\ntitle replaced\nT: 1\n','policy'),
    badMapping,
    request('journey\nT $$x$$: nope\n','score'),
    request('journey\nNext $$n$$: 2\n','good'),
    {figureId:'other',type:'flowchart',source:'flowchart LR\nA --> B\n'},
  ]);
  expect(results.get('syntax')).toMatchObject({ok:false});
  expect(results.get('policy')).toMatchObject({ok:false,code:'E_MATH',line:2});
  expect(results.get('mismatch')).toMatchObject({ok:false,code:'E_MATH'});
  expect(results.get('score')).toMatchObject({ok:false,code:'E_MATH',error:expect.stringContaining('finite task scores')});
  expect(results.get('good')).toMatchObject({ok:true,journeyMath:{total:{occurrences:1},snapshot:{title:''}}});
  expect(results.get('other')).toMatchObject({ok:true,flowchart:{vertices:expect.any(Array)}});
  expect(parse('journey\nT: nope\n')).toMatchObject({ok:true});
});

it('separates internal activation in the cache and requires original source for effective math', () => {
  clearMermaidParseCache();
  const source = 'journey\nTask $$x$$: 1\n';
  const plain = request(source); delete plain.journey;
  const off = parseMermaid([plain]).get('j')!;
  const on = parseMermaid([request(source)]).get('j')!;
  // Without a family adapter, the legacy worker falls through to mapped
  // sequence extraction; public 'other' families are not sent down that path.
  expect(off).toMatchObject({ok:false,error:expect.stringContaining('getMessages')});
  expect(on).toMatchObject({ok:true,journeyMath:{total:{occurrences:1}}});
  const noOriginal = request('journey\naccDescr {\n<br/>&dollar;&dollar;x&dollar;&dollar;\n}\nTask: 1\n');
  delete noOriginal.originalSource;
  expect(parseMermaid([noOriginal]).get('j')).toMatchObject({ok:false,code:'E_MATH',error:expect.stringContaining('original fenced source')});
});

it('rejects mismatched adapter families and unsafe direct requests before native parsing', () => {
  clearMermaidParseCache();
  expect(parseMermaid([request('flowchart LR\nA --> B\n')]).get('j')).toMatchObject({ok:false,code:'E_MATH',error:expect.stringContaining('declared family')});
  expect(parse('journey\n%%{init: {"securityLevel":"loose"}}%%\nTask: 1\n')).toMatchObject({ok:false,code:'E_UNSAFE_CONTENT'});
});

it('rechecks JSON transport ownership, display consistency, coverage and document charges', () => {
  const result = parse('journey\ntitle $$t$$\nsection S\nTask $$x$$: 1: A\n');
  expect(result).toMatchObject({ok:true}); if (!result.ok) return;
  const math = result.journeyMath!;
  expect(() => reserveJourneyTransportMath({...math,total:{...math.total,occurrences:0}})).toThrow('total differs');
  expect(() => reserveJourneyTransportMath({...math,slots:math.slots.slice(1)})).toThrow('incomplete');
  expect(() => reserveJourneyTransportMath({...math,slots:[...math.slots,math.slots[0]!]})).toThrow('repeated visible owner');
  expect(() => reserveJourneyTransportMath({...math,records:math.records.map((record,index) => index ? record : {...record,renderedValue:'stale'})})).toThrow('parts differ');
});
