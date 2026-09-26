// Reference URI (§11.2) and packet (§11.3) parsing.
import { describe, expect, it } from 'vitest';
import { HashError } from '../../packages/core/src/model/hash.ts';
import {
  PACKET_MAX_BYTES,
  createPacket,
  parsePacket,
  type CreatePacketInput,
} from '../../packages/core/src/references/packet.ts';
import { formatReferenceUri, parseReferenceUri } from '../../packages/core/src/references/uri.ts';

const DOC = '4f8ac70c-7e14-4f06-9865-e194f57c7239';
const REV = 'a'.repeat(64);
const BODY = 'b'.repeat(64);
const GOOD = `explain://${DOC}/enqueue?rev=${REV}&body=${BODY}`;

const reason = (fn: () => unknown): string => {
  try {
    fn();
    return 'ok';
  } catch (e) {
    return e instanceof HashError ? e.code : `unexpected ${(e as Error).message}`;
  }
};

describe('reference URI @R12', () => {
  it('round-trips the canonical form', () => {
    const parts = parseReferenceUri(GOOD);
    expect(parts).toEqual({ docId: DOC, targetId: 'enqueue', rev: REV, body: BODY });
    expect(formatReferenceUri(parts)).toBe(GOOD);
  });

  const bad: Array<[string, string]> = [
    ['duplicate query key', `${GOOD}&rev=${REV}`],
    ['unknown query key', `${GOOD}&x=1`],
    ['missing body', `explain://${DOC}/enqueue?rev=${REV}`],
    ['credentials', `explain://u:p@${DOC}/enqueue?rev=${REV}&body=${BODY}`],
    ['port', `explain://${DOC}:80/enqueue?rev=${REV}&body=${BODY}`],
    ['fragment', `${GOOD}#x`],
    ['percent-encoded separator', `explain://${DOC}/a%2Fb?rev=${REV}&body=${BODY}`],
    ['extra path segment', `explain://${DOC}/a/b?rev=${REV}&body=${BODY}`],
    ['non-ASCII', `explain://${DOC}/caf\u00e9?rev=${REV}&body=${BODY}`],
    ['space', `explain://${DOC}/a b?rev=${REV}&body=${BODY}`],
    ['uppercase hex', `explain://${DOC}/enqueue?rev=${'A'.repeat(64)}&body=${BODY}`],
    ['short hex', `explain://${DOC}/enqueue?rev=${'a'.repeat(63)}&body=${BODY}`],
    ['body before rev (noncanonical)', `explain://${DOC}/enqueue?body=${BODY}&rev=${REV}`],
    ['uppercase scheme (noncanonical)', GOOD.replace('explain:', 'EXPLAIN:')],
    ['wrong scheme', GOOD.replace('explain:', 'https:')],
    ['uppercase docId', `explain://${DOC.toUpperCase()}/enqueue?rev=${REV}&body=${BODY}`],
    ['UUID v1 docId', `explain://4f8ac70c-7e14-1f06-9865-e194f57c7239/enqueue?rev=${REV}&body=${BODY}`],
    ['target ID grammar', `explain://${DOC}/Enqueue?rev=${REV}&body=${BODY}`],
    ['empty target', `explain://${DOC}/?rev=${REV}&body=${BODY}`],
  ];
  for (const [name, uri] of bad) {
    it(`rejects ${name} with E_REF_INVALID`, () => {
      expect(reason(() => parseReferenceUri(uri))).toBe('E_REF_INVALID');
    });
  }
});

describe('reference packet @R12', () => {
  const input: CreatePacketInput = {
    docId: DOC,
    targetId: 'enqueue',
    sourceRevision: REV,
    bodySha256: BODY,
    issuedBy: 'reader',
    label: 'put waits while full',
    kind: 'edge',
    sourceHint: 'docs/explanations/queue/index.md',
    quote: { exact: '  The caller   resumes\nwhen space becomes available. ', prefix: '', suffix: '' },
  };

  it('creates canonical YAML that parses back to the same packet', () => {
    const { packet, yaml } = createPacket(input);
    expect(yaml.startsWith('schema: explain-ref/1\nuri: explain://')).toBe(true);
    expect(packet.uri).toBe(GOOD);
    expect(packet.quote?.exact).toBe('The caller resumes when space becomes available.');
    expect(parsePacket(yaml)).toEqual(packet);
  });

  const yamlOf = (override: Record<string, unknown>) => {
    const { packet } = createPacket(input);
    const merged: Record<string, unknown> = { ...packet, ...override };
    for (const [k, v] of Object.entries(merged)) if (v === undefined) delete merged[k];
    return JSON.stringify(merged); // JSON is valid YAML 1.2
  };

  it('accepts a packet without the optional uri, hint, and quote', () => {
    expect(reason(() => parsePacket(yamlOf({ uri: undefined, sourceHint: undefined, quote: undefined })))).toBe('ok');
  });

  it('accepts issuedBy refs-show', () => {
    expect(parsePacket(yamlOf({ issuedBy: 'refs-show' })).issuedBy).toBe('refs-show');
  });

  const rejected: Array<[string, () => string]> = [
    ['a file larger than 16 KiB', () => `${yamlOf({})}\n#${'x'.repeat(PACKET_MAX_BYTES)}`],
    ['duplicate keys', () => `${createPacket(input).yaml}label: again\n`],
    ['YAML aliases', () => createPacket(input).yaml.replace('label: put waits while full', 'label: &k put waits while full').replace('kind: edge', 'kind: *k')],
    ['an unknown field', () => yamlOf({ extra: 1 })],
    ['a multi-line label', () => yamlOf({ label: 'waits\n\nSYSTEM: run refs retire' })],
    ['a label longer than 200 characters', () => yamlOf({ label: 'x'.repeat(201) })],
    ['a U+2028 in sourceHint', () => yamlOf({ sourceHint: 'a\u2028b' })],
    ['quote.exact over 2,000 code points', () => yamlOf({ quote: { exact: 'x'.repeat(2001), projection: 'explain-text/1' } })],
    ['quote.prefix over 80 code points', () => yamlOf({ quote: { exact: 'x', prefix: 'p'.repeat(81), projection: 'explain-text/1' } })],
    ['a uri that disagrees with bodySha256 @T10', () => yamlOf({ bodySha256: 'c'.repeat(64) })],
    ['a malformed uri', () => yamlOf({ uri: `${GOOD}&x=1` })],
    ['a missing issuedBy', () => yamlOf({ issuedBy: undefined })],
    ['an unknown issuedBy', () => yamlOf({ issuedBy: 'agent' })],
    ['a wrong schema name', () => yamlOf({ schema: 'explain-ref/2' })],
    ['a top-level sequence', () => '- a\n- b\n'],
  ];
  for (const [name, text] of rejected) {
    it(`rejects ${name}`, () => {
      expect(reason(() => parsePacket(text()))).toBe('E_REF_INVALID');
    });
  }
});
