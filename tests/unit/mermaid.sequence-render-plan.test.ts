// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { MATH_LIMITS } from '../../packages/core/src/math/policy.ts';
import { extractSequenceMath } from '../../packages/core/src/mermaid/sequence-math.ts';
import { planSequenceRenderCopies, reserveSequenceRenderCopies } from '../../packages/core/src/mermaid/sequence-render-plan.ts';

type Db = Record<string, (...args: unknown[]) => unknown>;

async function native(source: string) {
  // Parse independently with Mermaid's pinned Jison/DB, as the browser worker
  // does. The collector creates a separate DB with the same source effects;
  // parse the native DB last because Mermaid's common title DB is global.
  const authored = await extractSequenceMath(source);
  // @ts-expect-error pinned Mermaid chunk has no declaration file
  const module = await import('mermaid/dist/chunks/mermaid.core/sequenceDiagram-PO4LG4MO.mjs');
  const pinned = module.diagram.parser.parser;
  const db = module.diagram.db as Db;
  const parser = new pinned.Parser();
  parser.lexer = Object.create(pinned.lexer);
  parser.yy = db;
  parser.parse(source);
  return { db, ...authored };
}

const plan = (db: Db, records: Awaited<ReturnType<typeof extractSequenceMath>>['records'],
  mirrorActors = false, hideUnusedParticipants = false) =>
  planSequenceRenderCopies(db, records, { mirrorActors, hideUnusedParticipants });

describe('pinned sequence render-copy plan', () => {
  it('assigns one actor header, one message, one title, and an optional actor footer', async () => {
    const source = 'sequenceDiagram\ntitle Test $$t$$\nparticipant A as Alice $$a$$\nparticipant B as Bob\nA->>B: Send $$m$$\n';
    const { db, records, total } = await native(source);
    expect(db['getDiagramTitle']!()).toBe(records.find(record => record.role === 'title')?.semanticValue);
    const plain = plan(db, records);
    expect(plain.copies.map(copy => copy.key)).toEqual(['actor:A:header', 'actor:B:header', 'message:0', 'title']);
    expect(plain.hiddenKeys).toEqual([]);
    expect(reserveSequenceRenderCopies(plain, records, total)).toEqual(total);
    const mirrored = plan(db, records, true);
    expect(mirrored.copies.map(copy => copy.key)).toEqual([
      'actor:A:header', 'actor:B:header', 'message:0', 'actor:A:footer', 'actor:B:footer', 'title',
    ]);
    expect(mirrored.copies.filter(copy => copy.slotKey === 'actor:A').map(copy => copy.recordIndex))
      .toEqual([mirrored.slots.find(slot => slot.key === 'actor:A')!.recordIndex,
        mirrored.slots.find(slot => slot.key === 'actor:A')!.recordIndex]);
    expect(reserveSequenceRenderCopies(mirrored, records, total).occurrences).toBe(total.occurrences + 1);
  });

  it('hides unused actors but treats activation endpoints as used, without refunding authored math', async () => {
    const source = 'sequenceDiagram\nparticipant A as Hidden $$h$$\nparticipant B as Active $$a$$\nactivate B\nB->>B: Ping\n';
    const { db, records, total } = await native(source);
    const filtered = plan(db, records, true, true);
    expect(filtered.copies.filter(copy => copy.slotKey.startsWith('actor:')).map(copy => copy.key))
      .toEqual(['actor:B:header', 'actor:B:footer']);
    expect(filtered.hiddenKeys).toContain('actor:A');
    expect(reserveSequenceRenderCopies(filtered, records, total).occurrences).toBe(total.occurrences + 1);
  });

  it('uses original message-array indices for create/destroy lifecycle without changing actor copies', async () => {
    const source = 'sequenceDiagram\nparticipant A\ncreate participant B as Born $$b$$\nA->>B: hello\ndestroy B\nB-->>A: bye\n';
    const { db, records } = await native(source);
    const rendered = plan(db, records, true);
    expect(rendered.copies.filter(copy => copy.slotKey === 'actor:B').map(copy => copy.key))
      .toEqual(['actor:B:header', 'actor:B:footer']);
    const created = db['getCreatedActors']!() as Map<string, number>;
    const destroyed = db['getDestroyedActors']!() as Map<string, number>;
    expect(created.get('B')).toBe(0);
    expect(destroyed.get('B')).toBe(1);
    created.set('B', 99);
    expect(() => plan(db, records, true)).toThrow(/original message index/);
  });

  it('emits repeated box-title runs in filtered actor order and hides an empty box', async () => {
    const source = 'sequenceDiagram\nparticipant A\nparticipant B\nbox teal Group $$g$$\nparticipant A\nparticipant C\nend\n';
    const { db, records, total } = await native(source);
    const rendered = plan(db, records);
    expect(rendered.copies.filter(copy => copy.slotKey === 'box:0').map(copy => copy.key))
      .toEqual(['box:0:run:0', 'box:0:run:1']);
    expect(reserveSequenceRenderCopies(rendered, records, total).occurrences).toBe(total.occurrences + 1);

    const emptySource = 'sequenceDiagram\nbox Empty $$e$$\nend\nparticipant A\n';
    const empty = await native(emptySource);
    const emptyPlan = plan(empty.db, empty.records);
    expect(emptyPlan.hiddenKeys).toContain('box:0');
    expect(emptyPlan.copies.some(copy => copy.slotKey === 'box:0')).toBe(false);
    expect(reserveSequenceRenderCopies(emptyPlan, empty.records, empty.total)).toEqual(empty.total);
  });

  it('rejects duplicate/missing actor keys and duplicate copy keys before budget accounting', async () => {
    const source = 'sequenceDiagram\nparticipant A\nparticipant B\nA->>B: hi\n';
    const { db, records, total } = await native(source);
    const actual = db['getActorKeys'];
    db['getActorKeys'] = () => ['A', 'A'];
    expect(() => plan(db, records)).toThrow(/actor permutation/);
    db['getActorKeys'] = () => ['A'];
    expect(() => plan(db, records)).toThrow(/actor permutation/);
    db['getActorKeys'] = actual!;
    const good = plan(db, records);
    const duplicate = { ...good, copies: [...good.copies, good.copies[0]!] };
    expect(() => reserveSequenceRenderCopies(duplicate, records, total)).toThrow(/duplicate rendered copy key/);
  });

  it('blocks additional copies that exceed the document budget', async () => {
    const source = 'sequenceDiagram\nparticipant A as $$x$$\n';
    const { db, records, total } = await native(source);
    const rendered = plan(db, records, true);
    const nearLimit = { ...total, occurrences: MATH_LIMITS.documentOccurrences };
    expect(() => reserveSequenceRenderCopies(rendered, records, nearLimit)).toThrow(/document budget/);
  });

  it('fails closed on a visible actor type without a pinned native drawing path', async () => {
    const source = 'sequenceDiagram\nparticipant A@{type: nonsense, alias: "$$x$$"}\n';
    const { db, records, total } = await native(source);
    expect(() => plan(db, records)).toThrow(/no pinned drawActor path/);
    const hidden = plan(db, records, true, true);
    expect(hidden.hiddenKeys).toContain('actor:A');
    expect(hidden.copies).toEqual([]);
    expect(reserveSequenceRenderCopies(hidden, records, total)).toEqual(total);
  });

  it.each(['actor', 'participant', 'boundary', 'control', 'entity', 'database', 'collections', 'queue'])(
    'counts the pinned %s actor renderer header and footer', async type => {
      const source = `sequenceDiagram\nparticipant A@{type: ${type}, alias: "$$x$$"}\n`;
      const { db, records } = await native(source);
      expect(plan(db, records, true).copies.map(copy => copy.key)).toEqual(['actor:A:header', 'actor:A:footer']);
    },
  );
});
