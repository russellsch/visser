// Phase 2b Mermaid examples (§9.12, §17.5a): every example loads and compiles
// cleanly, the projection covers every Mermaid target and relationship, shared
// node names collide, and the parse worker ships in dist/release.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { projectText } from '../../packages/core/src/model/project.ts';
import { compileDocument } from '../../packages/core/src/compiler/index.ts';

const root = new URL('../..', import.meta.url).pathname;
const MERMAID_EXAMPLES = ['mermaid-flowchart', 'mermaid-state', 'mermaid-sequence', 'mermaid-er', 'mermaid-class'] as const;
const PARSED = new Set(['mermaid-flowchart', 'mermaid-state', 'mermaid-sequence']);
const TOOLKIT = { version: '0.0.0-test', sha256: 'a'.repeat(64), integrity: { 'mermaid.js': 'sha384-TESTDIGEST' } };
const OPTIONS = { audience: 'private' as const, includeSource: false, layoutFallback: false };

const load = (example: string) => loadBundle(join(root, 'examples', example, 'index.md'));
const errors = (b: ReturnType<typeof loadBundle>) => b.diagnostics.filter((d) => d.severity === 'error');
const isMermaidElement = (kind: string) => kind.startsWith('mermaid-');

describe('Mermaid examples load and compile (§9.12) @R01 @R14', () => {
  for (const example of MERMAID_EXAMPLES) {
    it(`${example}: no error diagnostics, and it compiles`, async () => {
      const bundle = load(example);
      expect(errors(bundle), JSON.stringify(errors(bundle))).toEqual([]);
      const result = await compileDocument(bundle, TOOLKIT, OPTIONS);
      expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      const html = new TextDecoder().decode(result.files.find((f) => f.path.endsWith('index.html'))!.bytes);
      // The no-JS and text fallback: the Mermaid source is in the page.
      expect(html).toContain('vs-mermaid-source');
    });
  }

  it('parsed examples expose their elements as targets with mapped IDs', () => {
    const flow = load('mermaid-flowchart').model.targets;
    for (const id of ['browser', 'edgecache', 'originapi', 'articledb']) expect(flow.get(id)?.kind, id).toBe('mermaid-node');
    expect(flow.get('originsite')?.kind).toBe('mermaid-group');
    const state = load('mermaid-state').model.targets;
    for (const id of ['pending', 'authorized', 'declined', 'capturecheck', 'captured', 'voided']) expect(state.get(id)?.kind, id).toBe('mermaid-state');
    // State pseudo-nodes are not targets.
    expect([...state.keys()].some((id) => id.startsWith('root_'))).toBe(false);
    const seq = load('mermaid-sequence').model.targets;
    for (const id of ['webclient', 'tokenservice', 'reportsapi']) expect(seq.get(id)?.kind, id).toBe('mermaid-participant');
  });

  it('an explicit flowchart edge ID is a referenceable relationship target', () => {
    const bundle = load('mermaid-flowchart');
    const edge = bundle.model.relationships.find((r) => r.id === 'miss_fetch');
    expect(edge, 'relationship miss_fetch').toBeTruthy();
    expect(edge).toMatchObject({ from: 'edgecache', to: 'originapi' });
  });

  it('sequence notes and blocks are not relationships; every message is', () => {
    const rels = load('mermaid-sequence').model.relationships.filter((r) => r.kind.startsWith('mermaid-'));
    // Six messages: two to the API, two refresh-token answers, one refresh request, one retry.
    expect(rels).toHaveLength(6);
    expect(rels.every((r) => r.kind === 'mermaid-message')).toBe(true);
    expect(rels.some((r) => r.label.includes('Only the token service'))).toBe(false);
  });

  for (const example of MERMAID_EXAMPLES) {
    it(`${example}: the projection lists every Mermaid target and relationship tuple`, () => {
      const bundle = load(example);
      const text = projectText(bundle.parsed);
      const ids = [...text.matchAll(/<!-- vs:target ([a-z][a-z0-9_-]*) -->/g)].map((m) => m[1]);
      // Every target once, including each Mermaid element.
      expect(ids.sort()).toEqual([...bundle.model.targets.keys()].sort());
      const label = (id: string) => bundle.model.targets.get(id)?.label ?? id;
      const rels = bundle.model.relationships.filter((r) => r.kind.startsWith('mermaid-'));
      if (PARSED.has(example)) expect(rels.length, 'parsed diagrams have relationships').toBeGreaterThan(0);
      for (const r of rels) expect(text).toContain(`${label(r.from)} --[${r.kind}; ${r.label}]--> ${label(r.to)}`);
      if (!PARSED.has(example)) {
        // Figure-level types: one figure target, no element targets, the source as text.
        expect([...bundle.model.targets.values()].filter((t) => isMermaidElement(t.kind))).toEqual([]);
        const sourceLine: Record<string, string> = { 'mermaid-er': 'CUSTOMER ||--o{ INVOICE', 'mermaid-class': 'WorkQueue <|.. BlockingQueue' };
        expect(text).toContain(sourceLine[example]);
      }
    });
  }
});

describe('Mermaid identity rules (§9.12)', () => {
  const doc = (body: string) => `---
format: visser/1
docId: 5b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e
title: Collision
kind: teaching
capturedAt: 2026-09-27T00:00:00Z
visibility: private
---

<!-- vs:id collide_overview -->
# Collision

${body}
`;
  const write = (text: string) => {
    const dir = mkdtempSync(join(tmpdir(), 'visser-mermaid-'));
    writeFileSync(join(dir, 'index.md'), text);
    return loadBundle(join(dir, 'index.md'));
  };
  const figure = (id: string, src: string) =>
    `{% mermaid id="${id}" title="Figure ${id}" question="What connects?" %}\n\`\`\`mermaid\n${src}\n\`\`\`\n{% /mermaid %}\n`;

  it('two figures that share a node name fail with E_ID_DUPLICATE', () => {
    const bundle = write(doc(figure('fig_one', 'flowchart LR\n  SharedApi --> OneDb') + '\n' + figure('fig_two', 'flowchart LR\n  SharedApi --> TwoDb')));
    expect(bundle.diagnostics.map((d) => d.code)).toContain('E_ID_DUPLICATE');
  });

  it('a Mermaid name that maps onto a marker ID fails with E_ID_DUPLICATE', () => {
    const bundle = write(doc(figure('fig_one', 'flowchart LR\n  Collide_Overview --> OtherNode')));
    expect(bundle.diagnostics.map((d) => d.code)).toContain('E_ID_DUPLICATE');
  });
});

// cli.test.ts rebuilds dist/release in parallel; copy a release whose files all
// match its release.json before running it.
function stableReleaseCopy(): string {
  const source = join(root, 'dist/release');
  const wait = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      const copy = join(mkdtempSync(join(tmpdir(), 'visser-release-')), 'release');
      cpSync(source, copy, { recursive: true });
      const manifest = JSON.parse(readFileSync(join(copy, 'release.json'), 'utf8')) as { files: Array<{ path: string; sha256: string }> };
      const intact = manifest.files.every((f) => existsSync(join(copy, f.path))
        && createHash('sha256').update(readFileSync(join(copy, f.path))).digest('hex') === f.sha256);
      if (intact) return copy;
    } catch {
      // The release is being rebuilt; try again.
    }
    wait(1000);
  }
  throw new Error('dist/release is missing or never stable; run `npm run build` first');
}

describe('release-level Mermaid parse (§9.12 shipping the parser)', () => {
  it('the bundled CLI in dist/release parses a Mermaid flowchart', () => {
    const release = stableReleaseCopy();
    const repo = mkdtempSync(join(tmpdir(), 'visser-mermaid-repo-'));
    mkdirSync(join(repo, '.git'));
    const docDir = join(repo, 'docs/explanations/cdn');
    cpSync(join(root, 'examples/mermaid-flowchart'), docDir, { recursive: true });
    const r = spawnSync(process.execPath, [join(release, 'bin/visser.cjs'), 'check', join(docDir, 'index.md'), '--json'], { cwd: repo, encoding: 'utf8', timeout: 120_000 });
    expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0);
    const report = JSON.parse(r.stdout) as { ok: boolean; targetCount: number };
    expect(report.ok).toBe(true);
    // Markers plus the figure plus its five Mermaid elements.
    expect(report.targetCount).toBeGreaterThanOrEqual(10);
  }, 180_000);
});
