// Normative JSON Schemas (§5.4): frontmatter (§6.2), lock (§12.3), workspace
// (§12.3), source manifest (§7.4), packet (§11.3), resolve result (§11.6).
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { validateAgainst, type SchemaName } from '../../packages/core/src/model/schemas.ts';
import { sourceRevision } from '../../packages/core/src/model/hash.ts';

const root = new URL('../../', import.meta.url);
const example = readFileSync(new URL('examples/bounded-queue/index.md', root), 'utf8');
const frontmatterText = /^---\n([\s\S]*?)\n---\n/.exec(example)![1]!;
const frontmatter = parse(frontmatterText, { schema: 'core' }) as Record<string, unknown>;

const ok = (name: SchemaName, value: unknown) => validateAgainst(name, value).ok;
const H = (c: string) => c.repeat(64);

describe('frontmatter schema @R02', () => {
  it('accepts the Appendix A frontmatter', () => {
    expect(validateAgainst('frontmatter', frontmatter)).toEqual({ ok: true });
  });

  it('accepts retiredTargets entries', () => {
    const value = { ...frontmatter, retiredTargets: { old_id: { reason: 'merged', replacement: 'p_takeaway' } } };
    expect(ok('frontmatter', value)).toBe(true);
  });

  const bad: Array<[string, Record<string, unknown>]> = [
    ['a missing docId', { docId: undefined }],
    ['an uppercase docId', { docId: String(frontmatter.docId).toUpperCase() }],
    ['a UUIDv1 docId', { docId: '4f8ac70c-7e14-1f06-9865-e194f57c7239' }],
    ['an unknown kind', { kind: 'essay' }],
    ['an unknown visibility', { visibility: 'secret' }],
    ['an unknown top-level key', { extra: true }],
    ['an unknown reader key', { reader: { profile: 'x', mood: 'calm' } }],
    ['a retired ID outside the grammar', { retiredTargets: { Bad: { reason: 'x' } } }],
    ['a retirement without a reason', { retiredTargets: { old_id: {} } }],
    ['a capturedAt without a time', { capturedAt: '2026-09-26' }],
    ['a wrong format', { format: 'visser/2' }],
  ];
  for (const [name, change] of bad) {
    it(`rejects ${name}`, () => {
      const value: Record<string, unknown> = { ...frontmatter, ...change };
      for (const [k, v] of Object.entries(value)) if (v === undefined) delete value[k];
      expect(ok('frontmatter', value)).toBe(false);
    });
  }
});

describe('lock schema', () => {
  const lock = (toolkit: Record<string, unknown>) => ({
    schema: 'visser-lock/1',
    toolkit: { version: '0.1.0', sha256: H('a'), ...toolkit },
    extensions: [],
    imports: [],
  });

  it('accepts local-dir without archiveSha256', () => {
    expect(ok('lock', lock({ origin: { kind: 'local-dir' } }))).toBe(true);
  });
  it('rejects local-dir with archiveSha256', () => {
    expect(ok('lock', lock({ origin: { kind: 'local-dir' }, archiveSha256: H('b') }))).toBe(false);
  });
  it('requires archiveSha256 for archive and github-release', () => {
    expect(ok('lock', lock({ origin: { kind: 'archive' } }))).toBe(false);
    expect(ok('lock', lock({ origin: { kind: 'archive' }, archiveSha256: H('b') }))).toBe(true);
    const gh = { kind: 'github-release', repository: 'OWNER/REPO', tag: 'v0.1.0', asset: 'visser-0.1.0.tar.gz' };
    expect(ok('lock', lock({ origin: gh }))).toBe(false);
    expect(ok('lock', lock({ origin: gh, archiveSha256: H('b') }))).toBe(true);
  });
  it('rejects a machine-local path and placeholder digests', () => {
    expect(ok('lock', lock({ origin: { kind: 'local-dir', path: '/home/u/dist' } }))).toBe(false);
    expect(ok('lock', lock({ origin: { kind: 'local-dir' }, sha256: '<toolkit-manifest-digest>' }))).toBe(false);
  });
});

describe('workspace schema', () => {
  it('accepts the §12.3 example shape', () => {
    const value = {
      schema: 'visser-workspace/1',
      documentRoots: ['docs/explanations'],
      defaultToolkit: { version: '0.1.0', sha256: H('a') },
      server: { host: '127.0.0.1', port: 4310, basePath: '/' },
    };
    expect(ok('workspace', value)).toBe(true);
  });
  it('rejects absolute document roots and unknown keys', () => {
    expect(ok('workspace', { schema: 'visser-workspace/1', documentRoots: ['/etc'] })).toBe(false);
    expect(ok('workspace', { schema: 'visser-workspace/1', extra: 1 })).toBe(false);
  });
});

describe('source manifest schema @R18', () => {
  it('accepts a manifest produced by sourceRevision', () => {
    const { manifest } = sourceRevision(String(frontmatter.docId), [
      { path: 'index.md', kind: 'text', content: new Uint8Array(Buffer.from(example, 'utf8')) },
    ]);
    expect(ok('sourceManifest', manifest)).toBe(true);
  });
});

describe('resolve result schema', () => {
  it('accepts a minimal invalid result and rejects unknown fields', () => {
    const diag = { code: 'E_REF_INVALID', severity: 'error', message: 'bad packet' };
    expect(ok('resolve', { schema: 'visser-resolve/1', status: 'invalid', diagnostics: [diag] })).toBe(true);
    expect(ok('resolve', { schema: 'visser-resolve/1', status: 'guess', diagnostics: [] })).toBe(false);
    expect(ok('resolve', { schema: 'visser-resolve/1', status: 'exact', diagnostics: [], extra: 1 })).toBe(false);
  });
});
