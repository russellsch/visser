import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {extractERLabels} from '../../../packages/core/src/mermaid/er-labels.ts';
import {normalizeERDbEffects} from '../../../packages/core/src/mermaid/er-db-effects.ts';
import {replayERDb,captureERDb} from '../../../packages/core/src/mermaid/er-db.ts';
const [nodeDb,hook,stub,chunk]=process.argv.slice(2);
const {erContractLoadHook}=await import(hook);
registerHooks({load:erContractLoadHook(),resolve(specifier,context,next){return specifier==='dompurify'?{url:stub,shortCircuit:true}:next(specifier,context);}});
const mermaid=(await import('mermaid')).default;
const common=await import('../../../node_modules/mermaid/dist/chunks/mermaid.core/chunk-O7XYJQB3.mjs');
const init=(htmlLabels=true)=>mermaid.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels});
init();
const {installERNodeDb,captureERNodeState,readERNodeConfig,erPlanningData}=await import(nodeDb);
await installERNodeDb();await installERNodeDb();
const mod=await import(chunk),parser=mod.diagram.parser;
const source='erDiagram\naccTitle: $$title$$\nA {\n string name PK "comment"\n}\nA ||--o{ B : role\n',input=source+'\n';
const fresh=()=>{const db=mod.diagram.db;db.clear();parser.yy=db;return db;};
const absent=db=>assert.throws(()=>captureERNodeState(db,input),/no completed/);
const cases=[];
{
 const db=mod.diagram.db;parser.yy=db;
 assert.throws(()=>parser.parse(input),/fresh native clear/);absent(db);
 db.clear();parser.parse(input);assert.throws(()=>captureERNodeState(db,'wrong'),/input differs/);absent(db);
 db.clear();parser.parse(input);captureERNodeState(db,input);absent(db);
 cases.push('clear-source-one-use');
}
for(const htmlLabels of [false,true]) {
 init(htmlLabels);const db=fresh();parser.parse(input);const state=captureERNodeState(db,input);
 const labels=await extractERLabels(source),normalized=await normalizeERDbEffects(labels,htmlLabels);
 assert.deepEqual(state.effects,labels.effects.map(({method,args})=>({method,args})));
 assert.deepEqual(replayERDb(normalized.effects,state.options),state.snapshot);
 assert.equal(state.effects.filter(e=>e.method==='addEntity').length,3); // no nested addAttributes/addEntity
 assert.equal(state.htmlLabels,htmlLabels);
 assert.deepEqual(captureERDb(db),state.snapshot);
 assert.ok([...db.getEntities().values()].every(entity=>!('colorIndex'in entity)&&!('cssCompiledStyles'in entity)));
 const {config:renderConfig,...graph}=db.getData();assert.deepEqual(state.data,structuredClone(graph));
 assert.equal(Object.hasOwn(state.data,'config'),false);cases.push(`native-parity-${htmlLabels}`);
}
{
 init();const db=fresh();parser.parse(input);
 const other=mod.diagram.db;assert.notEqual(other,db);assert.equal(other.getAccTitle(),'');
 common.setConfig({look:'handDrawn',layout:'dagre'});
 const state=captureERNodeState(db,input);assert.equal(state.snapshot.accTitle,'$$title$$');
 assert.equal(state.planningConfig.look,state.options.look);assert.equal(state.planningConfig.layout,'elk');
 assert.notEqual(state.planningConfig.look,common.getConfig().look);
 assert.equal(state.data.nodes.some(node=>node.label==='later'),false);
 const before=structuredClone(state);db.clear();db.addEntity('later');assert.deepEqual(state,before);
 cases.push('historical-fresh-db');
}
{
 const db=fresh();parser.parse(input);
 assert.throws(()=>parser.parse.call({yy:db},input),/wrong parser receiver/);absent(db);
 db.clear();assert.throws(()=>parser.parse('erDiagram\nA {\n string broken\n'),/Parse error/);absent(db);
 db.clear();parser.parse(input);assert.equal(captureERNodeState(db,input).snapshot.accTitle,'$$title$$');
 db.clear();db.setDiagramTitle('unsupported');assert.throws(()=>parser.parse(input),/preparse state/);absent(db);
 cases.push('receiver-failure-seed-recovery');
}
for(const config of [{securityLevel:'loose'},{htmlLabels:'bad'},{dompurifyConfig:{ADD_TAGS:['x']}}]) {
 mermaid.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels:true,...config});const db=fresh();
 assert.throws(()=>readERNodeConfig(),/strict|boolean|purification/);
 assert.throws(()=>parser.parse(input),/strict|boolean|purification/);absent(db);
 cases.push(`config-${Object.keys(config)[0]}`);
}
function injection(name,action,expected) {
 init();const other=mod.diagram.db;other.addEntity('sentinel');
 const db=fresh(),original=db.addEntity;let ran=false;
 db.addEntity=(...args)=>{if(!ran){ran=true;action(db,other);}return original(...args);};
 try {assert.throws(()=>parser.parse(input),expected,name);assert.ok(ran,name);absent(db);}
 finally {db.addEntity=original;init();}
 cases.push(name);
}
injection('config-drift',()=>common.setConfig({look:'handDrawn'}),/config changed/);
injection('layout-drift',()=>common.setConfig({layout:'dagre'}),/config changed/);
injection('clear-during-parse',db=>db.clear(),/invalidated|cleared during/);
injection('caught-nested-parse',()=>assert.throws(()=>parser.parse(input),/overlapping/),/invalidated/);
injection('caught-construction',()=>assert.throws(()=>mod.diagram.db,/construction/),/invalidated/);
injection('caught-foreign-mutation',(_db,other)=>assert.throws(()=>other.addEntity('bad'),/foreign DB mutation/),/invalidated/);
injection('caught-foreign-clear',(_db,other)=>{
 assert.throws(()=>other.clear(),/foreign DB clear/);assert.equal(other.getEntities().size,1);
},/invalidated/);
{
 init();const db=fresh();db.setDirection('RL');db.clear();parser.parse(input);
 assert.equal(captureERNodeState(db,input).options.initialDirection,'RL');cases.push('retained-direction');
}
{
 init();const db=fresh(),original=parser.performAction;
 parser.performAction=()=>Promise.resolve(true);
 try {assert.throws(()=>parser.parse(input),/asynchronous boundary/);absent(db);}
 finally {parser.performAction=original;}
 db.clear();parser.parse(input);captureERNodeState(db,input);
 cases.push('thenable-rejected-recovery');
}
{
 init();const db=fresh();parser.parse(input);
 assert.throws(()=>parser.parse(input,'extra'),/fresh native clear|unexpected parser input/);absent(db);
 db.clear();assert.throws(()=>parser.parse(42),/unexpected parser input/);absent(db);
 parser.yy={};assert.throws(()=>parser.parse(input),/not a registered/);
 cases.push('invalid-arguments-db');
}
{
 init();common.setConfig({nodeSpacing:()=> 'not cloneable'});const db=fresh();
 assert.equal(typeof common.getConfig().nodeSpacing,'function');
 assert.throws(()=>parser.parse(input),/planning config must be cloneable/);absent(db);
 init();db.clear();parser.yy=db;parser.parse(input);assert.equal(captureERNodeState(db,input).data.nodes.length,2);
 cases.push('noncloneable-planning-config-recovery');
}
for(const failure of ['config','caught-clear','final-config-caught-clear']){
 init();const other=mod.diagram.db,db=fresh(),clone=globalThis.structuredClone;let ran=false,capturedGraph=false;
 globalThis.structuredClone=(value,...args)=>{
  const result=clone(value,...args);
  const graph=value&&Array.isArray(value.nodes)&&Array.isArray(value.edges)&&Object.hasOwn(value,'other')&&Object.hasOwn(value,'direction');
  if(graph)capturedGraph=true;
  const finalConfig=failure==='final-config-caught-clear'&&capturedGraph&&value?.securityLevel==='strict'&&Object.hasOwn(value,'erNodeSpacing');
  if(!ran&&(failure==='final-config-caught-clear'?finalConfig:graph)){
   ran=true;
   if(failure==='config')common.setConfig({layout:'dagre'});
   else assert.throws(()=>other.clear(),/foreign DB clear/);
  }
  return result;
 };
 try{assert.throws(()=>parser.parse(input),/config changed during data capture|invalidated during data capture/);assert.equal(ran,true);absent(db);}
 finally{globalThis.structuredClone=clone;init();}
 db.clear();parser.yy=db;parser.parse(input);captureERNodeState(db,input);
 cases.push(`capture-${failure}-recovery`);
}
{
 init();common.setConfig({nodeSpacing:11,rankSpacing:12,er:{nodeSpacing:13,rankSpacing:14},flowchart:{nodeSpacing:999,rankSpacing:888}});
 const db=fresh();parser.parse(input);const receipt=captureERNodeState(db,input),planned=erPlanningData(receipt);
 assert.deepEqual(planned.config,{nodeSpacing:11,rankSpacing:12,flowchart:{nodeSpacing:13,rankSpacing:14}});
 planned.nodes[0].label='changed';assert.notEqual(receipt.data.nodes[0].label,'changed');
 init();common.setConfig({er:{nodeSpacing:0,rankSpacing:0}});db.clear();parser.yy=db;parser.parse(input);
 assert.deepEqual(erPlanningData(captureERNodeState(db,input)).config,{nodeSpacing:undefined,rankSpacing:undefined,flowchart:{nodeSpacing:140,rankSpacing:80}});
 cases.push('planning-spacing-precedence');
}
console.log(JSON.stringify({cases}));
