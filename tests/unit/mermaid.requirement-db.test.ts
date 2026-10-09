import {afterAll,beforeAll,expect,it} from 'vitest';
import DOMPurify from 'dompurify';
// @ts-expect-error jsdom is supplied by the test harness without declarations.
import {JSDOM} from 'jsdom';
import {captureRequirementDb,reconcileRequirementDb,replayRequirementDb,type RequirementEffect} from '../../packages/core/src/mermaid/requirement-db.ts';

const descriptors=Object.getOwnPropertyDescriptors(DOMPurify);
beforeAll(()=>{const instance=DOMPurify(new JSDOM('').window);Object.assign(DOMPurify,{sanitize:instance.sanitize,addHook:instance.addHook});});
afterAll(()=>{for(const key of ['sanitize','addHook'])if(descriptors[key])Object.defineProperty(DOMPurify,key,descriptors[key]!);else Reflect.deleteProperty(DOMPurify,key);});
async function native(source:string){const {default:mermaid}=await import('mermaid');mermaid.initialize({startOnLoad:false,securityLevel:'strict'});return (await mermaid.mermaidAPI.getDiagramFromText(source)).db as any;}
const effect=(method:any,...args:any[])=>({method,args}) as unknown as RequirementEffect;
const apply=(db:any,effects:readonly RequirementEffect[])=>{for(const value of effects)(db[value.method]as Function)(...value.args);};

it('matches a fresh native requirement diagram for ordered declarations, duplicate first-wins maps, namespaces, and relationships',async()=>{
 const source=`requirementDiagram
direction LR
requirement R {
  id: first
  text: first text
  risk: low
  verifyMethod: test
}
requirement R {
  id: ignored
  text: ignored text
}
element E {
  type: service
  docRef: refone
}
`;
 const db=await native(source),snapshot=captureRequirementDb(db);
 const effects:RequirementEffect[]=[effect('setDirection','LR'),
  effect('setNewReqId','first'),effect('setNewReqText','first text'),effect('setNewReqRisk','Low'),effect('setNewReqVerifyMethod','Test'),effect('addRequirement','R','Requirement'),
  effect('setNewReqId','ignored'),effect('setNewReqText','ignored text'),effect('addRequirement','R','Requirement'),
  effect('setNewElementType','service'),effect('setNewElementDocRef','refone'),effect('addElement','E')];
 expect(reconcileRequirementDb(effects,snapshot)).toEqual(snapshot);
 expect(snapshot.requirements).toEqual([['R',expect.objectContaining({requirementId:'first',text:'first text',risk:'Low',verifyMethod:'Test'})]]);
 expect(snapshot.elements.map(([name])=>name)).toEqual(['E']);expect(snapshot.relations).toEqual([]);
});

it('replays independent pending requirement/element buffers, map order, style early return, and repeated class effects against native methods',async()=>{
 const db=await native('requirementDiagram\n');
 const effects:RequirementEffect[]=[effect('setDirection','RL'),effect('setNewReqId','r-id'),effect('setNewElementType','worker'),effect('setNewReqText','r-text'),effect('setNewElementDocRef','doc'),
  effect('addElement','E'),effect('setNewElementType','colliding-element'),effect('addElement','R'),effect('setNewReqRisk','High'),effect('setNewReqVerifyMethod','Inspection'),effect('addRequirement','R','Functional Requirement'),
  effect('addRequirement','R2','Requirement'),effect('setClass',['R2'],['later']),effect('defineClass',['later'],['fill:#0f0']),effect('addRelationship','satisfies','R','E'),effect('addRelationship','traces','E','R'),effect('setCssStyle',['missing','R'],['fill:#bad','stroke:#111,fill:#222']),
  effect('setCssStyle',['R'],['stroke:#111,fill:#222']),effect('defineClass',['hot'],['fill:#f00,color:#fff']),effect('setClass',['R','E'],['hot']),
  effect('defineClass',['hot'],['stroke:#333']),effect('setClass',['R'],['hot'])];
 db.clear();apply(db,effects);const snapshot=captureRequirementDb(db);
 expect(reconcileRequirementDb(effects,snapshot)).toEqual(snapshot);
 expect(snapshot.requirements.map(([name])=>name)).toEqual(['R','R2']);expect(snapshot.elements.map(([name])=>name)).toEqual(['E','R']);
 expect(snapshot.requirements[1]![1]).toMatchObject({classes:['default','later'],cssStyles:['fill:#0f0']});
 expect(snapshot.relations).toEqual([{type:'satisfies',src:'R',dst:'E'},{type:'traces',src:'E',dst:'R'}]);
 expect(snapshot.requirements[0]![1]).toMatchObject({requirementId:'r-id',text:'r-text',risk:'High',verifyMethod:'Inspection',classes:['default','hot','hot']});
 expect(snapshot.requirements[0]![1].cssStyles).toEqual(['stroke:#111','fill:#222','fill:#f00,color:#fff','stroke:#333','fill:#f00,color:#fff','stroke:#333']);
 expect(snapshot.elements[0]![1].cssStyles).toEqual(['fill:#f00,color:#fff','stroke:#333']);
 expect(snapshot.classes).toEqual([
  ['later',{id:'later',styles:['fill:#0f0'],textStyles:[]}],
  ['hot',{id:'hot',styles:['fill:#f00,color:#fff','stroke:#333'],textStyles:['bgFill:#f00,color:#fff']}],
 ]);
});

it('clear keeps direction but resets pending buffers, maps, relations, and common metadata; captures are detached',async()=>{
 const db=await native('requirementDiagram\n');
 const effects:RequirementEffect[]=[effect('setDirection','BT'),effect('setDiagramTitle','title'),effect('setAccTitle','access'),effect('setAccDescription','description'),effect('setNewReqText','stale'),effect('setNewElementType','stale-type'),effect('addRequirement','old','Requirement'),effect('addElement','old-element'),effect('addRelationship','contains','old','old-element'),effect('clear'),effect('addRequirement','fresh','Requirement'),effect('addElement','fresh-element')];
 db.clear();apply(db,effects);const snapshot=captureRequirementDb(db);expect(reconcileRequirementDb(effects,snapshot)).toEqual(snapshot);
 expect(snapshot).toMatchObject({direction:'BT',title:'',accTitle:'',accDescr:'',requirements:[['fresh',expect.objectContaining({text:''})]],elements:[['fresh-element',expect.objectContaining({type:''})]],relations:[]});
 db.setNewReqText('later');db.addRequirement('later','Requirement');expect(snapshot.requirements.map(([name])=>name)).toEqual(['fresh']);
});

it('rejects forged snapshots and snapshots captured after getData layout mutation',async()=>{
 const db=await native('requirementDiagram\nrequirement R {\n text: body\n}\n');
 const effects:RequirementEffect[]=[effect('setNewReqText','body'),effect('addRequirement','R','Requirement')];
 const before=captureRequirementDb(db);expect(reconcileRequirementDb(effects,before)).toEqual(before);
 const forged=structuredClone(before);forged.requirements[0]![1].text='forged';expect(()=>reconcileRequirementDb(effects,forged)).toThrow(/Requirement native reconciliation/);
 db.getData();const after=captureRequirementDb(db);expect(()=>reconcileRequirementDb(effects,after)).toThrow(/Requirement native reconciliation/);
});
