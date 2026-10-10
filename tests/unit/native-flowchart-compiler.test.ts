import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { compileDocument } from '../../packages/core/src/compiler/compile.ts';
import { h, render, assertRenderedByteLimit } from '../../packages/core/src/compiler/html.ts';
import { FLOWCHART_READER_CONTRACT, flowchartReaderContracts } from '../../packages/core/src/compiler/flowchart-contract.ts';

const toolkit = { version: '0.0.0', sha256: 'e'.repeat(64), readerContracts: [FLOWCHART_READER_CONTRACT] };
const options = { audience: 'private' as const, includeSource: false, layoutFallback: false };
const front = `---
format: visser/1
docId: 7d2b9c1e-3f4a-4b5c-8d6e-9f0a1b2c3d4e
title: Flowchart fixture
kind: reference
capturedAt: 2026-10-10T00:00:00Z
visibility: private
---\n`;
const chart = `{% flowchart id="process" title="Review order" question="Can this order proceed?" %}
{% group id="phase" label="Review" color="teal" /%}
{% start id="received" label="Received" /%}
{% action id="check" label="Check order" group="phase" /%}
{% decision id="valid" label="Valid?" group="phase" /%}
{% end id="ready" label="Ready" /%}
{% flow id="f_start" from="received" to="check" /%}
{% flow id="f_check" from="check" to="valid" /%}
{% flow id="f_yes" from="valid" to="ready" label="Yes" /%}
{% flow id="f_no" from="valid" to="check" label="No" /%}
{% /flowchart %}`;
function bundle(body = chart) {
 const dir = mkdtempSync(join(tmpdir(), 'visser-flowchart-compile-'));
 writeFileSync(join(dir, 'index.md'), front + body);
 const b = loadBundle(join(dir, 'index.md'));
 expect(b.diagnostics.filter(d=>d.severity==='error')).toEqual([]);
 return b;
}
function html(result: Awaited<ReturnType<typeof compileDocument>>) {return new TextDecoder().decode(result.files.find(f=>f.path.endsWith('/index.html'))!.bytes);}

describe('native flowchart compiler @FCcompiler', () => {
 it('uses native shapes, stable original references and existing canonical details', async () => {
  const b=bundle(); const result=await compileDocument(b,toolkit,options); const page=html(result);
  expect(result.needsMermaid).toBe(false);
  expect(page).toContain('data-vs-flowchart="true"');
  expect(page).toContain('vs-flow-decision');expect(page).toContain('vs-flow-terminal');
  expect(page).toContain('vs-flow-group-color-teal');
  for(const id of ['phase','received','check','valid','ready']) {
   expect(page).toContain(`href="#x-${id}"`);
   expect(page).toContain(`id="x-${id}"`);
  }
  expect(page).toContain('vs-flow-members');expect(page).toContain('Cross-boundary flows');
  expect(page).toContain('data-vs-fold-initial="false"');expect(page).toContain('data-vs-fold-expand="phase"');
  const ids=[...page.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);expect(new Set(ids).size).toBe(ids.length);
  expect(page).not.toContain('vs-flowchart-sidebar');
  expect(page).toContain('data-vs-flowchart-part="true"');
  const text=new TextDecoder().decode(result.files.find(f=>f.path.endsWith('/document.md'))!.bytes);
  expect(text).toContain('Valid?');expect(text).toContain('continues to');
 });
 it('rejects absent or mismatched reader capability evidence, only for flowcharts', async()=>{
  await expect(compileDocument(bundle(),{...toolkit,readerContracts:[]},options)).rejects.toThrow('E_INTEGRITY');
  await expect(compileDocument(bundle(),{...toolkit,readerContracts:['visser-flowchart-reader/0']},options)).rejects.toThrow('E_INTEGRITY');
  expect(flowchartReaderContracts('/*! visser-flowchart-reader/1 */','')).toEqual([]);
  expect(flowchartReaderContracts('/*! visser-flowchart-reader/1 */','/*! visser-flowchart-reader/1 */')).toEqual([FLOWCHART_READER_CONTRACT]);
  const plain=bundle('<!-- vs:id p_plain -->\nPlain paragraph.');
  await expect(compileDocument(plain,{...toolkit,readerContracts:[]},options)).resolves.toBeDefined();
 });
 it('retains markers in built JS and CSS',()=>{
  expect(flowchartReaderContracts(readFileSync('dist/release/browser/reader.js','utf8'),readFileSync('dist/release/browser/reader.css','utf8'))).toEqual([FLOWCHART_READER_CONTRACT]);
 });
 it('fails closed on invalid geometry and retains complete text in explicit fallback',async()=>{
  const b=bundle(); const broken=async()=>{throw new Error('injected geometry failure');};
  await expect(compileDocument(b,toolkit,{...options,layout:broken})).rejects.toThrow('E_LAYOUT_LIMIT');
  const result=await compileDocument(b,toolkit,{...options,layout:broken,layoutFallback:true});
  expect(result.diagnostics.some(d=>d.code==='W_LAYOUT_FALLBACK')).toBe(true);
  const page=html(result);expect(page).not.toContain('<svg');
  for(const id of ['f_start','f_check','f_yes','f_no'])expect(page).toContain(`data-vs-rel="${id}"`);
 });
 it('bounds escaped SVG output at the exact byte cap and one over',()=>{
  const limit=2*1024*1024;
  expect(()=>assertRenderedByteLimit(h('svg',{},'x'.repeat(limit-11)),limit)).not.toThrow();
  expect(()=>assertRenderedByteLimit(h('svg',{},'x'.repeat(limit-10)),limit)).toThrow('exceeds');
  const escaped=h('svg',{'aria-label':'"&é'},'𝑞 < C & x');
  const bytes=new TextEncoder().encode(render(escaped)).length;
  expect(()=>assertRenderedByteLimit(escaped,bytes)).not.toThrow();
  expect(()=>assertRenderedByteLimit(escaped,bytes-1)).toThrow();
 });
 it('renders direct equations as prose without inventing process nodes',async()=>{
  const b=bundle(chart.replace('{% /flowchart %}','{% equation id="capacity" %}\nq < C\n{% /equation %}\n{% /flowchart %}'));
  const page=html(await compileDocument(b,{...toolkit,assets:{'math.js':'b'.repeat(64)}},options));
  expect(page).toContain('id="x-capacity"');
  expect(page).not.toContain('id="v-process.capacity"');
  expect(page).not.toContain('id="l-process.capacity"');
 });
 it('keeps math source in native labels, folded groups, prose and details',async()=>{
  const b=bundle(chart.replace('label="Review"','label="Review $q$" collapsed=true').replace('label="Valid?"','label="$q < C$?"'));
  const result=await compileDocument(b,{...toolkit,assets:{'math.js':'b'.repeat(64)}},options);
  const page=html(result);
  expect(page).toContain('data-vs-math');expect(page).toContain('q &lt; C');
  expect(page).toContain('data-vs-fold-initial="true"');expect(page).toContain('vs-math-expressions');
  expect(result.needsMermaid).toBe(false);expect(result.needsMath).toBe(true);
 });

});
