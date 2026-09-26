import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSource } from '../../packages/core/src/syntax/index.ts';
import { buildTargetRecords } from '../../packages/core/src/model/targets.ts';
import { projectText } from '../../packages/core/src/model/project.ts';

const parsed = parseSource(new Uint8Array(readFileSync(new URL('../../examples/bounded-queue/index.md', import.meta.url))), 'index.md');
const model = buildTargetRecords(parsed);
const text = projectText(parsed);

describe('semantic Markdown projection (§7.6) @R01 @R14', () => {
  it('lists every target exactly once with an explain-text/1 ID line', () => {
    const ids = [...text.matchAll(/<!-- ex:target ([a-z][a-z0-9_-]*) -->/g)].map((m) => m[1]);
    expect(ids.sort()).toEqual([...model.targets.keys()].sort());
  });

  it('states every non-order relationship as a labelled tuple', () => {
    for (const r of model.relationships.filter((r) => r.kind !== 'order')) {
      const from = model.targets.get(r.from)!.label;
      const to = model.targets.get(r.to)!.label;
      expect(text).toContain(`${from} --[${r.kind}; ${r.label}]--> ${to}`);
    }
  });

  it('states trace partial order explicitly, not as observed sequence', () => {
    expect(text).toContain('Ordering, not duration.');
    for (const r of model.relationships.filter((r) => r.kind === 'order')) {
      const block = text.slice(text.indexOf(`<!-- ex:target ${r.to} -->`));
      expect(block.split('\n').find((l) => l.startsWith('after:'))).toContain(r.from);
    }
  });

  it('carries evidence references and the captured excerpt', () => {
    expect(text).toContain('Evidence: src_queue');
    expect(text).toContain('[cite: src_condition_docs]');
    expect(text).toContain('while len(self.items) >= self.capacity:');
    expect(text).toContain('availability: link-only');
  });

  it('is deterministic', () => {
    expect(projectText(parsed)).toBe(text);
  });
});
