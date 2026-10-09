import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { expect, it } from 'vitest';
// @ts-expect-error build scripts are outside the TS project.
import { patchQuadrantSnapshot, quadrantSnapshotPlugin } from '../../scripts/mermaid-quadrant-snapshot.mjs';

const chunk=resolve('node_modules/mermaid/dist/chunks/mermaid.core/quadrantDiagram-O4NWA36T.mjs');
it('rejects changed or already patched artifacts',()=>{
 const source=readFileSync(chunk,'utf8');
 expect(()=>patchQuadrantSnapshot(source+'\n')).toThrow(/artifact changed/);
 expect(()=>patchQuadrantSnapshot(patchQuadrantSnapshot(source))).toThrow(/artifact changed/);
});
it('requires exactly one snapshot chunk in a bundle',async()=>{
 await expect(build({stdin:{contents:'export const x = 1;',resolveDir:process.cwd()},write:false,plugins:[quadrantSnapshotPlugin()]})).rejects.toThrow(/patched 0/);
});
it('reads detached native snapshots in source and bundled execution without changing built data',async()=>{
 const root=process.cwd(), dir=mkdtempSync(join(tmpdir(),'visser-quadrant-snapshot-'));
 const url=(p:string)=>pathToFileURL(resolve(p)).href;
 // No DOM-dependent text setters are necessary to exercise snapshot identity,
 // prepend order, class state, resets, and native layout side effects here.
 const body=`
import assert from 'node:assert/strict';
const mod=await import(${JSON.stringify(url(chunk))});
const {diagram,getVisserQuadrantSnapshot:snapshot}=mod;
assert.equal(mod.quadrantSnapshotVersion,1);
const db=diagram.db; db.clear();
const empty=snapshot();
assert.deepEqual(empty,snapshot());
db.addClass('hot',['color:#ff0000']);
db.addClass('hot',['color:#00ff00']);
// Empty labels bypass sanitation while still exercising native point storage.
db.addPoint({text:''},'hot','0.1','0.2',['radius:7']);
db.addPoint({text:''},'','0.8','0.9',[]);
const before=snapshot(),saved=structuredClone(before);
assert.equal(before.data.points[0].x,'0.8');
assert.equal(before.data.points[1].radius,7);
assert.deepEqual(before.classes,[['hot',{color:'#00ff00'}]]);
const built=db.getQuadrantData();
assert.deepEqual(db.getQuadrantData(),built);
assert.deepEqual(snapshot(),before);
before.data.points[0].x='changed'; before.classes[0][1].color='changed';
assert.deepEqual(snapshot(),saved);
db.clear(); assert.deepEqual(snapshot(),empty); assert.deepEqual(saved.data.points.map(p=>p.x),['0.8','0.1']);
console.log(JSON.stringify({empty,saved,built}));
`;
 const hook=`import {registerHooks} from 'node:module';\nimport {quadrantSnapshotLoadHook} from ${JSON.stringify(url('scripts/mermaid-quadrant-snapshot.mjs'))};\nregisterHooks({load:quadrantSnapshotLoadHook()});\n`;
 try {
  const sourceFile=join(dir,'source.mjs');writeFileSync(sourceFile,hook+body);
  const source=JSON.parse(execFileSync(process.execPath,[sourceFile],{cwd:root,encoding:'utf8'}));
  const nativeFile=join(dir,'native.mjs');
  writeFileSync(nativeFile,`const {diagram}=await import(${JSON.stringify(url(chunk))});const db=diagram.db;db.clear();db.addClass('hot',['color:#ff0000']);db.addClass('hot',['color:#00ff00']);db.addPoint({text:''},'hot','0.1','0.2',['radius:7']);db.addPoint({text:''},'','0.8','0.9',[]);console.log(JSON.stringify(db.getQuadrantData()));`);
  const upstream=JSON.parse(execFileSync(process.execPath,[nativeFile],{cwd:root,encoding:'utf8'}));
  expect(source.built).toEqual(upstream);
  const outfile=join(dir,'bundle.mjs');
  // Absolute pinned import is bundled; the resulting file runs away from node_modules.
  await build({stdin:{contents:body.replaceAll(url(chunk),chunk),resolveDir:root,sourcefile:'quadrant-snapshot-entry.mjs'},bundle:true,platform:'node',format:'esm',outfile,plugins:[quadrantSnapshotPlugin()]});
  const bundled=JSON.parse(execFileSync(process.execPath,[outfile],{cwd:dir,encoding:'utf8'}));
  expect(bundled).toEqual(source);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
