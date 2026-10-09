import { beforeAll, expect, it } from 'vitest';
import { prepareSequenceSanitizer } from '../../packages/core/src/mermaid/sequence-sanitize.ts';
import { applySequenceProperties, parseSequenceProperties } from '../../packages/core/src/mermaid/sequence-properties.ts';
import { extractSequenceMath } from '../../packages/core/src/mermaid/sequence-math.ts';
import { sequencePropertiesIdentity } from '../../packages/core/src/mermaid/sequence-db.ts';
import { clearMermaidParseCache, parseMermaid } from '../../packages/core/src/mermaid/parse.ts';

beforeAll(prepareSequenceSanitizer);

it('preserves JSON machine data, duplicate precedence and native merge/no-op behavior', () => {
  const actor: {properties?: unknown} = {};
  for (const text of ['{"x":1,"x":2,"class":"custom","nested":{"icon":"inert"}}', '{invalid}',
    '{"x":3,"constructor":"inert","prototype":"inert","equation":"$$\\\\bad$$"}']) {
    applySequenceProperties(actor, parseSequenceProperties(text));
  }
  expect(actor.properties).toEqual({x:3,class:'custom',nested:{icon:'inert'},constructor:'inert',prototype:'inert',equation:'$$\\bad$$'});
  for (const first of ['null','false','42','"abc"','[1,2]']) {
    const actual: {properties?:unknown} = {};
    applySequenceProperties(actual, parseSequenceProperties(first));
    applySequenceProperties(actual, parseSequenceProperties('{"x":1}'));
    const expected: {properties?:unknown} = {properties:JSON.parse(first)};
    try { if(expected.properties==null) expected.properties={x:1}; else (expected.properties as any).x=1; } catch {}
    expect(actual).toEqual(expected);
  }
});

it('checks effective decoded root keys after sanitization and before any later overwrite', () => {
  for (const text of [String.raw`{"\u0069con":"https://example.test/i.svg"}`, '{"icon":false}',
    '{"note":"<br>&quot;, &quot;icon&quot;:&quot;@anything&quot;, &quot;x&quot;:&quot;"}',
    String.raw`{"__pro\u0074o__":{"icon":"hidden"}}`]) {
    expect(()=>parseSequenceProperties(text)).toThrow(/not allowed/);
  }
  expect(parseSequenceProperties('{"icon":')).toEqual({ok:false});
  expect(parseSequenceProperties('{"x":"<br>&quot;"}')).toEqual({ok:false});
});

it('keeps non-label dollars out of math records and retains effective property identity', async () => {
  const source=String.raw`sequenceDiagram
participant A as $$x$$
properties A: {"extra":"$$\u005cbad$$","class":"custom","value":1}
properties A: {"value":2}
`;
  const result=await extractSequenceMath(source);
  expect(result.total.occurrences).toBe(1);
  expect(result.records.every(record=>record.role==='actor')).toBe(true);
  expect(result.records.find(record=>record.active)!.actorIdentity!.propertiesIdentity).toBe(sequencePropertiesIdentity({extra:'$$\\bad$$',class:'custom',value:2}));
});

it('locates unsafe escaped keys and excludes external details before native DOM access', () => {
  for (const [statement,expected] of [
    [String.raw`properties A: {"nested":{"icon":0},"\u0069con":"@x"}`,String.raw`\u0069con`],
    ['details A: external','external'],
  ]) {
    const original=`sequenceDiagram\r\nparticipant A as Café\r\n${statement}\r\n`;
    clearMermaidParseCache();
    const result=parseMermaid([{figureId:'test',type:'sequence',source:original.replaceAll('\r\n','\n'),originalSource:original}]).get('test')!;
    expect(result).toMatchObject({ok:false,code:'E_UNSAFE_CONTENT',line:3});
    if(!result.ok && 'startByte' in result) {
      expect(new TextDecoder().decode(new TextEncoder().encode(original).slice(result.startByte,result.endByte))).toBe(expected);
      expect(result.error).not.toContain('document is not defined');
    }
  }
});

it('distinguishes overflow numbers, null and named array properties in DB identity', () => {
  expect(sequencePropertiesIdentity(JSON.parse('{"class":1e400}'))).not.toBe(sequencePropertiesIdentity({class:null}));
  const array: any[] & {class?:string} = [1,2];
  const before = sequencePropertiesIdentity(array);
  array.class='custom';
  expect(sequencePropertiesIdentity(array)).not.toBe(before);
  let nested: unknown = 1;
  for(let i=0;i<12000;i++)nested={child:nested};
  expect(sequencePropertiesIdentity(nested)).toContain('n:1');
});
