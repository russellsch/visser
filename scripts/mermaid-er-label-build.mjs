import {createHash} from 'node:crypto';

const SHAPES='4046b2f1b5524ca743ddd13b24be059278b026fd074e56e84629c2e74b104dce';
const COMMON='eb671be62e44b68716a51e6f9c0b611afd39df4feb70389e219c43c82152027c';
const CLUSTERS='8c8483c45402a7d354dc9713f745a67ebd9bcc084a9c237601cac2dbd0458644';
const EDGES='0f01726f593265d7b3372fb6ff1e510f6e7cd0452121bb4aee947f6ee703e17a';
const digest=source=>createHash('sha256').update(source).digest('hex');
function original(source,expected,name){if(digest(source)!==expected)throw new Error(`Mermaid ER ${name} artifact changed; review label boundary`);}
function once(source,marker,name){if(source.split(marker).length!==2)throw new Error(`Mermaid ER ${name} marker differs`);}
function importOnce(source,name){if(source.includes(name))throw new Error(`Mermaid ER ${name} already patched`);}

export function patchERGroupNodeHelper(originalSource,transformed=originalSource,adapter){
 original(originalSource,SHAPES,'shape helper');importOnce(transformed,'createERGroupNodeLabel');
 const marker='}, "labelHelper");';once(transformed,marker,'group label helper');
 return `import { createERGroupNodeLabel } from ${JSON.stringify(adapter)};\n`+transformed.replace(marker,`${marker}\nlabelHelper = createERGroupNodeLabel(labelHelper, input => sanitizeText(decodeEntities(input), getConfig2()), node => styles2String(node).labelStyles);`);
}

export function patchERTemporaryGroup(originalSource,transformed=originalSource,adapter){
 original(originalSource,COMMON,'common layout');
 const marker=`      measureWidth === void 0 ? node : { ...node, width: measureWidth }
    );`;once(transformed,marker,'temporary group label');
 const measured='    node.labelBBox = { width: bbox.width, height: bbox.height };';once(transformed,measured,'measured group bbox');
 return `import { erMeasuredGroup } from ${JSON.stringify(adapter)};\n`+transformed.replace(marker,`      measureWidth === void 0 ? node : { ...node, width: measureWidth },
      void 0,
      "measurement"
    );`).replace(measured,`${measured}\n    erMeasuredGroup(nodesGroup.node(), node, getSubGraphTitleMargins(getConfig2()).subGraphTitleTopMargin);`);
}

export function patchERClusterLabel(originalSource,transformed=originalSource,adapter){
 original(originalSource,CLUSTERS,'cluster helper');importOnce(transformed,'erClusterLabel');
 const rectStart=transformed.indexOf('var rect = /* @__PURE__ */ __name(async (parent, node) => {');
 const start=transformed.indexOf('  let text;',rectStart),end=transformed.indexOf('  const width = node.width <= bbox.width + node.padding ? bbox.width + node.padding : node.width;',start);
 if(rectStart<0||start<0||end<0)throw new Error('Mermaid ER cluster label boundary missing');
 const native=transformed.slice(start,end);
 if(native.includes('erClusterLabel'))throw new Error('Mermaid ER erClusterLabel already patched');
 const replacement=`  const bbox = await erClusterLabel(labelEl, node, labelStyles, async () => {\n${native}    return bbox;\n  });\n`;
 return `import { erClusterLabel } from ${JSON.stringify(adapter)};\n`+transformed.slice(0,start)+replacement+transformed.slice(end);
}

export function patchEREdgeLabel(originalSource,transformed=originalSource,adapter){
 original(originalSource,EDGES,'edge helper');importOnce(transformed,'erEdgeLabel');
 const start=transformed.indexOf('  const labelElement = await createText(',transformed.indexOf('var insertEdgeLabel'));
 const end=transformed.indexOf('  edgeLabels.set(edge.id, edgeLabel);',start);
 if(start<0||end<0)throw new Error('Mermaid ER edge label boundary missing');
 const native=transformed.slice(start,end);
 if(native.includes('erEdgeLabel'))throw new Error('Mermaid ER erEdgeLabel already patched');
 const replacement=`  const { labelElement, bbox } = await erEdgeLabel(label, edge, getLabelStyles(edge.labelStyle), async () => {\n${native}    return { labelElement, bbox };\n  });\n`;
 return `import { erEdgeLabel } from ${JSON.stringify(adapter)};\n`+transformed.slice(0,start)+replacement+transformed.slice(end);
}
