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
  schema: 'visser-ref/1',
  uri: `visser://${DOC}/overview?rev=${SHA}&body=${'b'.repeat(64)}`,
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
  diagnostics: { schema: 'visser-diagnostics/1', diagnostics: [diagnostic] },
  check: {
    schema: 'visser-check/1', ok: false, targetCount: 2, diagnostics: [diagnostic],
    origins: [
      { id: 'src_a', kind: 'git', state: 'origin-matched' },
      { id: 'src_wt', kind: 'working-tree', state: 'working-tree-matched', checkedAt: '2026-09-27T00:00:00Z' },
    ],
  },
  capture: {
    schema: 'visser-capture/1', docId: DOC, id: 'src_a', replaced: false, oldRevision: SHA, newRevision: SHA,
    attributes: {
      id: 'src_a', kind: 'git', title: 'A', language: 'python', repository: 'https://example.com/a.git',
      commit: 'a96a61f78a35e3ed3fa04dab5f9d713f75936a60', file: 'q.py', start: 1, end: 2,
      capturedAt: '2026-09-27T00:00:00Z', excerptSha256: SHA, originFileSha256: SHA,
    },
  },
  fork: { schema: 'visser-fork/1', sourceDocId: DOC, docId: 'f35558b8-040e-4fc8-a684-07bb89b311ee', path: '/tmp/x/index.md', files: ['index.md', 'visser.lock.json'] },
  show: { schema: 'visser-show/1', packet, yaml: 'schema: visser-ref/1\n' },
  refresh: { schema: 'visser-refresh/1', refused: false, packet, yaml: 'schema: visser-ref/1\n', targetBodyUnchanged: true },
  release: { schema: 'visser-release/1', version: '0.0.0', files: [{ path: 'bin/visser.cjs', sha256: SHA }] },
  trustStore: { schema: 'visser-trust-store/1', toolkits: { [SHA]: { source: 'install --from-dir dist/release', addedAt: '2026-09-27T00:00:00Z' } } },
  doctor: {
    schema: 'visser-doctor/1', ok: false, node: { version: 'v24.21.0', supported: true }, visserHome: '/home/u/.visser',
    userShim: { path: '/home/u/.visser/bin/visser.cjs', present: true, sha256: SHA, matchesToolkit: true },
    defaultToolkit: { state: 'none', message: 'no /home/u/.visser/default' },
    toolchains: [
      { scope: 'user', path: `/home/u/.visser/toolchains/${SHA}`, name: SHA, state: 'verified', trusted: true, version: '0.0.0' },
      { scope: 'repository', path: `/r/.visser/toolchains/${SHA}`, name: SHA, state: 'untrusted', trusted: false },
    ],
    trust: [{ sha256: SHA, source: 'install --from-dir dist/release', addedAt: '2026-09-27T00:00:00Z' }],
    document: { path: '/r/docs/a', lockSha256: SHA, resolution: { state: 'error', code: 'E_TOOLKIT_UNTRUSTED', message: 'untrusted' } },
    workspace: { root: '/r', resolution: { state: 'resolved', sha256: SHA, version: '0.0.0', source: 'user', dir: `/home/u/.visser/toolchains/${SHA}` } },
    wrappers: [{ host: 'claude-code', scope: 'repository', path: '/r/.claude/skills/visser-visual-explain/SKILL.md', sha256: SHA, state: 'no-canonical' }],
    conflicts: [], port: { host: '127.0.0.1', port: 4310, available: true }, diagnostics: [],
  },
  skill: {
    schema: 'visser-skill/1', toolkit: { sha256: SHA, version: '0.0.0', dir: '/home/u/.visser/toolchains/x', source: 'user' },
    document: '/r/docs/a/index.md', skill: { path: '/home/u/.visser/toolchains/x/skills/visser-visual-explain/SKILL.md', text: '# Visser\n' },
    guides: ['/home/u/.visser/toolchains/x/skills/visser-visual-explain/references/format.md'],
  },
  install: {
    schema: 'visser-install/1', scope: 'user', version: '0.0.0', toolkitSha256: SHA, archiveSha256: SHA,
    origin: { kind: 'archive', archiveSha256: SHA }, path: `/home/u/.visser/toolchains/${SHA}`,
    alreadyInstalled: false, trusted: true, shim: '/home/u/.visser/bin/visser.cjs', invocation: 'node /home/u/.visser/bin/visser.cjs',
  },
  trust: { schema: 'visser-trust/1', digest: SHA, trusted: true, changed: true, source: 'trust toolkit', addedAt: '2026-09-27T00:00:00Z' },
  export: {
    schema: 'visser-export/1', format: 'site', audience: 'public', out: '/tmp/site', includeSource: false, allowPrivateContent: true,
    collection: { title: 'Notes', path: 'index.html' },
    documents: [{ docId: DOC, title: 'Q', visibility: 'public', path: `d/${DOC}/${SHA}/${SHA}/index.html`, sourceRevision: SHA, buildId: SHA, toolkitSha256: SHA, mermaid: false }],
    sources: [{ docId: DOC, id: 'src_a', kind: 'git', repository: 'https://example.com/a.git', publicRepository: true }],
    mermaidPages: [],
    assetPacks: [{ toolkitSha256: SHA, path: `_visser/assets/${SHA}`, files: ['reader.css', 'reader.js'] }],
    warnings: [{ code: 'W_STATIC_HOST_SRI', message: 'a host that rewrites JavaScript breaks SRI' }],
  },
  collection: { schema: 'visser-collection/1', title: 'Notes', documents: [{ path: 'queue/index.md' }] },
  upgrade: { schema: 'visser-upgrade/1', doc: '/tmp/x/index.md', from: { sha256: SHA, version: '0.1.0' }, to: { sha256: 'b'.repeat(64), version: '0.2.0' }, changed: true, downgrade: false, dryRun: false, diff: '--- a/visser.lock.json\n', rebuilt: true },
  catalogue: { schema: 'visser-catalogue/1', toolkit: { sha256: SHA, version: '0.0.0', dir: '/tmp/r' }, entry: { name: 'trace', title: 'Execution trace', question: 'What happens?', path: '/tmp/r/trace.md' }, part: 'template', template: '{% trace %}\n' },
  // Extensions (§14).
  extension: {
    schema: 'visser-extension/1', name: 'timeline-lanes', version: '0.1.0', api: 'visser-component/1', buildEntry: 'build.cjs', browserEntry: null,
    schemaFile: 'schema.json', guide: 'GUIDE.md', files: [{ path: 'build.cjs', sha256: SHA }, { path: 'schema.json', sha256: SHA }, { path: 'GUIDE.md', sha256: SHA }],
  },
  componentOutput: {
    schema: 'visser-component-output/1',
    svg: { tag: 'svg', attrs: { viewBox: '0 0 10 10' }, children: [{ tag: 'g', target: 'lane_a', children: [{ tag: 'rect', attrs: { x: 0, y: 0, width: 10, height: 5 } }, { tag: 'text', children: ['A'] }] }] },
    parts: { lane_a: { text: 'A runs from 0 to 5 ms.' } },
  },
  extensionInspect: {
    schema: 'visser-extension-inspect/1', name: 'timeline-lanes', version: '0.1.0', sha256: SHA, path: '/x', location: 'user', trusted: false, executable: true,
    buildEntry: 'build.cjs', files: [{ path: 'build.cjs', sha256: SHA }], componentSchema: { type: 'object' }, guide: '# Guide\n',
  },
  extensionTrust: { schema: 'visser-extension-trust/1', digest: SHA, trusted: true, changed: true, source: 'extension trust', addedAt: '2026-09-27T00:00:00Z' },
  extensionInstall: { schema: 'visser-extension-install/1', scope: 'user', name: 'timeline-lanes', version: '0.1.0', sha256: SHA, path: `/home/u/.visser/extensions/${SHA}`, alreadyInstalled: false, trusted: false },
  extensionPin: { schema: 'visser-extension-pin/1', doc: '/r/docs/a/index.md', name: 'timeline-lanes', version: '0.1.0', sha256: SHA, changed: true, diff: '--- a/visser.lock.json\n' },
};

describe('schemas for --json outputs and metadata files (§5.4)', () => {
  for (const [name, sample] of Object.entries(samples)) {
    it(`${name}: accepts a real-shaped sample and rejects extra properties and a wrong schema value`, () => {
      expect(validateAgainst(name as SchemaName, sample)).toEqual({ ok: true });
      expect(validateAgainst(name as SchemaName, { ...sample, unexpected: 1 }).ok).toBe(false);
      expect(validateAgainst(name as SchemaName, { ...sample, schema: 'visser-other/1' }).ok).toBe(false);
    });
  }

  it('refresh: a refusal needs diagnostics; a success needs a packet', () => {
    expect(validateAgainst('refresh', { schema: 'visser-refresh/1', refused: true, currentRevision: SHA, diagnostics: [diagnostic] }).ok).toBe(true);
    expect(validateAgainst('refresh', { schema: 'visser-refresh/1', refused: true }).ok).toBe(false);
    expect(validateAgainst('refresh', { schema: 'visser-refresh/1', refused: false }).ok).toBe(false);
  });

  it('export: a leading-slash site path and an unknown asset file are rejected', () => {
    const exp = samples.export as Record<string, unknown>;
    const doc = (exp['documents'] as Array<Record<string, unknown>>)[0]!;
    expect(validateAgainst('export', { ...exp, documents: [{ ...doc, path: `/d/${DOC}/index.html` }] }).ok).toBe(false);
    expect(validateAgainst('export', { ...exp, assetPacks: [{ toolkitSha256: SHA, path: 'x', files: ['evil.js'] }] }).ok).toBe(false);
  });

  it('export: standalone HTML has one document, no collection, no source bundle, and no asset pack', () => {
    const site = samples.export as Record<string, unknown>;
    const [document] = site['documents'] as Array<Record<string, unknown>>;
    const html = {
      ...site,
      format: 'html',
      out: '/tmp/notes.html',
      documents: [{ ...document, path: 'notes.html' }],
      mermaidPages: [],
      assetPacks: [],
    } as Record<string, unknown>;
    delete html['collection'];
    expect(validateAgainst('export', html)).toEqual({ ok: true });
    expect(validateAgainst('export', { ...html, includeSource: true }).ok).toBe(false);
    expect(validateAgainst('export', { ...html, collection: { title: 'X', path: 'index.html' } }).ok).toBe(false);
    expect(validateAgainst('export', { ...html, assetPacks: site['assetPacks'] }).ok).toBe(false);
  });

  it('trustStore: a key that is not a digest is rejected', () => {
    expect(validateAgainst('trustStore', { schema: 'visser-trust-store/1', toolkits: { 'not-a-digest': { source: 'x', addedAt: '2026-09-27T00:00:00Z' } } }).ok).toBe(false);
  });

  it('install: an archive origin needs its digest, and trusted is always true', () => {
    expect(validateAgainst('install', { ...samples.install, origin: { kind: 'archive' } }).ok).toBe(false);
    expect(validateAgainst('install', { ...samples.install, trusted: false }).ok).toBe(false);
    expect(validateAgainst('install', { ...samples.install, origin: { kind: 'local-dir', archiveSha256: SHA } }).ok).toBe(false);
    // A github-release origin names the repository and version; it never holds a URL (which could carry a token).
    const release = { kind: 'github-release', repository: 'octo/visser', version: 'v1.2.3', archiveSha256: SHA };
    expect(validateAgainst('install', { ...samples.install, origin: release })).toEqual({ ok: true });
    expect(validateAgainst('install', { ...samples.install, origin: { ...release, url: 'https://x.invalid/a?token=t' } }).ok).toBe(false);
    expect(validateAgainst('install', { ...samples.install, origin: { ...release, repository: '../x' } }).ok).toBe(false);
    expect(validateAgainst('install', { ...samples.install, origin: { ...release, version: 'latest' } }).ok).toBe(false);
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
    // Pass asset digests as `visser build` does; without them the compiler omits each asset's sha256.
    const result = await compileDocument(bundle, { version: '0.0.0', sha256: SHA, assets: { 'reader.js': 'c'.repeat(64), 'reader.css': 'd'.repeat(64) } }, { audience: 'private', includeSource: false, layoutFallback: false, nodeVersion: 'v24.21.0' });
    const file = result.files.find((f) => f.path.endsWith('/build.json'));
    expect(file, 'compileDocument emits build.json').toBeDefined();
    const buildJson = JSON.parse(new TextDecoder().decode(file!.bytes)) as Record<string, unknown>;
    expect(validateAgainst('build', buildJson)).toEqual({ ok: true });
    expect(validateAgainst('build', { ...buildJson, unexpected: 1 }).ok).toBe(false);
  });
});
