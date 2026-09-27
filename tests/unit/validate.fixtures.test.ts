// Semantic fixture discovery (§18.8): fixtures/negative/<E_CODE>/semantic/<name>.md
// must produce exactly that error code through the full model and validator.
// (The syntax discovery test reads only .md files directly inside each code
// folder, so these subfolders are not part of it.)
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSource } from '../../packages/core/src/syntax/index.ts';
import { buildTargetRecords } from '../../packages/core/src/model/targets.ts';
import { validateDocument } from '../../packages/core/src/model/validate.ts';
import { projectText } from '../../packages/core/src/model/project.ts';

const ROOT = new URL('../../fixtures/', import.meta.url).pathname;

function analyze(text: string) {
  const parsed = parseSource(new TextEncoder().encode(text), 'index.md');
  const model = buildTargetRecords(parsed);
  const diagnostics = [...parsed.diagnostics, ...model.diagnostics, ...validateDocument(parsed, model)];
  return { parsed, model, diagnostics };
}

describe('semantic negative fixtures @R06 @R15', () => {
  const dir = join(ROOT, 'negative');
  const codes = readdirSync(dir).filter((code) => existsSync(join(dir, code, 'semantic'))).sort();
  it('covers the validator codes', () => {
    expect(codes).toEqual(expect.arrayContaining(['E_EVIDENCE_HASH', 'E_REF_BROKEN', 'E_SEMANTIC', 'E_SYNTAX']));
  });
  for (const code of codes) {
    for (const name of readdirSync(join(dir, code, 'semantic')).filter((f) => f.endsWith('.md')).sort()) {
      it(`${code}/semantic/${name}`, () => {
        const { diagnostics } = analyze(readFileSync(join(dir, code, 'semantic', name), 'utf8'));
        const errors = new Set(diagnostics.filter((d) => d.severity === 'error').map((d) => d.code));
        expect([...errors]).toEqual([code]);
      });
    }
  }
});

describe('positive family fixtures @R01 @R14', () => {
  const dir = join(ROOT, 'positive');
  for (const name of readdirSync(dir).filter((f) => f.startsWith('family-')).sort()) {
    const { parsed, model, diagnostics } = analyze(readFileSync(join(dir, name), 'utf8'));
    it(`${name} validates without diagnostics`, () => {
      expect(diagnostics).toEqual([]);
    });
    it(`${name} projects every target once and every relationship as a tuple`, () => {
      const text = projectText(parsed);
      const ids = [...text.matchAll(/<!-- vs:target ([a-z][a-z0-9_-]*) -->/g)].map((m) => m[1]);
      expect(ids.sort()).toEqual([...model.targets.keys()].sort());
      for (const r of model.relationships.filter((r) => r.kind !== 'order')) {
        const from = model.targets.get(r.from)!.label;
        const to = model.targets.get(r.to)!.label;
        expect(text).toContain(`${from} --[${r.kind}; ${r.label}]--> ${to}`);
      }
      for (const r of model.relationships.filter((r) => r.kind === 'order')) {
        const block = text.slice(text.indexOf(`<!-- vs:target ${r.to} -->`));
        expect(block.split('\n').find((l) => l.startsWith('after:'))).toContain(r.from);
      }
    });
  }

  it('the Appendix A example still validates cleanly', () => {
    const text = readFileSync(new URL('../../examples/bounded-queue/index.md', import.meta.url), 'utf8');
    expect(analyze(text).diagnostics).toEqual([]);
  });
});

describe('graph size caps (§2.3)', () => {
  const doc = (n: number, edges = 0) => {
    const nodes = Array.from({ length: n }, (_, i) => `{% node id="n${i}" label="N${i}" role="process" /%}`).join('\n');
    const links = Array.from({ length: edges }, (_, i) => `{% edge id="e${i}" from="n0" to="n1" kind="call" label="calls ${i}" /%}`).join('\n');
    return `---\nformat: visser/1\ndocId: 9c0c5e2a-9999-4a99-8a99-999999999999\ntitle: T\nkind: teaching\ncapturedAt: 2026-09-27T00:00:00Z\nvisibility: private\n---\n\n{% graph id="big" mode="architecture" title="T" question="Q?" %}\nI.\n\n${nodes}\n${links}\n{% /graph %}\n`;
  };
  it('warns above 25 nodes', () => {
    const codes = analyze(doc(26)).diagnostics.map((d) => `${d.severity}:${d.code}`);
    expect(codes).toEqual(['warning:W_VISUAL_DENSITY']);
  });
  it('fails above 200 nodes or 400 edges', () => {
    expect(analyze(doc(201)).diagnostics.map((d) => d.code)).toContain('E_LAYOUT_LIMIT');
    expect(analyze(doc(2, 401)).diagnostics.map((d) => d.code)).toContain('E_LAYOUT_LIMIT');
  });
});
