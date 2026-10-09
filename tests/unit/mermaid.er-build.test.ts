import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {expect,it} from 'vitest';
// @ts-expect-error build script is JavaScript outside tsconfig.
import {assertERShapeArtifact,patchERLayoutBoundary,patchERPreparationBoundary,patchERTableRows} from '../../scripts/mermaid-er-build.mjs';

const er=()=>readFileSync(resolve('node_modules/mermaid/dist/chunks/mermaid.core/erDiagram-OPXOYQCR.mjs'),'utf8');
const common=()=>readFileSync(resolve('node_modules/mermaid/dist/chunks/mermaid.core/chunk-3FUC2YCW.mjs'),'utf8');
const shapes=()=>readFileSync(resolve('node_modules/mermaid/dist/chunks/mermaid.core/chunk-7INBJB4K.mjs'),'utf8');
const layoutNodes=()=>readFileSync(resolve('node_modules/mermaid/dist/chunks/mermaid.core/chunk-5DYCD2WN.mjs'),'utf8');
const build=()=>readFileSync(resolve('scripts/mermaid-build.mjs'),'utf8');

it('pins the ER renderer and inserts one synchronous graph boundary after layout selection',()=>{
 const source=er(),marker='  data4Layout.layoutAlgorithm = getRegisteredLayoutAlgorithm(layout);',adapter='/er-native-graph.mjs',patched=patchERLayoutBoundary(source,adapter);
 const insertion=`${marker}\n  erNativeGraph(svg.node(), data4Layout);`;
 expect(patched.startsWith(`import { erNativeGraph } from ${JSON.stringify(adapter)};\n`)).toBe(true);
 expect(patched.match(/erNativeGraph\(svg\.node\(\), data4Layout\)/g)).toHaveLength(1);
 expect(patched.indexOf(insertion)).toBeGreaterThan(0);
 expect(patched.indexOf(insertion)).toBeLessThan(patched.indexOf('  data4Layout.config.flowchart.nodeSpacing'));
 expect(patched.slice(`import { erNativeGraph } from ${JSON.stringify(adapter)};\n`.length).replace(insertion,marker)).toBe(source);
 expect(()=>patchERLayoutBoundary(source+'\n// drift','/adapter.mjs')).toThrow(/renderer artifact changed/);
 expect(()=>patchERLayoutBoundary(patched,'/adapter.mjs')).toThrow(/renderer artifact changed/);
});

it('pins and instruments only ER table labels, including the hand-drawn background copy',()=>{
 const source=shapes(),adapter='/er-table-rows.mjs',patched=patchERTableRows(source,adapter);
 const start=source.indexOf('async function erBox(parent, node) {'),end=source.indexOf('__name(erBox, "erBox");',start),patchedStart=patched.indexOf('async function erBox(parent, node, renderOptions, visserCopy'),patchedEnd=patched.indexOf('__name(erBox, "erBox");',patchedStart);
 assertERShapeArtifact(source);
 expect(patched.startsWith(`import { erSimpleHeader, erTableRows } from ${JSON.stringify(adapter)};\n`)).toBe(true);
 // Mermaid calls shapes with a third renderOptions argument; copy identity belongs fourth.
 expect(layoutNodes()).toContain('el = await shapeHandler(elem, node, renderOptions);');
 expect(patched).toContain('async function erBox(parent, node, renderOptions, visserCopy = node.look === "handDrawn" ? "foreground" : "single") {');
 expect(patched).toContain('await erBox(parent, backgroundNode, renderOptions, "background");');
 expect(patched).toContain('const visserRows = erTableRows(parent, node, visserCopy, addText);');
 expect(patched).toContain('async function drawRect(parent, node, options, labelRenderer = labelHelper) {');
 expect(patched).toContain('const { shapeSvg, bbox } = await labelRenderer(parent, node, getNodeClasses(node));');
 expect(patched).toContain('const { shapeSvg: shapeSvg2, math: visserMath } = await erSimpleHeader(parent, node, visserCopy, config, options2, {');
 expect(patched).toContain('normalize: input => sanitizeText(decodeEntities(input), getConfig2()),');
 expect(patched).toContain('native: async () => {');
 expect(patched).toContain('if (calculateTextWidth(node.label, config) + options2.labelPaddingX * 2 < config.er.minEntityWidth) {');
 expect(patched).toContain('return drawRect(parent, node, options2);');
 expect(patched).toContain('draw: labelRenderer => drawRect(parent, node, options2, labelRenderer)');
 expect(patched).toContain('if (!visserMath && !evaluate(config.htmlLabels)) {');
 expect(patched).toContain('visserRows.add("header", shapeSvg, node.label ?? "", config, 0, 0, ["name"], labelStyles)');
 for(const role of ['type','name','keys','comment'])expect(patched).toContain(`\`row:\${rowIndex}:${role}\``);
 expect(patched.match(/visserRows\.add\(/g)).toHaveLength(5);
 const importLine=`import { erSimpleHeader, erTableRows } from ${JSON.stringify(adapter)};\n`;
 const beforeBox=patched.slice(importLine.length,patchedStart)
  .replace('async function drawRect(parent, node, options, labelRenderer = labelHelper) {','async function drawRect(parent, node, options) {')
  .replace('const { shapeSvg, bbox } = await labelRenderer(parent, node, getNodeClasses(node));','const { shapeSvg, bbox } = await labelHelper(parent, node, getNodeClasses(node));');
 expect(beforeBox).toBe(source.slice(0,start));
 expect(patched.slice(patchedEnd)).toBe(source.slice(end));
 expect(()=>patchERTableRows(source+'\n// drift','/adapter.mjs')).toThrow(/shape helper artifact changed/);
 expect(()=>patchERTableRows(patched,'/adapter.mjs')).toThrow(/shape helper artifact changed/);
});

it('composes ER rows with the existing Requirement and Kanban shape transforms',()=>{
 const source=build();
 expect(source).toContain("assertRequirementShapeArtifact(source);assertKanbanCardArtifact(source);assertERShapeArtifact(source);");
 expect(source).toContain("const requirement=patchRequirementRowsAfterVerification(source,join(root,'packages/runtime/src/mermaid-requirement.ts'));");
 expect(source).toContain("const er=patchERTableRowsAfterVerification(source,requirement,join(root,'packages/runtime/src/mermaid-er-table.ts'));");
 expect(source).toContain('const transformed=patchERGroupNodeHelper(source,patchKanbanCardHelpers(source,er),erLabelAdapter);');
 expect(source).toContain("return { contents: patchSwimlaneEdgeLabelAttribute(source,transformed), loader: 'js' };");
});

it('pins common layout and awaits preparation exactly before measurement',()=>{
 const source=common(),marker='    renderContext.preparedLayout = false ? await profiler.span("prepare", () => prepareLayout?.(data4Layout, renderContext)) : await prepareLayout?.(data4Layout, renderContext);',adapter='/er-prepared-layout.mjs',patched=patchERPreparationBoundary(source,adapter);
 const insertion=`${marker}\n    await erPreparedLayout(svg.node(), data4Layout, renderContext.preparedLayout);`;
 expect(patched.startsWith(`import { erPreparedLayout } from ${JSON.stringify(adapter)};\n`)).toBe(true);
 expect(patched.match(/await erPreparedLayout\(svg\.node\(\), data4Layout, renderContext\.preparedLayout\)/g)).toHaveLength(1);
 expect(patched.indexOf(insertion)).toBeGreaterThan(0);
 expect(patched.indexOf(insertion)).toBeLessThan(patched.indexOf('    const measure = false ? await profiler.span("measure", () => measureLayoutFn(data4Layout, renderContext))'));
 expect(patched.slice(`import { erPreparedLayout } from ${JSON.stringify(adapter)};\n`.length).replace(insertion,marker)).toBe(source);
 expect(()=>patchERPreparationBoundary(source+'\n// drift','/adapter.mjs')).toThrow(/common layout artifact changed/);
 expect(()=>patchERPreparationBoundary(patched,'/adapter.mjs')).toThrow(/common layout artifact changed/);
});
