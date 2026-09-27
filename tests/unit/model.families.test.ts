import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSource } from '../../packages/core/src/syntax/index.ts';
import { buildTargetRecords } from '../../packages/core/src/model/targets.ts';

const load = (name: string) =>
  buildTargetRecords(parseSource(new Uint8Array(readFileSync(new URL(`../../fixtures/positive/${name}`, import.meta.url))), 'index.md'));
const tuples = (name: string) => load(name).relationships.map((r) => [r.id, r.kind, r.from, r.to, r.basis ?? null, r.evidenceIds]);

describe('relationships per family (§9.2) @R06 @R14', () => {
  it('state transitions emit `transition`, including self-transitions', () => {
    expect(tuples('family-state.md')).toEqual([
      ['tr_connect', 'transition', 'st_opening', 'st_open', null, []],
      ['tr_retry', 'transition', 'st_opening', 'st_opening', null, []],
      ['tr_close', 'transition', 'st_open', 'st_closed', null, []],
    ]);
  });

  it('causal links emit `causal` with basis and the evidence attribute', () => {
    expect(tuples('family-cause.md')).toEqual([
      ['cl_deploy', 'causal', 'f_deploy', 'f_and', 'observed', ['src_log']],
      ['cl_ttl', 'causal', 'f_ttl', 'f_and', 'hypothesis', []],
      ['cl_miss', 'causal', 'f_and', 'f_miss', 'inferred', []],
    ]);
  });

  it('conversions emit `conversion`; a merge is several conversions with the same target', () => {
    const rels = tuples('family-transform.md');
    expect(rels.map((r) => r[1])).toEqual(['conversion', 'conversion']);
    expect(rels.map((r) => r[3])).toEqual(['sg_texture', 'sg_texture']);
  });

  it('plan dependencies emit their kind, defaulting to finish-start', () => {
    expect(tuples('family-plan.md').map((r) => [r[0], r[1]])).toEqual([
      ['d_schema_writes', 'finish-start'],
      ['d_schema_backfill', 'finish-start'],
      ['d_writes_backfill', 'input'],
    ]);
  });

  it('trace events emit `message` with the event ID and `order` with derived IDs', () => {
    const rels = tuples('family-trace.md');
    expect(rels.filter((r) => r[1] === 'message').map((r) => [r[0], r[2], r[3]])).toEqual([
      ['ev_submit', 'a_user', 'a_auth'],
      ['ev_token', 'a_auth', 'a_user'],
    ]);
    expect(rels.filter((r) => r[1] === 'order').map((r) => r[0])).toEqual([
      'ev_check~after~ev_submit',
      'ev_token~after~ev_check',
      'ev_count~after~ev_check',
      'tv_retry~after~tv_send',
    ]);
  });

  it('compare cells, nodes, and groups are targets, not relationships', () => {
    expect(load('family-compare.md').relationships).toEqual([]);
    const arch = load('family-architecture-groups.md');
    expect(arch.relationships.map((r) => r.id)).toEqual(['e_request', 'e_read']);
    expect(arch.targets.get('d_retry')).toMatchObject({ parentId: 'n_gateway', ownerComponentId: 'req_map', inspectable: true });
    expect(arch.targets.get('n_gateway')!.dependencies).toEqual(['g_edge']);
  });
});
