// Native ER/ELK measurement characterization with hash-pinned test-only traces.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {chromium} from '@playwright/test';
import {build} from 'esbuild';

const artifacts=new Map([
 [resolve('node_modules/mermaid/dist/chunks/mermaid.core/erDiagram-OPXOYQCR.mjs'),'1437bfbd601358cd7f2e54d540410bdebc9bdd38131300d16c49705811f9de49'],
 [resolve('node_modules/mermaid/dist/chunks/mermaid.core/chunk-3FUC2YCW.mjs'),'eb671be62e44b68716a51e6f9c0b611afd39df4feb70389e219c43c82152027c'],
 [resolve('node_modules/mermaid/dist/chunks/mermaid.core/chunk-UA2S7LBM.mjs'),'8c8483c45402a7d354dc9713f745a67ebd9bcc084a9c237601cac2dbd0458644'],
]);
function replaceOnce(source,marker,replacement,path){
 const matches=source.split(marker).length-1;if(matches!==1)throw new Error(`${path}: expected one instrumentation marker, found ${matches}`);
 return source.replace(marker,replacement);
}
function patch(path,source){
 const expected=artifacts.get(path),actual=createHash('sha256').update(source).digest('hex');
 if(actual!==expected)throw new Error(`${path}: native artifact hash changed (${actual})`);
 if(path.endsWith('erDiagram-OPXOYQCR.mjs'))return replaceOnce(source,'  const data4Layout = diag.db.getData();','  const data4Layout = diag.db.getData();\n  const trace = globalThis.__erElkTrace ??= { getData: [], measures: [], removed: [], rects: [] };\n  data4Layout.nodes.forEach((node, index) => { node.__erTraceOrdinal = index; });\n  trace.getData.push(data4Layout.nodes.filter((node) => node.isGroup).map((node) => ({ ordinal: node.__erTraceOrdinal, label: node.label, look: node.look })));',path);
 if(path.endsWith('chunk-3FUC2YCW.mjs')){
  let output=replaceOnce(source,'  if (node.label) {\n    const { shapeSvg, bbox } = await labelHelper(','  if (node.label) {\n    (globalThis.__erElkTrace ??= { getData: [], measures: [], removed: [], rects: [] }).measures.push({ ordinal: node.__erTraceOrdinal, label: node.label, look: node.look });\n    const { shapeSvg, bbox } = await labelHelper(',path);
  return replaceOnce(output,'    shapeSvg.remove();','    shapeSvg.remove();\n    (globalThis.__erElkTrace ??= { getData: [], measures: [], removed: [], rects: [] }).removed.push({ ordinal: node.__erTraceOrdinal, label: node.label, look: node.look, removed: !shapeSvg.node().isConnected });',path);
 }
 return replaceOnce(source,'  let text;\n  if (node.labelType === "markdown") {','  (globalThis.__erElkTrace ??= { getData: [], measures: [], removed: [], rects: [] }).rects.push({ ordinal: node.__erTraceOrdinal, label: node.label, look: node.look });\n  let text;\n  if (node.labelType === "markdown") {',path);
}
const plugin={name:'er-elk-measure-trace',setup(context){context.onLoad({filter:/node_modules[/\\]mermaid[/\\]dist[/\\]chunks[/\\]mermaid\.core[/\\](?:erDiagram-OPXOYQCR|chunk-3FUC2YCW|chunk-UA2S7LBM)\.mjs$/},args=>({contents:patch(args.path,readFileSync(args.path,'utf8')),loader:'js',resolveDir:dirname(args.path)}));}};
const bundles=[];
for(const instrumented of [false,true]){
 const built=await build({stdin:{contents:"import mermaid from 'mermaid'; window.mermaid=mermaid;",resolveDir:resolve('.')},bundle:true,format:'iife',platform:'browser',write:false,minify:true,logLevel:'warning',plugins:instrumented?[plugin]:[]});
 const bundle=built.outputFiles[0].text;bundles.push({instrumented,bundle,bundleSha256:createHash('sha256').update(bundle).digest('hex')});
}
const browser=await chromium.launch({headless:true});
try {
 const results=[],requests=[];
 for(const {instrumented,bundle,bundleSha256}of bundles){
  const page=await browser.newPage();
  await page.route('**/*',route=>{requests.push(route.request().url());return route.abort();});
  await page.setContent('<!doctype html><main></main>');await page.addScriptTag({content:bundle});
  const runs=await page.evaluate(async()=>{
   const cases=[
    {name:'duplicate-blank',source:'erDiagram\nsubgraph g[First]\n A\nend\nsubgraph g[Second]\n B\nend\nsubgraph empty[Empty]\nend\nsubgraph blank[" "]\nend\n'},
    {name:'unique-blank',source:'erDiagram\nsubgraph first[First]\n A\nend\nsubgraph second[Second]\n B\nend\nsubgraph empty[Empty]\nend\nsubgraph blank[" "]\nend\n'},
    {name:'duplicate',source:'erDiagram\nsubgraph g[First]\n A\nend\nsubgraph g[Second]\n B\nend\n'},
    {name:'unique',source:'erDiagram\nsubgraph first[First]\n A\nend\nsubgraph second[Second]\n B\nend\n'},
   ];
   const rows=[];
   for(const {name,source}of cases)for(const htmlLabels of [true,false])for(const look of ['default','handDrawn']){
    window.__erElkTrace={getData:[],measures:[],removed:[],rects:[]};
    const mermaid=window.mermaid;mermaid.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels,look});
    const effectiveLayout=mermaid.mermaidAPI.getConfig().layout;
    let error='';try{await mermaid.render(`erElkMeasure-${name}-${htmlLabels}-${look}`,source);}catch(caught){error=String(caught);}
    rows.push({name,source,htmlLabels,look,effectiveLayout,error,trace:structuredClone(window.__erElkTrace)});
   }
   return rows;
  });
  results.push({instrumented,bundleSha256,runs});await page.close();
 }
 // The unpatched comparison distinguishes a native rough duplicate-ID failure
 // from any test instrumentation effect. Failure rows prove measurement only;
 // they do not claim successful retained output or atomic error cleanup.
 assert.equal(results[0].bundleSha256,'efc90418750ac74ad8fa939cf05bce357b2bb2da98a346718e16b1534f9140af');
 assert.equal(results.length,2);
 for(const result of results){
  assert.equal(result.runs.length,16);
  for(const [index,row]of result.runs.entries()){
   assert.equal(row.effectiveLayout,'elk');
   const expectedError=row.look==='handDrawn'&&row.name.startsWith('duplicate')?"TypeError: Cannot read properties of undefined (reading 'type')":'';
   assert.equal(row.error,expectedError,`${result.instrumented}/${row.name}/${row.htmlLabels}/${row.look}`);
   assert.equal(row.error,results[0].runs[index].error);
   if(!result.instrumented){assert.deepEqual(row.trace,{getData:[],measures:[],removed:[],rects:[]});continue;}
   const titles=row.name.endsWith('-blank')?['','Empty','Second','First']:['Second','First'];
   const owners=titles.map((label,ordinal)=>({ordinal,label,look:row.look==='default'?'neo':'handDrawn'}));
   const measured=owners.filter(owner=>owner.label);
   assert.deepEqual(row.trace.getData,[owners]);
   const sorted=values=>[...values].sort((a,b)=>a.ordinal-b.ordinal);
   assert.deepEqual(sorted(row.trace.measures),measured);
   assert.deepEqual(sorted(row.trace.removed),measured.map(owner=>({...owner,removed:true})));
   assert.deepEqual(row.trace.rects,expectedError?owners.slice(0,-1):owners);
  }
 }
 assert.deepEqual(requests,[]);
 console.log(JSON.stringify({artifactHashes:Object.fromEntries(artifacts),results,networkAttempts:requests.length}));
} finally { await browser.close(); }
