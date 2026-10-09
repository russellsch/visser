import {expect,it} from 'vitest';
import {extractKanbanMath,LocatedKanbanMathError} from '../../packages/core/src/mermaid/kanban-math.ts';
import {EMPTY_MATH_RESOURCE_TOTAL as empty,MATH_LIMITS} from '../../packages/core/src/math/policy.ts';
const options={width:200,padding:10};
const extract=(source:string,total=empty)=>extractKanbanMath(source,options,total);

it('binds all visible roles and charges native repeated draw copies rather than display entries',async()=>{
 const simple=await extract('kanban\ncol["$$c$$"]\n  i["$$x$$"]@{ticket: "$$t$$", assigned: "$$a$$"}\n');
 expect(simple.total.occurrences).toBe(4);
 expect(simple.bindings.map(binding=>binding.role)).toEqual(['section','title']);
 expect(simple.records[simple.bindings[1]!.ticketRecord!]!.parts.find(part=>part.kind==='math')!.tex).toBe('t');
 const repeated=await extract('kanban\na[First]\n  i["$$x$$"]\na[Second]\n  j["$$y$$"]\n');
 expect(repeated.prepared.groups.copies.filter(copy=>copy.kind==='item')).toHaveLength(4);
 expect(repeated.renderPlan.counts).toEqual([1,4,1,4]);expect(repeated.renderPlan.total).toBe(10);
 expect(repeated.total.occurrences).toBe(8);
});

it('validates overridden labels and distinguishes separate ID/label tokens from derived IDs',async()=>{
 const overridden=await extract('kanban\ncol[Column]\n  i["$$x$$"]@{label: "$$y$$"}\n');
 expect(overridden.total.occurrences).toBe(2);
 const binding=overridden.bindings[1]!;expect(overridden.records[binding.labelRecord]!.role).toBe('metadata.label');
 expect(overridden.records.find(record=>record.nodeIndex===1&&record.role==='label')!.renderCopies).toBe(0);
 const derived=await extract('kanban\n["$$x$$"]\n');expect(derived.total.occurrences).toBe(1);expect(derived.records.map(record=>record.role)).toEqual(['label']);
 const explicit=await extract('kanban\n$$x$$["$$x$$"]\n');expect(explicit.total.occurrences).toBe(2);expect(explicit.records.map(record=>record.role)).toEqual(['id','label']);
 await expect(extract('kanban\ncol[Column]\n  i["$$\\href{x}{y}$$"]@{label: safe}\n')).rejects.toMatchObject({code:'E_MATH_INVALID',role:'label',nodeIndex:1});
});

it('does not collapse alias-expanded occurrences while checking scalar definitions once',async()=>{
 const result=await extract('kanban\ncol[Column]\n  i[Base]@{base: &a "$$x$$", label: [*a, *a], ticket: *a}\n');
 expect(result.total.occurrences).toBe(3);
 const record=result.records.find(record=>record.role==='metadata.label')!;expect(record.math.cost.occurrences).toBe(2);
 const parts=record.parts.filter(part=>part.kind==='math');expect(parts).toHaveLength(2);expect(parts[0]!.origins).toEqual(parts[1]!.origins);
});

it('checks math suppressed by object coercion, including nested keys and cyclic mappings',async()=>{
 const source='kanban\ncol[Column]\n  i[Base]@{label:\n  hidden: "$$x$$"\n}\n';
 const result=await extract(source);expect(result.total.occurrences).toBe(1);
 const record=result.records.find(record=>record.role==='metadata.label')!;
 expect(record.math.canonical.input.text).toBe('[object Object]');expect(record.parts.some(part=>part.kind==='math')).toBe(false);
 const cyclic='kanban\ncol[Column]\n  i[Base]@{label: &a\n  self: *a\n  hidden: "$$x$$"\n}\n';
 expect((await extract(cyclic)).total.occurrences).toBe(1);
 await expect(extract(source.replace('$$x$$',()=>'$$\\\\href{x}{y}$$'))).rejects.toMatchObject({code:'E_MATH_INVALID',role:'metadata.label'});
 const key='kanban\ncol[Column]\n  i[Base]@{label:\n  "$$x$$": value\n}\n';expect((await extract(key)).total.occurrences).toBe(1);
});

it('charges hidden section metadata, priority, shape and authored decorations',async()=>{
 const source='kanban\ncol[Column]@{ticket: "$$t$$", assigned: "$$a$$", priority: ["$$p$$"], shape: "$$s$$"}\n  i[Card]\n  :::$$d$$\n';
 const result=await extract(source);expect(result.total.occurrences).toBe(5);
 expect(result.records.filter(record=>record.math.cost.occurrences).every(record=>record.renderCopies===0)).toBe(true);
 expect(result.bindings[0]!.ticketRecord).toBeUndefined();
});

it('reports exact Unicode source coordinates for equal formulas in separate fields',async()=>{
 const source='\uFEFFkanban\r\ncol[Column]\r\n  i["雪 $$x$$"]@{label: "$$x$$"}\r\n';
 const result=await extract(source),record=result.records.find(record=>record.role==='metadata.label')!;
 const part=record.parts.find(part=>part.kind==='math')!,start=source.lastIndexOf('$$x$$');
 expect(part.origins).toEqual([expect.objectContaining({sourceStart:start,sourceEnd:start+5,startByte:Buffer.byteLength(source.slice(0,start)),rawSource:'$$x$$',startLine:3})]);
});

it('checks raw scalar fragments before permitting synthesized cross-child equations',async()=>{
 await expect(extract('kanban\ncol[Column]\n  i[Base]@{label: ["$$x", "y$$"]}\n')).rejects.toThrow(/unmatched/);
 const result=await extract('kanban\ncol[Recovered]\n');expect(result.total).toEqual(empty);
});

it('applies exact aggregate limits to actual rendered multiplicity and locates failures',async()=>{
 const source='kanban\na[First]\n  i["$$x$$"]\na[Second]\n  j["$$y$$"]\n';
 expect((await extract(source,{...empty,occurrences:MATH_LIMITS.documentOccurrences-8})).total.occurrences).toBe(MATH_LIMITS.documentOccurrences);
 try{await extract(source,{...empty,occurrences:MATH_LIMITS.documentOccurrences-7});throw new Error('expected limit failure');}
 catch(error){expect(error).toBeInstanceOf(LocatedKanbanMathError);expect(error).toMatchObject({code:'E_MATH_DOCUMENT_LIMIT',role:'label',nodeIndex:3,startLine:5});}
 await expect(extract('kanban\n',{...empty,occurrences:-1})).rejects.toMatchObject({code:'E_MATH_RESOURCE'});
});

it('walks opaque alias DAGs finitely and only interprets recognized metadata fields',async()=>{
 const fields=['a0: &a0 [plain]'];
 for(let i=1;i<=40;i++)fields.push(`a${i}: &a${i} [*a${i-1}, *a${i-1}]`);
 const result=await extract(`kanban\ncol[Column]\n  i[Card]@{${fields.join(', ')}, priority: *a40}\n`);
 expect(result.total).toEqual(empty);
 const unused='kanban\ncol[Column]\n  i[Card]@{unused: "$$\\\\href{x}{y}$$"}\n';
 expect((await extract(unused)).total).toEqual(empty);
 await expect(extract(unused.replace('unused:','unused: &a').replace('}\n',', label: *a}\n'))).rejects.toMatchObject({code:'E_MATH_INVALID'});
});

it('rejects metadata equations erased by sanitation and retains metadata limit locations',async()=>{
 const source='kanban\ncol[Column]\n  i[Card]@{label: "\\x3cscript>$$\\\\href{x}{y}$$\\x3c/script>safe"}\n';
 await expect(extract(source)).rejects.toMatchObject({code:'E_MATH_INVALID',role:'metadata.label',nodeIndex:1,startLine:3});
 const hidden='kanban\ncol[Column]@{priority: "$$x$$"}\n';
 await expect(extract(hidden,{...empty,occurrences:MATH_LIMITS.documentOccurrences})).rejects.toMatchObject({code:'E_MATH_DOCUMENT_LIMIT',role:'metadata.priority',nodeIndex:0,startLine:2});
});
