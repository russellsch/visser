import { expect,it } from 'vitest';
import { sequenceMathSourceMap } from '../../packages/core/src/mermaid/sequence-source-map.ts';
import { parseMermaid } from '../../packages/core/src/mermaid/parse.ts';

async function fixture(original:string,source=original) {
  const result=parseMermaid([{figureId:'sequence',type:'sequence',source,originalSource:original}]).get('sequence')!;
  if(!result.ok||!result.sequenceMath)throw new Error(JSON.stringify(result));
  const prefix='Document 😀\n';
  const raw=new TextEncoder().encode(prefix+original);
  const figure={source,mathBodyStartByte:new TextEncoder().encode(prefix).length,sequenceMath:result.sequenceMath};
  return {raw,figure};
}
it('maps mirrored aliases and repeated formula text through original BOM/CRLF/dedent bytes',async()=> {
  const original='\uFEFF  sequenceDiagram\r\n  %% $$hidden$$\r\n  participant A as 😀 $$x$$\r\n  A->>A: $$x$$\r\n';
  const source='sequenceDiagram\n%% $$hidden$$\nparticipant A as 😀 $$x$$\nA->>A: $$x$$\n';
  const {figure,raw}=await fixture(original,source);
  const map=sequenceMathSourceMap(figure,raw);
  expect(map.format).toBe('sequence');expect(map.source).not.toContain('hidden');
  expect(map.labels.map(l=>l.key)).toEqual(['actor:A:header','message:0','actor:A:footer']);
  const first=map.labels.find(label=>label.key==='actor:A:header')!.expressions[0]!;
  const footer=map.labels.find(label=>label.key==='actor:A:footer')!.expressions[0]!;
  const last=map.labels.find(label=>label.key==='message:0')!.expressions[0]!;
  expect(first).toEqual(footer);
  expect(first).toMatchObject({tex:'x',rawSource:'$$x$$'});
  expect('start' in first&&'start' in last&&first.start!<last.start!).toBe(true);
});
it('preserves encoded YAML spelling and rejects added box copies',async()=> {
  const source=String.raw`sequenceDiagram
box Group $$g$$
participant A@{alias: "\u0024\u0024x\u0024\u0024"}
end
`;
  const {figure,raw}=await fixture(source);
  const box=figure.sequenceMath.copies.find(c=>c.slotKey==='box:0')!;
  (figure.sequenceMath as any).copies.push({...box,key:'box:0:run:1'});
  expect(()=>sequenceMathSourceMap(figure,raw)).toThrow(/authenticated source ownership/);
});
it('marks disjoint folded YAML formula origins unrepresentable',async()=> {
  const {figure,raw}=await fixture('sequenceDiagram\nparticipant A@{\n alias: >-\n   $$x\n   + y$$\n}\n');
  const map=sequenceMathSourceMap(figure,raw);
  expect(map.labels[0]!.expressions).toEqual([{tex:'x + y',unrepresentable:true}]);
});
it('binds only math-bearing copies while still validating plain owners',async()=> {
  const {figure,raw}=await fixture('sequenceDiagram\ntitle Plain title\nbox Plain box\nparticipant A as Alice\nend\nparticipant B as Bob\nA->>B: plain\nB->>A: $$x$$\n');
  expect(sequenceMathSourceMap(figure,raw).labels.map(label=>label.key)).toEqual(['message:1']);
  (figure.sequenceMath as any).copies=figure.sequenceMath.copies.filter(copy=>copy.slotKey!=='actor:A');
  expect(()=>sequenceMathSourceMap(figure,raw)).toThrow(/authenticated source ownership/);
});
it('allows only explicitly hidden owners to lack copies',async()=> {
  const {figure,raw}=await fixture('sequenceDiagram\nparticipant A as $$x$$\n');
  (figure.sequenceMath as any).copies=[];
  expect(()=>sequenceMathSourceMap(figure,raw)).toThrow(/authenticated source ownership/);
  (figure.sequenceMath as any).hiddenKeys=['actor:A'];
  expect(()=>sequenceMathSourceMap(figure,raw)).toThrow(/authenticated source ownership/);
});
it('rejects stale bytes, wrong owner indices, duplicate copies and malformed copy keys',async()=> {
  const source='sequenceDiagram\nA->>A: $$x$$\n';
  for(const mutate of [
    (f:Awaited<ReturnType<typeof fixture>>)=>{f.raw[f.raw.length-3]=122;},
    (f:Awaited<ReturnType<typeof fixture>>)=>{(f.figure.sequenceMath as any).copies[0].recordIndex=999;},
    (f:Awaited<ReturnType<typeof fixture>>)=>{(f.figure.sequenceMath as any).copies.push(f.figure.sequenceMath.copies[0]!);},
    (f:Awaited<ReturnType<typeof fixture>>)=>{(f.figure.sequenceMath as any).copies[0].key='actor:wrong:header';},
  ]) {const f=await fixture(source);mutate(f);expect(()=>sequenceMathSourceMap(f.figure,f.raw)).toThrow();}
});
