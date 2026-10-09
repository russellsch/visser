import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {kanbanContractLoadHook} from '../../../scripts/mermaid-kanban-contract.mjs';
import DOMPurify from 'dompurify';
import {JSDOM} from 'jsdom';
import {prepareKanbanSource} from '../../../packages/core/src/mermaid/kanban-source.ts';
import {reconcileKanbanDb} from '../../../packages/core/src/mermaid/kanban-db.ts';
registerHooks({load:kanbanContractLoadHook()});
const window=new JSDOM('').window,purifier=DOMPurify(window);
Object.assign(DOMPurify,{sanitize:purifier.sanitize,addHook:purifier.addHook});
const mermaid=(await import('mermaid')).default;
const {diagram,visserCaptureKanbanDb:capture}=await import('../../../node_modules/mermaid/dist/chunks/mermaid.core/kanban-definition-PNTS6WVX.mjs');
const db=diagram.db,options={width:237,padding:11};
const fixtures=[
 'kanban\n',
 'kanban\ncol[Column]\n  bare\n  i["$$x$$"]@{label: "$$y$$", assigned: "$$a$$", ticket: "$$t$$"}\n',
 'kanban\na[First]\n  x["$$x$$"]\na[Second]\n  x["$$y$$"]\n',
 'kanban\ncol[Column]\n  i["<br/>$$x$$"]\n  :::hot\n  :::cold\n',
 'kanban\ncol[Column]\n  i[Base]@{base: &a ["$$x$$", *a], label: *a, assigned: *a, ticket: *a, priority: *a}\n',
 'kanban\ncol[Column]\n  i[Base]@{label: false, assigned: 0, ticket: "", priority: null}\n  j[Other]@{label: []}\n',
 'kanban\ncol[Column]\n  i[Base]@{label:\n - a\n -\n - "$$x$$"\n}\n',
 'kanban\ncol[Column]\n  (rounded)\n  ((circle))\n  {{hexagon}}\n  )cloud(\n  ))bang((\n',
 'kanban\n  col[Column]\ni[Lower]\n',
 'kanban\ncol[Column]\n  i[Base]@{label: "first\n    $$x$$"}\n',
];
let cases=0;
for(const mode of [true,false]){
 mermaid.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels:mode,mindmap:{padding:11,maxNodeWidth:237}});
 for(const source of fixtures){
  db.clear();diagram.parser.yy=db;diagram.parser.parse('kanban\nold[Sentinel]\n');
  const before=capture(),prepared=await prepareKanbanSource(source,options,undefined,mode);
  assert.deepStrictEqual(capture(),before,'preparation must not mutate native singleton');
  db.clear();diagram.parser.yy=db;diagram.parser.parse(prepared.authored.parserSource);
  assert.deepStrictEqual(prepared.snapshot,capture());
  reconcileKanbanDb(prepared.effects,options,capture());
  const display=db.getData().nodes;
  assert.deepStrictEqual(prepared.groups.copies.map(copy=>[prepared.snapshot.nodes[copy.nodeIndex].id,copy.kind]),display.map(n=>[n.id,n.isGroup?'section':'item']));
  cases++;
 }
}
const original='\uFEFF  kanban\r\n  %% note\r\n  col[Column]\r\n    i["雪 $$x$$"]\r\n';
const rendered='kanban\n%% note\ncol[Column]\n  i["雪 $$x$$"]\n';
const prepared=await prepareKanbanSource(original,options,rendered,false);
db.clear();diagram.parser.yy=db;diagram.parser.parse(prepared.authored.parserSource);assert.deepStrictEqual(prepared.snapshot,capture());cases++;
const before=capture();
await assert.rejects(prepareKanbanSource('kanban\ncol[Column]\n  i@{"\\u0069con": hidden}\n',options),/not allowed/);
assert.deepStrictEqual(capture(),before);
await assert.rejects(prepareKanbanSource('kanban\n  col[Column]\ni[Lower]\nj[Next]\n',options),/Items without section/);
assert.deepStrictEqual(capture(),before);
const recovered=await prepareKanbanSource('kanban\nnew[Recovered]\n',options);assert.equal(recovered.snapshot.nodes[0].id,'new');
window.close();console.log(JSON.stringify({cases,isolated:true,recovered:true}));
