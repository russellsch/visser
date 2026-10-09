import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const artifact = /[/\\]xychartDiagram-PMCCYNJV\.mjs$/;
const digest = 'd602c86e3513b44777118606f7190dbc4d260ecaba6f26ed3adb56f7375b2b7a';

/** Public DB accessors suffice; mark the exact reviewed grammar/DB/render contract. */
export function patchXYContract(source) {
  if (createHash('sha256').update(source).digest('hex') !== digest) throw new Error('Mermaid XY artifact changed; review grammar, DB and renderer contract');
  return source + '\nexport const visserXYContractVersion = 1;\n';
}

/** Preserve native module identity in source workers. Register before first import. */
export function xyContractLoadHook() {
  return (url, context, nextLoad) => {
    const loaded = nextLoad(url, context);
    if (!url.startsWith('file:') || !artifact.test(fileURLToPath(url))) return loaded;
    if (loaded.format !== 'module' || loaded.source == null) throw new Error('XY contract requires original ESM source');
    const source = typeof loaded.source === 'string' ? loaded.source : Buffer.from(loaded.source).toString('utf8');
    return { ...loaded, source: patchXYContract(source) };
  };
}

export function xyContractPlugin() {
  return { name:'visser-xychart-contract', setup(build) {
    let count = 0;
    build.onStart(()=>{count=0;});
    build.onLoad({filter:artifact},({path})=>{
      count++;
      return {contents:patchXYContract(readFileSync(path,'utf8')),loader:'js'};
    });
    build.onEnd(()=>count===1?undefined:{errors:[{text:`Expected one XY contract artifact; patched ${count}`}]});
  } };
}
