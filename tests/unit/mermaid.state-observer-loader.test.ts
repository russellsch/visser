import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
// @ts-expect-error checked build script outside the TS project
import { stateObserverPlugin } from '../../scripts/mermaid-state-observer-loader.mjs';
// @ts-expect-error checked build script outside the TS project
import { sequenceDomAliases, sequenceDomPlugin } from '../../scripts/sequence-dom-build.mjs';

it('observes the same native ownership in fresh Node source and relocated bundled execution', async () => {
  const root = process.cwd();
  const url = (path: string) => pathToFileURL(resolve(root, path)).href;
  const fixture = `stateDiagram-v2
state "first" as A
A: second
note right of A
note one<br/> &dollar;&dollar;n&dollar;&dollar;
end note
note left of A: note two
A --> B: message
[*] --> A
B --> [*]
`;
  const body = `
const { extractStateLabels } = await import(${JSON.stringify(url('packages/core/src/mermaid/state-labels.ts'))});
const { observeStateDb } = await import(${JSON.stringify(url('packages/core/src/mermaid/state-observer.ts'))});
const { diagram, stateObserverVersion } = await import(${JSON.stringify(url('node_modules/mermaid/dist/chunks/mermaid.core/stateDiagram-v2-GCMORJYK.mjs'))});
if(stateObserverVersion!==1) throw new Error('State observer module was imported before the loader');
const { installStateNodeDb } = await import(${JSON.stringify(url('packages/core/src/mermaid/state-node-db.ts'))});
await installStateNodeDb();
const labels=await extractStateLabels(${JSON.stringify(fixture)});
const { createStateProvenance } = await import(${JSON.stringify(url('packages/core/src/mermaid/state-provenance.ts'))});
const { sanitizeSequenceField } = await import(${JSON.stringify(url('packages/core/src/mermaid/sequence-sanitize.ts'))});
const { validateStateMathRecords } = await import(${JSON.stringify(url('packages/core/src/mermaid/state-math.ts'))});
const { planStateRenderCopies } = await import(${JSON.stringify(url('packages/core/src/mermaid/state-render-plan.ts'))});
const provenance=createStateProvenance(labels,sanitizeSequenceField);
const value=v=>Array.isArray(v)?v.map(value):v?{text:v.mapped.text,source:v.mapped.mapRange(0,v.mapped.length).intervals.map(i=>v.mapped.source.slice(i.start,i.end)),records:v.recordIndices}:undefined;
const snapshot=()=>{const result=provenance.result();
const ledger=validateStateMathRecords(${JSON.stringify(fixture)},labels,result,sanitizeSequenceField);
const plan=planStateRenderCopies(${JSON.stringify(fixture)},result,ledger.records,sanitizeSequenceField);
return {plan:{slots:plan.slots,total:plan.total},nodes:[...result.nodes].map(([node,mapped])=>({id:node.id,label:value(mapped.label),description:value(mapped.description)})),edges:[...result.edges].map(([edge,mapped])=>({id:edge.id,label:value(mapped.label)}))}};
const db=diagram.db, epochs=[], snapshots=[];
let events=[];
const stop=observeStateDb(db,event=>{
 provenance.listener(event);
 if(event.kind==='begin') events=[];
 const fields=labels.records.filter(record=>record.statement===event.item).map(record=>record.recordIndex);
 events.push({kind:event.kind,mode:event.mode,fields,nodeId:event.retained?.id,edgeId:event.edge?.id,noteId:event.note?.id});
 if(event.kind==='end'){epochs.push(events);snapshots.push(snapshot());}
});
db.setRootDoc([...labels.root]);
db.extract(db.getRootDocV2());
stop();
console.log(JSON.stringify({epochs,snapshots,nodes:db.getData().nodes.map(node=>({id:node.id,label:node.label,description:node.description})),edges:db.getData().edges.map(edge=>({id:edge.id,label:edge.label}))}));
`;
  const load = `import { registerHooks } from 'node:module';
import { stateObserverLoadHook } from ${JSON.stringify(url('scripts/mermaid-state-observer-loader.mjs'))};
registerHooks({load:stateObserverLoadHook(${JSON.stringify(url('packages/core/src/mermaid/state-observer.ts'))}),resolve(specifier,context,next){return specifier==='dompurify'?{url:${JSON.stringify(url('packages/core/src/mermaid/dompurify-stub.ts'))},shortCircuit:true}:next(specifier,context)}});
`;
  const directory = mkdtempSync(join(tmpdir(), 'visser-state-observer-'));
  try {
    const source = join(directory, 'source.mjs');
    writeFileSync(source, load + body);
    const sourceResult = JSON.parse(execFileSync(process.execPath, [source], { cwd: root, encoding: 'utf8' }));
    // Esbuild resolves absolute paths rather than file URLs. The bundled
    // entry omits the Node load hook and uses the exact same source transform.
    const bundledBody = body.replaceAll(pathToFileURL(root).href, root);
    const bundled = join(directory, 'relocated', 'fixture.cjs');
    await build({ stdin: { contents: `(async()=>{${bundledBody}})().catch(error=>{console.error(error);process.exitCode=1;});`, resolveDir: root }, outfile: bundled, bundle: true, platform: 'node', format: 'cjs',
      plugins: [stateObserverPlugin(root), sequenceDomPlugin(root)], alias: sequenceDomAliases(root) });
    const bundledResult = JSON.parse(execFileSync(process.execPath, [bundled], { cwd: directory, encoding: 'utf8' }));
    expect(bundledResult).toEqual(sourceResult);
    const [first, second] = sourceResult.epochs;
    expect(second).toEqual(first);
    expect(first.filter((event: any) => event.kind === 'note')).toHaveLength(2);
    expect(first.filter((event: any) => event.kind === 'note-sanitized')).toHaveLength(2);
    expect(first.filter((event: any) => event.kind === 'relation').map((event: any)=>event.edgeId)).toEqual(['edge2','edge3','edge4']);
    for (const event of first.filter((event: any) => ['init', 'description', 'note'].includes(event.kind) || (event.kind==='relation' && event.edgeId==='edge2'))) expect(event.fields.length).toBeGreaterThan(0);
    expect(sourceResult.snapshots[0]).toEqual(sourceResult.snapshots[1]);
    expect(sourceResult.snapshots[0].plan.total.occurrences).toBe(1);
    expect(sourceResult.snapshots[0].plan.slots.flatMap((slot:any)=>slot.parts.filter((part:any)=>part.kind==='math')).map((part:any)=>part.tex)).toEqual(['n']);
    expect(sourceResult.snapshots[0].nodes.find((node: any)=>node.id==='A')).toMatchObject({label:{text:'first',source:['first']},description:[{text:'second',source:['second']}]});
    expect(sourceResult.snapshots[0].nodes.find((node: any)=>node.id==='A----note-0').label.source.join('')).toBe('note one<br/> &dollar;&dollar;n&dollar;&dollar;');
    expect(sourceResult.nodes.find((node: any) => node.id === 'A----note-0')?.label).toBe('note one<br> $$n$$');
    expect(sourceResult.nodes.find((node: any) => node.id === 'A')).toMatchObject({ label: 'first', description: ['second'] });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
