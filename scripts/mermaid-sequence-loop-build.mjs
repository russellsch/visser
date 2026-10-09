// Composed after the actor/note/message/title patches against the same
// fingerprinted Mermaid 12 sequence chunk. Every anchor is exact and unique.
export function patchSequenceLoops(source, adapter) {
  let result = source;
  const replace = (before, after, count = 1) => {
    if (result.split(before).length !== count + 1) throw new Error('Mermaid sequence loop patch is ambiguous');
    result = result.split(before).join(after);
  };
  replace('function adjustLoopHeightForWrap(loopWidths, msg, preMargin, postMargin, addLoopFn) {',
    'function adjustLoopHeightForWrap(loopWidths, msg, preMargin, postMargin, addLoopFn) {\n  if (sequenceLoopAdvance(loopWidths, msg, preMargin, postMargin, addLoopFn, bounds, conf)) return;');
  replace('  createLoop: /* @__PURE__ */ __name(function(title = { message: void 0, wrap: false, width: void 0 }, fill) {\n    return {',
    '  createLoop: /* @__PURE__ */ __name(function(title = { message: void 0, wrap: false, width: void 0 }, fill) {\n    return bindSequenceLoopModel(title, {');
  replace('      fill\n    };\n  }, "createLoop"),',
    '      fill\n    });\n  }, "createLoop"),');
  replace('  const g = elem.append("g").attr("data-et", "control-structure").attr("data-id", "i" + msg.id);',
    '  reserveSequenceLoopModel(loopModel, bounds, conf2);\n  const g = elem.append("g").attr("data-et", "control-structure").attr("data-id", "i" + msg.id);');
  replace('  let textElem = hasKatex(txt.text) ? await drawKatex(g, txt, loopModel) : drawText(g, txt);',
    '  let textElem = drawSequenceLoopHeader(loopModel, g, txt) ?? (hasKatex(txt.text) ? await drawKatex(g, txt, loopModel) : drawText(g, txt));');
  replace('        if (hasKatex(txt.text)) {\n          loopModel.starty = loopModel.sections[idx].y;\n          await drawKatex(g, txt, loopModel);\n        } else {\n          drawText(g, txt);\n        }\n        let sectionHeight = Math.round(\n          textElem.map((te) => (te._groups || te)[0][0].getBBox().height).reduce((acc, curr) => acc + curr)\n        );',
    '        const mathSection = sequenceLoopDimensions(item);\n        let sectionTextElem;\n        if (mathSection) {\n          drawSequenceLoopSection(item, g, txt);\n        } else if (hasKatex(txt.text)) {\n          loopModel.starty = loopModel.sections[idx].y;\n          sectionTextElem = await drawKatex(g, txt, loopModel);\n        } else {\n          sectionTextElem = drawText(g, txt);\n        }\n        let sectionHeight = mathSection?.height ?? Math.round(\n          (sequenceLoopDimensions(loopModel) ? sectionTextElem : textElem).map((te) => (te._groups || te)[0][0].getBBox().height).reduce((acc, curr) => acc + curr)\n        );');
  return `import { sequenceLoopAdvance, bindSequenceLoopModel, reserveSequenceLoopModel, drawSequenceLoopHeader, drawSequenceLoopSection, sequenceLoopDimensions } from ${JSON.stringify(adapter)};\n${result}`;
}
