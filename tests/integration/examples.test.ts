import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { compileDocument } from '../../packages/core/src/compiler/index.ts';
import { projectText } from '../../packages/core/src/model/project.ts';

const root = new URL('../..', import.meta.url).pathname;
const examplesDir = join(root, 'examples');
const examples = readdirSync(examplesDir).filter((name) => existsSync(join(examplesDir, name, 'index.md'))).sort();
const toolkit = { version: '0.0.0-test', sha256: 'a'.repeat(64) };

describe('example bundles (§17.5) @R14', () => {
  it('includes one example per catalogue family, a cross-domain example, and a prose-first example', () => {
    expect(examples.length).toBeGreaterThanOrEqual(8);
    const kinds = new Set<string>();
    for (const name of examples) {
      const bundle = loadBundle(join(examplesDir, name, 'index.md'));
      for (const t of bundle.model.targets.values()) kinds.add(t.kind);
      for (const node of bundle.model.nodes.values()) {
        if (node.type === 'tag' && node.tag === 'graph' && typeof node.attributes['mode'] === 'string') kinds.add(`graph:${node.attributes['mode']}`);
      }
    }
    for (const kind of ['graph:architecture', 'graph:state', 'graph:cause', 'graph:plan', 'trace', 'transform', 'compare', 'annotated']) {
      expect(kinds, kind).toContain(kind);
    }
  });

  for (const name of examples) {
    describe(name, () => {
      const bundle = loadBundle(join(examplesDir, name, 'index.md'));

      it('loads without error diagnostics', () => {
        expect(bundle.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
        expect(bundle.sourceRevision).toMatch(/^[0-9a-f]{64}$/);
      });

      it('compiles without error diagnostics', async () => {
        const result = await compileDocument(bundle, toolkit, { audience: 'private', includeSource: false, layoutFallback: false });
        expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
        expect(result.files.map((f) => f.path.split('/').pop())).toContain('index.html');
      });

      it('projects every target once and every relationship tuple', () => {
        const text = projectText(bundle.parsed);
        const ids = [...text.matchAll(/<!-- ex:target ([a-z][a-z0-9_-]*) -->/g)].map((m) => m[1]!);
        expect(ids.sort()).toEqual([...bundle.model.targets.keys()].sort());
        for (const rel of bundle.model.relationships) {
          if (rel.kind === 'order') {
            const block = text.slice(text.indexOf(`<!-- ex:target ${rel.to} -->`));
            expect(block.split('\n').find((l) => l.startsWith('after:')), rel.id).toContain(rel.from);
            continue;
          }
          const from = bundle.model.targets.get(rel.from)!.label;
          const to = bundle.model.targets.get(rel.to)!.label;
          expect(text, rel.id).toContain(`${from} --[${rel.kind}; ${rel.label}]--> ${to}`);
        }
      });
    });
  }
});
