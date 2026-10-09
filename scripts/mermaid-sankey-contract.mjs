import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const artifact = /[/\\]sankeyDiagram-IPEJSGJF\.mjs$/;
const digest = '4e39ceb2e04100a1ab2f1252788963e9799c5afb780cf93ef73541c15f1294c2';

/** Public DB accessors suffice; mark the exact reviewed grammar/DB/render contract. */
export function patchSankeyContract(source) {
  if (createHash('sha256').update(source).digest('hex') !== digest) throw new Error('Mermaid Sankey artifact changed; review grammar, DB and renderer contract');
  return source + '\nexport const visserSankeyContractVersion = 1;\n';
}

/** Preserve native module identity in source workers. Register before first import. */
export function sankeyContractLoadHook() {
  return (url, context, nextLoad) => {
    const loaded = nextLoad(url, context);
    if (!url.startsWith('file:') || !artifact.test(fileURLToPath(url))) return loaded;
    if (loaded.format !== 'module' || loaded.source == null) throw new Error('Sankey contract requires original ESM source');
    const source = typeof loaded.source === 'string' ? loaded.source : Buffer.from(loaded.source).toString('utf8');
    return { ...loaded, source: patchSankeyContract(source) };
  };
}

export function sankeyContractPlugin() {
  return { name:'visser-sankey-contract', setup(build) {
    let count = 0;
    build.onStart(()=>{count=0;});
    build.onLoad({filter:artifact},({path})=>{
      count++;
      return {contents:patchSankeyContract(readFileSync(path,'utf8')),loader:'js'};
    });
    build.onEnd(()=>count===1?undefined:{errors:[{text:`Expected one Sankey contract artifact; patched ${count}`}]});
  } };
}

/** Browser-only observation point. The callback lives on an owned diagram proxy;
 * absent callbacks leave native drawing unchanged. Apply to original bytes only.
 */
export function patchSankeyRendererCapture(source) {
  patchSankeyContract(source);
  const needle = '  setupGraphViewbox(void 0, svg, 0, useMaxWidth);';
  if (source.split(needle).length !== 2) throw new Error('Sankey capture point changed');
  return source.replace(needle, `  if (Object.prototype.hasOwnProperty.call(diagObj, "visserCaptureSankey")) {
    if (typeof diagObj.visserCaptureSankey !== "function") throw new Error("Invalid Sankey capture callback");
    diagObj.visserCaptureSankey({ graph, width, height, showValues, prefix, suffix, labelStyle,
      getLabelPosition, getText, svg: svg.node(), labelsGroup: labelsGroup.node() });
  }
${needle}`) + '\nexport const visserSankeyRendererCaptureVersion = 1;\n';
}
