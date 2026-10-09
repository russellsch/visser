import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error build scripts are JavaScript, outside the TypeScript project.
import { patchStateObserver, stateObserverVersion } from '../../scripts/mermaid-state-observer-build.mjs';

const chunk = () => readFileSync(resolve('node_modules/mermaid/dist/chunks/mermaid.core/stateDiagram-v2-GCMORJYK.mjs'), 'utf8');

describe('version-checked Mermaid state extraction observer patch', () => {
  it('patches the pinned artifact once with synchronous, named observer imports', () => {
    const source = chunk();
    const patched = patchStateObserver(source, '/observer.mjs');
    expect(stateObserverVersion).toBe(1);
    expect(patched.startsWith('import { beginStateExtraction, observeStateExtraction, endStateExtraction } from "/observer.mjs";\n')).toBe(true);
    expect(patched).toContain('export const stateObserverVersion = 1;');
    expect(patched).toContain('this.clear(true);\n    beginStateExtraction(this, this.nodes, this.edges);');
    expect(patched).toContain('endStateExtraction(this, this.nodes, this.edges);');
    const events = (kind: string) => patched.match(new RegExp(`observeStateExtraction\\([^\\n]*, "${kind}"`, 'g')) ?? [];
    expect(events('description')).toHaveLength(4);
    expect(events('sanitized')).toHaveLength(1);
    expect(events('candidate')).toHaveLength(1);
    expect(events('init')).toHaveLength(1);
    expect(events('node')).toHaveLength(1);
    expect(events('relation')).toHaveLength(1);
    expect(events('note')).toHaveLength(1);
    expect(events('note-sanitized')).toHaveLength(1);
    expect(events('split')).toHaveLength(1);
    expect(patched).toContain('mode: "append"');
    expect(patched).toContain('mode: "replace-implicit"');
    expect(patched).toContain('mode: "prepend"');
    expect(patched).toContain('mode: "assign"');
  });

  it('does not accept a changed artifact or apply to already patched source', () => {
    const source = chunk();
    expect(() => patchStateObserver(source + '\n// changed\n', '/observer.mjs')).toThrow('Mermaid state artifact changed');
    expect(() => patchStateObserver(patchStateObserver(source, '/observer.mjs'), '/observer.mjs')).toThrow('Mermaid state artifact changed');
  });

  it('preserves each native anchor and changes only the observer insertion sites', () => {
    const patched = patchStateObserver(chunk(), '/observer.mjs');
    expect(patched).toContain('edges.push(edgeData);\n          observeStateExtraction(nodes, "relation", { item, edge: edgeData });\n          graphItemCount++;');
    expect(patched).toContain('observeStateExtraction(nodes, "note", { item: parsedItem, note: noteData, group: groupData });\n      insertOrUpdateNode(nodes, groupData, classes);');
    expect(patched).toContain('const noteBeforeSanitize = doc2.note.text;\n      doc2.note.text = common_default.sanitizeText(doc2.note.text, getConfig());\n      observeStateExtraction(this.nodes, "note-sanitized", { note: doc2.note, before: noteBeforeSanitize, after: doc2.note.text });');
    expect(patched).toContain('nodes.push(nodeData);\n  }\n  observeStateExtraction(nodes, "node", { candidate: nodeData, retained: existingNodeData ?? nodeData });\n}');
  });
});
