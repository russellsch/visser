import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {expect,it} from 'vitest';

it('enforces Radar parser/native markers and protects native parse lifecycle state in isolated source workers',()=>{
 const root=process.cwd(),dir=mkdtempSync(join(tmpdir(),'visser-radar-node-db-')),url=(path:string)=>pathToFileURL(resolve(path)).href;
 const nodeDb=url('packages/core/src/mermaid/radar-node-db.ts'),nodeMath=url('packages/core/src/mermaid/radar-node-math.ts'),stub=url('packages/core/src/mermaid/dompurify-stub.ts'),parserHook=url('scripts/mermaid-radar-parser-contract.mjs'),nativeHook=url('scripts/mermaid-radar-contract.mjs'),chunk=url('node_modules/mermaid/dist/chunks/mermaid.core/diagram-MPIPVDR6.mjs'),mermaid=url('node_modules/mermaid/dist/mermaid.core.mjs');
 const source='radar-beta\ntitle $$a < b$$<br/>\naccTitle: $$access$$<br/>\naxis a["$$a < b$$<br/>"],b\ncurve c["&dollar;&dollar;literal&dollar;&dollar;<br/>"]{1,2}\n',invalid='radar-beta\naxis a["broken"]\ncurve c {1,}\n',recovered='radar-beta\naxis next["$$next$$"]\ncurve c {1}\n';
 const missingParser='import assert from "node:assert/strict";const {installRadarNodeDb}=await import('+JSON.stringify(nodeDb)+');await assert.rejects(installRadarNodeDb(),/parser contract patch is missing/);console.log("parser missing");';
 const missingNative=['import assert from "node:assert/strict";import {registerHooks} from "node:module";','import {radarParserContractLoadHook} from '+JSON.stringify(parserHook)+';','registerHooks({load:radarParserContractLoadHook(),resolve(specifier,context,next){return specifier==="dompurify"?{url:'+JSON.stringify(stub)+',shortCircuit:true}:next(specifier,context);}});','const {installRadarNodeDb}=await import('+JSON.stringify(nodeDb)+');','await assert.rejects(installRadarNodeDb(),/native contract patch is missing/);console.log("native missing");'].join('\n');
 const ready=[
  'import assert from "node:assert/strict";import {registerHooks} from "node:module";',
  'import {radarParserContractLoadHook} from '+JSON.stringify(parserHook)+';',
  'import {radarContractLoadHook} from '+JSON.stringify(nativeHook)+';',
  'registerHooks({load:radarParserContractLoadHook()});',
  'registerHooks({load:radarContractLoadHook(),resolve(specifier,context,next){return specifier==="dompurify"?{url:'+JSON.stringify(stub)+',shortCircuit:true}:next(specifier,context);}});',
  'const {installRadarNodeDb,captureRadarNodeState}=await import('+JSON.stringify(nodeDb)+');',
  'const {extractRadarNodeMath}=await import('+JSON.stringify(nodeMath)+');',
  'const stubModule=await import('+JSON.stringify(stub)+'),originalSanitize=stubModule.default.sanitize;',
  'await Promise.all([installRadarNodeDb(),installRadarNodeDb()]);',
  'const module=await import('+JSON.stringify(chunk)+'),db=module.diagram.db,parser=module.diagram.parser;',
  'assert.throws(()=>captureRadarNodeState(db),/no completed native parse state/);assert.throws(()=>captureRadarNodeState({}),/no completed native parse state/);',
  'const source='+JSON.stringify(source)+';',
  'await assert.rejects(parser.parse(source),/fresh native clear/);db.clear();const pendingParse=parser.parse(source);assert.throws(()=>captureRadarNodeState(db),/no completed native parse state/);await assert.rejects(parser.parse(source),/overlapping native parse/);await pendingParse;',
  'const first=captureRadarNodeState(db);assert.deepEqual(captureRadarNodeState(db),first);await assert.rejects(parser.parse(source),/fresh native clear/);assert.throws(()=>captureRadarNodeState(db),/no completed native parse state/);db.clear();await parser.parse(source);const captured=captureRadarNodeState(db);assert.notEqual(captured.title,captured.axes[0].label);assert.equal(captured.axes[0].label,"$$a < b$$<br/>");assert.equal(captured.curves[0].label,"&dollar;&dollar;literal&dollar;&dollar;<br/>");assert.equal(stubModule.default.sanitize,originalSanitize);',
  'const planned=extractRadarNodeMath(source,source,db);db.clear();const detached=await planned;assert.equal(detached.snapshot.axes[0].label,"$$a < b$$<br/>");assert.equal(detached.slots.some(slot=>slot.key==="axis:0"),true);assert.equal(captured.axes[0].label,"$$a < b$$<br/>");',
  'const invalid='+JSON.stringify(invalid)+';db.clear();await assert.rejects(parser.parse(invalid));assert.throws(()=>captureRadarNodeState(db),/no completed native parse state/);await assert.rejects(parser.parse(source),/fresh native clear/);assert.throws(()=>captureRadarNodeState(db),/no completed native parse state/);',
  'db.clear();const interrupted=parser.parse(source);db.clear();await assert.rejects(interrupted,/cleared during parse/);await assert.rejects(parser.parse(source),/fresh native clear/);',
  'const recovered='+JSON.stringify(recovered)+';db.clear();await parser.parse(recovered);const next=await extractRadarNodeMath(recovered,recovered,db);assert.equal(next.snapshot.axes[0].label,"$$next$$");assert.equal(captured.axes[0].label,"$$a < b$$<br/>");',
  'const {default:mermaid}=await import('+JSON.stringify(mermaid)+');mermaid.initialize({startOnLoad:false,securityLevel:"strict"});const viaApi=await mermaid.mermaidAPI.getDiagramFromText("radar-beta\\naxis api\\ncurve c {1}\\n");assert.equal(captureRadarNodeState(viaApi.db).axes[0].label,"api");',
  'assert.equal(stubModule.default.sanitize,originalSanitize);assert.equal(globalThis.window,undefined);assert.equal(globalThis.document,undefined);db.clear();console.log("recovered");'
 ].join('\n');
 try{
  const files=[['parser.mjs',missingParser,'parser missing'],['native.mjs',missingNative,'native missing'],['ready.mjs',ready,'recovered']] as const;
  for(const [name,body,expected]of files){const file=join(dir,name);writeFileSync(file,body);expect(execFileSync(process.execPath,[file],{cwd:root,encoding:'utf8'}).trim()).toBe(expected);}
 }finally{rmSync(dir,{recursive:true,force:true});}
});
