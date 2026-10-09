import {createHash} from 'node:crypto';

const RENDERER='b53dd676e6021cb1eb493ec133c619f4f9acb8586b36f0c97f7c18819c5b87aa';
const CARD='4046b2f1b5524ca743ddd13b24be059278b026fd074e56e84629c2e74b104dce';
const SECTION='8c8483c45402a7d354dc9713f745a67ebd9bcc084a9c237601cac2dbd0458644';
const hash=(source)=>createHash('sha256').update(source).digest('hex');
function one(source,marker,name){if(source.split(marker).length!==2)throw new Error(`Kanban ${name} marker differs`);return source;}
function original(source,expected,name){if(hash(source)!==expected)throw new Error(`Kanban ${name} artifact changed`);}

export function assertKanbanCardArtifact(source){original(source,CARD,'card helper');}
export function patchKanbanRenderer(source,adapter){
 original(source,RENDERER,'renderer');one(source,'var kanbanRenderer_default = {','renderer');
 const marker='var kanbanRenderer_default = {';
 return `import {createKanbanMathRenderer} from ${JSON.stringify(adapter)};\nimport {decodeEntities} from './chunk-ZIGJFQKS.mjs';\nimport {visserKanbanCardHelpers} from './chunk-7INBJB4K.mjs';\nimport {visserKanbanSectionHelpers} from './chunk-UA2S7LBM.mjs';\n`+source.replace(marker,
  `draw = createKanbanMathRenderer({original:draw,getConfig,selectSvgElement,setupGraphViewbox,card:visserKanbanCardHelpers,section:visserKanbanSectionHelpers,normalize:input=>sanitizeText(decodeEntities(input),getConfig())});\n${marker}`);
}
const cardHelpers=`\nvar visserKanbanCardHelpers = {\n  styles: styles2String,\n  classes: getNodeClasses,\n  htmlLabels: () => getEffectiveHtmlLabels(getConfig2()),\n  plain: async (group, input, node) => createText(group, sanitizeText(decodeEntities(input), getConfig2()), {\n    useHtmlLabels: getEffectiveHtmlLabels(getConfig2()), markdown: true, classes: "markdown-node-label",\n    width: Math.max(1, node.width - 10), style: node.labelStyle\n  }, getConfig2()),\n  outline: (shapeSvg, node, width, height) => {\n    const x = -width / 2, y = -height / 2; let outline;\n    if (node.look === "handDrawn") {\n      const rc = rough68.svg(shapeSvg), options = userNodeOverrides(node, {});\n      const roughNode = node.rx || node.ry ? rc.path(createRoundedRectPathD(x, y, width, height, node.rx || 0), options) : rc.rectangle(x, y, width, height, options);\n      outline = shapeSvg.insert(() => roughNode, ":first-child");\n      outline.attr("class", "basic label-container").attr("style", node.cssStyles ? node.cssStyles : null);\n    } else {\n      outline = shapeSvg.insert("rect", ":first-child");\n      outline.attr("class", "basic label-container __APA__").attr("style", nodeStylesForVisser(node)).attr("rx", node.rx ?? 5).attr("ry", node.ry ?? 5).attr("x", x).attr("y", y).attr("width", width).attr("height", height);\n      const priority = "priority" in node && node.priority;\n      if (priority) { const line = shapeSvg.append("line"), lineX = x + 2; line.attr("x1", lineX).attr("y1", y + Math.floor((node.rx ?? 0) / 2)).attr("x2", lineX).attr("y2", y + height - Math.floor((node.rx ?? 0) / 2)).attr("stroke-width", "4").attr("stroke", colorFromPriority(priority)); }\n    }\n    return outline;\n  }\n};\nvar nodeStylesForVisser = /* @__PURE__ */ __name((node) => styles2String(node).nodeStyles, "nodeStylesForVisser");\n`;
export function patchKanbanCardHelpers(source,transformed=source){
 assertKanbanCardArtifact(source);
 if(transformed.includes('visserKanbanCardHelpers'))throw new Error('Kanban card helper already patched');
 const start=source.indexOf('async function kanbanItem(parent, kanbanNode, { config }) {'),end=source.indexOf('__name(kanbanItem, "kanbanItem");',start);
 if(start<0||end<0||source.slice(start,end)!==transformed.slice(transformed.indexOf('async function kanbanItem(parent, kanbanNode, { config }) {'),transformed.indexOf('__name(kanbanItem, "kanbanItem");',transformed.indexOf('async function kanbanItem(parent, kanbanNode, { config }) {'))))throw new Error('Kanban native card boundary changed');
 return transformed+cardHelpers+'\nexport { visserKanbanCardHelpers };\n';
}
const sectionHelpers=`\nvar visserKanbanSectionHelpers = {\n  styles: styles2String,\n  htmlLabels: () => getEffectiveHtmlLabels(getConfig()),\n  titleMargin: () => getSubGraphTitleMargins(getConfig()).subGraphTitleTopMargin,\n  plain: async (group, input, node) => createText(group, input, { style: node.labelStyle, useHtmlLabels: getEffectiveHtmlLabels(getConfig()), isNode: true, width: node.width }),\n  outline: (shapeSvg, node, width, height) => {\n    const config = getConfig(), { themeVariables, handDrawnSeed } = config, { clusterBkg, clusterBorder } = themeVariables;\n    const { nodeStyles, borderStyles, backgroundStyles } = styles2String(node), x = -width / 2, y = -height / 2; let outline;\n    if (node.look === "handDrawn") {\n      const rc = rough2.svg(shapeSvg), options = userNodeOverrides(node, { roughness: 0.7, fill: clusterBkg, stroke: clusterBorder, fillWeight: 4, seed: handDrawnSeed });\n      const roughNode = rc.path(createRoundedRectPathD(x, y, width, height, node.rx), options);\n      outline = shapeSvg.insert(() => roughNode, ":first-child");\n      outline.select("path:nth-child(2)").attr("style", borderStyles.join(";"));\n      outline.select("path").attr("style", backgroundStyles.join(";").replace("fill", "stroke"));\n    } else { outline = shapeSvg.insert("rect", ":first-child"); outline.attr("style", nodeStyles).attr("rx", node.rx).attr("ry", node.ry).attr("x", x).attr("y", y).attr("width", width).attr("height", height); }\n    return outline;\n  }\n};\n`;
export function patchKanbanSectionHelpers(source){
 original(source,SECTION,'section helper');
 if(source.includes('visserKanbanSectionHelpers'))throw new Error('Kanban section helper already patched');
 const start=source.indexOf('var kanbanSection = /* @__PURE__ */ __name(async (parent, node) => {'),end=source.indexOf('}, "kanbanSection");',start);
 if(start<0||end<0)throw new Error('Kanban section boundary missing');
 return source+sectionHelpers+'\nexport { visserKanbanSectionHelpers };\n';
}
