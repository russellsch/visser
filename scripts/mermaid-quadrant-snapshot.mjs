import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const artifact = /[/\\]quadrantDiagram-O4NWA36T\.mjs$/;
const digest = '6ba5f7611316b11a03d48b4da207b827c2eae00441abb328af2cd3120f329cfb';
const anchor = 'var quadrantBuilder = new QuadrantBuilder();';

/** Read actual native state without invoking its config-mutating layout builder. */
export function patchQuadrantSnapshot(source) {
  if (createHash('sha256').update(source).digest('hex') !== digest) throw new Error('Mermaid quadrant artifact changed; review snapshot patch');
  if (source.split(anchor).length !== 2) throw new Error('Mermaid quadrant snapshot anchor is ambiguous');
  return source.replace(anchor, `${anchor}
export const quadrantSnapshotVersion = 1;
export function getVisserQuadrantSnapshot() {
  return structuredClone({
    version: 1,
    data: quadrantBuilder.data,
    classes: Array.from(quadrantBuilder.classes.entries()),
    title: getDiagramTitle(),
    accTitle: getAccTitle(),
    accDescr: getAccDescription()
  });
}`);
}

/** Register before the native chunk is first imported. */
export function quadrantSnapshotLoadHook() {
  return (url, context, nextLoad) => {
    const loaded = nextLoad(url, context);
    if (!url.startsWith('file:') || !artifact.test(fileURLToPath(url))) return loaded;
    if (loaded.format !== 'module' || loaded.source == null) throw new Error('Quadrant snapshot requires original ESM source');
    const source = typeof loaded.source === 'string' ? loaded.source : Buffer.from(loaded.source).toString('utf8');
    return { ...loaded, source: patchQuadrantSnapshot(source) };
  };
}

/** Shared transform for future worker and browser consumers; exactly one chunk. */
export function quadrantSnapshotPlugin() {
  return { name:'visser-quadrant-snapshot', setup(build) {
    let count = 0;
    build.onStart(()=>{count=0;});
    build.onLoad({filter:artifact},({path})=>{
      count++;
      return {contents:patchQuadrantSnapshot(readFileSync(path,'utf8')),loader:'js'};
    });
    build.onEnd(()=>count===1?undefined:{errors:[{text:`Expected one quadrant snapshot artifact; patched ${count}`}]});
  } };
}
