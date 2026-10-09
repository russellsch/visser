// Reproducible instrumentation of Mermaid's pinned js-yaml parser. No runtime code generation.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const input = new URL('../node_modules/mermaid/dist/chunks/mermaid.core/chunk-LNGE3PJU.mjs', import.meta.url);
export function instrumentMermaidYaml(source) {
  if (createHash('sha256').update(source).digest('hex') !== '2cb4e5f8d5fd99daccb0135fda6a5583c91f39efb0bb845af9d968ed427efcb2') throw Error('Pinned Mermaid YAML source changed');
  function patch(from, to, count = 1) {
    const found = source.split(from).length - 1;
    if (found !== count) throw Error(`YAML patch expected ${count}, found ${found}: ${from}`);
    source = source.split(from).join(to);
  }
  patch('import {\n  __name\n} from "./chunk-Y2CYZVJY.mjs";', 'const __name = (target, name) => Object.defineProperty(target, "name", { value: name, configurable: true });');
  patch('this.input = input;', 'this.input = input; this.provenance = options.provenance;');
  patch('function storeAnchor(state, name, value) {', 'function storeAnchor(state, name, value) {\n    state.provenance.anchor(name, value);');
  patch('function beginAnchorTransaction(state) {', 'function beginAnchorTransaction(state) {\n    state.provenance.begin();');
  patch('function commitAnchorTransaction(state) {', 'function commitAnchorTransaction(state) {\n    state.provenance.commit();');
  patch('function rollbackAnchorTransaction(state) {', 'function rollbackAnchorTransaction(state) {\n    state.provenance.rollback();');
  patch('function snapshotState(state) {\n    return {', 'function snapshotState(state) {\n    return { provenance: state.provenance.snapshot(),');
  patch('function restoreState(state, snapshot) {', 'function restoreState(state, snapshot) {\n    state.provenance.restore(snapshot.provenance);');
  patch('state.result += _result;', 'state.provenance.copy(start, end);\n      state.result += _result;');
  patch('function readLineBreak(state) {', 'function readLineBreak(state) {\n    state.provenance.breakAt(state.position);');
  patch('state.result = "";', 'state.result = ""; state.provenance.scalar(state.position);', 4);
  patch('captureStart = state.position;\n          state.position++;', 'state.provenance.replace(state.position - 1, state.position + 1, "\'");\n          captureStart = state.position + 1;\n          state.result += "\'";\n          state.position++;');
  patch('state.result += simpleEscapeMap[ch];', 'state.provenance.replace(state.position - 1, state.position + 1, simpleEscapeMap[ch]);\n          state.result += simpleEscapeMap[ch];');
  patch('let hexLength = tmp;', 'const escapeStart = state.position - 1;\n          let hexLength = tmp;');
  patch('state.result += charFromCodepoint(hexResult);', 'state.provenance.replace(escapeStart, state.position + 1, charFromCodepoint(hexResult));\n          state.result += charFromCodepoint(hexResult);');
  // All scalar line-fold/chomp writes use the physical line-breaks accumulated since the last capture.
  for (const expr of ['" "', 'common2.repeat("\\n", count - 1)', 'common2.repeat("\\n", didReadContent ? 1 + emptyLines : emptyLines)', '"\\n"', 'common2.repeat("\\n", emptyLines + 1)', 'common2.repeat("\\n", emptyLines)']) {
   const counts = {'" "':2, 'common2.repeat("\\n", count - 1)':1, 'common2.repeat("\\n", didReadContent ? 1 + emptyLines : emptyLines)':3, '"\\n"':1, 'common2.repeat("\\n", emptyLines + 1)':1, 'common2.repeat("\\n", emptyLines)':1};
   patch(`state.result += ${expr};`, `state.provenance.fold(${expr}, ${expr.includes("count - 1") || expr === 'common2.repeat("\\n", emptyLines)'}); state.result += ${expr};`, counts[expr]);
  }
  patch('function composeNode(state, parentIndent, nodeContext, allowToSeek, allowCompact) {', 'function composeNode(state, parentIndent, nodeContext, allowToSeek, allowCompact) {\n    const provenanceFrame = state.provenance.open(state.position);');
  patch('    if (indentStatus === 1) {\n      while (true)', '    provenanceFrame.node.start = state.position;\n    if (indentStatus === 1) {\n      while (true)');
  patch('    if (state.tag === null) {\n      if (state.anchor !== null)', '    state.provenance.before(state, provenanceFrame);\n    if (state.tag === null) {\n      if (state.anchor !== null)');
  patch('    state.depth -= 1;', '    state.provenance.close(state, provenanceFrame);\n    state.depth -= 1;');
  patch('state.result = state.anchorMap[alias];', 'state.result = state.anchorMap[alias];\n    state.provenance.alias(alias, _position - 1, state.position);');
  patch('state.documents.push(state.result);', 'state.documents.push(state.result); state.provenance.document();');
  // Local relation handles follow the parser\'s successful stores, never speculative listener events.
  patch('let keyNode;', 'let keyNode; let keyTrace = null; let valueTrace = null;');
  patch('let keyNode = null;', 'let keyNode = null; let keyTrace = null; let valueTrace = null;');
  patch('keyNode = state.result;', 'keyNode = state.result; keyTrace = state.provenance.last;', 3);
  patch('valueNode = state.result;', 'valueNode = state.result; valueTrace = state.provenance.last;', 2);
  patch('keyTag = keyNode = valueNode = null;', 'keyTag = keyNode = valueNode = null; keyTrace = valueTrace = null;', 4);
  patch('startLine, startLineStart, startPos) {', 'startLine, startLineStart, startPos, keyTrace, valueTrace) {');
  patch('setProperty(_result, keyNode, valueNode);', 'setProperty(_result, keyNode, valueNode); state.provenance.pair(_result, keyNode, keyTrace, valueTrace);');
  patch('valueNode, _line, _lineStart, _pos)', 'valueNode, _line, _lineStart, _pos, keyTrace, valueTrace)', 2);
  patch('null, _keyLine, _keyLineStart, _keyPos)', 'null, _keyLine, _keyLineStart, _keyPos, keyTrace, null)', 3);
  patch('valueNode, _keyLine, _keyLineStart, _keyPos)', 'valueNode, _keyLine, _keyLineStart, _keyPos, keyTrace, valueTrace)');
  patch('_result.push(keyNode);', '_result.push(keyNode); state.provenance.item(_result, keyTrace);');
  patch('_result.push(state.result);', '_result.push(state.result); state.provenance.item(_result, state.provenance.last);');
  patch('_result.push(null);', '_result.push(null); state.provenance.item(_result, null);');
  patch('_result.push(storeMappingPair(state, null, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos, keyTrace, valueTrace));', 'const pair = storeMappingPair(state, null, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos, keyTrace, valueTrace); _result.push(pair); state.provenance.item(_result, state.provenance.collection(pair));');
  return '// Generated by scripts/mermaid-yaml-build.mjs; js-yaml MIT license in yaml-provenance.LICENSE.\n' + source;
}

export async function generateMermaidYaml() {
  const source = await readFile(input, 'utf8');
  await writeFile(new URL('../packages/core/src/mermaid/vendor/yaml-provenance.mjs', import.meta.url), instrumentMermaidYaml(source));
}

if (import.meta.main) await generateMermaidYaml();
