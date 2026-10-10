// Catalogue guides (§9.1): each guide has the required sections, stays short,
// documents the attribute rules that the validator enforces, and has one
// template that checks with no errors. Code wins over prose: the attribute
// tables are compared with the catalogue schema, so a guide cannot drift.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { guideHeader, guideTemplate, PATTERNS, patternSchema } from '../../packages/core/src/catalogue/index.ts';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';

const DIR = new URL('../../skills/visser-visual-explain/references/catalogue/', import.meta.url).pathname;
const WRAPPER = [
  '---',
  'format: visser/1',
  'docId: 4f8ac70c-7e14-4f06-9865-e194f57c7239',
  'title: Catalogue template',
  'kind: reference',
  'capturedAt: 2026-09-27T00:00:00Z',
  'visibility: private',
  '---',
  '',
  '<!-- vs:id overview -->',
  '# Catalogue template',
  '',
  '',
].join('\n');

const COMMON = ['## Use it when', '## Do not use it when', '## Misleading example', '## Rules', '## Template', '## Diagnostics'];
const COMPONENT = ['## Tags and attributes', '## Narrow screens and text'];

const work = mkdtempSync(join(tmpdir(), 'visser-catalogue-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

/** Text outside fenced blocks. */
function prose(text: string): string {
  return text.replace(/^(`{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, '');
}

/** Rows of the attribute table: tag -> { required, optional }. */
function attributeTable(text: string): Map<string, { required: string[]; optional: string[] }> {
  const rows = new Map<string, { required: string[]; optional: string[] }>();
  for (const line of text.split('\n')) {
    const m = /^\| `([a-z-]+)` \| (.*) \| (.*) \|$/.exec(line);
    if (!m) continue;
    const names = (cell: string) => [...cell.matchAll(/`([A-Za-z0-9]+)`/g)].map((x) => x[1]!).sort();
    rows.set(m[1]!, { required: names(m[2]!), optional: names(m[3]!) });
  }
  return rows;
}

function errors(body: string): string[] {
  const dir = mkdtempSync(join(work, 't-'));
  writeFileSync(join(dir, 'index.md'), WRAPPER + body);
  return loadBundle(join(dir, 'index.md')).diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.code}: ${d.message}`);
}

describe('catalogue guides (§9.1) @R16', () => {
  it('every pattern has a guide, and no guide is orphaned', () => {
    for (const p of PATTERNS) expect(existsSync(join(DIR, `${p.name}.md`)), p.name).toBe(true);
    expect(PATTERNS.map((p) => p.name).sort()).toEqual(
      ['annotated', 'architecture', 'cause', 'compare', 'decision', 'domain', 'flowchart', 'measure', 'mermaid', 'note', 'plan', 'prose', 'self-check', 'state', 'steps', 'trace', 'transform', 'tree'],
    );
  });

  for (const pattern of PATTERNS) {
    describe(pattern.name, () => {
      const text = readFileSync(join(DIR, `${pattern.name}.md`), 'utf8');

      it('has a title, a question, and the required sections, and stays short', () => {
        const header = guideHeader(text);
        expect(header.question.endsWith('?')).toBe(true);
        for (const section of [...COMMON, ...(pattern.tag ? COMPONENT : [])]) expect(text, section).toContain(`\n${section}\n`);
        const words = prose(text).split(/\s+/).filter(Boolean).length;
        expect(words, `${pattern.name}: ${words} words outside fences`).toBeLessThanOrEqual(600);
      });

      it('has one template that checks with no errors and uses the pattern tags', () => {
        const template = guideTemplate(text);
        expect(errors(template)).toEqual([]);
        if (pattern.tag) {
          expect(template).toContain(`{% ${pattern.tag} `);
          if (pattern.mode) expect(template).toContain(`mode="${pattern.mode}"`);
          for (const child of pattern.children) expect(template, child).toContain(`{% ${child} `);
        }
      });

      if (pattern.tag) {
        it('documents exactly the attributes and enum values that the validator enforces', () => {
          const table = attributeTable(text);
          const schemas = new Map(patternSchema(pattern).map((schema) => [schema.tag, schema]));
          const tags = [pattern.tag!, ...pattern.children, ...(pattern.name === 'annotated' ? ['source'] : [])];
          expect([...table.keys()].sort()).toEqual([...tags].sort());
          for (const tag of tags) {
            const spec = schemas.get(tag)!;
            expect(table.get(tag)!.required, `${tag} required`).toEqual(Object.keys(spec.required).sort());
            expect(table.get(tag)!.optional, `${tag} optional`).toEqual(Object.keys(spec.optional).sort());
            for (const [name, values] of Object.entries(spec.enums ?? {})) {
              if (tag === 'graph' && name === 'mode') continue; // each guide covers one mode
              for (const value of values) expect(text, `${tag}.${name}=${value}`).toContain(`\`${value}\``);
            }
          }
        });
      }
    });
  }

  it('a broken template is caught: an unknown edge kind fails the check', () => {
    const template = guideTemplate(readFileSync(join(DIR, 'architecture.md'), 'utf8')).replace('kind="call"', 'kind="talks-to"');
    expect(errors(template).some((e) => e.startsWith('E_SYNTAX'))).toBe(true);
  });

  it('projects group attributes for the owning figure', () => {
    const architecture = patternSchema(PATTERNS.find((p) => p.name === 'architecture')!).find((schema) => schema.tag === 'group')!;
    const flowchart = patternSchema(PATTERNS.find((p) => p.name === 'flowchart')!).find((schema) => schema.tag === 'group')!;
    expect(architecture.optional).not.toHaveProperty('color');
    expect(flowchart.optional).toHaveProperty('color');
    expect(flowchart.enums.color).toEqual(['neutral', 'teal', 'violet', 'amber']);
  });
});
