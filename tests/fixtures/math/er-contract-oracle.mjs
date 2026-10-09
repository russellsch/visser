import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {captureERDb} from '../../../packages/core/src/mermaid/er-db.ts';
import {erContractLoadHook} from '../../../scripts/mermaid-er-contract.mjs';
import DOMPurify from 'dompurify';
import {JSDOM} from 'jsdom';
registerHooks({load:erContractLoadHook()});
const window=new JSDOM('').window,purifier=DOMPurify(window);
Object.assign(DOMPurify,{sanitize:purifier.sanitize,addHook:purifier.addHook});
const mermaid=(await import('mermaid')).default;
const module=await import('../../../node_modules/mermaid/dist/chunks/mermaid.core/erDiagram-OPXOYQCR.mjs');
assert.equal(module.visserERContractVersion,3);
const spec={cardA:'ONLY_ONE',cardB:'ZERO_OR_MORE',relType:'IDENTIFYING'};
for(const htmlLabels of [false,true]) {
 mermaid.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels,look:'handDrawn'});
 const db=module.diagram.db;assert.ok(db instanceof module.VisserErDB);db.clear();
 db.setDirection('RL');db.setDiagramTitle('diagram');db.setAccTitle('accessible title');db.setAccDescription('accessible description');
 db.addEntity('A','alpha');db.addAttributes('A',[{type:'int',name:'id',keys:['PK'],comment:'key'},{type:'string',name:'name'}]);
 db.addEntity('B');db.addEntity('C');db.addEntity('First');
 db.addSubGraph({text:'First'},['A','B','A','',{stmt:'dir',value:'LR'}],{text:' First group ',type:'text'});
 db.addSubGraph({text:'Second'},['A','C'],{text:'Second group',type:'markdown'});
 db.addSubGraph({text:'Second'},['B','C'],{text:'Second group duplicate',type:'markdown'});
 db.addClass(['accent'],['fill: red','color: blue']);db.setClass(['A','First','Second'],['accent']);
 db.addCssStyles(['A','First','Second'],['stroke: black']);
 db.addRelationship('A','owns','B',spec);db.addRelationship('First','contains','C',spec);
 const snapshot=captureERDb(db),storedBefore=structuredClone(snapshot),configBefore=module.visserCaptureERConfig();
 const detached=module.visserCaptureERData(snapshot);
 // Capture uses only supplied detached state; it must not call native getData on the live DB.
 assert.deepEqual(snapshot,storedBefore);assert.deepEqual(captureERDb(db),storedBefore);assert.deepEqual(module.visserCaptureERConfig(),configBefore);
 assert.deepEqual(Object.keys(configBefore).sort(),['dompurifyConfig','erNodeSpacing','erRankSpacing','htmlLabels','layout','look','nodeSpacing','rankSpacing','securityLevel']);
 assert.equal(configBefore.nodeSpacing,undefined);assert.equal(configBefore.rankSpacing,undefined);assert.equal(configBefore.erNodeSpacing,140);assert.equal(configBefore.erRankSpacing,80);
 assert.equal(detached.direction,'RL');assert.equal(detached.nodes.filter(node=>node.isGroup).length,3);assert.equal(detached.edges.length,2);
 // getData emits groups in reverse insertion order; duplicate IDs stay distinct rows.
 const [duplicateSecond,second,first]=detached.nodes.filter(node=>node.isGroup),a=detached.nodes.find(node=>node.id==='entity-A-0');
 assert.equal(duplicateSecond.label,'Second group duplicate');assert.equal(second.label,'Second group');assert.equal(first.label,'First group');
 assert.deepEqual(first.cssCompiledStyles,['fill: red','color: blue','color: blue']);assert.equal(first.dir,'LR');assert.deepEqual(first.cssStyles,['stroke: black']);
 assert.deepEqual(duplicateSecond.cssCompiledStyles,['fill: red','color: blue','color: blue']);assert.equal(a.parentId,'First');
 assert.deepEqual(a.attributes.map(attribute=>attribute.name),['name','id']);assert.deepEqual(a.attributes[0].keys,[]);
 assert.deepEqual(snapshot.subGraphs.map(group=>group.nodes),[['A','B'],['C'],[]]);assert.ok(!detached.nodes.some(node=>!node.isGroup&&node.id==='entity-First-3'));
 const {config:nativeConfig,...native}=db.getData();assert.ok(nativeConfig);assert.deepEqual(detached,native);assert.deepEqual(Object.keys(detached).sort(),['direction','edges','nodes','other']);
 // Native getData aliases entity/config data; the contract result has its own graph.
 native.nodes.find(node=>node.id==='entity-A-0').alias='native mutation';
 assert.equal(detached.nodes.find(node=>node.id==='entity-A-0').alias,'alpha');
 detached.nodes.find(node=>node.id==='entity-A-0').alias='detached mutation';
 assert.equal(snapshot.entities.find(([name])=>name==='A')[1].alias,'alpha');assert.equal(module.visserCaptureERConfig().look,'handDrawn');
 const before=module.visserCaptureERConfig();
 module.visserPrepareERSanitizer();module.visserPrepareERSanitizer();
 assert.deepEqual(module.visserCaptureERConfig(),before);
 assert.equal(db.getAccTitle(),'accessible title');
 assert.deepEqual(before,{securityLevel:'strict',htmlLabels,look:'handDrawn',layout:'elk',dompurifyConfig:undefined,nodeSpacing:undefined,rankSpacing:undefined,erNodeSpacing:140,erRankSpacing:80});
}
mermaid.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels:true,dompurifyConfig:{ADD_TAGS:['sentinel']}});
const detached=module.visserCaptureERConfig();detached.dompurifyConfig.ADD_TAGS.push('changed');
assert.deepEqual(module.visserCaptureERConfig().dompurifyConfig.ADD_TAGS,['sentinel']);
window.close();console.log(JSON.stringify({modes:2,configDetached:true,preparationPreservesState:true,detachedData:true}));
