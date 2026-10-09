import {createHash} from 'node:crypto';
const REQUIREMENT='78077a43ffafbf1f752fe3ea7d7c78a0c7f9af6ad00ab3a619e9c494fc74cb0a';
const SHAPES='4046b2f1b5524ca743ddd13b24be059278b026fd074e56e84629c2e74b104dce';
function replace(source,from,to){if(source.split(from).length!==2)throw new Error('Requirement patch marker differs: '+from);return source.replace(from,to);}
export function assertRequirementShapeArtifact(source){
 if(createHash('sha256').update(source).digest('hex')!==SHAPES)throw new Error('Requirement shape artifact changed');
}
export function patchRequirementRenderer(source,adapter){
 if(createHash('sha256').update(source).digest('hex')!==REQUIREMENT)throw new Error('Requirement renderer artifact changed');
 source=replace(source,'var diagram = {',`draw = createRequirementMathRenderer({original:draw,getConfig:getConfig2,normalize:input=>sanitizeText2(decodeEntities(input))});\nvar diagram = {`);
 return `import {createRequirementMathRenderer} from ${JSON.stringify(adapter)};\nimport {sanitizeText2} from './chunk-O7XYJQB3.mjs';\nimport {decodeEntities} from './chunk-ZIGJFQKS.mjs';\n`+source;
}
export function patchRequirementRows(source,adapter){
 assertRequirementShapeArtifact(source);return patchRequirementRowsAfterVerification(source,adapter);
}
/** Compose shape transforms only after every transform has authenticated the
 * same original upstream bytes. */
export function patchRequirementRowsAfterVerification(source,adapter){
 const start=source.indexOf('async function requirementBox(parent, node) {'),end=source.indexOf('__name(requirementBox, "requirementBox");',start);if(start<0||end<0)throw new Error('Requirement shape boundary missing');
 let shape=source.slice(start,end),index=0;
 const roles=['stereotype','stereotype','name','id','text','risk','verifyMethod','type','docRef'];
 shape=shape.replace(/addText3\(/g,()=>`visserRows.add(${JSON.stringify(roles[index++])}, `);if(index!==roles.length)throw new Error('Requirement row call coverage changed');
 shape=replace(shape,'  node.labelStyle = labelStyles;','  node.labelStyle = labelStyles;\n  const visserRows = requirementRows(parent,node,{native:addText3,normalize:input=>sanitizeText2(decodeEntities(input))});');
 shape=replace(shape,'  const totalWidth =','  visserRows.finish();\n  const visserBounds = shapeSvg.node().getBBox();\n  const totalWidth =');
 shape=replace(shape,'${newTranslateY + padding}', '${visserRows.active ? newTranslateY + padding / 2 - visserBounds.y : newTranslateY + padding}');
 shape=replace(shape,'if (accumulativeHeight > typeHeight + nameHeight + gap)', 'if (visserRows.active ? visserRows.body : accumulativeHeight > typeHeight + nameHeight + gap)');
 shape=replace(shape,'const lineY = y + typeHeight + nameHeight + gap;', 'const lineY = y + typeHeight + nameHeight + (visserRows.active ? padding / 2 + gap / 2 : gap);');
 shape=replace(shape,'shapeSvg.selectAll("path").attr("style", nodeStyles);','shapeSvg.selectAll(visserRows.active ? ":scope > .outer-path path, :scope > .divider path, :scope > path" : "path").attr("style", nodeStyles);');
 return `import {requirementRows} from ${JSON.stringify(adapter)};\n`+source.slice(0,start)+shape+source.slice(end);
}
