import {createHash} from 'node:crypto';

const SWIMLANES='4ae52a179cc4921842cf50918f81d67b701a7402fa1b9070ed2dcfc1ed3ba2c6';
const SHAPES='4046b2f1b5524ca743ddd13b24be059278b026fd074e56e84629c2e74b104dce';
const digest=source=>createHash('sha256').update(source).digest('hex');
function original(source,expected,name){if(digest(source)!==expected)throw new Error(`Mermaid swimlane ${name} artifact changed; review edge label identity`);}
function once(source,marker,name){if(source.split(marker).length!==2)throw new Error(`Mermaid swimlane ${name} marker differs`);}

// Swimlane moves edge labels into the node layer. Carry the authored edge ID
// through that synthetic label node so the runtime can bind it exactly.
export function patchSwimlaneEdgeLabelNode(originalSource,transformed=originalSource){
 original(originalSource,SWIMLANES,'layout');
 const marker='      edgeEnd: edge.end ?? "",\n';
 once(transformed,marker,'edge label node');
 if(transformed.includes('visserEdgeId'))throw new Error('Mermaid swimlane edge label node already patched');
 return transformed.replace(marker,`${marker}      visserEdgeId: edge.id,\n`);
}

export function patchSwimlaneEdgeLabelAttribute(originalSource,transformed=originalSource){
 original(originalSource,SHAPES,'shared shapes');
 const marker='  shapeSvg.attr("class", "label edgeLabel");';
 once(transformed,marker,'edge label shape');
 if(transformed.includes('data-vs-native-edge-id'))throw new Error('Mermaid swimlane edge label shape already patched');
 return transformed.replace(marker,`${marker}\n  if (typeof node.visserEdgeId === "string") shapeSvg.attr("data-vs-native-edge-id", node.visserEdgeId);`);
}
