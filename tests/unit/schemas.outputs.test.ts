// Every --json output and generated metadata file has a normative schema (§5.4).
// Valid samples mirror real CLI output; each schema must also reject an extra
// property and a wrong `schema` value, so a test cannot pass on a schema that
// accepts anything.
import { describe, expect, it } from 'vitest';
import { type SchemaName, validateAgainst } from '../../packages/core/src/model/schemas.ts';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { compileDocument } from '../../packages/core/src/compiler/index.ts';

const SHA = 'a'.repeat(64);
const DOC = '75b406cf-0add-4ee7-9c36-b82de9deb02e';
const packet = {
  schema: 'explain-ref/1',
  uri: `explain://${DOC}/overview?rev=${SHA}&body=${'b'.repeat(64)}`,
  docId: DOC,
  targetId: 'overview',
  sourceRevision: SHA,
  bodySha256: 'b'.repeat(64),
  label: 'Q',
  kind: 'heading',
  issuedBy: 'refs-show',
};
const diagnostic = { code: 'E_REF_STALE', severity: 'error', message: 'stale', targetId: 'overview' };

const samples: Record<Exclude<SchemaName, 'frontmatter' | 'packet' | 'lock' | 'workspace' | 'sourceManifest' | 'resolve' | 'edit' | 'build'>, Record<string, unknown>> = {
  diagnostics: { schema: 'explain-diagnostics/1', diagnostics: [diagnostic] },
  check: {
    schema: 'explain-check/1', ok: false, targetCount: 2, diagnostics: [diagnostic],
    origins: [
      { id: 'src_a', kind: 'git', state: 'origin-matched' },
      { id: 'src_wt', kind: 'working-tree', state: 'working-tree-matched', checkedAt: '2026-09-27T00:00:00Z' },
    ],
  },
  capture: {
    schema: 'explain-capture/1', docId: DOC, id: 'src_a', replaced: false, oldRevision: SHA, newRevision: SHA,
    attributes: {
      id: 'src_a', kind: 'git', title: 'A', language: 'python', repository: 'https://example.com/a.git',
      commit: 'a96a61f78a35e3ed3fa04dab5f9d713f75936a60', file: 'q.py', start: 1, end: 2,
      capturedAt: '2026-09-27T00:00:00Z', excerptSha256: SHA, originFileSha256: SHA,
    },
  },
  fork: { schema: 'explain-fork/1', sourceDocId: DOC, docId: 'f35558b8-040e-4fc8-a684-07bb89b311ee', path: '/tmp/x/index.md', files: ['index.md', 'explain.lock.json'] },
  show: { schema: 'explain-show/1', packet, yaml: 'schema: explain-ref/1\n' },
  refresh: { schema: 'explain-refresh/1', refused: false, packet, yaml: 'schema: explain-ref/1\n', targetBodyUnchanged: true },
  release: { schema: 'explain-release/1', version: '0.0.0', files: [{ path: 'bin/explain.cjs', sha256: SHA }] },
  trustStore: { schema: 'explain-trust-store/1', toolkits: { [SHA]: { source: 'install --from-dir dist/release', addedAt: '2026-09-27T00:00:00Z' } } },
  doctor: {
    schema: 'explain-doctor/1', ok: false, node: { version: 'v24.21.0', supported: true }, explainHome: '/home/u/.explain',
    userShim: { path: '/home/u/.explain/bin/explain.cjs', present: true, sha256: SHA, matchesToolkit: true },
    defaultToolkit: { state: 'none', message: 'no /home/u/.explain/default' },
    toolchains: [
      { scope: 'user', path: `/home/u/.explain/toolchains/${SHA}`, name: SHA, state: 'verified', trusted: true, version: '0.0.0' },
      { scope: 'repository', path: `/r/.explain/toolchains/${SHA}`, name: SHA, state: 'untrusted', trusted: false },
    ],
    trust: [{ sha256: SHA, source: 'install --from-dir dist/release', addedAt: '2026-09-27T00:00:00Z' }],
    document: { path: '/r/docs/a', lockSha256: SHA, resolution: { state: 'error', code: 'E_TOOLKIT_UNTRUSTED', message: 'untrusted' } },
    workspace: { root: '/r', resolution: { state: 'resolved', sha256: SHA, version: '0.0.0', source: 'user', dir: `/home/u/.explain/toolchains/${SHA}` } },
    wrappers: [{ host: 'claude-code', scope: 'repository', path: '/r/.claude/skills/explain/SKILL.md', sha256: SHA, state: 'no-canonical' }],
    conflicts: [], port: { host: '127.0.0.1', port: 4310, available: true }, diagnostics: [],
  },
  skill: {
    schema: 'explain-skill/1', toolkit: { sha256: SHA, version: '0.0.0', dir: '/home/u/.explain/toolchains/x', source: 'user' },
    document: '/r/docs/a/index.md', skill: { path: '/home/u/.explain/toolchains/x/skills/explain/SKILL.md', text: '# Explain\n' },
    guides: ['/home/u/.explain/toolchains/x/skills/explain/references/format.md'],
  },
  install: {
    schema: 'explain-install/1', scope: 'user', version: '0.0.0', toolkitSha256: SHA, archiveSha256: SHA,
    origin: { kind: 'archive', archiveSha256: SHA }, path: `/home/u/.explain/toolchains/${SHA}`,
    alreadyInstalled: false, trusted: true, shim: '/home/u/.explain/bin/explain.cjs', invocation: 'node /home/u/.explain/bin/explain.cjs',
  },
  trust: { schema: 'explain-trust/1', digest: SHA, trusted: true, changed: true, source: 'trust toolkit', addedAt: '2026-09-27T00:00:00Z' },
};

describe('schemas for --json outputs and metadata files (§5.4)', () => {
  for (const [name, sample] of Object.entries(samples)) {
    it(`${name}: accepts a real-shaped sample and rejects extra properties and a wrong schema value`, () => {
      expect(validateAgainst(name as SchemaName, sample)).toEqual({ ok: true });
      expect(validateAgainst(name as SchemaName, { ...sample, unexpected: 1 }).ok).toBe(false);
      expect(validateAgainst(name as SchemaName, { ...sample, schema: 'explain-other/1' }).ok).toBe(false);
    });
  }

  it('refresh: a refusal needs diagnostics; a success needs a packet', () => {
    expect(validateAgainst('refresh', { schema: 'explain-refresh/1', refused: true, currentRevision: SHA, diagnostics: [diagnostic] }).ok).toBe(true);
    expect(validateAgainst('refresh', { schema: 'explain-refresh/1', refused: true }).ok).toBe(false);
    expect(validateAgainst('refresh', { schema: 'explain-refresh/1', refused: false }).ok).toBe(false);
  });

  it('trustStore: a key that is not a digest is rejected', () => {
    expect(validateAgainst('trustStore', { schema: 'explain-trust-store/1', toolkits: { 'not-a-digest': { source: 'x', addedAt: '2026-09-27T00:00:00Z' } } }).ok).toBe(false);
  });

  it('install: an archive origin needs its digest, and trusted is always true', () => {
    expect(validateAgainst('install', { ...samples.install, origin: { kind: 'archive' } }).ok).toBe(false);
    expect(validateAgainst('install', { ...samples.install, trusted: false }).ok).toBe(false);
    expect(validateAgainst('install', { ...samples.install, origin: { kind: 'local-dir', archiveSha256: SHA } }).ok).toBe(false);
  });

  it('check: an unknown origin state is rejected', () => {
    const bad = { ...samples.check, origins: [{ id: 'src_a', kind: 'git', state: 'verified' }] };
    expect(validateAgainst('check', bad).ok).toBe(false);
  });

  it('capture: a malformed commit or excerpt digest is rejected', () => {
    const attributes = samples.capture['attributes'] as Record<string, unknown>;
    expect(validateAgainst('capture', { ...samples.capture, attributes: { ...attributes, commit: 'HEAD' } }).ok).toBe(false);
    expect(validateAgainst('capture', { ...samples.capture, attributes: { ...attributes, excerptSha256: 'x' } }).ok).toBe(false);
  });

  it('build: the build.json that the compiler emits for the bounded-queue example is valid', async () => {
    const bundle = loadBundle(new URL('../../examples/bounded-queue/index.md', import.meta.url).pathname);
    // Pass asset digests as `explain build` does; without them the compiler omits each asset's sha256.
    const result = await compileDocument(bundle, { version: '0.0.0', sha256: SHA, assets: { 'reader.js': 'c'.repeat(64), 'reader.css': 'd'.repeat(64) } }, { audience: 'private', includeSource: false, layoutFallback: false, nodeVersion: 'v24.21.0' });
    const file = result.files.find((f) => f.path.endsWith('/build.json'));
    expect(file, 'compileDocument emits build.json').toBeDefined();
    const buildJson = JSON.parse(new TextDecoder().decode(file!.bytes)) as Record<string, unknown>;
    expect(validateAgainst('build', buildJson)).toEqual({ ok: true });
    expect(validateAgainst('build', { ...buildJson, unexpected: 1 }).ok).toBe(false);
  });
});
