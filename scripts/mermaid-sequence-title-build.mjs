export function patchSequenceTitles(source, adapter) {
  let result=source;
  const replace=(before,after,count=1)=>{if(result.split(before).length!==count+1)throw new Error('Mermaid sequence title patch is ambiguous');result=result.split(before).join(after);};
  replace('      this.boxes.push(boxModel);','      this.boxes.push(sequenceBoxSnapshot(boxModel));');
  replace('  boxes.forEach((box) => {\n    const textFont = messageFont(conf);','  for (const box of boxes) {\n    await finalizeSequenceBox(box, conf);\n    const textFont = messageFont(conf);');
  replace('    if (box.wrap) {\n      box.name = utils_default.wrapLabel(', '    if (box.wrap && !sequenceBoxDimensions(box)) {\n      box.name = utils_default.wrapLabel(');
  replace('    const boxMsgDimensions = utils_default.calculateTextDimensions(box.name, textFont);','    const boxMsgDimensions = sequenceBoxDimensions(box) ?? utils_default.calculateTextDimensions(box.name, textFont);');
  replace('  });\n  boxes.forEach((box) => box.textMaxHeight = maxBoxHeight);','    reserveSequenceBoxMargin(box, conf);\n  }\n  boxes.forEach((box) => box.textMaxHeight = maxBoxHeight);');
  replace('  if (box.name) {\n    _drawTextCandidateFunc(conf2)(', '  if (box.name && !drawSequenceBox(box, g, conf2)) {\n    _drawTextCandidateFunc(conf2)(');
  replace('    maxBoxHeight = common_default.getMax(boxMsgDimensions.height, maxBoxHeight);',
    '    const mathHeaderExtra = sequenceBoxDimensions(box) ? Math.max(0, conf.boxTextMargin + 5 - conf.boxMargin) : 0;\n    maxBoxHeight = common_default.getMax(boxMsgDimensions.height + mathHeaderExtra, maxBoxHeight);');
  replace('  if (title) {\n    diagram2.append("text").text(title)', '  if (title && !hasSequenceTitle(diagram2.node())) {\n    diagram2.append("text").text(title)');
  replace('  const extraVertForTitle = title ? 40 : 0;', '  const extraVertForTitle = hasSequenceTitle(diagram2.node()) ? 0 : (title ? 40 : 0);');
  replace('  log.debug(`models:`, bounds.models);', '  const mathTitleSize = finalizeSequenceTitle(diagram2.node(), title, conf.diagramMarginY);\n  if (mathTitleSize) configureSvgSize(diagram2, mathTitleSize.height, mathTitleSize.width, conf.useMaxWidth);\n  log.debug(`models:`, bounds.models);');
  return `import { finalizeSequenceBox, sequenceBoxDimensions, reserveSequenceBoxMargin, sequenceBoxSnapshot, drawSequenceBox, hasSequenceTitle, finalizeSequenceTitle } from ${JSON.stringify(adapter)};\n${result}`;
}
