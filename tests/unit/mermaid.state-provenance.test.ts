import { describe, expect, it } from 'vitest';
import { createStateProvenance, type Leaf } from '../../packages/core/src/mermaid/state-provenance.ts';
import type { StateLabelRecord, StateLabels, StateStatement } from '../../packages/core/src/mermaid/state-labels.ts';
import { ProvenanceText } from '../../packages/core/src/mermaid/source-provenance.ts';
import type { StateExtractionEvent } from '../../packages/core/src/mermaid/state-observer.ts';

function fixture(fields: readonly [StateLabelRecord['role'], string, StateStatement][]): StateLabels {
  let index = 0;
  return { parserSource: 'source', root: [...new Set(fields.map(field => field[2]))], records: fields.map(([role, text, statement]) => ({
    recordIndex: ++index, role, semanticValue: text, mappedValue: ProvenanceText.identity(text), intervals: [], synthetic: false, statement,
  })) };
}
function events(labels: StateLabels, sanitizer = (value: ProvenanceText) => value) {
  const consumer = createStateProvenance(labels, sanitizer);
  return { consumer, send: (event: StateExtractionEvent) => consumer.listener(event) };
}
const begin = (send: (event: StateExtractionEvent) => void, nodes: object[] = [], edges: object[] = []) => send({ kind: 'begin', db: {}, nodes, edges });
const end = (send: (event: StateExtractionEvent) => void, nodes: object[] = [], edges: object[] = []) => send({ kind: 'end', db: {}, nodes, edges });
const texts = (value: Leaf | readonly Leaf[]): unknown => 'mapped' in value ? value.mapped.text : value.map(texts);

describe('state extraction provenance', () => {
  it('keeps equal records distinct by statement identity and promotes only visible implicit labels', () => {
    const first: StateStatement = { id: 'A' }; const second: StateStatement = { id: 'A' };
    const labels = fixture([['state.implicit', 'A', first], ['state.implicit', 'A', second]]);
    const { consumer, send } = events(labels);
    const one: Record<string, unknown> = { description: 'A' }; const two: Record<string, unknown> = { description: 'A' };
    const candidateOne = { label: 'A', shape: 'rect' }; const candidateTwo = { label: 'A', shape: 'roundedWithTitle' };
    const nodes = [one, two]; begin(send, nodes);
    send({ kind: 'init', item: first, target: one }); send({ kind: 'candidate', target: one, candidate: candidateOne }); send({ kind: 'node', candidate: candidateOne, retained: one });
    send({ kind: 'init', item: second, target: two }); send({ kind: 'candidate', target: two, candidate: candidateTwo }); send({ kind: 'node', candidate: candidateTwo, retained: two }); end(send, nodes);
    const result = consumer.result();
    expect((result.nodes.get(one)!.label as Leaf).recordIndices).toEqual([1]);
    expect(result.nodes.get(one)!.promotedImplicitRecordIndices).toEqual([1]);
    expect((result.nodes.get(two)!.label as Leaf).recordIndices).toEqual([2]);
    expect(result.nodes.get(two)!.promotedImplicitRecordIndices).toEqual([]);
  });

  it('follows reported description branch modes and flattens exactly one level when sanitized', () => {
    const state: StateStatement = { id: 'A', description: 'one' };
    const second: StateStatement = { id: 'A', description: 'two' };
    const third: StateStatement = { id: 'A', description: 'three' };
    const labels = fixture([['state.implicit','A',state], ['state.description', 'one', state], ['state.description', 'two', second], ['state.description', 'three', third]]);
    const { consumer, send } = events(labels, value => value.replace(0, value.length, value.text === 'A' ? '' : value.text.toUpperCase()));
    const target: Record<string, unknown> = {description:''};
    begin(send);
    send({kind:'init',item:state,target});
    send({ kind: 'description', mode: 'assign', item: state, target });
    target.description = 'one'; send({ kind: 'description', mode: 'replace-implicit', item: second, target });
    target.description = ['two']; send({ kind: 'description', mode: 'prepend', item: third, target });
    // Native sanitization has already flattened the reported nested shape.
    target.description = ['TWO', 'THREE']; send({ kind: 'sanitized', item: state, target });
    const candidate: Record<string, unknown> = { label: ['TWO', 'THREE'], shape: 'rectWithTitle' }; send({ kind: 'candidate', target, candidate });
    candidate.label = 'TWO'; candidate.description = ['THREE']; send({ kind: 'split', node: candidate }); send({ kind: 'node', candidate, retained: target }); end(send, [target]);
    const node = consumer.result().nodes.get(target)!;
    expect(texts(node.label as Leaf)).toBe('TWO');
    expect(texts(node.description as readonly Leaf[])).toEqual(['THREE']);
  });

  it('moves a candidate to an existing retained node after an update', () => {
    const state: StateStatement = { id: 'A' }; const labels = fixture([['state.implicit', 'A', state]]);
    const { consumer, send } = events(labels); const target: Record<string, unknown> = { description: 'A' }; const retained = {};
    begin(send, [retained]); send({ kind: 'init', item: state, target });
    const candidate = { label: 'A', shape: 'rect' }; send({ kind: 'candidate', target, candidate }); send({ kind: 'node', candidate, retained }); end(send, [retained]);
    expect((consumer.result().nodes.get(retained)!.label as Leaf).recordIndices).toEqual([1]);
  });

  it('snapshots node and edge identity before later native mutation', () => {
    const state: StateStatement = { id: 'A' }; const relation: StateStatement = { description: 'move' };
    const labels = fixture([['state.implicit', 'A', state], ['transition', 'move', relation]]);
    const { consumer, send } = events(labels); const retained: Record<string, unknown> = { id: 'node-a', domId: 'dom-a', shape: 'rect', description: 'A' };
    const edge: Record<string, unknown> = { id: 'a-b', start: 'a', end: 'b', label: 'move' };
    begin(send, [retained], [edge]); send({ kind: 'init', item: state, target: retained });
    const candidate = { label: 'A', shape: 'rect' }; send({ kind: 'candidate', target: retained, candidate }); send({ kind: 'node', candidate, retained });
    send({ kind: 'relation', item: relation, edge }); end(send, [retained], [edge]);
    const result = consumer.result(); retained.id = 'changed'; retained.domId = 'changed-dom'; retained.shape = 'choice'; delete retained.description;
    edge.id = 'changed-edge'; edge.start = 'x'; edge.end = 'y';
    expect(result.nodes.get(retained)!.identity).toEqual({ id: 'node-a', domId: 'dom-a', shape: 'rect', hasDescription: true });
    expect(result.edges.get(edge)!.identity).toEqual({ id: 'a-b', start: 'a', end: 'b' });
    expect(Object.isFrozen(result.nodes.get(retained)!.identity)).toBe(true);
  });

  it('carries note sanitizer history across epochs and maps a note while keeping its group structural', () => {
    const statement: StateStatement = { id: 'state', note: { text: 'note' } }; const note = statement.note!;
    const labels = fixture([['note', 'note', statement]]); const { consumer, send } = events(labels, value => value.replace(0, value.length, `safe:${value.text}`));
    const noteNode: Record<string, unknown> = { id: 'note', label: 'safe:note', shape: 'note' }; const group = {};
    begin(send, [noteNode, group]); send({ kind: 'note-sanitized', note, before: 'note', after: 'safe:note' }); send({ kind: 'note', item: statement, note: noteNode, group }); send({ kind: 'node', candidate: noteNode, retained: noteNode }); end(send, [noteNode, group]);
    begin(send, [noteNode, group]); send({ kind: 'note-sanitized', note, before: 'safe:note', after: 'safe:safe:note' }); noteNode.label = 'safe:safe:note'; send({ kind: 'note', item: statement, note: noteNode, group }); send({ kind: 'node', candidate: noteNode, retained: noteNode }); end(send, [noteNode, group]);
    const result = consumer.result(); expect((result.nodes.get(noteNode)!.label as Leaf).mapped.text).toBe('safe:safe:note'); expect(result.nodes.get(group)!.structural).toBe(true);
  });

  it('rejects mismatched native values and result calls before end', () => {
    const statement: StateStatement = { id: 'A' }; const labels = fixture([['state.implicit', 'A', statement]]); const { consumer, send } = events(labels);
    expect(() => consumer.result()).toThrow('before extraction completed');
    begin(send); expect(() => send({ kind: 'init', item: statement, target: { description: 'wrong' } })).toThrow('initial state description');
  });

  it('rejects unexplained ID generation and description ownership', () => {
    const unknown = events(fixture([])); begin(unknown.send);
    expect(() => unknown.send({kind:'init',item:{id:'invented'},target:{description:'invented'}})).toThrow('no attested grammar origin');
    const state: StateStatement = {id:'A',description:'text'};
    const uninitialized = events(fixture([['state.description','text',state]])); begin(uninitialized.send);
    expect(() => uninitialized.send({kind:'description',mode:'assign',item:state,target:{description:''}})).toThrow('no initialized source value');
    const ambiguous = events(fixture([['state.implicit','A',state],['state.description','text',state],['state.description','extra',state]]));
    begin(ambiguous.send); const target={description:'A'};
    ambiguous.send({kind:'init',item:state,target});
    expect(() => ambiguous.send({kind:'description',mode:'replace-implicit',item:state,target})).toThrow('does not match its grammar record');
  });

  it('allows generated empty connectors but rejects unexplained nonempty edges', () => {
    const statement: StateStatement = { id: 'state', note: { text: 'n' } }; const grammarNote = statement.note!;
    const { consumer, send } = events(fixture([['note', 'n', statement]]));
    const note = { id: 'note', label: 'n' }; const group = { id: 'group' }; const empty = { id: 'state-note', start: 'state', end: 'note' };
    begin(send, [], [empty]); send({ kind: 'note-sanitized', note: grammarNote, before: 'n', after: 'n' }); send({ kind: 'note', item: statement, note, group }); end(send, [], [empty]); expect((consumer.result().edges.get(empty)!.label as Leaf).mapped.text).toBe('');
    const bad = events(fixture([])); begin(bad.send, [], [{ label: 'hidden' }]); expect(() => end(bad.send, [], [{ label: 'hidden' }])).toThrow('layout edge has no provenance');
  });
});
