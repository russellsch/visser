import { build } from 'esbuild';
import { test, expect } from '@playwright/test';
import { prepareSequenceSanitizer } from '../../packages/core/src/mermaid/sequence-sanitize.ts';
import { applySequenceProperties, parseSequenceProperties } from '../../packages/core/src/mermaid/sequence-properties.ts';
import { sequencePropertiesIdentity } from '../../packages/core/src/mermaid/sequence-db.ts';
import { extractSequenceMath } from '../../packages/core/src/mermaid/sequence-math.ts';
let bundle: string;
test.beforeAll(async()=>{
  await prepareSequenceSanitizer();
  bundle=(await build({stdin:{contents:"import mermaid from 'mermaid'; import {sequencePropertiesIdentity,reconcileSequenceMath} from './packages/core/src/mermaid/sequence-db.ts'; globalThis.mermaid=mermaid;globalThis.identity=sequencePropertiesIdentity;globalThis.reconcile=reconcileSequenceMath;",resolveDir:process.cwd()},bundle:true,platform:'browser',format:'iife',write:false})).outputFiles[0]!.text;
});

test('participant property semantics match native browser DB without interpreting machine data as equations',async({page})=>{
  const cases=[
    ['{"class":"custom","text":"$$\\\\bad$$","nested":{"icon":"inert"}}','{"class":"actor","x":2}'],
    ['{"x":1,"x":2}','{"x":3}','{invalid}'],
    ['{"text":"<br>&amp;dollar;"}'],
    ['{"text":"<br>&quot;"}'],
    ['{"note":"<br>&quot;, &quot;extra&quot;:&quot;decoded&quot;, &quot;x&quot;:&quot;"}'],
    ['null','{"class":"custom"}'],['false','{"class":"custom"}'],['42','{"class":"custom"}'],
    ['"abc"','{"class":"custom"}'],['[1,2]','{"class":"custom","0":3}'],
    ['{"class":1e400}'],['{"class":null}'],['{"class":0}'],['{"class":["actor","custom"]}'],['{"class":{"text":"ordinary"}}'],
    ['{"constructor":"inert","prototype":"inert"}'],
  ];
  await page.setContent('<!doctype html><main></main>');await page.addScriptTag({content:bundle});
  const actual=await page.evaluate(async cases=>{
    const m=(window as any).mermaid;m.initialize({startOnLoad:false,securityLevel:'strict'});
    const result=[];
    for(const entries of cases){const {db}=await m.mermaidAPI.getDiagramFromText('sequenceDiagram\nparticipant A');for(const text of entries)db.addProperties('A',{text});result.push((window as any).identity(db.getActors().get('A').properties)??'undefined');}
    return result;
  },cases);
  const expected=cases.map(entries=>{const actor:{properties?:unknown}={properties:{}};for(const text of entries)applySequenceProperties(actor,parseSequenceProperties(text));return sequencePropertiesIdentity(actor.properties)??'undefined';});
  expect(actual).toEqual(expected);
  const source='sequenceDiagram\nparticipant A as $$x$$\nproperties A: [1,2]\nproperties A: {"class":"custom","extra":"$$\\\\bad$$"}\n';
  const math=await extractSequenceMath(source);
  expect(math.total.occurrences).toBe(1);
  const result=await page.evaluate(async({source,records})=>{const {db}=await (window as any).mermaid.mermaidAPI.getDiagramFromText(source);return (window as any).reconcile(db,records);},{source,records:math.records});
  expect(result.map((slot:any)=>slot.key)).toEqual(['actor:A']);
});

test('reconciliation detects native-distinct overflow class mutations',async({page})=>{
  await page.setContent('<!doctype html><main></main>');await page.addScriptTag({content:bundle});
  const source='sequenceDiagram\nparticipant A as $$x$$\nproperties A: {"class":1e400}\n';
  const math=await extractSequenceMath(source);
  const result=await page.evaluate(async({source,records})=>{
    const m=(window as any).mermaid;m.initialize({startOnLoad:false,securityLevel:'strict'});
    const {db}=await m.mermaidAPI.getDiagramFromText(source);
    (window as any).reconcile(db,records);
    db.getActors().get('A').properties.class=null;
    try{(window as any).reconcile(db,records);return 'accepted';}catch(error){return String(error);}
  },{source,records:math.records});
  expect(result).toContain('actor properties differ');
});
