import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {registerHooks} from 'node:module';
import {fileURLToPath} from 'node:url';
import {erContractLoadHook} from '../../../scripts/mermaid-er-contract.mjs';
const native=process.argv.includes('--native');
if(!native)registerHooks({load:erContractLoadHook()});
const {extractERLabels}=await import('../../../packages/core/src/mermaid/er-labels.ts');
const {mapFlowchartParserInput}=await import('../../../packages/core/src/mermaid/flowchart-source.ts');
const {normalizeMermaidSource}=await import('../../../packages/core/src/mermaid/rules.ts');
const {diagram}=await import('../../../node_modules/mermaid/dist/chunks/mermaid.core/erDiagram-OPXOYQCR.mjs');
const trace=value=>value.effects.map(({method,args})=>({method,args}));
async function nativeTrace(source){
 const pinned=diagram.parser.parser,parser=new pinned.Parser();parser.lexer=Object.create(pinned.lexer);parser.lexer.options={...pinned.lexer.options,ranges:true};
 const effects=[],methods=['addEntity','addAttributes','addRelationship','setClass','setAccTitle','setAccDescription','setDirection','addSubGraph','addClass','addCssStyles'];
 parser.yy={Cardinality:{ZERO_OR_ONE:'ZERO_OR_ONE',ZERO_OR_MORE:'ZERO_OR_MORE',ONE_OR_MORE:'ONE_OR_MORE',ONLY_ONE:'ONLY_ONE',MD_PARENT:'MD_PARENT'},Identification:{NON_IDENTIFYING:'NON_IDENTIFYING',IDENTIFYING:'IDENTIFYING'},...Object.fromEntries(methods.map(method=>[method,(...args)=>{effects.push({method,args:structuredClone(args)});return method==='addSubGraph'?args[0].text.trim():undefined;}]))};
 parser.parse(mapFlowchartParserInput(source,normalizeMermaidSource(source)).mermaidInput.text);return effects;
}
const fraction=String.raw`$$\frac{a}{b}$$`,matrix=String.raw`$$\begin{matrix}a&b\\c&d\end{matrix}$$`,mixed=String.raw`before $$\mathbf{x}$$ and $$50\%$$ after`;
const unchanged=`erDiagram\nA[Ordinary] {\n string field "${fraction}"\n}\nA ||--|| B : "${fraction}"\n`;
const serialize=value=>({effects:trace(value),records:value.records.map(({role,semanticValue,intervals})=>({role,semanticValue,intervals}))});
const unchangedResult=serialize(await extractERLabels(unchanged));
assert.deepEqual(unchangedResult.effects,await nativeTrace(unchanged));
if(native){console.log(JSON.stringify(unchangedResult));process.exit(0);}
const previous=JSON.parse(execFileSync(process.execPath,[fileURLToPath(import.meta.url),'--native'],{encoding:'utf8',timeout:30000}));
assert.deepEqual(unchangedResult,previous);
const cases=[
 `erDiagram\nA["${fraction}"]\n`,
 `erDiagram\nA["${matrix}"]\n`,
 `erDiagram\nA["${mixed}"]\n`,
 `erDiagram\nA["before\u2028 ${fraction} after\u2029"]\n`,
 `erDiagram\n"${fraction}"\n`,
 `erDiagram\n"${fraction}" ||--|| B : role\n`,
 `erDiagram\nsubgraph g["${fraction}"]\n A\nend\n`,
 `erDiagram\nsubgraph "${fraction}"\n A\nend\n`,
 `\uFEFFerDiagram\r\n%% 😀 source before label\r\nA["${fraction}"]\r\n`,
];
for(const source of cases){
 const collected=await extractERLabels(source);assert.deepEqual(trace(collected),await nativeTrace(source));
 const records=collected.records.filter(record=>record.semanticValue.includes('\\'));assert.ok(records.length>0);
 for(const record of records){
  const raw=record.intervals.map(interval=>interval.rawSource).join('');assert.equal(raw,record.semanticValue);
  for(const interval of record.intervals)assert.equal(source.slice(interval.sourceStart,interval.sourceEnd),interval.rawSource);
 }
}
for(const interior of [String.raw`$$\frac{a}`+'\u2028'+String.raw`{b}$$`,String.raw`$$\frac{a}`+'\u2029'+String.raw`{b}$$`,String.raw`C:\path`,String.raw`\outside $$x$$`,String.raw`prose% $$\frac ab$$`,String.raw`$$\frac ab`,String.raw`$$\frac ab$$`+'\nnext',String.raw`$$\frac ab$$`+'\rnext',String.raw`$$\frac ab$$`+'\vnext',String.raw`$$\frac ab$$`+'\bnext']){
 await assert.rejects(extractERLabels(`erDiagram\nA["${interior}"]\n`));
}
// Exercise the native completion receipt and located authored math validator,
// not just lexical acceptance or a stand-alone KaTeX call.
const DOMPurify=(await import('dompurify')).default,{JSDOM}=await import('jsdom'),window=new JSDOM('').window,purifier=DOMPurify(window);
Object.assign(DOMPurify,{sanitize:purifier.sanitize,addHook:purifier.addHook});
const mermaid=(await import('mermaid')).default,{installERNodeDb}=await import('../../../packages/core/src/mermaid/er-node-db.ts'),{reconcileERNodeState}=await import('../../../packages/core/src/mermaid/er-node-state.ts');
await installERNodeDb();
for(const htmlLabels of [true,false]){
 mermaid.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels});
 for(const source of cases.slice(0,3)){
  const drawing=await mermaid.mermaidAPI.getDiagramFromText(source),state=await reconcileERNodeState(drawing.db,drawing.text,source);
  assert.ok(state.math.total.occurrences>0);assert.ok(state.labels.records.some(record=>record.role==='entity.alias'&&record.semanticValue.includes('\\')));
 }
 const source=String.raw`erDiagram
A["$$\href{x}{y}$$"]
`;
 const drawing=await mermaid.mermaidAPI.getDiagramFromText(source);
 await assert.rejects(reconcileERNodeState(drawing.db,drawing.text,source),error=>{assert.match(error.message,/unsupported TeX/);assert.equal(error.role,'entity.alias');assert.equal(error.startLine,2);assert.equal(error.intervals[0].sourceStart,source.indexOf('$$'));return true;});
}
window.close();console.log(JSON.stringify({admitted:cases.length,rejected:10,nativeRoleAndCommentParity:true,receiptModes:2,forbiddenLocated:true}));
