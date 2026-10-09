import {createHash} from 'node:crypto';

const ER_LAYOUT='1437bfbd601358cd7f2e54d540410bdebc9bdd38131300d16c49705811f9de49';
const COMMON_LAYOUT='eb671be62e44b68716a51e6f9c0b611afd39df4feb70389e219c43c82152027c';
const ER_SHAPES='4046b2f1b5524ca743ddd13b24be059278b026fd074e56e84629c2e74b104dce';
const hash=source=>createHash('sha256').update(source).digest('hex');
function pinned(source,expected,name){if(hash(source)!==expected)throw new Error(`Mermaid ER ${name} artifact changed; review layout boundary`);}
function exactlyOne(source,marker,name){if(source.split(marker).length!==2)throw new Error(`Mermaid ER ${name} marker differs`);}

/** Adds the synchronous ER graph adapter at the native renderer's data boundary. */
export function patchERLayoutBoundary(source,adapter){
 pinned(source,ER_LAYOUT,'renderer');
 const marker='  data4Layout.layoutAlgorithm = getRegisteredLayoutAlgorithm(layout);';
 exactlyOne(source,marker,'renderer layout');
 return `import { erNativeGraph } from ${JSON.stringify(adapter)};\n`+source.replace(marker,`${marker}\n  erNativeGraph(svg.node(), data4Layout);`);
}

/** Install the staged renderer after declaration while retaining native draw. */
export function patchERMathRenderer(source,transformed,adapter){
 pinned(source,ER_LAYOUT,'renderer');
 const marker='}, "draw");';
 exactlyOne(transformed,marker,'draw declaration');
 return `import { createERMathRenderer } from ${JSON.stringify(adapter)};\nimport { decodeEntities as visserERDecodeEntities } from "./chunk-ZIGJFQKS.mjs";\n`+transformed.replace(marker,`${marker}\ndraw = createERMathRenderer({ original: draw, getConfig, normalize: input => common_default.sanitizeText(visserERDecodeEntities(input), getConfig()) });`);
}

/** Adds the prepared-layout adapter after native preparation and before measurement. */
export function patchERPreparationBoundary(source,adapter){
 pinned(source,COMMON_LAYOUT,'common layout');
 const marker='    renderContext.preparedLayout = false ? await profiler.span("prepare", () => prepareLayout?.(data4Layout, renderContext)) : await prepareLayout?.(data4Layout, renderContext);';
 exactlyOne(source,marker,'prepared layout');
 return `import { erPreparedLayout } from ${JSON.stringify(adapter)};\n`+source.replace(marker,`${marker}\n    await erPreparedLayout(svg.node(), data4Layout, renderContext.preparedLayout);`);
}

export function assertERShapeArtifact(source){pinned(source,ER_SHAPES,'shape helper');}
function replaceOne(source,marker,replacement,name){
 exactlyOne(source,marker,name);
 return source.replace(marker,replacement);
}

/** Adds ER header/table hooks and an optional native rectangle label renderer.
 * Every shared-shape transform authenticates the same upstream bytes first. */
export function patchERTableRowsAfterVerification(source,transformed,adapter){
 assertERShapeArtifact(source);
 if(transformed.includes('erTableRows')||transformed.includes('erSimpleHeader'))throw new Error('Mermaid ER table rows already patched');
 const drawStart=transformed.indexOf('async function drawRect(parent, node, options) {'),drawEnd=transformed.indexOf('__name(drawRect, "drawRect");',drawStart);
 if(drawStart<0||drawEnd<0)throw new Error('Mermaid ER simple header boundary missing');
 let draw=transformed.slice(drawStart,drawEnd);
 draw=replaceOne(draw,'async function drawRect(parent, node, options) {','async function drawRect(parent, node, options, labelRenderer = labelHelper) {','drawRect signature');
 draw=replaceOne(draw,'  const { shapeSvg, bbox } = await labelHelper(parent, node, getNodeClasses(node));','  const { shapeSvg, bbox } = await labelRenderer(parent, node, getNodeClasses(node));','drawRect label renderer');
 transformed=transformed.slice(0,drawStart)+draw+transformed.slice(drawEnd);
 const start=transformed.indexOf('async function erBox(parent, node) {'),end=transformed.indexOf('__name(erBox, "erBox");',start);
 if(start<0||end<0)throw new Error('Mermaid ER table boundary missing');
 let box=transformed.slice(start,end);
 box=replaceOne(box,'async function erBox(parent, node) {','async function erBox(parent, node, renderOptions, visserCopy = node.look === "handDrawn" ? "foreground" : "single") {','function signature');
 box=replaceOne(box,'    await erBox(parent, backgroundNode);','    await erBox(parent, backgroundNode, renderOptions, "background");','background recursion');
 const nativeWidth=`    if (calculateTextWidth(node.label, config) + options2.labelPaddingX * 2 < config.er.minEntityWidth) {
      node.width = config.er.minEntityWidth;
    }`;
 const nativeSimple=`${nativeWidth}
    const shapeSvg2 = await drawRect(parent, node, options2);`;
 const simpleHook=`    const { shapeSvg: shapeSvg2, math: visserMath } = await erSimpleHeader(parent, node, visserCopy, config, options2, {
      normalize: input => sanitizeText(decodeEntities(input), getConfig2()),
      native: async () => {
${nativeWidth}
        return drawRect(parent, node, options2);
      },
      draw: labelRenderer => drawRect(parent, node, options2, labelRenderer)
    });`;
 box=replaceOne(box,nativeSimple,simpleHook,'simple header');
 box=replaceOne(box,'    if (!evaluate(config.htmlLabels)) {','    if (!visserMath && !evaluate(config.htmlLabels)) {','simple header recenter');
 box=replaceOne(box,'  const shapeSvg = parent.insert("g").attr("class", cssClasses).attr("id", node.domId || node.id);','  const shapeSvg = parent.insert("g").attr("class", cssClasses).attr("id", node.domId || node.id);\n  const visserRows = erTableRows(parent, node, visserCopy, addText);','table row hook');
 box=replaceOne(box,'  const nameBBox = await addText(shapeSvg, node.label ?? "", config, 0, 0, ["name"], labelStyles);','  const nameBBox = await visserRows.add("header", shapeSvg, node.label ?? "", config, 0, 0, ["name"], labelStyles);','header label');
 box=replaceOne(box,'  for (const attribute of entityNode.attributes) {','  for (const [rowIndex, attribute] of entityNode.attributes.entries()) {','row iteration');
 for(const role of ['type','name','keys','comment']){
  box=replaceOne(box,`    const ${role==='name'?'nameBBox2':role+'BBox'} = await addText(\n      shapeSvg,`, `    const ${role==='name'?'nameBBox2':role+'BBox'} = await visserRows.add(\n      \`row:\${rowIndex}:${role}\`,\n      shapeSvg,`,`${role} label`);
 }
 return `import { erSimpleHeader, erTableRows } from ${JSON.stringify(adapter)};\n`+transformed.slice(0,start)+box+transformed.slice(end);
}

export function patchERTableRows(source,adapter){return patchERTableRowsAfterVerification(source,source,adapter);}
