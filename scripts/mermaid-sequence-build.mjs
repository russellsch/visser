// Actor/note rendering slice of the sequence adapter. The parent plugin checks the
// complete artifact fingerprint before calling this exact-anchor transform.
export function patchSequenceMath(source, adapter) {
  if (source.includes('.vs-')) throw new Error('Native sequence stylesheet uses the reserved toolkit class namespace');
  let result = source;
  const replace = (before, after, count = 1) => {
    if (result.split(before).length !== count + 1) throw new Error('Mermaid sequence math patch is ambiguous');
    result = result.split(before).join(after);
  };
  replace('  rect.class = cssclass;', '  rect.class = sequenceActorClasses(cssclass);', 3);
  replace('  g.attr("class", cssclass);', '  g.attr("class", sequenceActorClasses(cssclass));');
  replace('  cylinderGroup.attr("class", cssclass);', '  cylinderGroup.attr("class", sequenceActorClasses(cssclass));');
  replace('  if (conf2.look !== "neo") {\n    return null;',
    '  if (conf2.look !== "neo" && !sequenceActorDimensions(actor)) {\n    return null;');
  replace('_drawTextCandidateFunc(conf2, hasKatex(actor.description))(',
    '(sequenceActorDraw(actor, isFooter) ?? _drawTextCandidateFunc(conf2, hasKatex(actor.description)))(', 8);
  replace('    if (actor.wrap) {\n      actor.description = utils_default.wrapLabel(',
    '    if (actor.wrap && !sequenceActorDimensions(actor)) {\n      actor.description = utils_default.wrapLabel(');
  replace('    const actDims = hasKatex(actor.description) ?',
    '    const mathDims = sequenceActorDimensions(actor);\n    const actDims = mathDims ?? (hasKatex(actor.description) ?');
  replace('utils_default.calculateTextDimensions(actor.description, actorFont(conf));',
    'utils_default.calculateTextDimensions(actor.description, actorFont(conf)));');
  replace('    actor.width = actor.wrap ? conf.width : common_default.getMax(conf.width, actDims.width + 2 * conf.wrapPadding);',
    '    actor.width = actor.wrap && !mathDims ? conf.width : common_default.getMax(conf.width, actDims.width + 2 * conf.wrapPadding);');
  replace('    if (getConfig2().look === "neo") {\n      actor.actorTextHeight',
    '    if (getConfig2().look === "neo" || mathDims) {\n      actor.actorTextHeight');
  replace('      const wrappedMessage = msg.wrap ? utils_default.wrapLabel(msg.message, conf.width - 2 * conf.wrapPadding, textFont) : msg.message;',
    '      const wrappedMessage = msg.wrap && !sequenceNoteDimensions(msg) ? utils_default.wrapLabel(msg.message, conf.width - 2 * conf.wrapPadding, textFont) : msg.message;');
  replace('      const messageDimensions = hasKatex(wrappedMessage) ? await calculateMathMLDimensions(msg.message, getConfig2()) : utils_default.calculateTextDimensions(wrappedMessage, textFont);',
    '      const messageDimensions = sequenceNoteDimensions(msg) ?? (hasKatex(wrappedMessage) ? await calculateMathMLDimensions(msg.message, getConfig2()) : utils_default.calculateTextDimensions(wrappedMessage, textFont));');
  replace('  let textDimensions = hasKatex(msg.message) ? await calculateMathMLDimensions(msg.message, getConfig2()) : utils_default.calculateTextDimensions(\n    shouldWrap ? utils_default.wrapLabel(msg.message, conf.width, noteFont(conf)) : msg.message,\n    noteFont(conf)\n  );',
    '  const mathNoteDims = sequenceNoteDimensions(msg);\n  let textDimensions = mathNoteDims ?? (hasKatex(msg.message) ? await calculateMathMLDimensions(msg.message, getConfig2()) : utils_default.calculateTextDimensions(\n    shouldWrap ? utils_default.wrapLabel(msg.message, conf.width, noteFont(conf)) : msg.message,\n    noteFont(conf)\n  ));');
  replace('  } else if (msg.to === msg.from) {\n    textDimensions = utils_default.calculateTextDimensions(',
    '  } else if (msg.to === msg.from) {\n    if (!mathNoteDims) textDimensions = utils_default.calculateTextDimensions(');
  replace('  if (shouldWrap) {\n    noteModel.message = utils_default.wrapLabel(',
    '  if (shouldWrap && !mathNoteDims) {\n    noteModel.message = utils_default.wrapLabel(');
  replace('  log.debug(\n    `NM:[${noteModel.startx}',
    '  sequenceNoteModel(msg, noteModel, diagObj.db.PLACEMENT, conf);\n  log.debug(\n    `NM:[${noteModel.startx}');
  replace('  const textElem = hasKatex(textObj.text) ? await drawKatex(g, textObj) : drawText(g, textObj);\n  const textHeight = Math.round(\n    textElem.map((te) => (te._groups || te)[0][0].getBBox().height).reduce((acc, curr) => acc + curr)\n  );',
    '  const textElem = sequenceNoteDraw(noteModel, g, textObj) ?? (hasKatex(textObj.text) ? await drawKatex(g, textObj) : drawText(g, textObj));\n  const textHeight = sequenceNoteHeight(noteModel) ?? Math.round(\n    textElem.map((te) => (te._groups || te)[0][0].getBBox().height).reduce((acc, curr) => acc + curr)\n  );');
  replace('  renderer: sequenceRenderer_default,',
    '  renderer: { ...sequenceRenderer_default, draw: createSequenceDraw(draw, getConfig2) },');
  return `import { createSequenceDraw, sequenceActorClasses, sequenceActorDimensions, sequenceActorDraw, sequenceNoteDimensions, sequenceNoteModel, sequenceNoteDraw, sequenceNoteHeight } from ${JSON.stringify(adapter)};\n${result}`;
}
