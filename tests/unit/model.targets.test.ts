import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSource } from '../../packages/core/src/syntax/index.ts';
import { buildTargetRecords } from '../../packages/core/src/model/targets.ts';
import { bodySha256 } from '../../packages/core/src/model/hash.ts';

const bytes = new Uint8Array(readFileSync(new URL('../../examples/bounded-queue/index.md', import.meta.url)));
const model = buildTargetRecords(parseSource(bytes, 'index.md'));
const t = (id: string) => model.targets.get(id)!;

describe('derived target fields (§7.1) @R02 @R03', () => {
  it('builds all 23 Appendix A targets without diagnostics', () => {
    expect(model.diagnostics).toEqual([]);
    expect(model.targets.size).toBe(23);
  });

  it('derives kind, label, parent, owner, and section', () => {
    expect(t('overview')).toMatchObject({ kind: 'heading', label: 'A full queue blocks producers, not consumers' });
    expect(t('overview').sectionId).toBeUndefined();
    expect(t('enqueue')).toMatchObject({ kind: 'edge', label: 'put waits while full', parentId: 'handoff', ownerComponentId: 'handoff', sectionId: 'overview' });
    expect(t('def_backpressure').label).toBe('Backpressure');
    expect(t('p_limits').label.length).toBeLessThanOrEqual(80);
  });

  it('gives entities label-plus-body plainText and containers only their own leading body', () => {
    expect(t('enqueue').plainText).toMatch(/^put waits while full\nput rechecks capacity after waking\./);
    expect(t('handoff').plainText).toBe('The calls below share one queue. The arrows describe calls, not execution order.');
    expect(t('handoff').plainText).not.toContain('Producer');
  });

  it('records dependencies from attributes and inline references', () => {
    expect(t('enqueue').dependencies).toEqual(['producer', 'queue', 'src_queue']);
    expect(t('actor_consumer').dependencies).toEqual(['worker']);
    expect(t('p_trace').dependencies).toEqual(['enqueue', 'event_wait', 'event_remove']);
    expect(t('p_vocabulary').dependencies).toEqual(['def_backpressure']);
  });

  it('marks entities inspectable and top-level blocks not @R04', () => {
    expect(t('enqueue').inspectable).toBe(true);
    expect(t('src_queue').inspectable).toBe(true);
    expect(t('handoff').inspectable).toBe(false);
    expect(t('p_takeaway').inspectable).toBe(false);
  });

  it('hashes each target span as normalized text @R18', () => {
    const r = t('enqueue');
    expect(r.bodySha256).toBe(bodySha256(bytes.subarray(r.span.startByte, r.span.endByte)));
    expect(r.bodySha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('emits relationships with the §9.2 kinds and derived order IDs', () => {
    expect(model.relationships.map((r) => [r.id, r.kind, r.from, r.to])).toEqual([
      ['enqueue', 'blocking-call', 'producer', 'queue'],
      ['dequeue', 'blocking-call', 'worker', 'queue'],
      ['event_wait~after~event_call', 'order', 'event_call', 'event_wait'],
      ['event_remove~after~event_wait', 'order', 'event_wait', 'event_remove'],
      ['event_resume~after~event_remove', 'order', 'event_remove', 'event_resume'],
    ]);
    expect(model.relationships[0]!.evidenceIds).toEqual(['src_queue']);
  });

  it('reports a broken reference as E_REF_BROKEN @R12', () => {
    const broken = new TextEncoder().encode(new TextDecoder().decode(bytes).replace('ref="def_backpressure"', 'ref="def_missing"'));
    const result = buildTargetRecords(parseSource(broken, 'index.md'));
    expect(result.diagnostics.map((d) => d.code)).toContain('E_REF_BROKEN');
  });

  it('keeps identity when a block moves, and changes only positions @T02 @T03', () => {
    const text = new TextDecoder().decode(bytes);
    const para = text.slice(text.indexOf('<!-- vs:id p_limits -->'), text.indexOf('<!-- vs:id p_vocabulary -->'));
    const moved = text.replace(para, '').replace('<!-- vs:id p_trace -->', para + '<!-- vs:id p_trace -->');
    const after = buildTargetRecords(parseSource(new TextEncoder().encode(moved), 'index.md'));
    expect(after.diagnostics).toEqual([]);
    expect(after.targets.get('p_limits')!.bodySha256).toBe(t('p_limits').bodySha256);
    expect(after.targets.get('p_limits')!.span.startLine).not.toBe(t('p_limits').span.startLine);
  });
});
