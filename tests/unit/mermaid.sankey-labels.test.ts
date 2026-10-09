import {expect,it} from 'vitest';
import {extractSankeyLabels,mapSankeyParserInput} from '../../packages/core/src/mermaid/sankey-labels.ts';

type NativeCall={method:'node'|'link';args:unknown[]};
async function nativeCalls(text:string):Promise<NativeCall[]> {
 // @ts-expect-error Mermaid's pinned parser has no declarations.
 const {diagram}=await import('mermaid/dist/chunks/mermaid.core/sankeyDiagram-IPEJSGJF.mjs');
 const pinned=diagram.parser.parser,parser=new pinned.Parser(),calls:NativeCall[]=[];
 parser.lexer=Object.create(pinned.lexer);parser.lexer.options={...pinned.lexer.options,ranges:true};
 parser.yy={findOrCreateNode:(name:string)=>{const node={name};calls.push({method:'node',args:[name,node]});return node;},addLink:(...args:unknown[])=>calls.push({method:'link',args})};
 parser.parse(text);return calls;
}

it('owns quoted CSV grammar fields, trims endpoints, unescapes doubled quotes, and preserves repeated origins',async()=>{
 const source='sankey-beta\n" A, A ","B ""quoted""",1.5\n"same",next,2\n"same",last,3\n';
 const found=await extractSankeyLabels(source);
 expect(found.records.map(record=>[record.rowIndex,record.role,record.semanticValue])).toEqual([[0,'source','A, A'],[0,'target','B "quoted"'],[1,'source','same'],[1,'target','next'],[2,'source','same'],[2,'target','last']]);
 expect(found.rows.map(row=>[row.sourceRecord,row.targetRecord,row.value,row.valueText.text])).toEqual([[1,2,1.5,'1.5'],[3,4,2,'2'],[5,6,3,'3']]);
 const repeated=found.records.filter(record=>record.semanticValue==='same');expect(repeated).toHaveLength(2);expect(repeated[0]!.intervals[0]!.startByte).not.toBe(repeated[1]!.intervals[0]!.startByte);
 const quoted=found.records[1]!;expect(quoted.mappedValue.text).toBe('B "quoted"');expect(quoted.intervals.map(interval=>interval.rawSource).join('')).toContain('""');
});

it('matches the pinned parser callback endpoints, values, and order independently',async()=>{
 const source='sankey-beta\na,b, 1.25junk\n"c,d",e,2\n';const input=mapSankeyParserInput(source),found=await extractSankeyLabels(source),calls=await nativeCalls(input.text);
 const expected=found.rows.flatMap(row=>{const sourceRecord=found.records[row.sourceRecord-1]!,targetRecord=found.records[row.targetRecord-1]!;return [[sourceRecord.semanticValue,targetRecord.semanticValue,row.value] as const];});
 const links=calls.filter(call=>call.method==='link').map(call=>[(call.args[0]as any).name,(call.args[1]as any).name,call.args[2]]);
 expect(links).toEqual(expected);expect(calls.map(call=>call.method)).toEqual(['node','node','link','node','node','link']);
});

it('maps BOM/CRLF/dedent/comments and collapses native quoted newlines without search-based provenance',async()=>{
 const original='\uFEFF  sankey-beta\r\n%% hidden,comment,9\r\n"same\r\nname",target,4\r\n"same\r\nname",other,5\r\n';
 const found=await extractSankeyLabels(original);expect(found.parserSource).not.toContain('hidden');expect(found.parserSource).not.toContain('\r');
 const sources=found.records.filter(record=>record.role==='source');expect(sources.map(record=>record.semanticValue)).toEqual(['same\nname','same\nname']);expect(sources[0]!.intervals[0]!.startByte).not.toBe(sources[1]!.intervals[0]!.startByte);
 for(const record of found.records)for(const interval of record.intervals)expect(original.slice(interval.sourceStart,interval.sourceEnd)).toBe(interval.rawSource);
});

it('rejects Unicode outside the native ASCII grammar, malformed CSV, and recovers in a later parse',async()=>{
 await expect(extractSankeyLabels('sankey-beta\n雪,b,1\n')).rejects.toThrow();
 await expect(extractSankeyLabels('sankey-beta\n"unterminated,b,1\n')).rejects.toThrow();
 const recovered=await extractSankeyLabels('sankey-beta\na,b,1\n');expect(recovered.rows).toMatchObject([{value:1}]);
});

it('uses native parseFloat value quirks while retaining the exact value field provenance',async()=>{
 const found=await extractSankeyLabels('sankey-beta\na,b, 1.5junk\nc,d,Infinity\ne,f,.25\n');
 expect(found.rows.map(row=>row.value)).toEqual([1.5,Infinity,.25]);expect(found.rows.map(row=>row.valueText.text)).toEqual([' 1.5junk','Infinity','.25']);
});

it('maps explicitly dedented fenced CSV without accepting indentation that native parsing rejects',async()=>{
 const original='\uFEFF  sankey\r\n  "$$a$$",b,1\r\n',rendered='sankey\n"$$a$$",b,1\n';
 const result=await extractSankeyLabels(original,rendered);expect(result.records[0]!.semanticValue).toBe('$$a$$');
 expect(result.records[0]!.intervals[0]!.rawSource).toBe('$$a$$');
 await expect(extractSankeyLabels(original)).rejects.toThrow();
});
