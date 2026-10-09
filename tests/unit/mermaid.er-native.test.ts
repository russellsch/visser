import {beforeAll,afterAll,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import DOMPurify from 'dompurify';
// @ts-expect-error test-only jsdom has no declarations.
import {JSDOM} from 'jsdom';
const descriptors:Record<string,PropertyDescriptor|undefined>={};
beforeAll(()=>{for(const key of ['sanitize','addHook'])descriptors[key]=Object.getOwnPropertyDescriptor(DOMPurify,key);const instance=DOMPurify(new JSDOM('').window as any);Object.assign(DOMPurify,{sanitize:instance.sanitize,addHook:instance.addHook});});
afterAll(()=>{for(const key of ['sanitize','addHook'])if(descriptors[key])Object.defineProperty(DOMPurify,key,descriptors[key]!);else Reflect.deleteProperty(DOMPurify,key);});
async function parsed(source:string){
 // @ts-expect-error pinned native artifact has no declarations.
 const {diagram}=await import('mermaid/dist/chunks/mermaid.core/erDiagram-OPXOYQCR.mjs');
 const db=diagram.db,parser=new diagram.parser.parser.Parser();parser.lexer=Object.create(diagram.parser.parser.lexer);parser.yy=db;parser.parse(source);return db;
}
it('pins ER semantics to the reviewed native artifact',()=>{
 const source=readFileSync('node_modules/mermaid/dist/chunks/mermaid.core/erDiagram-OPXOYQCR.mjs');
 expect(createHash('sha256').update(source).digest('hex')).toBe('1437bfbd601358cd7f2e54d540410bdebc9bdd38131300d16c49705811f9de49');
});
it('keeps the first nonempty alias and restores authored attribute order per declaration',async()=>{
 const db=await parsed('erDiagram\nA\nA["$$alias$$"] {\n string first "$$one$$"\n int second PK, FK "$$two$$"\n}\nA["$$hidden$$"] {\n bool third\n}\n');
 const entity=db.getEntity('A');
 expect(entity.alias).toBe('$$alias$$');expect(entity.label).toBe('A');
 expect(entity.attributes).toEqual([{type:'string',name:'first',keys:[],comment:'$$one$$'},{type:'int',name:'second',keys:['PK','FK'],comment:'$$two$$'},{type:'bool',name:'third',keys:[],comment:''}]);
});
it('preserves repeated relationship roles and actual title/accessibility parser behavior',async()=>{
 const db=await parsed('erDiagram\naccTitle: $$access$$\naccDescr: $$description$$\nA ||--o{ B : "$$first$$"\nA ||--o{ B : "$$second$$"\n');
 expect(db.getRelationships().map((r:any)=>r.roleA)).toEqual(['$$first$$','$$second$$']);
 expect(db.getAccTitle()).toBe('$$access$$');expect(db.getAccDescription()).toBe('$$description$$');expect(db.getDiagramTitle()).toBe('');
 await expect(parsed('erDiagram\ntitle $$title$$\nA\n')).rejects.toThrow(/Parse error/);
});
it('keeps entities detached across fresh DBs while common accessibility state is global',async()=>{
 const first=await parsed('erDiagram\naccTitle: first\nA\n');const second=await parsed('erDiagram\naccTitle: second\nB\n');
 expect([...first.getEntities().keys()]).toEqual(['A']);expect([...second.getEntities().keys()]).toEqual(['B']);expect(first.getAccTitle()).toBe('second');
});
it('records native group membership, group titles and local direction',async()=>{
 const db=await parsed('erDiagram\nsubgraph g["Group $$g$$"]\ndirection LR\nA\nB\nend\nA ||--o{ B : "$$role$$"\n');
 expect(db.getSubGraphs()).toMatchObject([{id:'g',title:'Group $$g$$',nodes:['A','B'],dir:'LR'}]);expect(db.getDirection()).toBe('TB');
});
it('retains direction through clear and resolves duplicate groups at relationship insertion time',async()=>{
 const db=await parsed('erDiagram\ndirection LR\nsubgraph g[First]\nA\nend\nsubgraph g[Second]\nB\nend\ng ||--o{ C : first\n');
 expect(db.getSubGraphs().map((g:any)=>[g.id,g.title,g.nodes])).toEqual([['g','First',['A']],['g','Second',['B']]]);
 expect(db.getRelationships()[0].entityA).toBe('g');
 expect(db.getEntity('g').id).not.toBe('g');
 db.clear();expect(db.getDirection()).toBe('LR');expect(db.getSubGraphs()).toEqual([]);expect(db.getRelationships()).toEqual([]);
});
it('retains native accessibility statement values in group membership',async()=>{
 const db=await parsed('erDiagram\nsubgraph g[Group]\naccTitle: $$access$$\nA[Alias]\nend\n');
 expect(db.getSubGraphs()[0].nodes).toEqual(['$$access$$','A']);
 expect([...db.getEntities().keys()]).toEqual(['A']);
});
