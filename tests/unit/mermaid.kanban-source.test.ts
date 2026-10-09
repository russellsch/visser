import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {expect,it} from 'vitest';
import {prepareKanbanSource} from '../../packages/core/src/mermaid/kanban-source.ts';

const options={width:200,padding:10};
it('joins grammar, YAML and sanitation into exact native state without mutating the DB',()=>{
 const output=execFileSync(process.execPath,[resolve('tests/fixtures/math/kanban-source-oracle.mjs')],{encoding:'utf8',timeout:30000});
 expect(JSON.parse(output)).toEqual({cases:21,isolated:true,recovered:true});
},40000);

it('retains authored effects independently from replayed mutable metadata and groups',async()=>{
 const source='kanban\na[First]\n  i[Original]@{base: &a ["$$x$$", *a], label: *a, assigned: *a}\na[Second]\n  j[Other]\n';
 const result=await prepareKanbanSource(source,options);
 expect(result.authored.nodes[1]!.label.text).toBe('Original');
 expect(result.snapshot.nodes[1]!.label).toEqual(['$$x$$',expect.any(Array)]);
 expect((result.snapshot.nodes[1]!.label as unknown[])[1]).toBe(result.snapshot.nodes[1]!.label);
 expect(result.groups.copies.map(copy=>[copy.nodeIndex,copy.sectionIndex])).toEqual([[0,0],[1,0],[3,0],[2,1],[1,1],[3,1]]);
 const first=result.effects[1]!;
 if(first.kind!=='node')throw new Error('node effect required');
 const metadata=first.metadata as {label:unknown[]};metadata.label.push('mutated');
 expect((result.snapshot.nodes[1]!.label as unknown[])).toHaveLength(2);
 const next=await prepareKanbanSource(source,options);expect((next.snapshot.nodes[1]!.label as unknown[])).toHaveLength(2);
});

it('rejects bounded alias expansion before producing a replay and recovers',async()=>{
 const levels=['a0: &a0 [x]'];
 for(let i=1;i<=17;i++)levels.push(`a${i}: &a${i} [*a${i-1}, *a${i-1}]`);
 const source=`kanban\ncol[Column]\n  i@{${levels.join(', ')}, label: *a17}\n`;
 await expect(prepareKanbanSource(source,options)).rejects.toMatchObject({code:'E_MATH_EXPRESSION_LIMIT'});
 expect((await prepareKanbanSource('kanban\ncol[Recovered]\n',options)).snapshot.nodes[0]!.label).toBe('Recovered');
});

it('keeps equal formulas tied to their own fields, including overridden originals and aliases',async()=>{
 const source='kanban\ncol["$$x$$"]\n  i["$$x$$"]@{base: &a "$$x$$", label: *a, assigned: "$$x$$", ticket: *a}\n  :::hot\n';
 const prepared=await prepareKanbanSource(source,options),column=prepared.nodes[0]!,card=prepared.nodes[1]!;
 const positions=[...source.matchAll(/\$\$x\$\$/g)].map(match=>match.index);
 const range=(value:typeof card.effectiveLabel)=>value.mapRange(0,value.length);
 expect(range(column.effectiveLabel)).toEqual({synthetic:false,intervals:[{start:positions[0],end:positions[0]!+5}]});
 expect(range(card.baseLabel.value)).toEqual({synthetic:false,intervals:[{start:positions[1],end:positions[1]!+5}]});
 expect(range(card.effectiveLabel)).toEqual({synthetic:false,intervals:[{start:positions[2],end:positions[2]!+5}]});
 const assigned=card.metadata!.fields.find(field=>field.name==='assigned')!.mappedValue!;
 const ticket=card.metadata!.fields.find(field=>field.name==='ticket')!.mappedValue!;
 expect(range(assigned)).toEqual({synthetic:false,intervals:[{start:positions[3],end:positions[3]!+5}]});
 expect(range(ticket)).toEqual(range(card.effectiveLabel));
 expect(prepared.decorations[0]!.owner).toBe(card.authored);
 expect(prepared.decorations[0]!.nodeIndex).toBe(1);
 expect(prepared.snapshot.nodes[1]!.cssClasses).toBe('hot');
});

it('preserves a YAML-introduced HTML override until the later native getData stage',async()=>{
 const source='kanban\ncol[Column]\n  i[Base]@{label: "\\x3cscript>hidden\\x3c/script>$$x$$"}\n';
 const prepared=await prepareKanbanSource(source,options);
 expect(prepared.nodes[1]!.baseLabel.value.text).toBe('Base');
 expect(prepared.nodes[1]!.effectiveLabel.text).toBe('<script>hidden</script>$$x$$');
 expect(prepared.snapshot.nodes[1]!.label).toBe('<script>hidden</script>$$x$$');
});

it('keeps concurrent sources, metadata, and sanitizer modes separate',async()=>{
 const sources=Array.from({length:8},(_,i)=>`kanban\ncol${i}[Column]\n  i[Base]@{label: "<br/>$$x_${i}$$"}\n`);
 const results=await Promise.all(sources.map((source,i)=>prepareKanbanSource(source,options,undefined,i%2===0)));
 for(const [i,result] of results.entries()){
  expect(result.snapshot.nodes[0]!.id).toBe(`col${i}`);
  expect(result.nodes[1]!.effectiveLabel.text).toBe(`<br/>$$x_${i}$$`);
  expect(result.nodes[1]!.baseLabel.witness.passes).toHaveLength(i%2===0?2:1);
  expect(result.nodes[1]!.effectiveLabel.source).toBe(sources[i]);
 }
});

it('validates the sanitation mode even when a diagram has no fields',async()=>{
 await expect(prepareKanbanSource('kanban\n',options,undefined,'true' as unknown as boolean)).rejects.toMatchObject({code:'E_MATH_INVALID'});
});
