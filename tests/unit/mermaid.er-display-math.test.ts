import {expect,it} from 'vitest';
import {extractERLabels,type ERLabelRole,type ERLabels} from '../../packages/core/src/mermaid/er-labels.ts';
import {normalizeERDbEffects} from '../../packages/core/src/mermaid/er-db-effects.ts';
import {replayERDb} from '../../packages/core/src/mermaid/er-db.ts';
import {projectEROwners} from '../../packages/core/src/mermaid/er-owners.ts';
import {prepareERDisplayMath} from '../../packages/core/src/mermaid/er-display-math.ts';

async function prepare(source:string){
 const labels=await extractERLabels(source),normalized=await normalizeERDbEffects(labels,true);
 const owners=projectEROwners(labels,normalized,replayERDb(normalized.effects,{look:'default'}));
 return {labels,owners,math:await prepareERDisplayMath(source,labels,normalized,owners,true)};
}
function at(labels:ERLabels,role:ERLabelRole,source:string,needle:string,from=0){
 const start=source.indexOf(needle,from),matches=labels.records.filter(record=>record.role===role&&record.intervals[0]?.sourceStart===start);
 expect(start).toBeGreaterThanOrEqual(0);expect(matches).toHaveLength(1);return matches[0]!.recordIndex;
}

it('uses the first accepted alias while validating ignored aliases and table/edge owners',async()=>{
 const source='erDiagram\nA["$$head$$"] {\n string field "$$comment$$"\n}\nA["$$ignored$$"]\nA ||--o{ B : "$$role$$"\n';
 const {labels,owners,math}=await prepare(source);
 const head=at(labels,'entity.alias',source,'$$head$$'),ignored=at(labels,'entity.alias',source,'$$ignored$$');
 const type=at(labels,'attribute.type',source,'string'),name=at(labels,'attribute.name',source,'field');
 const comment=at(labels,'attribute.comment',source,'$$comment$$'),role=at(labels,'relationship.role',source,'$$role$$');
 expect(math.total.occurrences).toBe(4);
 expect(owners.entities[0]!.header).toEqual({kind:'record',recordIndex:head});
 expect(math.bindings).toContainEqual({ownerKind:'entity-header',ownerIndex:0,recordIndex:head,path:'table'});
 expect(math.bindings.map(binding=>binding.recordIndex)).not.toContain(ignored);
 expect(math.bindings).toEqual(expect.arrayContaining([
  {ownerKind:'attribute',ownerIndex:0,rowIndex:0,field:'type',recordIndex:type,path:'table'},
  {ownerKind:'attribute',ownerIndex:0,rowIndex:0,field:'name',recordIndex:name,path:'table'},
  {ownerKind:'attribute',ownerIndex:0,rowIndex:0,field:'comment',recordIndex:comment,path:'table'},
  {ownerKind:'relationship',ownerIndex:0,recordIndex:role,path:'edge'},
 ]));
});

it('skips a same-key grouped entity display but still validates its authored alias',async()=>{
 const source='erDiagram\nA["$$hidden$$"]\nsubgraph A["$$group$$"]\n A\nend\n';
 const {labels,owners,math}=await prepare(source),hidden=at(labels,'entity.alias',source,'$$hidden$$'),group=at(labels,'subgraph.title',source,'$$group$$');
 expect(owners.entities[0]!.suppressedByGroup).toBe(true);expect(math.total.occurrences).toBe(2);
 expect(math.bindings.map(binding=>binding.recordIndex)).not.toContain(hidden);
 expect(math.bindings.filter(binding=>binding.recordIndex===group).map(binding=>binding.path).sort()).toEqual(['group-cluster','group-node']);
});

it('charges one implicit group header and two explicit equal header fields',async()=>{
 const implicit=await prepare('erDiagram\nsubgraph "$$same$$"\n A\nend\n');
 const explicit=await prepare('erDiagram\nsubgraph "$$same$$"["$$same$$"]\n A\nend\n');
 expect(implicit.math.total.occurrences).toBe(1);expect(explicit.math.total.occurrences).toBe(2);
 expect(implicit.math.bindings.filter(binding=>binding.ownerKind==='group')).toHaveLength(2);
 expect(explicit.math.bindings.filter(binding=>binding.ownerKind==='group')).toHaveLength(2);
});
