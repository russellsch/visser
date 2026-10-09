import {afterAll,beforeAll,expect,it} from 'vitest';
import DOMPurify from 'dompurify';
// @ts-expect-error test DOM shim.
import {JSDOM} from 'jsdom';
import {extractERLabels} from '../../packages/core/src/mermaid/er-labels.ts';
import {normalizeERDbEffects} from '../../packages/core/src/mermaid/er-db-effects.ts';
import {captureERDb,replayERDb} from '../../packages/core/src/mermaid/er-db.ts';
const window=new JSDOM('').window,descriptors:Record<string,PropertyDescriptor|undefined>={};
beforeAll(()=>{for(const key of ['sanitize','addHook'])descriptors[key]=Object.getOwnPropertyDescriptor(DOMPurify,key);const instance=DOMPurify(window as any);Object.assign(DOMPurify,{sanitize:instance.sanitize,addHook:instance.addHook});});
afterAll(()=>{for(const key of ['sanitize','addHook'])if(descriptors[key])Object.defineProperty(DOMPurify,key,descriptors[key]!);else Reflect.deleteProperty(DOMPurify,key);window.close();});
async function native(source:string){
 const mermaid=(await import('mermaid')).default;
 const diagram=await mermaid.mermaidAPI.getDiagramFromText(source),db=diagram.db;
 return {db,snapshot:captureERDb(db)};
}
it('normalizes only DB-owned field effects while preserving native stored-state parity',async()=>{const mermaid=(await import('mermaid')).default;for(const htmlLabels of [true,false]){mermaid.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels});const source='erDiagram\naccTitle: $$x&lt;y$$ &amp;\naccTitle: $$new$$<br> tail\naccDescr {a\n\n\u00a0 b}\nsubgraph g["  Group<br> &amp;  "]\n A[Alias] {\n  string name PK "comment"\n }\nend\ng ||--o{ B : role\n';const labels=await extractERLabels(source),before=structuredClone(labels.effects),normalized=await normalizeERDbEffects(labels,htmlLabels),actual=await native(source);expect(labels.effects).toEqual(before);expect(replayERDb(normalized.effects,{look:(actual.snapshot.entities[0]![1] as {look:string}).look})).toEqual(actual.snapshot);expect(normalized.fields.map(field=>field.recordIndex)).toEqual(labels.records.filter(r=>['subgraph.title','accTitle','accDescr'].includes(r.role)).map(r=>r.recordIndex));expect(Object.isFrozen(normalized.effects)).toBe(true);}});
it('rejects missing, duplicate, wrong-role and mismatched DB owners',async()=>{const labels:any=await extractERLabels('erDiagram\naccTitle: x\nA\n');for(const mutate of [(e:any)=>e.recordIndices=[],(e:any)=>e.recordIndices=[0,0],(e:any)=>e.recordIndices=[labels.records.findIndex((r:any)=>r.role==='entity.name')],(e:any)=>e.args[0]='forged']){const bad={...labels,effects:structuredClone(labels.effects)},effect=bad.effects.find((e:any)=>e.method==='setAccTitle');mutate(effect);await expect(normalizeERDbEffects(bad,true)).rejects.toThrow(/owner|field|requires|wrong|repeated/i);}});

it('preserves shared argument objects while detaching and freezing the complete graph',async()=>{
 const labels=await extractERLabels('erDiagram\nA\nB\n');
 const row={type:'string',name:'field'};
 const effects=[...labels.effects,{method:'addAttributes',args:['A',[row]],recordIndices:[]},{method:'addAttributes',args:['B',[row]],recordIndices:[]}];
 const result=await normalizeERDbEffects({...labels,effects},false);
 const first=(result.effects.at(-2)!.args[1] as any[])[0],second=(result.effects.at(-1)!.args[1] as any[])[0];
 expect(first).toBe(second);expect(first).not.toBe(row);expect(Object.isFrozen(first)).toBe(true);
 expect(row).toEqual({type:'string',name:'field'});
 const replay=replayERDb(result.effects,{look:'default'});
 expect((replay.entities[0]![1] as any).attributes[0]).toBe((replay.entities[1]![1] as any).attributes[0]);
});
