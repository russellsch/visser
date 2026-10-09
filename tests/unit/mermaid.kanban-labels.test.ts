import { beforeAll, afterAll, expect, it } from 'vitest';
import DOMPurify from 'dompurify';
// @ts-expect-error test-only jsdom package has no declarations.
import { JSDOM } from 'jsdom';
import { extractKanbanLabels } from '../../packages/core/src/mermaid/kanban-labels.ts';
import { MermaidSourceCoordinates } from '../../packages/core/src/mermaid/source-coordinates.ts';

const descriptors: Record<string, PropertyDescriptor | undefined> = {};
beforeAll(() => {
 for (const key of ['sanitize', 'addHook']) descriptors[key] = Object.getOwnPropertyDescriptor(DOMPurify, key);
 const instance = DOMPurify(new JSDOM('').window as any);
 Object.assign(DOMPurify, {sanitize:instance.sanitize,addHook:instance.addHook});
});
afterAll(() => {
 for (const key of ['sanitize', 'addHook']) if (descriptors[key]) Object.defineProperty(DOMPurify, key, descriptors[key]!); else Reflect.deleteProperty(DOMPurify, key);
});

async function nativeModule() {
 // @ts-expect-error pinned native chunk has no declarations.
 return import('mermaid/dist/chunks/mermaid.core/kanban-definition-PNTS6WVX.mjs');
}
async function nativeEffects(source: string): Promise<unknown[][]> {
 const {diagram} = await nativeModule(), pinned = diagram.parser.parser;
 const parser = new pinned.Parser();parser.lexer = Object.create(pinned.lexer);
 const effects: unknown[][] = [];
 parser.yy = {getLogger:()=>({trace(){},info(){}}),getType:diagram.db.getType,
  addNode:(...args:unknown[])=>effects.push(['node',...args]),decorateNode:(...args:unknown[])=>effects.push(['decoration',...args])};
 parser.parse(source);return effects;
}
function collectedEffects(found: Awaited<ReturnType<typeof extractKanbanLabels>>): unknown[][] {
 return found.effects.map(effect => {
  if(effect.kind === 'node') {const n=found.nodes[effect.nodeIndex]!;return ['node',n.level,n.id.text,n.label.text,n.type,...(n.shapeData === undefined?[]:[n.shapeData.text])];}
  const d=found.decorations[effect.decorationIndex]!;return ['decoration',{[d.kind]:d.value.text}];
 });
}

it('retains ordered native callbacks for every node syntax, duplicate IDs and decorators', async () => {
 const source='kanban\ncol[Column]\n  bare\n  card["Quoted $$x$$"]@{label: "$$override$$", assigned: "$$person$$"}\n  ::icon(fa fa-user)\n  :::hot\n  card["`Markdown $$x$$`"]\n  (rounded)\n  ((circle))\n  {{hexagon}}\n  )cloud(\n  ))bang((\n';
 const found=await extractKanbanLabels(source);
 expect(found.nodes.map(n=>[n.nodeIndex,n.level,n.id.text,n.label.text,n.type])).toEqual([
  [0,0,'col','Column',2],[1,2,'bare','bare',0],[2,2,'card','Quoted $$x$$',2],[3,2,'card','Markdown $$x$$',2],
  [4,2,'rounded','rounded',1],[5,2,'circle','circle',3],[6,2,'hexagon','hexagon',6],[7,2,'cloud','cloud',4],[8,2,'bang','bang',5],
 ]);
 expect(found.decorations.map(d=>[d.nodeIndex,d.kind,d.value.text])).toEqual([[2,'icon','fa fa-user'],[2,'class','hot']]);
 expect(collectedEffects(found)).toEqual(await nativeEffects(found.parserSource));
 expect(found.nodes[2]!.shapeData!.text).toBe('label: "$$override$$", assigned: "$$person$$"');
});

it('maps exact original Unicode bytes through BOM, CRLF, permitted dedent and comment removal', async () => {
 const original='\uFEFF  kanban\r\n  %% hidden $$comment$$\r\n  col[Column]\r\n    card["雪 $$x$$"]\r\n    :::hot\r\n';
 const shown='kanban\n%% hidden $$comment$$\ncol[Column]\n  card["雪 $$x$$"]\n  :::hot\n';
 const found=await extractKanbanLabels(original,shown),value=found.nodes[1]!.label;
 expect(found.parserSource).not.toContain('comment');expect(found.parserSource).not.toContain('\r');expect(value.text).toBe('雪 $$x$$');
 const located=new MermaidSourceCoordinates(original).locateRange(value,0,value.length);
 expect(located.synthetic).toBe(false);expect(located.intervals).toHaveLength(1);
 const interval=located.intervals[0]!,start=original.indexOf('雪');
 expect(interval).toMatchObject({sourceStart:start,sourceEnd:start+value.length,startByte:Buffer.byteLength(original.slice(0,start)),endByte:Buffer.byteLength(original.slice(0,start+value.length)),rawSource:value.text,startLine:4});
 expect(collectedEffects(found)).toEqual(await nativeEffects(found.parserSource));
});

it('preserves lexer-owned metadata composition and inserted break provenance without decoding YAML', async () => {
 const source='kanban\ncol[Column]\n  item@{label: "first\n    $$x$$", assigned: "$$a$$", ticket: "$$t$$"}\n';
 const found=await extractKanbanLabels(source),metadata=found.nodes[1]!.shapeData!;
 expect(metadata.text).toBe('label: "first<br/>$$x$$", assigned: "$$a$$", ticket: "$$t$$"');
 const at=metadata.text.indexOf('$$x$$'),range=new MermaidSourceCoordinates(source).locateRange(metadata,at,at+5);
 expect(range.intervals).toHaveLength(1);expect(range.intervals[0]).toMatchObject({sourceStart:source.indexOf('$$x$$'),rawSource:'$$x$$'});
 expect(collectedEffects(found)).toEqual(await nativeEffects(found.parserSource));
});

it('retains hidden metadata and YAML alias spelling for the later typed decoder',async()=>{
 const source='kanban\ncol[Column]@{ticket: "$$hidden$$"}\n  i@{base: &name "$$x$$", label: *name, priority: "$$ignored$$"}\n';
 const found=await extractKanbanLabels(source);
 expect(found.nodes[0]!.shapeData!.text).toContain('$$hidden$$');
 expect(found.nodes[1]!.label.text).toBe('i');expect(found.nodes[1]!.shapeData!.text).toContain('label: *name');
 expect(collectedEffects(found)).toEqual(await nativeEffects(found.parserSource));
});

it('does not clear or mutate the shared native Kanban DB',async()=>{
 const {diagram}=await nativeModule();diagram.db.clear();diagram.parser.yy=diagram.db;
 diagram.parser.parse('kanban\nexisting[Existing]\n  card[Card]\n');
 const before=structuredClone({nodes:diagram.db.getData().nodes,sections:diagram.db.getSections()});
 await extractKanbanLabels('kanban\nnew[New]\n  changed[Changed]\n');
 expect({nodes:diagram.db.getData().nodes,sections:diagram.db.getSections()}).toEqual(before);diagram.db.clear();
});

it('rejects invalid grammar and unattached decorations, then parses a fresh source cleanly',async()=>{
 await expect(extractKanbanLabels('kanban\ncol[unterminated\n')).rejects.toThrow();
 await expect(extractKanbanLabels('kanban\n::icon(fa fa-user)\n')).rejects.toThrow();
 const next=await extractKanbanLabels('kanban\ncol[Recovered]\n');
 expect(next.nodes).toHaveLength(1);expect(next.nodes[0]!.nodeIndex).toBe(0);expect(next.decorations).toEqual([]);
});

it('composes many lexer metadata pieces without dropping or reassigning repeated formulas',async()=>{
 const metadata=Array.from({length:120},(_,i)=>`v${i}: "$$x$$"`).join(', '),source=`kanban\ncol[Column]\n  item@{${metadata}}\n`;
 const found=await extractKanbanLabels(source),mapped=found.nodes[1]!.shapeData!;
 expect(mapped.text).toBe(metadata);expect(collectedEffects(found)).toEqual(await nativeEffects(found.parserSource));
 const coordinates=new MermaidSourceCoordinates(source),spans=[...mapped.text.matchAll(/\$\$x\$\$/g)].map(match=>coordinates.locateRange(mapped,match.index!,match.index!+5).intervals[0]!);
 expect(new Set(spans.map(span=>span.startByte)).size).toBe(120);for(const span of spans)expect(Buffer.from(source).subarray(span.startByte,span.endByte).toString()).toBe('$$x$$');
});


it('preserves the existing unsafe icon-metadata rejection before collection',async()=>{
 await expect(extractKanbanLabels('kanban\ncol[Column]\n  i@{icon: "fa:user"}\n')).rejects.toThrow(/icon/i);
});

it('keeps identical formulas attached to distinct quoted fields and preserves literal TeX slashes',async()=>{
 const source=String.raw`kanban
col[Column]
  a["$$x$$"]
  b["$$x$$"]
  c["$$\begin{matrix}a\\b\end{matrix}$$"]
`;
 const found=await extractKanbanLabels(source),coordinates=new MermaidSourceCoordinates(source);
 const origins=found.nodes.slice(1,3).map(n=>coordinates.locateRange(n.label,0,n.label.length).intervals[0]!);
 expect(origins[0]!.rawSource).toBe('$$x$$');expect(origins[1]!.rawSource).toBe('$$x$$');expect(origins[0]!.startByte).toBeLessThan(origins[1]!.startByte);
 expect(found.nodes[3]!.label.text).toBe(String.raw`$$\begin{matrix}a\\b\end{matrix}$$`);
 expect(collectedEffects(found)).toEqual(await nativeEffects(found.parserSource));
});
