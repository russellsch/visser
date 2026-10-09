import {expect,it} from 'vitest';
import {extractERLabels} from '../../packages/core/src/mermaid/er-labels.ts';
import {normalizeERDbEffects} from '../../packages/core/src/mermaid/er-db-effects.ts';
import {replayERDb} from '../../packages/core/src/mermaid/er-db.ts';
import {projectEROwners} from '../../packages/core/src/mermaid/er-owners.ts';
import {materializeERField} from '../../packages/core/src/mermaid/er-field.ts';
import {MermaidSourceCoordinates} from '../../packages/core/src/mermaid/source-coordinates.ts';
it('materializes exact authored fields and synthetic key commas',async()=>{
 const source='erDiagram\nA {\n string name PK, FK ""\n int other\n}\n';
 const labels=await extractERLabels(source),normalized=await normalizeERDbEffects(labels,true),owners=projectEROwners(labels,normalized,replayERDb(normalized.effects,{look:'default'}));
 const [first,second]=owners.entities[0]!.rows;
 const keys=materializeERField(labels,first!.keys);expect(keys.text).toBe('PK,FK');
 expect(keys.mapRange(0,2)).toEqual({synthetic:false,intervals:[{start:source.indexOf('PK'),end:source.indexOf('PK')+2}]});
 expect(keys.mapRange(2,3)).toEqual({synthetic:true,intervals:[]});
 expect(keys.mapRange(3,5)).toEqual({synthetic:false,intervals:[{start:source.indexOf('FK'),end:source.indexOf('FK')+2}]});
 const name=materializeERField(labels,first!.name);expect(name.text).toBe('name');
 expect(name.mapRange(0,4)).toEqual({synthetic:false,intervals:[{start:source.indexOf('name'),end:source.indexOf('name')+4}]});
 expect(materializeERField(labels,first!.comment).text).toBe('');expect(materializeERField(labels,second!.comment).text).toBe('');
 expect(first!.comment.kind).toBe('record');expect(second!.comment.kind).toBe('empty');
 for(const owner of [second!.comment,second!.keys]){
   const empty=materializeERField(labels,owner);
   expect(empty.source).toBe(source);
   expect(new MermaidSourceCoordinates(source).locateRange(empty,0,0)).toEqual({intervals:[],synthetic:false});
   expect(empty.concatAll([name]).text).toBe('name');
 }
 expect(()=>materializeERField({...labels,records:[]},{kind:'empty'})).toThrow(/source owner/);
 expect(()=>materializeERField(labels,{kind:'record',recordIndex:-1})).toThrow(/owner/);
 expect(()=>materializeERField(labels,{kind:'joinedKeys',recordIndices:[0]})).toThrow(/keys/);
});
