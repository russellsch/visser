// The component catalogue (§9.1, §17.1 `catalogue list|show`). Each pattern
// has a guide in the toolkit at skills/visser-visual-explain/references/catalogue/NAME.md.
// The guide holds the prose and one `markdown visser-template` fence; the
// attribute rules come from the validator's TAG_SPECS, so they cannot drift.
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TAG_SPECS } from '../model/validate.ts';

export type CataloguePattern = {
  name: string;
  /** The top-level tag, with its graph mode when the tag is `graph`. */
  tag: string | null;
  mode?: string;
  /** Child tags, in the order the guide documents them. */
  children: readonly string[];
  /**
   * An escape hatch, not a catalogue answer (IMPROVEMENTS.md §6.2): listed
   * last, under a rule, and left out of the skill's component table.
   */
  escapeHatch?: true;
};

/** Every catalogue pattern, in reading order. `prose` has no component. The escape hatch (`mermaid`) is last. */
export const PATTERNS: readonly CataloguePattern[] = [
  { name: 'prose', tag: null, children: [] },
  { name: 'architecture', tag: 'graph', mode: 'architecture', children: ['group', 'node', 'edge'] },
  { name: 'domain', tag: 'domain', children: ['concept', 'relation'] },
  { name: 'trace', tag: 'trace', children: ['actor', 'event', 'branch'] },
  { name: 'state', tag: 'graph', mode: 'state', children: ['state', 'transition'] },
  { name: 'transform', tag: 'transform', children: ['stage', 'conversion'] },
  { name: 'cause', tag: 'graph', mode: 'cause', children: ['factor', 'causal-link'] },
  { name: 'compare', tag: 'compare', children: ['option', 'criterion', 'cell'] },
  { name: 'plan', tag: 'graph', mode: 'plan', children: ['task', 'dependency'] },
  { name: 'annotated', tag: 'annotated', children: ['annotation'] },
  // Components of IMPROVEMENTS.md §14, and the decision guide (§14.8), which has no tag.
  { name: 'measure', tag: 'measure', children: ['reading'] },
  { name: 'tree', tag: 'tree', children: ['entry'] },
  { name: 'steps', tag: 'steps', children: ['step'] },
  { name: 'note', tag: 'note', children: [] },
  { name: 'self-check', tag: 'self-check', children: [] },
  { name: 'decision', tag: null, children: [] },
  { name: 'mermaid', tag: 'mermaid', children: [], escapeHatch: true },
];

export type CatalogueEntry = { name: string; title: string; question: string; path: string };

export type TagSchema = {
  tag: string;
  required: Record<string, string>;
  optional: Record<string, string>;
  enums: Record<string, readonly string[]>;
  parents: readonly string[] | null;
};

export function catalogueDir(toolkitDir: string): string {
  return join(toolkitDir, 'skills', 'visser-visual-explain', 'references', 'catalogue');
}

export function findPattern(name: string): CataloguePattern | undefined {
  return PATTERNS.find((p) => p.name === name);
}

function readGuide(path: string): string {
  const stat = lstatSync(path);
  if (!stat.isFile()) throw new Error(`${path} is not a regular file`);
  return readFileSync(path, 'utf8');
}

/** Title (the H1) and question (the `**Question:**` line) of one guide. */
export function guideHeader(text: string): { title: string; question: string } {
  const title = /^# (.+)$/m.exec(text)?.[1]?.trim();
  const question = /^\*\*Question:\*\* (.+)$/m.exec(text)?.[1]?.trim();
  if (!title || !question) throw new Error('a catalogue guide needs a `# Title` line and a `**Question:**` line');
  return { title, question };
}

/** The single `markdown visser-template` fence of a guide, without its fence lines. */
export function guideTemplate(text: string): string {
  const lines = text.split('\n');
  const found: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const open = /^(`{3,})(.*)$/.exec(lines[i]!);
    if (!open) continue;
    const fence = open[1]!;
    const close = lines.findIndex((l, j) => j > i && l.startsWith(fence) && l.slice(fence.length).trim() === '');
    if (close === -1) throw new Error(`unclosed fence at line ${i + 1}`);
    const info = open[2]!.trim().split(/\s+/);
    if (info[0] === 'markdown' && info[1] === 'visser-template') found.push(lines.slice(i + 1, close).join('\n') + '\n');
    i = close;
  }
  if (found.length !== 1) throw new Error(`a catalogue guide needs exactly one visser-template fence, not ${found.length}`);
  return found[0]!;
}

/** The attribute rules of the pattern's tags, from the validator. */
export function patternSchema(pattern: CataloguePattern): TagSchema[] {
  const tags = [...(pattern.tag ? [pattern.tag] : []), ...pattern.children, ...(pattern.name === 'annotated' ? ['source'] : [])];
  return tags.map((tag) => {
    const spec = TAG_SPECS[tag];
    if (!spec) throw new Error(`no attribute rules for tag ${tag}`);
    return { tag, required: { ...spec.required }, optional: { ...spec.optional }, enums: { ...(spec.enums ?? {}) }, parents: spec.parents ?? null };
  });
}

/** Every guide present in the toolkit, in PATTERNS order with the escape hatches last. A missing guide is skipped. */
export function listCatalogue(toolkitDir: string): CatalogueEntry[] {
  const dir = catalogueDir(toolkitDir);
  const out: CatalogueEntry[] = [];
  for (const pattern of [...PATTERNS.filter((p) => !p.escapeHatch), ...PATTERNS.filter((p) => p.escapeHatch)]) {
    const path = join(dir, `${pattern.name}.md`);
    if (!existsSync(path)) continue;
    out.push({ name: pattern.name, ...guideHeader(readGuide(path)), path });
  }
  return out;
}

export function readPatternGuide(toolkitDir: string, name: string): { entry: CatalogueEntry; text: string } | undefined {
  if (!findPattern(name)) return undefined;
  const path = join(catalogueDir(toolkitDir), `${name}.md`);
  if (!existsSync(path)) return undefined;
  const text = readGuide(path);
  return { entry: { name, ...guideHeader(text), path }, text };
}
