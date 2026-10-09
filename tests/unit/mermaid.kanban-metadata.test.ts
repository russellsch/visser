import { expect, it } from 'vitest';
import { decodeKanbanMetadata } from '../../packages/core/src/mermaid/kanban-metadata.ts';
import { ProvenanceText } from '../../packages/core/src/mermaid/source-provenance.ts';
import { MermaidSourceCoordinates } from '../../packages/core/src/mermaid/source-coordinates.ts';
import { extractKanbanLabels } from '../../packages/core/src/mermaid/kanban-labels.ts';

const decode=(text:string)=>decodeKanbanMetadata(ProvenanceText.identity(text));
const field=(text:string,name='label')=>decode(text).fields.find(item=>item.name===name)!;

it('keeps all authored recognized fields, typed truthiness and native scalar coercion',()=>{
 const result=decode('label: false, assigned: 0, ticket: "", priority: null, shape: ""');
 expect(result.fields.map(f=>[f.name,f.value,f.active])).toEqual([['label',false,false],['assigned',0,false],['ticket','',false],['priority',null,false],['shape','',false]]);
 for(const [source,name,want]of [['label: 42','label','42'],['assigned: true','assigned','true'],['ticket: 1.25','ticket','1.25']]as const){
  const found=field(source,name);expect(found.active).toBe(true);expect(found.mappedValue!.text).toBe(want);
 }
});

it('retains literal scalar, YAML escape and alias-definition provenance',()=>{
 const source=String.raw`base: &name "\u0024\u0024x\u0024\u0024", label: *name, assigned: "$$x$$", ticket: *name`;
 const found=decode(source),label=found.fields.find(f=>f.name==='label')!.mappedValue!,assigned=found.fields.find(f=>f.name==='assigned')!.mappedValue!,ticket=found.fields.find(f=>f.name==='ticket')!.mappedValue!;
 expect(label.text).toBe('$$x$$');expect(assigned.text).toBe('$$x$$');expect(ticket.text).toBe('$$x$$');
 const coordinates=new MermaidSourceCoordinates(source),span=(value:ProvenanceText)=>coordinates.locateRange(value,0,value.length);
 expect(span(label).intervals[0]!.rawSource).toBe(String.raw`\u0024\u0024x\u0024\u0024`);
 expect(span(label)).toEqual(span(ticket));expect(span(label).intervals[0]!.startByte).toBeLessThan(span(assigned).intervals[0]!.startByte);
});

it('maps nested arrays with native comma joins and synthetic separators, without first-item truncation',()=>{
 const source='label: ["$$x$$", ["$$x$$", null, true], 42, {plain: text}], assigned: [A, B], ticket: [1, 2]';
 const result=decode(source),label=result.fields.find(f=>f.name==='label')!.mappedValue!;
 expect(label.text).toBe('$$x$$,$$x$$,,true,42,[object Object]');
 expect(result.fields.find(f=>f.name==='assigned')!.mappedValue!.text).toBe('A,B');expect(result.fields.find(f=>f.name==='ticket')!.mappedValue!.text).toBe('1,2');
 const coordinates=new MermaidSourceCoordinates(source),first=coordinates.locateRange(label,0,5),second=coordinates.locateRange(label,6,11);
 expect(first.intervals[0]!.rawSource).toBe('$$x$$');expect(second.intervals[0]!.rawSource).toBe('$$x$$');expect(first.intervals[0]!.startByte).toBeLessThan(second.intervals[0]!.startByte);
 expect(label.originAt(5).synthetic).toBe(true);expect(label.originAt(label.text.indexOf('[object Object]')).synthetic).toBe(true);
});

it('coerces cyclic and repeated array aliases with native active-path semantics',()=>{
 for(const source of ['base: &a ["$$x$$", *a, "$$y$$"], label: *a','base: &a ["$$x$$"], label: [*a, *a]']){
  const result=decode(source),value=(result.value as any).label,selected=result.fields.find(f=>f.name==='label')!.mappedValue!;
  expect(selected.text).toBe(value.toString());
 }
 const repeated=field('base: &a ["$$x$$"], label: [*a, *a]').mappedValue!;
 expect(repeated.text).toBe('$$x$$,$$x$$');expect(repeated.mapRange(0,5)).toEqual(repeated.mapRange(6,11));
});

it('retains opaque priority and shape types without inventing visible labels',()=>{
 const result=decode('priority: ["$$hidden$$"], shape: kanbanitem');
 expect(result.fields.map(f=>[f.name,f.active])).toEqual([['priority',true],['shape',true]]);
 expect(result.fields.every(f=>f.mappedValue===undefined)).toBe(true);
 expect(()=>decode('shape: kanbanItem')).toThrow();expect(()=>decode('shape: 42')).toThrow();
});

it('rejects decoded forbidden keys, native-incompatible coercion and invalid YAML without a silent fallback',()=>{
 for(const source of [String.raw`"\u0069con": fa:user`, '"img": somewhere'])expect(()=>decode(source)).toThrow(/not allowed|unsafe|forbid/i);
 expect(()=>decode('label: {toString: bad}')).toThrow();expect(()=>decode('assigned: {toString: null}')).toThrow();
 expect(()=>decode('label: [unterminated')).toThrow();expect(()=>decode('label: first, label: second')).toThrow();
 expect(()=>decode('\nnull\n')).toThrow();expect(()=>decode('\n\n')).toThrow();
 expect(field('label: recovered').mappedValue!.text).toBe('recovered');
});

it('composes original fence mapping with lexer metadata normalization and YAML escape decoding',async()=>{
 const original='\uFEFF  kanban\r\n  col[Column]\r\n    item@{label: "雪\r\n      $$x$$", assigned: "$$x$$"}\r\n';
 const shown='kanban\ncol[Column]\n  item@{label: "雪\n    $$x$$", assigned: "$$x$$"}\n';
 const nodes=await extractKanbanLabels(original,shown),result=decodeKanbanMetadata(nodes.nodes[1]!.shapeData!);
 const label=result.fields.find(f=>f.name==='label')!.mappedValue!,assigned=result.fields.find(f=>f.name==='assigned')!.mappedValue!;
 expect(label.text).toBe('雪<br/>$$x$$');expect(assigned.text).toBe('$$x$$');
 const coordinates=new MermaidSourceCoordinates(original),start=label.text.indexOf('$$x$$'),first=coordinates.locateRange(label,start,start+5).intervals[0]!,second=coordinates.locateRange(assigned,0,5).intervals[0]!;
 expect(first.rawSource).toBe('$$x$$');expect(second.rawSource).toBe('$$x$$');expect(first.startByte).toBeLessThan(second.startByte);
 expect(Buffer.from(original).subarray(first.startByte,first.endByte).toString()).toBe('$$x$$');
});

it('marks equations assembled across array elements as synthetic without inventing contiguous source',()=>{
 const source='label: ["$$x", "y$$"]',mapped=field(source).mappedValue!;
 expect(mapped.text).toBe('$$x,y$$');
 const located=new MermaidSourceCoordinates(source).locateRange(mapped,0,mapped.length);
 expect(located.synthetic).toBe(true);expect(located.intervals.map(span=>span.rawSource)).toEqual(['$$x','y$$']);
});

it('matches native string conversion over a fixed nested typed corpus',()=>{
 const values=[[],[null],[''],['$$x$$',false,0,null],[['$$x$$'],['$$y$$',null]],{plain:'$$hidden$$'},true,42,0.125];
 for(const value of values){
  const raw=`label: ${JSON.stringify(value)}, assigned: ${JSON.stringify(value)}, ticket: ${JSON.stringify(value)}`;
  const found=decode(raw);
  for(const current of found.fields){expect(current.active).toBe(Boolean(value));if(current.active)expect(current.mappedValue!.text).toBe(value.toString());}
 }
});

it('accepts native empty block-sequence slots without requiring nonexistent scalar provenance',()=>{
 const raw='label:\n - "$$x$$"\n -\n - "$$y$$"\n',selected=field(raw).mappedValue!;
 expect(selected.text).toBe('$$x$$,,$$y$$');
 const origins=new MermaidSourceCoordinates(raw).locateRange(selected,0,selected.length);
 expect(origins.synthetic).toBe(true);expect(origins.intervals.map(span=>span.rawSource)).toEqual(['$$x$$','$$y$$']);
});

function aliasDag(base:string,depth:number,extraEmpty=false):string {
 const rows=[`a0: &a0 ${JSON.stringify(base)}`];
 for(let i=1;i<=depth;i++)rows.push(`a${i}: &a${i} [*a${i-1}, *a${i-1}]`);
 rows.push(`label: ${extraEmpty?`[*a${depth}, ""]`:`*a${depth}`}`);return rows.join('\n')+'\n';
}
it('enforces the existing expanded UTF-8 label bound incrementally across alias DAGs',()=>{
 const near=field(aliasDag('x',15)).mappedValue!,exact=field(aliasDag('x',15,true)).mappedValue!;
 expect(Buffer.byteLength(near.text)).toBe(65535);expect(Buffer.byteLength(exact.text)).toBe(65536);
 expect(()=>decode(aliasDag('x',16))).toThrow(expect.objectContaining({code:'E_MATH_EXPRESSION_LIMIT'}));
 const unicode=field(aliasDag('雪',14,true)).mappedValue!;
 expect(Buffer.byteLength(unicode.text)).toBe(65536);expect(unicode.length).toBeLessThan(65536);
 expect(()=>decode(aliasDag('雪',15))).toThrow(expect.objectContaining({code:'E_MATH_EXPRESSION_LIMIT'}));
 const astral=field(aliasDag('😀abc',13,true)).mappedValue!;expect(Buffer.byteLength(astral.text)).toBe(65536);
 expect(()=>decode(aliasDag('😀abc',14))).toThrow(expect.objectContaining({code:'E_MATH_EXPRESSION_LIMIT'}));
 expect(field('label: recovered').mappedValue!.text).toBe('recovered');
});
