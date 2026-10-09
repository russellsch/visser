import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {expect,it} from 'vitest';
// @ts-expect-error build scripts are checked JavaScript outside tsconfig.
import {assertRequirementShapeArtifact,patchRequirementRowsAfterVerification} from '../../scripts/mermaid-requirement-build.mjs';
// @ts-expect-error build script is checked JavaScript outside tsconfig.
import {assertKanbanCardArtifact,patchKanbanCardHelpers,patchKanbanRenderer,patchKanbanSectionHelpers} from '../../scripts/mermaid-kanban-build.mjs';

const card=()=>readFileSync(resolve('node_modules/mermaid/dist/chunks/mermaid.core/chunk-7INBJB4K.mjs'),'utf8');
const section=()=>readFileSync(resolve('node_modules/mermaid/dist/chunks/mermaid.core/chunk-UA2S7LBM.mjs'),'utf8');
const renderer=()=>readFileSync(resolve('node_modules/mermaid/dist/chunks/mermaid.core/kanban-definition-PNTS6WVX.mjs'),'utf8');
const plugin=()=>readFileSync(resolve('scripts/mermaid-build.mjs'),'utf8');

it('pins and wraps the Kanban renderer exactly once with verified helper dependencies',()=>{
 const source=renderer(),patched=patchKanbanRenderer(source,'/adapter.mjs');
 expect(patched.startsWith('import {createKanbanMathRenderer} from "/adapter.mjs";\n')).toBe(true);
 expect(patched).toContain("import {visserKanbanCardHelpers} from './chunk-7INBJB4K.mjs';");
 expect(patched).toContain("import {visserKanbanSectionHelpers} from './chunk-UA2S7LBM.mjs';");
 expect(patched.match(/draw = createKanbanMathRenderer\(/g)).toHaveLength(1);
 expect(patched).toContain('selectSvgElement,setupGraphViewbox,card:visserKanbanCardHelpers,section:visserKanbanSectionHelpers');
 expect(()=>patchKanbanRenderer(source+'\n// drift\n','/adapter.mjs')).toThrow(/Kanban renderer artifact changed/);
 expect(()=>patchKanbanRenderer(patched,'/adapter.mjs')).toThrow(/Kanban renderer artifact changed/);
});

it('exports card helpers without changing the pinned native card body and composes after Requirement verification',()=>{
 const source=card(),start=source.indexOf('async function kanbanItem(parent, kanbanNode, { config }) {'),end=source.indexOf('__name(kanbanItem, "kanbanItem");',start);
 assertRequirementShapeArtifact(source);assertKanbanCardArtifact(source);
 const requirement=patchRequirementRowsAfterVerification(source,'/requirement.mjs');
 const patched=patchKanbanCardHelpers(source,requirement);
 expect(patched).toContain('export { visserKanbanCardHelpers };');
 expect(patched).toContain('htmlLabels: () => getEffectiveHtmlLabels(getConfig2())');
 expect(patched).toContain('rough68.svg(shapeSvg)');
 expect(patched).toContain('colorFromPriority(priority)');
 const transformedStart=patched.indexOf('async function kanbanItem(parent, kanbanNode, { config }) {'),transformedEnd=patched.indexOf('__name(kanbanItem, "kanbanItem");',transformedStart);
 expect(patched.slice(transformedStart,transformedEnd)).toBe(source.slice(start,end));
 expect(()=>patchKanbanCardHelpers(source+'\n// drift\n')).toThrow(/Kanban card helper artifact changed/);
 expect(()=>patchKanbanCardHelpers(source,patched)).toThrow(/already patched/);
});

it('exports a separately pinned native section outline helper',()=>{
 const source=section(),start=source.indexOf('var kanbanSection = /* @__PURE__ */ __name(async (parent, node) => {'),end=source.indexOf('}, "kanbanSection");',start),patched=patchKanbanSectionHelpers(source);
 expect(patched).toContain('export { visserKanbanSectionHelpers };');
 expect(patched).toContain('titleMargin: () => getSubGraphTitleMargins(getConfig()).subGraphTitleTopMargin');
 expect(patched).toContain('rough2.svg(shapeSvg)');
 expect(patched).toContain('clusterBkg, clusterBorder');
 expect(patched.slice(start,end)).toBe(source.slice(start,end));
 expect(()=>patchKanbanSectionHelpers(source+'\n// drift\n')).toThrow(/Kanban section helper artifact changed/);
 expect(()=>patchKanbanSectionHelpers(patched)).toThrow(/artifact changed/);
});

it('installs each Kanban transform once in the shared Mermaid plugin',()=>{
 const source=plugin();
 expect(source).toContain('let kanbanPatched = 0;');
 expect(source).toContain('let kanbanSectionPatched = 0;');
 expect(source).toContain('if(kanbanPatched!==1)');
 expect(source).toContain('if(kanbanSectionPatched!==1)');
 expect(source).toContain('assertRequirementShapeArtifact(source);assertKanbanCardArtifact(source);');
});
