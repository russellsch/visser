import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const artifact = /[/\\]kanban-definition-PNTS6WVX\.mjs$/;
const digest = 'b53dd676e6021cb1eb493ec133c619f4f9acb8586b36f0c97f7c18819c5b87aa';

export function patchKanbanContract(source) {
  if (createHash('sha256').update(source).digest('hex') !== digest) {
    throw new Error('Mermaid Kanban artifact changed; review grammar, DB and renderer contract');
  }
  // Install native lazy link hooks before any parse, including SVG-only
  // configurations. The inert pass changes neither DB state nor config.
  return source + '\nexport const visserKanbanContractVersion = 3;\nexport function visserCaptureKanbanDb() { return structuredClone({ nodes, sections, counter: cnt }); }\nexport function visserCaptureKanbanConfig() { const config = getConfig(), mindmap = config.mindmap; return structuredClone({ securityLevel: config.securityLevel, htmlLabels: config.htmlLabels, mindmap: { padding: mindmap?.padding ?? defaultConfig_default.mindmap.padding, maxNodeWidth: mindmap?.maxNodeWidth ?? defaultConfig_default.mindmap.maxNodeWidth } }); }\nexport function visserPrepareKanbanSanitizer() { sanitizeText("visser-kanban-sanitizer", { ...getConfig(), htmlLabels: true, securityLevel: "strict" }); }\n';
}

export function kanbanContractLoadHook() {
  return (url, context, nextLoad) => {
    const loaded = nextLoad(url, context);
    if (!url.startsWith('file:') || !artifact.test(fileURLToPath(url))) return loaded;
    if (loaded.format !== 'module' || loaded.source == null) throw new Error('Kanban contract requires original ESM source');
    const source = typeof loaded.source === 'string' ? loaded.source : Buffer.from(loaded.source).toString('utf8');
    return { ...loaded, source: patchKanbanContract(source) };
  };
}

export function kanbanContractPlugin() {
  return {
    name: 'visser-kanban-contract',
    setup(build) {
      let count = 0;
      build.onStart(() => { count = 0; });
      build.onLoad({ filter: artifact }, ({ path }) => {
        count++;
        return { contents: patchKanbanContract(readFileSync(path, 'utf8')), loader: 'js' };
      });
      build.onEnd(() => count === 1 ? undefined : { errors: [{ text: `Expected one Kanban contract artifact; patched ${count}` }] });
    },
  };
}
