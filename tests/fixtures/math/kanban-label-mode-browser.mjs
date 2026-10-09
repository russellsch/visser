// Native-only characterization: no Visser build patches or math activation.
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {chromium} from '@playwright/test';
import {prepareKanbanSource} from '../../../packages/core/src/mermaid/kanban-source.ts';
import {planKanbanRenderCopies} from '../../../packages/core/src/mermaid/kanban-render-copies.ts';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();const requests=[];
 await page.route('**/*',route=>{requests.push(route.request().url());return route.abort();});
 await page.setContent('<!doctype html><main></main>');
 await page.addScriptTag({path:resolve('node_modules/mermaid/dist/mermaid.js')});
 const result=await page.evaluate(async()=>{
  const results=[];
  for(const htmlLabels of [true,false]){
   const m=window.mermaid;
   m.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels});
   const source='kanban\ncol[Column]\n  i[Card]@{ticket: Ticket, assigned: Person}\n';
   const result=await m.render(`kanbanMode${htmlLabels}`,source);
   const root=document.createElement('div');root.innerHTML=result.svg;document.body.append(root);
   results.push({htmlLabels,after:m.mermaidAPI.getConfig().htmlLabels,foreignObjects:root.querySelectorAll('foreignObject').length,text:root.textContent});root.remove();
  }
  const m=window.mermaid;
  m.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels:true});
  const duplicateSource='kanban\na[First]\n  i[CardOne]\na[Second]\n  j[CardTwo]\n';
  const diagram=await m.mermaidAPI.getDiagramFromText(duplicateSource);
  const dbItems=diagram.db.getData().nodes.filter(n=>!n.isGroup).length;
  const duplicate=await m.render('kanbanDuplicate',duplicateSource);
  const root=document.createElement('div');root.innerHTML=duplicate.svg;document.body.append(root);
  const copies={dbItems,renderedCards:root.querySelectorAll('.items > g.node').length,foreignObjects:root.querySelectorAll('foreignObject').length,titles:[...root.querySelectorAll('.items > g.node')].map(node=>node.textContent)};root.remove();
  return {results,copies};
 });
 for(const row of result.results){assert.equal(row.after,row.htmlLabels);assert.equal(row.foreignObjects,row.htmlLabels?4:0);for(const word of ['Column','Card','Ticket','Person'])assert.ok(row.text.includes(word));}
 // Native draws ticket/assignee label objects even when their text is empty.
 const prepared=await prepareKanbanSource('kanban\na[First]\n  i[CardOne]\na[Second]\n  j[CardTwo]\n',{width:200,padding:10});
 const plan=planKanbanRenderCopies(prepared);
 const plannedTitles=[...plan.copies()].filter(copy=>copy.kind==='item').map(copy=>prepared.nodes[copy.nodeIndex].effectiveLabel.text);
 assert.deepStrictEqual(result.copies,{dbItems:4,renderedCards:8,foreignObjects:26,titles:plannedTitles});
 assert.equal(plan.total,10);assert.deepStrictEqual(plan.counts,[1,4,1,4]);
 assert.deepStrictEqual(requests,[]);
 console.log(JSON.stringify({rows:result.results.map(({text,...row})=>row),copies:result.copies,networkAttempts:requests.length}));
}finally{await browser.close();}
