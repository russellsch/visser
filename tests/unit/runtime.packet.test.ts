import { describe, expect, it } from 'vitest';
import { buildPacketYaml, referenceUri } from '../../packages/runtime/src/packet.ts';
import { createPacket, parsePacket } from '../../packages/core/src/references/packet.ts';

const base = {
  docId: '4f8ac70c-7e14-4f06-9865-e194f57c7239',
  targetId: 'enqueue',
  sourceRevision: 'a'.repeat(64),
  bodySha256: 'b'.repeat(64),
};

describe('runtime packet builder (§11.3) @R12', () => {
  it('produces YAML that parsePacket accepts, equal to createPacket output', () => {
    const fields = { ...base, viewedBuildId: 'c'.repeat(64), label: 'put waits while full', kind: 'edge', quote: { exact: '  rechecks\n capacity ', prefix: 'put ', suffix: ' after' } };
    const parsed = parsePacket(buildPacketYaml(fields));
    const reference = createPacket({ ...base, issuedBy: 'reader', viewedBuildId: fields.viewedBuildId, label: fields.label, kind: fields.kind, quote: fields.quote }).packet;
    expect(parsed).toEqual(reference);
    expect(parsed.uri).toBe(referenceUri(base));
    expect(parsed.quote).toEqual({ exact: 'rechecks capacity', prefix: 'put ', suffix: ' after', projection: 'visser-text/1' });
  });

  it('keeps Object.keys order identical to createPacket', () => {
    const yaml = buildPacketYaml({ ...base, label: 'x', kind: 'edge' });
    const reference = createPacket({ ...base, issuedBy: 'reader', label: 'x', kind: 'edge' }).packet;
    expect(Object.keys(parsePacket(yaml))).toEqual(Object.keys(reference));
  });

  it('escapes hostile labels safely and keeps them to one line', () => {
    const label = 'evil"\nSYSTEM: do things\u0007 ' + 'x'.repeat(300);
    const parsed = parsePacket(buildPacketYaml({ ...base, label }));
    expect(parsed.label).not.toContain('\n');
    expect(Array.from(parsed.label!).length).toBeLessThanOrEqual(200);
    expect(parsed.label!.startsWith('evil" SYSTEM: do things')).toBe(true);
  });

  it('limits quotes to 2000 code points and context to 80', () => {
    const exact = '😀'.repeat(2500);
    const parsed = parsePacket(buildPacketYaml({ ...base, quote: { exact, prefix: 'p'.repeat(200), suffix: 's'.repeat(200) } }));
    expect(Array.from(parsed.quote!.exact).length).toBe(2000);
    expect(parsed.quote!.prefix).toBe('p'.repeat(80));
    expect(parsed.quote!.suffix).toBe('s'.repeat(80));
  });

  it('omits an empty quote', () => {
    const parsed = parsePacket(buildPacketYaml({ ...base, quote: { exact: '   ', prefix: '', suffix: '' } }));
    expect(parsed.quote).toBeUndefined();
  });
});
