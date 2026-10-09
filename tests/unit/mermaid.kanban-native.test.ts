import { beforeAll, afterAll, expect, it } from 'vitest';
import DOMPurify from 'dompurify';
// @ts-expect-error test-only jsdom package has no declarations.
import { JSDOM } from 'jsdom';

const descriptors: Record<string, PropertyDescriptor | undefined> = {};
let mermaid: typeof import('mermaid')['default'];
beforeAll(async()=>{
 for(const key of ['sanitize','addHook'])descriptors[key]=Object.getOwnPropertyDescriptor(DOMPurify,key);
 const instance=DOMPurify(new JSDOM('').window as any);Object.assign(DOMPurify,{sanitize:instance.sanitize,addHook:instance.addHook});
 mermaid=(await import('mermaid')).default;mermaid.initialize({startOnLoad:false,securityLevel:'strict'});
});
afterAll(()=>{for(const key of ['sanitize','addHook'])if(descriptors[key])Object.defineProperty(DOMPurify,key,descriptors[key]!);else Reflect.deleteProperty(DOMPurify,key);});
async function nodes(source:string):Promise<any[]> {const diagram=await mermaid.mermaidAPI.getDiagramFromText(source);return structuredClone((diagram.db as any).getData().nodes);}

it('repeats every matching child under each duplicate section ID',async()=>{
 const result=await nodes('kanban\na[First]\n  c[Card1]\na[Second]\n  d[Card2]\n');
 expect(result.map(n=>[n.id,n.parentId,n.label])).toEqual([
 ['a',undefined,'First'],['c','a','Card1'],['d','a','Card2'],['a',undefined,'Second'],['c','a','Card1'],['d','a','Card2'],
 ]);
});
it('uses native string coercion for typed metadata and retains hidden metadata separately',async()=>{
 const result=await nodes('kanban\ncol[Column]@{ticket: "$$section-hidden$$"}\n  i[Original]@{label: ["first", "second"], assigned: ["A", "B"], ticket: 42, priority: "$$hidden$$", icon: "$$icon$$"}\n');
 expect(result[0]).toMatchObject({label:'Column',ticket:'$$section-hidden$$'});
 expect(result[1]).toMatchObject({label:'first,second',assigned:'A,B',ticket:'42',priority:'$$hidden$$',icon:'$$icon$$'});
});
it('keeps the parsed label when YAML overrides are falsy and drops decorated classes from display data',async()=>{
 const result=await nodes('kanban\ncol[Column]\n  a[First]@{label: false, assigned: 0, ticket: "", priority: null}\n  :::hot\n  b[Second]@{label: 0}\n');
 expect(result.map(n=>n.label)).toEqual(['Column','First','Second']);
 expect(result[1].assigned).toBeUndefined();expect(result[1].ticket).toBeUndefined();expect(result[1].priority).toBeUndefined();expect(result[1].cssClasses).toBeUndefined();
});
it('admits the first lower indentation as a child but rejects the next addition',async()=>{
 expect((await nodes('kanban\n  col[Column]\ni[Lower]\n')).map(n=>[n.id,n.level,n.parentId])).toEqual([['col',2,undefined],['i',0,'col']]);
 await expect(nodes('kanban\n  col[Column]\ni[Lower]\nj[Next]\n')).rejects.toThrow(/Items without section/);
});
it('rejects camelcase shape metadata before the unreachable kanbanItem override',async()=>{
 await expect(nodes('kanban\ncol[Column]\n  i[Item]@{shape: kanbanItem}\n')).rejects.toThrow(/Shape names should be lowercase/);
 expect((await nodes('kanban\ncol[Column]\n  i[Item]@{shape: kanbanitem}\n'))[1].shape).toBe('kanbanItem');
});

it('matches decoded Kanban metadata coercion against native DB text for typed and cyclic values',async()=>{
 const {extractKanbanLabels}=await import('../../packages/core/src/mermaid/kanban-labels.ts');
 const {decodeKanbanMetadata}=await import('../../packages/core/src/mermaid/kanban-metadata.ts');
 const fixtures=[
  'label: ["$$x$$", ["$$y$$", null, true]], assigned: [A, B], ticket: 42',
  'base: &a ["$$x$$", *a, "$$y$$"], label: *a, assigned: *a, ticket: *a',
  'label:\n  plain: value\nassigned:\n  plain: value\nticket:\n  plain: value\n',
  'label:\n - a\n -\n - b\nassigned: [A, B]\n',
 ];
 for(const raw of fixtures){
  const source=`kanban\ncol[Column]\n  item[Original]@{${raw}}\n`,collected=await extractKanbanLabels(source),decoded=decodeKanbanMetadata(collected.nodes[1]!.shapeData!),actual=(await nodes(source))[1];
  for(const current of decoded.fields.filter(f=>['label','assigned','ticket'].includes(f.name)))expect(actual[current.name]).toBe(current.mappedValue!.text);
 }
});
