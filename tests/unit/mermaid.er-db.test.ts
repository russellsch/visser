import {expect,it} from 'vitest';
import {beforeAll,afterAll} from 'vitest';
import DOMPurify from 'dompurify';
// @ts-expect-error test-only DOM shim.
import {JSDOM} from 'jsdom';
import {captureERDb,reconcileERDb,replayERDb} from '../../packages/core/src/mermaid/er-db.ts';
import {extractERLabels} from '../../packages/core/src/mermaid/er-labels.ts';
const descriptors:Record<string,PropertyDescriptor|undefined>={};
beforeAll(()=>{for(const key of ['sanitize','addHook'])descriptors[key]=Object.getOwnPropertyDescriptor(DOMPurify,key);const instance=DOMPurify(new JSDOM('').window as any);Object.assign(DOMPurify,{sanitize:instance.sanitize,addHook:instance.addHook});});
afterAll(()=>{for(const key of ['sanitize','addHook'])if(descriptors[key])Object.defineProperty(DOMPurify,key,descriptors[key]!);else Reflect.deleteProperty(DOMPurify,key);});
async function native(source:string){
 // @ts-expect-error private pinned parser.
 const {diagram}=await import('mermaid/dist/chunks/mermaid.core/erDiagram-OPXOYQCR.mjs'),db=diagram.db,parser=new diagram.parser.parser.Parser();parser.lexer=Object.create(diagram.parser.parser.lexer);parser.yy=db;parser.parse(source);return {db,snapshot:captureERDb(db)};
}
async function parity(source:string){const [labels,actual]=await Promise.all([extractERLabels(source),native(source)]);return {labels,actual,replay:replayERDb(labels.effects,{look:actual.db.getEntity('A')?.look??'default'})};}
it('replays entities, reverse attribute batches, groups and endpoints without mutating effects',()=>{
 const effects:any=[{method:'addEntity',args:['A','alias']},{method:'addAttributes',args:['A',[{type:'a',name:'first'},{type:'b',name:'second',keys:['PK']}]]},{method:'addSubGraph',args:[{text:' g '},['A',{stmt:'dir',value:'LR'}],{text:' Group '}]} ,{method:'addRelationship',args:['g','role','A',{cardA:'ONE_OR_MORE',cardB:'ONLY_ONE',relType:'IDENTIFYING'}]}];
 const original=structuredClone(effects),snapshot:any=replayERDb(effects,{look:'default'});
 expect(effects).toEqual(original);expect(snapshot.entities[0][1].attributes.map((row:any)=>row.name)).toEqual(['second','first']);expect(snapshot.subGraphs[0]).toMatchObject({id:'g',nodes:['A'],title:'Group',dir:'LR'});expect(snapshot.relationships[0]).toMatchObject({entityA:'g',entityB:'entity-A-0'});
});
it('retains direction through clear and rejects unknown effects',()=>{
 expect(replayERDb([{method:'setDirection',args:['RL']},{method:'clear',args:[]}],{look:'handDrawn'}).direction).toBe('RL');
 expect(()=>replayERDb([{method:'wat',args:[]}],{look:'default'})).toThrow(/unknown/);
});
it('matches native stored state for aliases, attributes, classes/styles and relationship creation',async()=>{
 const source='erDiagram\nA[Alias] ::: c {\n string first PK\n int second FK "comment"\n}\nB\nclassDef c fill:red,color:blue\nstyle A fill:green\nA ||--o{ B : role\n';
 const {actual,replay}=await parity(source);expect(replay).toEqual(actual.snapshot);
});
it('matches duplicate groups, earlier membership, nested directions, and relations before/after groups',async()=>{
 const source='erDiagram\ng ||--o{ X : before\nsubgraph g[First]\n direction LR\n A\n subgraph inner[Inner]\n  direction RL\n  B\n end\nend\nsubgraph g[Second]\n A\n C\nend\ng ||--o{ C : after\n';
 const {actual,replay}=await parity(source);expect(replay).toEqual(actual.snapshot);
});
it('captures detached state and rejects coherent lookup/input-shape tampering',async()=>{
 const {snapshot}=await native('erDiagram\nA\n');const copy=structuredClone(snapshot);(copy.entities[0]![1] as any).label='changed';expect((snapshot.entities[0]![1] as any).label).toBe('A');
 const forged:any=structuredClone(snapshot);forged.subGraphLookup=[['x',{id:'x'}]];expect(()=>reconcileERDb([],forged,{look:'default'})).toThrow();
 expect(()=>replayERDb([{method:'addEntity',args:[3]}] as any,{look:'default'})).toThrow();expect(()=>replayERDb([],{} as any)).toThrow();expect(()=>replayERDb([],{look:'default',initialDirection:3} as any)).toThrow();
});
it('rejects equal-valued group lookup copies that destroy native object sharing',async()=>{
 const source='erDiagram\nsubgraph g[Group]\n A\nend\n';
 const {labels,actual}=await parity(source),options={look:actual.db.getEntity('A').look};
 expect(()=>reconcileERDb(labels.effects,actual.snapshot,options)).not.toThrow();
 const forged:any=structuredClone(actual.snapshot);forged.subGraphLookup[0][1]=structuredClone(forged.subGraphLookup[0][1]);
 expect(forged).toEqual(actual.snapshot);expect(()=>reconcileERDb(labels.effects,forged,options)).toThrow(/aliases/);
});
it('preserves shared attribute and relation-spec objects without mutating caller effects',async()=>{
 const row={type:'string',name:'same'},spec={cardA:'ONLY_ONE',cardB:'ZERO_OR_MORE',relType:'IDENTIFYING'};
 const effects:any=[{method:'addAttributes',args:['A',[row,row]]},{method:'addRelationship',args:['A','one','B',spec]},{method:'addRelationship',args:['A','two','B',spec]}];
 const original=structuredClone(effects),{db}=await native('erDiagram\n');
 for(const effect of structuredClone(effects))db[effect.method](...effect.args);
 const snapshot:any=captureERDb(db),options={look:db.getEntity('A').look},replay:any=replayERDb(effects,options);
 expect(replay).toEqual(snapshot);expect(effects).toEqual(original);
 expect(replay.entities[0][1].attributes[0]).toBe(replay.entities[0][1].attributes[1]);
 expect(replay.relationships[0].relSpec).toBe(replay.relationships[1].relSpec);
 const forged=structuredClone(snapshot);forged.relationships[1].relSpec=structuredClone(forged.relationships[1].relSpec);
 expect(()=>reconcileERDb(effects,forged,options)).toThrow(/aliases/);
 db.clear();expect(snapshot.entities).toHaveLength(2);
});
it('rejects missing or wrongly typed arguments rather than string-coercing them',()=>{
 for(const effect of [{method:'setDirection',args:[]},{method:'setAccTitle',args:[3]},{method:'addEntity',args:[{}]},{method:'addAttributes',args:['A',[{type:'int',name:3}]]},{method:'addClass',args:[['A'],[3]]},{method:'addRelationship',args:['A','r','B',{cardA:3,cardB:'ONLY_ONE',relType:'IDENTIFYING'}]}])
  expect(()=>replayERDb([effect],{look:'default'})).toThrow();
});
