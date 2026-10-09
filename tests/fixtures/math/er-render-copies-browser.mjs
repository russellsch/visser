// Native-only ER SVG characterization. No Visser bundle or source binding is loaded.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {chromium} from '@playwright/test';
import {build} from 'esbuild';

const bundled=await build({stdin:{contents:"import mermaid from 'mermaid'; window.mermaid=mermaid;",resolveDir:resolve('.')},bundle:true,format:'iife',platform:'browser',write:false,minify:true,logLevel:'warning'});
const moduleBundle=bundled.outputFiles[0].text,moduleBundleSha256=createHash('sha256').update(moduleBundle).digest('hex');
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage(),requests=[];
 await page.route('**/*',route=>{requests.push(route.request().url());return route.abort();});
 await page.setContent('<!doctype html><main id="root"></main>');
 await page.addScriptTag({content:moduleBundle});
 const result=await page.evaluate(async()=>{
  const source='erDiagram\nA[Header] {\n string field PK "Comment"\n}\nB[Simple]\nA ||--|| B : Role\n';
  const inspect=svg=>{
   const all=selector=>[...svg.querySelectorAll(selector)];
   const label=(selector,text)=>all(selector).filter(node=>node.textContent?.trim()===text).length;
   return {
    foreignObjects:all('foreignObject').length,
    labels:{
     header:label('g.node .label.name, g.rough-node .label.name','Header'),
     type:label('g.node .label.attribute-type, g.rough-node .label.attribute-type','string'),
     name:label('g.node .label.attribute-name, g.rough-node .label.attribute-name','field'),
     keys:label('g.node .label.attribute-keys, g.rough-node .label.attribute-keys','PK'),
     comment:label('g.node .label.attribute-comment, g.rough-node .label.attribute-comment','Comment'),
     simple:label('g.node, g.rough-node','Simple'),
     role:label('.edgeLabels > g.edgeLabel','Role'),
    },
   };
  };
  const modes=[],layouts=[{requestedLayout:'default',config:{}},{requestedLayout:'dagre',config:{layout:'dagre'}}];
  for(const {requestedLayout,config} of layouts)for(const htmlLabels of [true,false])for(const look of ['default','handDrawn']){
   const mermaid=window.mermaid;mermaid.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels,look,...config});
   const rendered=await mermaid.render(`erCopies-${htmlLabels}-${look}`,source),host=document.createElement('div');host.innerHTML=rendered.svg;document.body.append(host);
   modes.push({requestedLayout,effectiveLayout:mermaid.mermaidAPI.getConfig().layout,htmlLabels,look,...inspect(host.querySelector('svg'))});host.remove();
  }
  const mermaid=window.mermaid;
  const groups='erDiagram\nsubgraph g[First]\n A\nend\nsubgraph g[Second]\n B\nend\nsubgraph empty[Empty]\nend\nsubgraph full[Full]\n C\nend\n';
  const loops='erDiagram\nA ||--|| A : Before\nA ||--|| A : After\n';
  const layoutCases=[];
  for(const {requestedLayout,config} of layouts){
   mermaid.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels:true,look:'default',...config});
   const effectiveLayout=mermaid.mermaidAPI.getConfig().layout;
   const groupRender=await mermaid.render(`erGroups-${requestedLayout}`,groups),groupHost=document.createElement('div');groupHost.innerHTML=groupRender.svg;document.body.append(groupHost);
   const groupTitles=[...groupHost.querySelectorAll('.clusters .cluster')].map(node=>node.textContent?.trim());
   const loopRender=await mermaid.render(`erLoops-${requestedLayout}`,loops),loopHost=document.createElement('div');loopHost.innerHTML=loopRender.svg;document.body.append(loopHost);
   const loopRoles=[...loopHost.querySelectorAll('.edgeLabels > g.edgeLabel')].map(node=>node.textContent?.trim());loopHost.remove();
   const allGroupLabels=['First','Second','Empty','Full'].map(text=>[text,[...groupHost.querySelectorAll('g.node, g.rough-node, g.cluster')].filter(node=>node.textContent?.trim()===text).length]);
   groupHost.remove();
   layoutCases.push({requestedLayout,effectiveLayout,groupTitles,allGroupLabels:Object.fromEntries(allGroupLabels),loopRoles});
  }
  mermaid.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels:true,look:'default',layout:'dagre'});
  const collision='erDiagram\nA[Alias]\nsubgraph entity-A-0[Group]\n B\nend\nB ||--|| X : role\n';
  let dagreCollisionRejected=false,dagreCollisionError='';try{await mermaid.render('erDagreEntityCollision',collision);}catch(error){dagreCollisionRejected=true;dagreCollisionError=String(error);}
  return {modes,layoutCases,dagreCollisionRejected,dagreCollisionError};
 });
 for(const mode of result.modes){
  assert.equal(mode.effectiveLayout,mode.requestedLayout==='default'?'elk':'dagre');
  const copies=mode.look==='handDrawn'?2:1;
  assert.deepEqual(mode.labels,{header:copies,type:copies,name:copies,keys:copies,comment:copies,simple:copies,role:1});
  assert.equal(mode.foreignObjects,mode.htmlLabels?(copies===1?7:13):0);
 }
 const elk=result.layoutCases.find(row=>row.requestedLayout==='default');
 assert.equal(elk.effectiveLayout,'elk');
 assert.deepEqual(elk.allGroupLabels,{First:1,Second:1,Empty:1,Full:1});
 assert.deepEqual(elk.loopRoles,['Before','After']);
 const dagre=result.layoutCases.find(row=>row.requestedLayout==='dagre');
 assert.equal(dagre.effectiveLayout,'dagre');
 assert.deepEqual(dagre.allGroupLabels,{First:1,Second:0,Empty:1,Full:1});
 assert.deepEqual(dagre.groupTitles.sort(),['First','Full']);
 assert.equal(dagre.allGroupLabels.Empty,1);
 assert.equal(result.layoutCases.find(row=>row.requestedLayout==='default').allGroupLabels.Empty,1);
 assert.deepEqual(dagre.loopRoles,['After']);
 assert.equal(result.dagreCollisionRejected,true);
 assert.match(result.dagreCollisionError,/attr/);
 assert.deepEqual(requests,[]);
 console.log(JSON.stringify({moduleBundleSha256,nativeER:result,networkAttempts:requests.length}));
} finally { await browser.close(); }
