import {expect,it} from 'vitest';
import {extractERLabels,type ERLabels,type ERLabelRole} from '../../packages/core/src/mermaid/er-labels.ts';
import {normalizeERDbEffects} from '../../packages/core/src/mermaid/er-db-effects.ts';
import {replayERDb} from '../../packages/core/src/mermaid/er-db.ts';
import {projectEROwners,type ERFieldOwner} from '../../packages/core/src/mermaid/er-owners.ts';
async function project(source:string){const labels=await extractERLabels(source),normalized=await normalizeERDbEffects(labels,true),snapshot=replayERDb(normalized.effects,{look:'default'});return {labels,normalized,snapshot,owners:projectEROwners(labels,normalized,snapshot)};}
function at(labels:ERLabels,role:ERLabelRole,offset:number){const candidates=labels.records.filter(r=>r.role===role&&r.intervals[0]?.sourceStart===offset);expect(candidates).toHaveLength(1);return candidates[0]!.recordIndex;}
const record=(recordIndex:number):ERFieldOwner=>({kind:'record',recordIndex});
it('keeps first creation and accepted aliases, including whitespace aliases and ignored later aliases',async()=>{
 const source='erDiagram\nA ||--o{ B : first\nA["chosen"]\nA[ignored]\nB["   "]\nB[later]\nA ||--o{ B : second\n';
 const {labels,owners}=await project(source),[a,b]=owners.entities;
 expect(a!.nameRecord).toBe(at(labels,'entity.name',source.indexOf('A ||')));
 expect(a!.header).toEqual(record(at(labels,'entity.alias',source.indexOf('chosen'))));
 expect(b!.header).toEqual(record(at(labels,'entity.alias',source.indexOf('   '))));
 expect(a!.headerPath).toBe('simple');expect(b!.headerPath).toBe('simple');
 expect(owners.records).toBe(labels.records);
 expect(labels.records.filter(r=>r.role==='entity.alias').map(r=>r.semanticValue)).toEqual(['chosen','ignored','   ','later']);
 expect(owners.relationships[0]!.endpointRecords).toEqual([at(labels,'entity.name',source.indexOf('A ||')),at(labels,'entity.name',source.indexOf('B : first'))]);
 expect(owners.relationships[1]!.endpointRecords).toEqual([at(labels,'entity.name',source.lastIndexOf('A ||')),at(labels,'entity.name',source.indexOf('B : second'))]);
});
it('owns repeated attribute blocks in stored order, distinguishing empty and absent comments and equal text',async()=>{
 const source='erDiagram\nA {\n string one FK, PK ""\n int two "same"\n}\nA {\n bool three "same"\n uuid four\n}\n';
 const {labels,owners}=await project(source),rows=owners.entities[0]!.rows;
 expect(rows.map(row=>row.name)).toEqual(['one','two','three','four'].map(text=>record(at(labels,'attribute.name',source.indexOf(text)))));
 expect(rows.map(row=>row.argumentRowIndex)).toEqual([1,0,1,0]);
 expect(rows.map(row=>row.rowIndex)).toEqual([0,1,2,3]);
 expect(rows[0]!.keys).toEqual({kind:'joinedKeys',recordIndices:[at(labels,'attribute.key',source.indexOf('FK')),at(labels,'attribute.key',source.indexOf('PK'))]});
 expect(rows[0]!.comment.kind).toBe('record');
 if(rows[0]!.comment.kind!=='record')throw new Error('expected authored empty comment');
 expect(labels.records[rows[0]!.comment.recordIndex]!.semanticValue).toBe('');
 expect(rows[3]!.comment).toEqual({kind:'empty'});expect(rows[3]!.keys).toEqual({kind:'empty'});
 expect(rows[1]!.comment).toEqual(record(at(labels,'attribute.comment',source.indexOf('same'))));
 expect(rows[2]!.comment).toEqual(record(at(labels,'attribute.comment',source.lastIndexOf('same'))));
 expect(owners.entities[0]!.headerPath).toBe('table');expect(owners.records).toBe(labels.records);
});
it('distinguishes membership from same-key suppression, retaining duplicate and empty groups and timed endpoints',async()=>{
 const source='erDiagram\ng[Alias] {\n string hidden "hidden"\n}\ng ||--o{ X : before\nsubgraph g[First]\n A\n subgraph inner[Inner]\n  B\n end\nend\nsubgraph g[Second]\n direction LR\nend\ng ||--o{ A : after\n';
 const {labels,owners}=await project(source),g=owners.entities.find(e=>e.entityKey==='g')!,a=owners.entities.find(e=>e.entityKey==='A')!;
 expect(g.suppressedByGroup).toBe(true);expect(g.rows).toHaveLength(1);expect(g.aliasRecord).toBeDefined();
 expect(a.suppressedByGroup).toBe(false);
 expect(owners.groups.map(group=>group.titleRecord)).toEqual(['Inner','First','Second'].map(text=>at(labels,'subgraph.title',source.indexOf(text))));
 expect(owners.displayGroupOrder).toEqual([2,1,0]);
 expect(owners.displayEntityOrder).toEqual(owners.entities.filter(e=>e.entityKey!=='g').map(e=>e.entityIndex));
 expect(owners.relationships[0]!.entityA).toBe('entity-g-0');expect(owners.relationships[1]!.entityA).toBe('g');
 expect(owners.relationships[0]!.roleRecord).toBe(at(labels,'relationship.role',source.indexOf('before')));
 expect(owners.relationships[1]!.roleRecord).toBe(at(labels,'relationship.role',source.indexOf('after')));
 expect(owners.records).toBe(labels.records);
});
it('rejects missing, wrong-role and leftover attribute owners without destroying provenance in the fixture',async()=>{
 const {labels,normalized,snapshot}=await project('erDiagram\nA {\n string name PK\n}\n');
 for(const mutate of [(refs:number[])=>refs.pop(),(refs:number[])=>{refs[1]=refs[2]!;},(refs:number[])=>refs.push(refs[0]!)]) {
  const bad={...labels,effects:structuredClone(labels.effects)} as any;
  mutate(bad.effects.find((effect:any)=>effect.method==='addAttributes').recordIndices);
  expect(()=>projectEROwners(bad,normalized,snapshot)).toThrow(/ER ownership/);
 }
});
