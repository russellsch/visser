import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {expect,it} from 'vitest';

it('authenticates one detached Kanban singleton parse receipt in isolated Node workers',()=>{
 const root=process.cwd(),dir=mkdtempSync(join(tmpdir(),'visser-kanban-node-db-')),url=(path:string)=>pathToFileURL(resolve(path)).href;
 const nodeDb=url('packages/core/src/mermaid/kanban-node-db.ts'),stub=url('packages/core/src/mermaid/dompurify-stub.ts'),hook=url('scripts/mermaid-kanban-contract.mjs'),chunk=url('node_modules/mermaid/dist/chunks/mermaid.core/kanban-definition-PNTS6WVX.mjs'),mermaid=url('node_modules/mermaid/dist/mermaid.core.mjs');
 const source='kanban\ncolumn[Column]\n  card[Card]\n',recovered='kanban\nnext[Next]\n  child[Child]\n';
 const missing=`import assert from 'node:assert/strict';const {installKanbanNodeDb}=await import(${JSON.stringify(nodeDb)});await assert.rejects(installKanbanNodeDb(),/native contract patch is missing/);console.log('marker missing');`;
 const ready=[
  "import assert from 'node:assert/strict';import {registerHooks} from 'node:module';",
  'import {kanbanContractLoadHook} from '+JSON.stringify(hook)+';',
  'registerHooks({load:kanbanContractLoadHook(),resolve(specifier,context,next){return specifier==="dompurify"?{url:'+JSON.stringify(stub)+',shortCircuit:true}:next(specifier,context);}});',
  'const {installKanbanNodeDb,captureKanbanNodeState}=await import('+JSON.stringify(nodeDb)+');',
  'await Promise.all([installKanbanNodeDb(),installKanbanNodeDb()]);',
  'const module=await import('+JSON.stringify(chunk)+'),db=module.diagram.db,parser=module.diagram.parser,source='+JSON.stringify(source)+';',
  'const {default:mermaid}=await import('+JSON.stringify(mermaid)+');mermaid.initialize({startOnLoad:false,securityLevel:"strict",htmlLabels:true,mindmap:{padding:13,maxNodeWidth:241}});',
  'assert.throws(()=>captureKanbanNodeState(db,source),/no completed native parse snapshot/);assert.throws(()=>captureKanbanNodeState({} ,source),/no completed native parse snapshot/);',
  'parser.yy={};db.clear();assert.throws(()=>parser.parse(source),/registered native singleton/);parser.yy=db;db.clear();assert.throws(()=>parser.parse.call({},source),/wrong parser receiver/);assert.throws(()=>parser.parse(source),/fresh native clear/);',
  'db.clear();parser.parse(source);assert.throws(()=>captureKanbanNodeState(db,"other"),/completed parser input differs/);assert.throws(()=>captureKanbanNodeState(db,source),/no completed native parse snapshot/);',
  'db.clear();parser.parse(source);const first=captureKanbanNodeState(db,source);assert.deepEqual(first.options,{width:241,padding:13});assert.equal(first.htmlLabels,true);assert.equal(first.snapshot.nodes[0],first.snapshot.sections[0]);first.snapshot.nodes[0].label="changed";assert.throws(()=>captureKanbanNodeState(db,source),/no completed native parse snapshot/);',
  'db.clear();parser.parse(source);db.clear();assert.throws(()=>captureKanbanNodeState(db,source),/no completed native parse snapshot/);parser.parse(source);assert.ok(captureKanbanNodeState(db,source));',
  'const originalAdd=db.addNode;db.addNode=(...args)=>{originalAdd.apply(db,args);db.clear();};db.clear();assert.throws(()=>parser.parse(source),/cleared during parse/);assert.throws(()=>captureKanbanNodeState(db,source),/no completed native parse snapshot/);db.addNode=originalAdd;assert.throws(()=>parser.parse(source),/fresh native clear/);',
  'db.addNode=(...args)=>parser.parse(source);db.clear();assert.throws(()=>parser.parse(source),/overlapping native parse/);assert.throws(()=>captureKanbanNodeState(db,source),/no completed native parse snapshot/);db.addNode=originalAdd;',
  'const invalid="kanban\\ncolumn[";db.clear();assert.throws(()=>parser.parse(invalid));assert.throws(()=>captureKanbanNodeState(db,invalid),/no completed native parse snapshot/);assert.throws(()=>parser.parse(source),/fresh native clear/);',
  'mermaid.initialize({startOnLoad:false,securityLevel:"loose",htmlLabels:true});db.clear();assert.throws(()=>parser.parse(source),/securityLevel must be strict/);assert.throws(()=>parser.parse(source),/fresh native clear/);',
  'mermaid.initialize({startOnLoad:false,securityLevel:"strict",htmlLabels:true,mindmap:{padding:null,maxNodeWidth:null}});const defaults=module.visserCaptureKanbanConfig();db.clear();parser.parse(source);const fallback=captureKanbanNodeState(db,source);assert.deepEqual(fallback.options,{width:defaults.mindmap.maxNodeWidth,padding:defaults.mindmap.padding});assert.equal(fallback.snapshot.nodes[0].width,fallback.options.width);assert.equal(fallback.snapshot.nodes[0].padding,2*fallback.options.padding);',
  'mermaid.initialize({startOnLoad:false,securityLevel:"strict",htmlLabels:false,mindmap:{padding:7,maxNodeWidth:101}});const api=await mermaid.mermaidAPI.getDiagramFromText('+JSON.stringify(recovered)+');const captured=captureKanbanNodeState(api.db,api.text);assert.deepEqual(captured.options,{width:101,padding:7});assert.equal(captured.htmlLabels,false);mermaid.initialize({startOnLoad:false,securityLevel:"strict",htmlLabels:true,mindmap:{padding:99,maxNodeWidth:999}});assert.deepEqual(captured.options,{width:101,padding:7});assert.equal(captured.snapshot.nodes[0].label,"Next");',
  'mermaid.initialize({startOnLoad:false,securityLevel:"strict",htmlLabels:true,mindmap:{padding:13,maxNodeWidth:241}});db.clear();parser.yy=db;parser.parse(source);db.addNode(0,"late","Late",0);mermaid.initialize({startOnLoad:false,securityLevel:"strict",htmlLabels:false,mindmap:{padding:2,maxNodeWidth:82}});const late=captureKanbanNodeState(db,source);assert.equal(late.snapshot.nodes.length,2);assert.deepEqual(late.options,{width:241,padding:13});assert.equal(late.htmlLabels,true);',
  'db.addNode=(...args)=>{originalAdd.apply(db,args);mermaid.initialize({startOnLoad:false,securityLevel:"strict",htmlLabels:true,mindmap:{padding:3,maxNodeWidth:83}});};db.clear();assert.throws(()=>parser.parse(source),/config changed during parse/);assert.throws(()=>captureKanbanNodeState(db,source),/no completed native parse snapshot/);db.addNode=originalAdd;assert.throws(()=>parser.parse(source),/fresh native clear/);db.clear();parser.parse(source);assert.ok(captureKanbanNodeState(db,source));',
  'const stubModule=await import('+JSON.stringify(stub)+');assert.equal(stubModule.default.sanitize("<b>raw</b>"),"<b>raw</b>");assert.equal(globalThis.window,undefined);assert.equal(globalThis.document,undefined);',
  'console.log("recovered");'
 ].join('\n');
 try { for(const [name,body,expected] of [['missing.mjs',missing,'marker missing'],['ready.mjs',ready,'recovered']] as const) { const file=join(dir,name);writeFileSync(file,body);expect(execFileSync(process.execPath,[file],{cwd:root,encoding:'utf8'}).trim()).toBe(expected); } }
 finally { rmSync(dir,{recursive:true,force:true}); }
});
