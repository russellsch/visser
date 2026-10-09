import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const artifact = /[/\\]diagram-MPIPVDR6\.mjs$/;
const digest = '2ce7653fe44f279cbcdb434977860480efe1c20908203548ffbbc0e02648a4f3';

/** Public DB accessors suffice; mark the exact reviewed grammar/DB/render contract. */
export function patchRadarContract(source) {
  if (createHash('sha256').update(source).digest('hex') !== digest) throw new Error('Mermaid Radar artifact changed; review grammar, DB and renderer contract');
  return source + '\nexport const visserRadarContractVersion = 1;\n';
}

/** Preserve native module identity in source workers. Register before first import. */
export function radarContractLoadHook() {
  return (url, context, nextLoad) => {
    const loaded = nextLoad(url, context);
    if (!url.startsWith('file:') || !artifact.test(fileURLToPath(url))) return loaded;
    if (loaded.format !== 'module' || loaded.source == null) throw new Error('Radar contract requires original ESM source');
    const source = typeof loaded.source === 'string' ? loaded.source : Buffer.from(loaded.source).toString('utf8');
    return { ...loaded, source: patchRadarContract(source) };
  };
}

export function radarContractPlugin() {
  return { name:'visser-radar-contract', setup(build) {
    let count = 0;
    build.onStart(()=>{count=0;});
    build.onLoad({filter:artifact},({path})=>{
      count++;
      return {contents:patchRadarContract(readFileSync(path,'utf8')),loader:'js'};
    });
    build.onEnd(()=>count===1?undefined:{errors:[{text:`Expected one Radar contract artifact; patched ${count}`}]});
  } };
}

/** Browser-only observation after native geometry and labels have been drawn.
 * The owned diagram proxy supplies the callback; ordinary draws are unchanged.
 */
export function patchRadarRendererCapture(source) {
  patchRadarContract(source);
  const needle='  g.append("text").attr("class", "radarTitle").text(title).attr("x", 0).attr("y", -config.height / 2 - config.marginTop);';
  if(source.split(needle).length!==2)throw new Error('Radar capture point changed');
  return source.replace(needle,`${needle}
  if (Object.prototype.hasOwnProperty.call(diagram2, "visserCaptureRadar")) {
    if (typeof diagram2.visserCaptureRadar !== "function") throw new Error("Invalid Radar capture callback");
    diagram2.visserCaptureRadar({axes,curves,options,config,title,minValue,maxValue,radius,svg:svg.node(),group:g.node()});
  }`)+'\nexport const visserRadarRendererCaptureVersion = 1;\n';
}
