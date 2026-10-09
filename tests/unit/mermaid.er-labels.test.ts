import {expect,it} from 'vitest';
import {extractERLabels} from '../../packages/core/src/mermaid/er-labels.ts';
import {mapFlowchartParserInput} from '../../packages/core/src/mermaid/flowchart-source.ts';
import {normalizeMermaidSource} from '../../packages/core/src/mermaid/rules.ts';

async function nativeEffects(original:string){
 const input=mapFlowchartParserInput(original,normalizeMermaidSource(original)).mermaidInput;
 // @ts-expect-error pinned native parser has no declarations.
 const {diagram}=await import('mermaid/dist/chunks/mermaid.core/erDiagram-OPXOYQCR.mjs');
 const parser=new diagram.parser.parser.Parser();parser.lexer=Object.create(diagram.parser.parser.lexer);parser.lexer.options={...diagram.parser.parser.lexer.options,ranges:true};
 const effects:Array<{method:string;args:unknown[]}>=[],methods=['addEntity','addAttributes','addRelationship','setClass','setAccTitle','setAccDescription','setDirection','addSubGraph','addClass','addCssStyles'];
 parser.yy={Cardinality:{ZERO_OR_ONE:'ZERO_OR_ONE',ZERO_OR_MORE:'ZERO_OR_MORE',ONE_OR_MORE:'ONE_OR_MORE',ONLY_ONE:'ONLY_ONE',MD_PARENT:'MD_PARENT'},Identification:{NON_IDENTIFYING:'NON_IDENTIFYING',IDENTIFYING:'IDENTIFYING'},...Object.fromEntries(methods.map(method=>[method,(...args:unknown[])=>{effects.push({method,args:structuredClone(args)});return method==='addSubGraph'?(args[0] as any).text.trim():undefined;}]))};
 parser.parse(input.text);return {parserSource:input.text,effects};
}
const trace=(value:{effects:readonly {method:string;args:readonly unknown[]}[]})=>value.effects.map(({method,args})=>({method,args}));

it('matches an independent native callback trace for aliases, classes, attributes and relations',async()=>{
 const source='erDiagram\nA["$$alias-a$$"] ::: hot {\n `$$matrix\\\\type$$`? `$$matrix\\\\name$$`\n string plain PK\n int keyed PK, FK\n bool commented "$$comment$$"\n uuid complete UK "$$comment-two$$"\n}\nB["$$alias-b$$"]\nA ||--o{ B : "$$role$$"\n';
 const [actual,native]=await Promise.all([extractERLabels(source),nativeEffects(source)]);
 expect(actual.parserSource).toBe(native.parserSource);expect(trace(actual)).toEqual(native.effects);
 expect(actual.records.filter(record=>record.semanticValue==='$$comment$$').map(record=>record.role)).toEqual(['attribute.comment']);
});

it('keeps duplicate equal-TeX owners, source-ordered attributes, and exact original spans',async()=>{
 const source='\uFEFF  erDiagram\r\n  %% removed $$comment$$\r\n  A["$$same$$"] {\r\n    string first "$$same$$"\r\n    string second "$$same$$"\r\n  }\r\n  A ||--o{ Ω : "$$same$$"\r\n';
 const result=await extractERLabels(source),same=result.records.filter(record=>record.semanticValue==='$$same$$');
 expect(same.map(record=>record.role)).toEqual(['entity.alias','attribute.comment','attribute.comment','relationship.role']);
 expect(new Set(same.map(record=>record.intervals[0]!.sourceStart))).toHaveLength(4);
 expect(result.records.filter(record=>record.role==='attribute.name').map(record=>record.semanticValue)).toEqual(['first','second']);
 for(const record of result.records)for(const interval of record.intervals)expect(source.slice(interval.sourceStart,interval.sourceEnd)).toBe(interval.rawSource);
});

it('matches native groups, nested direction, accessibility and relations before/after groups',async()=>{
 const source='erDiagram\ndirection LR\ng ||--o{ X : "$$before$$"\nsubgraph g[Multi Word]\n accTitle: $$access$$\n direction RL\n subgraph " inner id "[Inner]\n  A\n end\nend\nsubgraph h\n B\nend\ng ||--o{ h : "$$after$$"\n';
 const [actual,native]=await Promise.all([extractERLabels(source),nativeEffects(source)]);
 expect(trace(actual)).toEqual(native.effects);
 const title=actual.records.find(record=>record.role==='subgraph.title'&&record.semanticValue==='Multi Word')!;
 expect(title.synthetic).toBe(true);expect(title.intervals.map(interval=>interval.rawSource)).toEqual(['Multi','Word']);
 expect(actual.records.find(record=>record.role==='accTitle')!.semanticValue).toBe('$$access$$');
});

it('recovers through fresh parser construction after a failure',async()=>{
 await expect(extractERLabels('erDiagram\nA {\n string broken\n')).rejects.toThrow();
 await expect(extractERLabels('erDiagram\nA\n')).resolves.toMatchObject({parserSource:'erDiagram\nA\n\n'});
});
it('binds equal text to the owning callback and retains reversed native attribute references',async()=>{
 const source='erDiagram\nA["$$x$$"] {\n string first "$$x$$"\n string second "$$x$$"\n}\nA ||--o{ B : "$$x$$"\n';
 const found=await extractERLabels(source),owned=(method:string)=>found.effects.find(e=>e.method===method)!.recordIndices.map(i=>found.records[i]!);
 expect(owned('addEntity').map(r=>[r.role,r.intervals[0]!.sourceStart])).toEqual([['entity.name',source.indexOf('A[')],['entity.alias',source.indexOf('$$x$$')]]);
 expect(owned('addAttributes').filter(r=>r.role==='attribute.name').map(r=>r.semanticValue)).toEqual(['second','first']);
 expect(owned('addAttributes').filter(r=>r.role==='attribute.comment').map(r=>r.intervals[0]!.sourceStart)).toEqual([source.indexOf('$$x$$',source.indexOf('second')),source.indexOf('$$x$$',source.indexOf('first'))]);
 expect(owned('addRelationship').map(r=>r.role)).toEqual(['entity.name','entity.name','relationship.role']);
 expect(owned('addRelationship').at(-1)!.intervals[0]!.sourceStart).toBe(source.lastIndexOf('$$x$$'));
});
it('retains empty fields at their authored position',async()=>{
 const found=await extractERLabels('erDiagram\nA {\n string field ""\n}\naccDescr: final\n');
 expect(found.records.map(r=>[r.role,r.semanticValue])).toEqual([['entity.name','A'],['attribute.type','string'],['attribute.name','field'],['attribute.comment',''],['accDescr','final']]);
});
it('matches every declaration form and native style effects',async()=>{
 const source='erDiagram\nA\nB:::hot\nC {}\nD:::hot {}\nE[Alias]\nF[Alias]:::hot\nG[Alias] {}\nH[Alias]:::hot {}\nI[Alias] { string field }\nJ[Alias]:::hot { string field }\nclassDef hot fill:red,color:blue\nclass A,B hot\nstyle A fill:red\nA:::hot ||--o{ B:::hot : role\nC:::hot ||--o{ D : role\nE ||--o{ F:::hot : role\n';
 expect(trace(await extractERLabels(source))).toEqual((await nativeEffects(source)).effects);
});
it('leaves the shared native parser and lexer unchanged and freezes effect snapshots',async()=>{
 // @ts-expect-error pinned native parser has no declarations.
 const {diagram}=await import('mermaid/dist/chunks/mermaid.core/erDiagram-OPXOYQCR.mjs');
 const pinned=diagram.parser.parser,yy=pinned.yy,lexer=pinned.lexer,options=lexer.options,before=structuredClone(options),action=pinned.performAction;
 const found=await extractERLabels('erDiagram\nA { string field PK }\n');
 expect(pinned.yy).toBe(yy);expect(pinned.lexer).toBe(lexer);expect(lexer.options).toBe(options);expect(options).toEqual(before);expect(pinned.performAction).toBe(action);
 const attributes=found.effects.find(e=>e.method==='addAttributes')!;
 expect(Object.isFrozen(attributes.args)).toBe(true);expect(Object.isFrozen(attributes.args[1])).toBe(true);
 expect(Object.isFrozen((attributes.args[1] as any[])[0])).toBe(true);
});
