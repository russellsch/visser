// Isolated native singleton and Node hook: no Vitest module-cache authority.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { kanbanContractLoadHook } from '../../../scripts/mermaid-kanban-contract.mjs';
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { replayKanbanDb, reconcileKanbanDb } from '../../../packages/core/src/mermaid/kanban-db.ts';
import { sanitizeKanbanField } from '../../../packages/core/src/mermaid/kanban-sanitize.ts';
import { decodeKanbanMetadata } from '../../../packages/core/src/mermaid/kanban-metadata.ts';
import { ProvenanceText } from '../../../packages/core/src/mermaid/source-provenance.ts';
registerHooks({load:kanbanContractLoadHook()});
const window = new JSDOM('').window;
const purifier = DOMPurify(window);
Object.assign(DOMPurify,{sanitize:purifier.sanitize,addHook:purifier.addHook});
const mermaid=(await import('mermaid')).default;
mermaid.initialize({startOnLoad:false,securityLevel:'strict',mindmap:{padding:13,maxNodeWidth:241}});
const {diagram,visserCaptureKanbanDb:capture}=await import('../../../node_modules/mermaid/dist/chunks/mermaid.core/kanban-definition-PNTS6WVX.mjs');
const db=diagram.db, options={padding:13,width:241};
let htmlLabels=true;
const sanitize=async text=>(await sanitizeKanbanField(ProvenanceText.identity(text),htmlLabels)).value.text;
async function compare(raw){
 db.clear();const effects=[];
 for(const e of raw){
  if(e.kind==='decoration'){
   db.decorateNode(e);
   const mapped={kind:'decoration'};
   for(const key of ['icon','class'])if(e[key])mapped[key]=await sanitize(e[key]);
   effects.push(mapped);
  }else{
   db.addNode(e.level,e.id,e.label,e.type,e.yaml);
   const mapped={kind:'node',level:e.level,id:await sanitize(e.id),label:await sanitize(e.label),type:e.type};
   if(e.yaml!==undefined)mapped.metadata=decodeKanbanMetadata(ProvenanceText.identity(e.yaml)).value;
   effects.push(mapped);
  }
  const snapshot=capture();
  assert.deepStrictEqual(replayKanbanDb(effects,options),snapshot);
  assert.deepStrictEqual(reconcileKanbanDb(effects,options,snapshot),snapshot);
 }
 const snapshot=capture(),labels=[];
 for(const section of snapshot.sections){
  labels.push(await sanitize(String(section.label??'')));
  for(const child of snapshot.nodes.filter(n=>n.parentId===section.id))labels.push(await sanitize(String(child.label??'')));
 }
 assert.deepStrictEqual(db.getData().nodes.map(n=>n.label),labels);
 return {effects,snapshot};
}
const node=(level,id,label,type=0,yaml)=>({kind:'node',level,id,label,type,yaml});
const corpus=[
 [],[node(0,'','')],
 [node(0,'a','<b>$$x$$</b>'),node(1,'i','<script>bad</script>$$x$$',2),node(0,'a','Second'),node(1,'i','Duplicate',6)],
 [node(0,'kbn0','Literal'),node(1,'','Fallback'),node(0,'','Fallback section')],
 [node(0,'a','Column'),...Array.from({length:7},(_,i)=>node(1,`id${i}`,'Card',i))],
 [node(0,'a','Column'),node(1,'i','Old',0,'label: ["$$x$$", null, true], assigned: [A, B], ticket: 42, priority: [High, Low]')],
 [node(0,'a','Column'),node(1,'i','Old',0,'base: &a ["$$x$$", *a], label: *a, assigned: *a, ticket: *a, priority: *a')],
 [node(0,'a','Column'),node(1,'i','Old',0,'label: false, assigned: 0, ticket: "", priority: null')],
 [node(0,'a','Column'),node(1,'i','Old',0,'label: []')],
 [node(0,'a','Column'),{kind:'decoration',icon:'first',class:'hot'},{kind:'decoration',icon:'<script>removed</script>',class:'<script>removed</script>'}],
 [node(2,'a','Column'),node(0,'i','Lower')],
 [{kind:'decoration'},node(0,'a','Column')],
];
for(const mode of [true,false]){
 htmlLabels=mode;mermaid.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels:mode,mindmap:{padding:13,maxNodeWidth:241}});
 for(const raw of corpus)await compare(raw);
}
const {effects,snapshot}=await compare(corpus[6]);
assert.equal(snapshot.nodes[0],snapshot.sections[0]);
assert.equal(snapshot.nodes[1].label[1],snapshot.nodes[1].label);
snapshot.nodes[0].label='mutated';snapshot.nodes[1].label.push('mutated');snapshot.sections.length=0;snapshot.counter=123;
const fresh=capture();assert.equal(fresh.nodes[0].label,'Column');assert.equal(fresh.nodes[1].label.length,2);assert.equal(fresh.sections.length,1);assert.equal(fresh.counter,0);
for(const mutate of [s=>s.counter++,s=>s.nodes[1].assigned='wrong',s=>s.sections.pop(),s=>s.nodes[0].hidden=true,s=>s.nodes[0].padding++]){
 const changed=capture();mutate(changed);assert.throws(()=>reconcileKanbanDb(effects,options,changed),/native nodes, sections or counter differ/);
}
const split=capture();split.sections[0]=structuredClone(split.sections[0]);
assert.throws(()=>reconcileKanbanDb(effects,options,split),/native object aliases differ/);
const lower=[node(2,'s','Section'),node(0,'i','Lower')];await compare(lower);
assert.throws(()=>db.addNode(1,'next','Next',0),/Items without section/);
assert.throws(()=>replayKanbanDb([...lower,node(1,'next','Next')],options),/Items without section/);
for(const yaml of ['shape: kanbanItem','shape: [rect]','assigned: {toString: broken}','null\n']){
 db.clear();assert.throws(()=>db.addNode(0,'s','Section',0,yaml));
}
db.clear();assert.deepStrictEqual(capture(),{nodes:[],sections:[],counter:0});
await compare([node(0,'','Recovered')]);assert.equal(capture().nodes[0].id,'kbn0');
window.close();console.log(JSON.stringify({cases:corpus.length*2,detached:true,recovery:true}));
