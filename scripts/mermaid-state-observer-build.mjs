import { createHash } from 'node:crypto';
import { patchStateClasses } from './mermaid-state-classes-build.mjs';

// The observer is coupled to Mermaid 12.0.0's state renderer. A dependency
// update must re-audit every extraction mutation before this patch may run.
const STATE_SHA256 = '33ba302a233f6a2b43efd12b2ba42cd1878d637bf79d351d5901812728c9318d';
export const stateObserverVersion = 1;

/** Add synchronous extraction observer calls to the exact pinned state chunk. */
export function patchStateObserver(source, observerImport) {
  if (createHash('sha256').update(source).digest('hex') !== STATE_SHA256) {
    throw new Error('Mermaid state artifact changed; review extraction observer patch');
  }
  let result = source;
  const replace = (before, after, count = 1) => {
    if (result.split(before).length !== count + 1) throw new Error('Mermaid state observer patch is ambiguous');
    result = result.split(before).join(after);
  };

  replace('    this.clear(true);\n', '    this.clear(true);\n    beginStateExtraction(this, this.nodes, this.edges);\n');
  replace('      doc2.note = note;\n      doc2.note.text = common_default.sanitizeText(doc2.note.text, getConfig());',
    '      doc2.note = note;\n      const noteBeforeSanitize = doc2.note.text;\n      doc2.note.text = common_default.sanitizeText(doc2.note.text, getConfig());\n      observeStateExtraction(this.nodes, "note-sanitized", { note: doc2.note, before: noteBeforeSanitize, after: doc2.note.text });');
  replace('      });\n    }\n    const newNode = nodeDb.get(itemId);',
    '      });\n      observeStateExtraction(nodes, "init", { item: parsedItem, target: nodeDb.get(itemId) });\n    }\n    const newNode = nodeDb.get(itemId);');
  replace('        newNode.description.push(parsedItem.description);',
    '        observeStateExtraction(nodes, "description", { mode: "append", target: newNode, item: parsedItem });\n        newNode.description.push(parsedItem.description);');
  replace('          newNode.description = [parsedItem.description];',
    '          observeStateExtraction(nodes, "description", { mode: "replace-implicit", target: newNode, item: parsedItem });\n          newNode.description = [parsedItem.description];');
  replace('          newNode.description = [newNode.description, parsedItem.description];',
    '          observeStateExtraction(nodes, "description", { mode: "prepend", target: newNode, item: parsedItem });\n          newNode.description = [newNode.description, parsedItem.description];');
  replace('          newNode.description = parsedItem.description;',
    '          observeStateExtraction(nodes, "description", { mode: "assign", target: newNode, item: parsedItem });\n          newNode.description = parsedItem.description;');
  replace('      newNode.description = common_default.sanitizeTextOrArray(newNode.description, config);',
    '      newNode.description = common_default.sanitizeTextOrArray(newNode.description, config);\n      observeStateExtraction(nodes, "sanitized", { target: newNode, item: parsedItem });');
  replace('      labelType: "markdown"\n    };\n    if (nodeData.shape === SHAPE_DIVIDER) {',
    '      labelType: "markdown"\n    };\n    observeStateExtraction(nodes, "candidate", { candidate: nodeData, target: newNode });\n    if (nodeData.shape === SHAPE_DIVIDER) {');
  replace('      noteData.parentId = parentNodeId;\n      insertOrUpdateNode(nodes, groupData, classes);',
    '      noteData.parentId = parentNodeId;\n      observeStateExtraction(nodes, "note", { item: parsedItem, note: noteData, group: groupData });\n      insertOrUpdateNode(nodes, groupData, classes);');
  replace('  } else {\n    nodes.push(nodeData);\n  }\n}',
    '  } else {\n    nodes.push(nodeData);\n  }\n  observeStateExtraction(nodes, "node", { candidate: nodeData, retained: existingNodeData ?? nodeData });\n}');
  replace('          edges.push(edgeData);',
    '          edges.push(edgeData);\n          observeStateExtraction(nodes, "relation", { item, edge: edgeData });');
  replace('      node.label = node.label[0];\n    }\n  }\n  handleStyleDef',
    '      node.label = node.label[0];\n      observeStateExtraction(this.nodes, "split", { node });\n    }\n    endStateExtraction(this, this.nodes, this.edges);\n  }\n  handleStyleDef');
  return `import { beginStateExtraction, observeStateExtraction, endStateExtraction } from ${JSON.stringify(observerImport)};\nexport const stateObserverVersion = 1;\n${patchStateClasses(source, observerImport.replace(/state-observer\.ts$/, 'state-classes.ts'), result)}`;
}
