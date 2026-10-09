import {agentflowContractPlugin} from './mermaid-agentflow-contract.mjs';
import {patchERGroupNodeHelper,patchERTemporaryGroup,patchERClusterLabel,patchEREdgeLabel} from './mermaid-er-label-build.mjs';
import {patchERMathRenderer,patchERLayoutBoundary,patchERPreparationBoundary,assertERShapeArtifact,patchERTableRowsAfterVerification} from './mermaid-er-build.mjs';
import {patchERMathGrammar} from './mermaid-er-grammar.mjs';
import {assertRequirementShapeArtifact,patchRequirementRenderer,patchRequirementRowsAfterVerification} from './mermaid-requirement-build.mjs';
import {assertKanbanCardArtifact,patchKanbanCardHelpers,patchKanbanRenderer,patchKanbanSectionHelpers} from './mermaid-kanban-build.mjs';
import { radarParserContractPlugin } from './mermaid-radar-parser-contract.mjs';
import { patchRadarRendererCapture } from './mermaid-radar-contract.mjs';
import { patchSankeyRendererCapture } from './mermaid-sankey-contract.mjs';
import { patchXYContract } from './mermaid-xychart-contract.mjs';
import { patchQuadrantSnapshot } from './mermaid-quadrant-snapshot.mjs';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { patchStateClasses } from './mermaid-state-classes-build.mjs';
import { patchStateObserver } from './mermaid-state-observer-build.mjs';
import { patchSequenceMath } from './mermaid-sequence-build.mjs';
import { patchSequenceLoops } from './mermaid-sequence-loop-build.mjs';
import { patchSequenceTitles } from './mermaid-sequence-title-build.mjs';
import { patchSequenceMessages } from './mermaid-sequence-message-build.mjs';
import {patchSwimlaneEdgeLabelAttribute,patchSwimlaneEdgeLabelNode} from './mermaid-swimlane-build.mjs';

// Patches are deliberately tied to the exact upstream artifact. A dependency
// update must re-audit both parser fields and geometry before accepting it.
const SEQUENCE_SHA256 = '05f2f26e080d2bc490589dd82fc31bff6c24c3d15b9208db2cbd56b9820e9fea';
const PIE_SHA256 = '61b96a02cfa6db64c3a6560d71d823c65f403c11b4e23801cc734c0b6f0f4668';
const TIMELINE_SHA256 = 'e5521b5ba9ae144a9b2d8271e1164dd94b5ff9d41aa40682ddac4b75609b5781';
const TEXT_SHA256 = '02ab305a27aa89e9f079796e7dd1eca4f952976bad598585c97947c1ce090195';
const SHAPES_SHA256 = '4046b2f1b5524ca743ddd13b24be059278b026fd074e56e84629c2e74b104dce';
export function mermaidMathPlugin(root, { observeState = false } = {}) {
  return {
    name: 'visser-mermaid-math',
    setup(build) {
      radarParserContractPlugin().setup(build);
      agentflowContractPlugin().setup(build);
      let erLayoutPatched=0,erPreparationPatched=0,erEdgesPatched=0;
      const erAdapter=join(root,'packages/runtime/src/mermaid-er-context.ts'),erLabelAdapter=join(root,'packages/runtime/src/mermaid-er-label.ts');
      build.onLoad({filter:/[/\\]erDiagram-OPXOYQCR\.mjs$/},({path})=>{const original=readFileSync(path,'utf8');erLayoutPatched++;return {contents:patchERMathRenderer(original,patchERMathGrammar(original,patchERLayoutBoundary(original,erAdapter)),join(root,'packages/runtime/src/mermaid-er-renderer.ts')),loader:'js'};});
      build.onLoad({filter:/[/\\]chunk-3FUC2YCW\.mjs$/},({path})=>{const original=readFileSync(path,'utf8');erPreparationPatched++;return {contents:patchERTemporaryGroup(original,patchERPreparationBoundary(original,erAdapter),erLabelAdapter),loader:'js'};});
      build.onLoad({filter:/[/\\]chunk-Z7XXMR3K\.mjs$/},({path})=>{const original=readFileSync(path,'utf8');erEdgesPatched++;return {contents:patchEREdgeLabel(original,original,erLabelAdapter),loader:'js'};});
      let statePatched = 0;
      build.onLoad({ filter: /[/\\]stateDiagram-v2-[^/\\]+\.mjs$/ }, ({ path }) => {
        const source = readFileSync(path, 'utf8');
        if (createHash('sha256').update(source).digest('hex') !== '33ba302a233f6a2b43efd12b2ba42cd1878d637bf79d351d5901812728c9318d') {
          throw new Error('Mermaid state artifact changed; review math input normalization');
        }
        const marker = '  await render(data4Layout, svg);';
        if (source.split(marker).length !== 2) throw new Error('Mermaid state math patch is ambiguous');
        const observed = observeState ? patchStateObserver(source, join(root, 'packages/core/src/mermaid/state-observer.ts')) : patchStateClasses(source, join(root, 'packages/core/src/mermaid/state-classes.ts'));
        const adapter = JSON.stringify(join(root, 'packages/runtime/src/mermaid-state-text.ts'));
        statePatched++;
        return {contents: `import { withStateMathRoot } from ${adapter};\n` + observed.replace(marker,
          '  await withStateMathRoot(svg.node(), () => render(data4Layout, svg));'), loader: 'js'};
      });
      let patched = 0;
      let sequencePatched = 0;
      build.onLoad({ filter: /[/\\]sequenceDiagram-[^/\\]+\.mjs$/ }, ({ path }) => {
        const source = readFileSync(path, 'utf8');
        if (createHash('sha256').update(source).digest('hex') !== SEQUENCE_SHA256) {
          throw new Error('Mermaid sequence artifact changed; review math layout before rebuilding');
        }
        sequencePatched++;
        return { contents: patchSequenceLoops(patchSequenceTitles(patchSequenceMessages(patchSequenceMath(source, join(root, 'packages/runtime/src/mermaid-sequence.ts')), join(root, 'packages/runtime/src/mermaid-sequence-message.ts')), join(root, 'packages/runtime/src/mermaid-sequence-title.ts')), join(root, 'packages/runtime/src/mermaid-sequence-loop.ts')), loader: 'js' };
      });
      let radarPatched = 0;
      build.onLoad({filter:/[/\\]diagram-MPIPVDR6\.mjs$/},({path})=>{
        const source=patchRadarRendererCapture(readFileSync(path,'utf8')),marker='var diagram = {';
        if(source.split(marker).length!==2)throw new Error('Mermaid Radar renderer patch is ambiguous');
        radarPatched++;
        const adapter=JSON.stringify(join(root,'packages/runtime/src/mermaid-radar.ts'));
        return {contents:`import {createRadarMathRenderer} from ${adapter};\n`+source.replace(marker,
          `renderer.draw = createRadarMathRenderer({original:renderer.draw,getConfig});\n${marker}`),loader:'js'};
      });
      let sankeyPatched = 0;
      build.onLoad({ filter: /[/\\]sankeyDiagram-[^/\\]+\.mjs$/ }, ({ path }) => {
        const source = patchSankeyRendererCapture(readFileSync(path, 'utf8'));
        const marker = 'var diagram = {';
        if (source.split(marker).length !== 2) throw new Error('Mermaid Sankey renderer patch is ambiguous');
        sankeyPatched++;
        const adapter = JSON.stringify(join(root, 'packages/runtime/src/mermaid-sankey.ts'));
        return {contents: `import { createSankeyMathRenderer } from ${adapter};\n` + source.replace(marker,
          `sankeyRenderer_default.draw = createSankeyMathRenderer({original: sankeyRenderer_default.draw, getConfig});\n${marker}`),loader:'js'};
      });
      let xyPatched = 0;
      build.onLoad({ filter: /[/\\]xychartDiagram-[^/\\]+\.mjs$/ }, ({ path }) => {
        const source = patchXYContract(readFileSync(path, 'utf8'));
        const marker = 'var diagram = {';
        if (source.split(marker).length !== 2) throw new Error('Mermaid XY renderer patch is ambiguous');
        xyPatched++;
        const adapter = JSON.stringify(join(root, 'packages/runtime/src/mermaid-xychart.ts'));
        return {contents: `import { createXYMathRenderer } from ${adapter};\nimport { select as visserXYSelect } from 'd3';\n` + source.replace(marker,
          `xychartRenderer_default.draw = createXYMathRenderer({original: xychartRenderer_default.draw, getConfig, components: (config, data, theme) => new Orchestrator(config, data, theme, undefined).componentStore, select: visserXYSelect, configureSvgSize});\n${marker}`),loader:'js'};
      });
      let quadrantPatched = 0;
      build.onLoad({ filter: /[/\\]quadrantDiagram-[^/\\]+\.mjs$/ }, ({ path }) => {
        const source = patchQuadrantSnapshot(readFileSync(path, 'utf8'));
        const marker = 'var diagram = {';
        if (source.split(marker).length !== 2) throw new Error('Mermaid quadrant renderer patch is ambiguous');
        quadrantPatched++;
        const adapter = JSON.stringify(join(root, 'packages/runtime/src/mermaid-quadrant.ts'));
        return {contents: `import { createQuadrantMathRenderer } from ${adapter};\n` + source.replace(marker,
          `quadrantRenderer_default.draw = createQuadrantMathRenderer({original: quadrantRenderer_default.draw, getConfig, getSnapshot: getVisserQuadrantSnapshot, select, configureSvgSize});\n${marker}`),loader:'js'};
      });
      let timelinePatched = 0;
      let journeyPatched = 0;
      build.onLoad({ filter: /[/\\]journeyDiagram-[^/\\]+\.mjs$/ }, ({ path }) => {
        const source = readFileSync(path, 'utf8');
        if (createHash('sha256').update(source).digest('hex') !== 'b2a84793cf6fea9b0c5cf7f680bcbfebf648dadf0535d4fdfd7f636c025e3c0d') {
          throw new Error('Mermaid journey artifact changed; review measured layout before rebuilding');
        }
        const marker = 'var diagram = {';
        if (source.split(marker).length !== 2) throw new Error('Mermaid journey renderer patch is ambiguous');
        const adapter = JSON.stringify(join(root, 'packages/runtime/src/mermaid-journey.ts'));
        journeyPatched++;
        return { contents: `import { createJourneyMathRenderer } from ${adapter};\n` + source.replace(marker,
          `journeyRenderer_default.draw = createJourneyMathRenderer({ original: journeyRenderer_default.draw, getConfig, select, initGraphics, drawFace, drawCircle, configureSvgSize });\n${marker}`), loader: 'js' };
      });
      let requirementPatched = 0;
      build.onLoad({filter:/[/\\]requirementDiagram-PLB6GJNP\.mjs$/},({path})=>{
        requirementPatched++;
        return {contents:patchRequirementRenderer(readFileSync(path,'utf8'),join(root,'packages/runtime/src/mermaid-requirement.ts')),loader:'js'};
      });
      let kanbanPatched = 0;
      build.onLoad({filter:/[/\\]kanban-definition-PNTS6WVX\.mjs$/},({path})=>{
        kanbanPatched++;
        return {contents:patchKanbanRenderer(readFileSync(path,'utf8'),join(root,'packages/runtime/src/mermaid-kanban.ts')),loader:'js'};
      });
      let textPatched = 0;
      let shapesChecked = 0;
      build.onLoad({ filter: /[/\\]chunk-7INBJB4K\.mjs$/ }, ({ path }) => {
        const source = readFileSync(path, 'utf8');
        if (createHash('sha256').update(source).digest('hex') !== SHAPES_SHA256) {
          throw new Error('Mermaid shape artifact changed; review label applicability before rebuilding');
        }
        shapesChecked++;
        assertRequirementShapeArtifact(source);assertKanbanCardArtifact(source);assertERShapeArtifact(source);
        const requirement=patchRequirementRowsAfterVerification(source,join(root,'packages/runtime/src/mermaid-requirement.ts'));
        const er=patchERTableRowsAfterVerification(source,requirement,join(root,'packages/runtime/src/mermaid-er-table.ts'));
        const transformed=patchERGroupNodeHelper(source,patchKanbanCardHelpers(source,er),erLabelAdapter);
        return { contents: patchSwimlaneEdgeLabelAttribute(source,transformed), loader: 'js' };
      });
      let swimlanePatched = 0;
      build.onLoad({filter:/[/\\]swimlanes-2SLR337P\.mjs$/},({path})=>{
        const source=readFileSync(path,'utf8');
        swimlanePatched++;
        return {contents:patchSwimlaneEdgeLabelNode(source),loader:'js'};
      });
      let kanbanSectionPatched = 0;
      build.onLoad({filter:/[/\\]chunk-UA2S7LBM\.mjs$/},({path})=>{const original=readFileSync(path,'utf8');kanbanSectionPatched++;return {contents:patchERClusterLabel(original,patchKanbanSectionHelpers(original),erLabelAdapter),loader:'js'};});
      build.onLoad({ filter: /[/\\]pieDiagram-[^/\\]+\.mjs$/ }, ({ path }) => {
        const source = readFileSync(path, 'utf8');
        if (createHash('sha256').update(source).digest('hex') !== PIE_SHA256) {
          throw new Error('Mermaid pie artifact changed; review the math adapter before rebuilding');
        }
        const marker = 'var renderer = { draw };';
        if (source.split(marker).length !== 2) throw new Error('Mermaid pie renderer patch is ambiguous');
        const adapter = JSON.stringify(join(root, 'packages/runtime/src/mermaid-pie.ts'));
        patched++;
        return { contents: `import { createPieDraw } from ${adapter};\n` + source.replace(marker,
          `var mathDraw = createPieDraw({ arc, d3pie, scaleOrdinal, selectSvgElement, cleanAndMerge, parseFontSize, getConfig, configureSvgSize, log });
var renderer = { draw: (...args) => {
  const db = args[3].db;
  const hasMath = [db.getDiagramTitle(), ...db.getSections().keys()].some(label => label.includes('$$'));
  return (hasMath ? mathDraw : draw)(...args);
} };`), loader: 'js' };
      });
      build.onLoad({ filter: /[/\\]timeline-definition-[^/\\]+\.mjs$/ }, ({ path }) => {
        const source = readFileSync(path, 'utf8');
        if (createHash('sha256').update(source).digest('hex') !== TIMELINE_SHA256) {
          throw new Error('Mermaid timeline artifact changed; review the math adapter before rebuilding');
        }
        const marker = 'var diagram = {';
        if (source.split(marker).length !== 2) throw new Error('Mermaid timeline renderer patch is ambiguous');
        const adapter = JSON.stringify(join(root, 'packages/runtime/src/mermaid-timeline.ts'));
        timelinePatched++;
        return { contents: `import { createTimelineMathRenderer } from ${adapter};\n` + source.replace(marker,
          `rendererSelector.draw = createTimelineMathRenderer({ original: rendererSelector.draw, selectSvgElement, getConfig: getConfig2, initGraphics, defaultBkg, setupGraphViewbox });\n${marker}`), loader: 'js' };
      });
      build.onLoad({ filter: /[/\\]chunk-MBY4JIJT\.mjs$/ }, ({ path }) => {
        const source = readFileSync(path, 'utf8');
        if (createHash('sha256').update(source).digest('hex') !== TEXT_SHA256) {
          throw new Error('Mermaid shared text artifact changed; review math measurement before rebuilding');
        }
        const marker = '  return fo.node();';
        if (source.split(marker).length !== 2) throw new Error('Mermaid shared text measurement patch is ambiguous');
        const adapter = JSON.stringify(join(root, 'packages/runtime/src/mermaid-ink.ts'));
        const inputMarker = '    const node = {\n      isNode,\n      label: hasKatex(text) ? inputForKatex : decodedReplacedText,';
        if (source.split(inputMarker).length !== 2) throw new Error('Mermaid state math input patch is ambiguous');
        const stateAdapter = JSON.stringify(join(root, 'packages/runtime/src/mermaid-state-text.ts'));
        const normalized = source.replace(inputMarker,
          '    const node = {\n      isNode,\n      label: hasKatex(text) ? stateMathText(el.node(), inputForKatex) : decodedReplacedText,');
        textPatched++;
        return { contents: `import { stateMathText } from ${stateAdapter};\nimport { reserveMermaidMathInk } from ${adapter};\n` + normalized.replace(marker,
          `  reserveMermaidMathInk(fo.node(), node.label);\n${marker}`), loader: 'js' };
      });
      build.onEnd(() => {
        if (patched !== 1) return { errors: [{ text: `Expected one Mermaid pie patch; applied ${patched}` }] };
        if(erEdgesPatched!==1)throw new Error(`Expected one ER edge patch; got ${erEdgesPatched}`);
        if(erLayoutPatched!==1||erPreparationPatched!==1)throw new Error(`Expected one ER layout and preparation patch; got ${erLayoutPatched}/${erPreparationPatched}`);
        if(requirementPatched!==1)throw new Error(`Expected one Requirement renderer patch; got ${requirementPatched}`);
        if(kanbanPatched!==1)throw new Error(`Expected one Kanban renderer patch; got ${kanbanPatched}`);
        if(kanbanSectionPatched!==1)throw new Error(`Expected one Kanban section helper patch; got ${kanbanSectionPatched}`);
        if (sequencePatched !== 1) return { errors: [{ text: `Expected one Mermaid sequence patch; applied ${sequencePatched}` }] };
        if (timelinePatched !== 1) return { errors: [{ text: `Expected one Mermaid timeline patch; applied ${timelinePatched}` }] };
        if (journeyPatched !== 1) return { errors: [{ text: `Expected one Mermaid journey patch; applied ${journeyPatched}` }] };
        if (radarPatched !== 1) throw new Error(`Expected one Mermaid Radar patch, got ${radarPatched}`);
        if (sankeyPatched !== 1) throw new Error(`Expected one Mermaid Sankey patch, got ${sankeyPatched}`);
        if (xyPatched !== 1) return {errors:[{text:`Expected one Mermaid XY patch; applied ${xyPatched}`}]};
        if (quadrantPatched !== 1) return {errors:[{text:`Expected one Mermaid quadrant patch; applied ${quadrantPatched}`}]};
        if (shapesChecked !== 1) return { errors: [{ text: `Expected one Mermaid shape artifact; checked ${shapesChecked}` }] };
        if (swimlanePatched !== 1) return { errors: [{ text: `Expected one Mermaid swimlane patch; applied ${swimlanePatched}` }] };
        if (statePatched !== 1) return { errors: [{ text: `Expected one Mermaid state patch; applied ${statePatched}` }] };
        if (textPatched !== 1) return { errors: [{ text: `Expected one Mermaid shared text patch; applied ${textPatched}` }] };
      });
    },
  };
}
