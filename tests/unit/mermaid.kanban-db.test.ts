import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { replayKanbanDb, reconcileKanbanDb, type KanbanDbEffect } from '../../packages/core/src/mermaid/kanban-db.ts';

it('replays actual native stored state and captures detached aliases in an isolated process',()=>{
 const output=execFileSync(process.execPath,[resolve('tests/fixtures/math/kanban-db-oracle.mjs')],{encoding:'utf8',timeout:30000});
 expect(JSON.parse(output)).toEqual({cases:24,detached:true,recovery:true});
},40000);

it('rejects malformed replay inputs and does not retain input or output mutation',()=>{
 const options={width:200,padding:10},node:KanbanDbEffect={kind:'node',level:0,id:'a',label:'A',type:0,metadata:{label:['$$x$$']}};
 const snapshot=replayKanbanDb([node],options);
 (node.metadata as {label:string[]}).label.push('changed');
 expect(snapshot.nodes[0]!.label).toEqual(['$$x$$']);
 for(const effects of [null,[null],[{kind:'nope'}],[{...node,level:NaN}],[{...node,type:7}],[{...node,id:null}],[{kind:'decoration',icon:42}]])expect(()=>replayKanbanDb(effects as any,options)).toThrow(/kanban DB replay/);
 for(const bad of [null,{width:Infinity,padding:10},{width:200,padding:'10'}])expect(()=>replayKanbanDb([],bad as any)).toThrow(/finite width and padding/);
 expect(()=>reconcileKanbanDb([],options,null as any)).toThrow(/native nodes, sections or counter differ/);
 expect(()=>replayKanbanDb([{kind:'decoration',class:''}],options)).toThrow();
 expect(replayKanbanDb([{kind:'decoration'}],options).nodes).toEqual([]);
});
