// Composed after the actor/note patch, against the same fingerprinted artifact.
export function patchSequenceMessages(source, adapter) {
  let result=source;
  const replace=(before,after,count=1)=>{if(result.split(before).length!==count+1)throw new Error('Mermaid sequence message patch is ambiguous');result=result.split(before).join(after);};
  replace('async function boundMessage(_diagram, msgModel) {','async function boundMessage(_diagram, msgModel) {\n  const mathY = boundSequenceMessage(msgModel, bounds, conf);\n  if (mathY !== undefined) return mathY;');
  replace('  const textDims = utils_default.calculateTextDimensions(message, messageFont(conf));','  const textDims = sequenceMessageDimensions(msgModel) ?? utils_default.calculateTextDimensions(message, messageFont(conf));');
  replace('  if (hasKatex(textObj.text)) {\n    await drawKatex(diagram2, textObj, { startx, stopx, starty: lineStartY });','  if (drawSequenceMessage(msgModel, diagram2, lineStartY)) {\n    // Prepared DOM was placed synchronously.\n  } else if (hasKatex(textObj.text)) {\n    await drawKatex(diagram2, textObj, { startx, stopx, starty: lineStartY });');
  replace('          messagesToDraw.push({ messageModel: msgModel, lineStartY, msg });','          reserveSequenceMessageBounds(msgModel, lineStartY, bounds, conf);\n          messagesToDraw.push({ messageModel: msgModel, lineStartY, msg });');
  replace('          log.error("error while drawing message", e);','          if (sequenceMessageDimensions(msg)) throw e;\n          log.error("error while drawing message", e);');
  replace('var buildMessageModel = /* @__PURE__ */ __name(function(msg, actors, diagObj) {','var buildMessageModel = /* @__PURE__ */ __name(async function(msg, actors, diagObj) {');
  replace('  if (msg.wrap && msg.message) {\n    msg.message = utils_default.wrapLabel(', '  await finalizeSequenceMessage(msg, common_default.getMax(boundedWidth + 2 * conf.wrapPadding, conf.width));\n  if (msg.wrap && msg.message && !sequenceMessageDimensions(msg)) {\n    msg.message = utils_default.wrapLabel(');
  replace('  const msgDims = utils_default.calculateTextDimensions(msg.message, messageFont(conf));\n  return {', '  const mathDims = sequenceMessageDimensions(msg);\n  const msgDims = mathDims ?? utils_default.calculateTextDimensions(msg.message, messageFont(conf));\n  return bindSequenceMessage(msg, {');
  replace('      msg.wrap ? 0 : msgDims.width + 2 * conf.wrapPadding,','      msg.wrap && !mathDims ? 0 : msgDims.width + 2 * conf.wrapPadding,');
  replace('    toBounds: Math.max.apply(null, allBounds)\n  };','    toBounds: Math.max.apply(null, allBounds)\n  });');
  replace('      msgModel = buildMessageModel(msg, actors, diagObj);','      msgModel = await buildMessageModel(msg, actors, diagObj);');
  replace('      if (msgModel.startx && msgModel.stopx && stack.length > 0) {','      if ((sequenceMessageDimensions(msgModel) ? Number.isFinite(msgModel.startx) && Number.isFinite(msgModel.stopx) : msgModel.startx && msgModel.stopx) && stack.length > 0) {');
  // The note adapter supplies the parallel ownership-aware preliminary branch.
  replace('      const wrappedMessage = msg.wrap && !sequenceNoteDimensions(msg) ?', '      const wrappedMessage = msg.wrap && !sequenceNoteDimensions(msg) && !sequenceMessageDimensions(msg) ?');
  replace('      const messageDimensions = ', '      const messageDimensions = sequenceMessageDimensions(msg) ?? ');
  return `import { sequenceMessageDimensions, finalizeSequenceMessage, bindSequenceMessage, boundSequenceMessage, reserveSequenceMessageBounds, drawSequenceMessage } from ${JSON.stringify(adapter)};\n${result}`;
}
