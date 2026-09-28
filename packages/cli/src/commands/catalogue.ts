// `visser catalogue list [--json]` and
// `visser catalogue show NAME [--part guide|template|schema] [--json]` (§9.1, §17.1).
// Reads the guides of the resolved toolkit (the same selection as `skill show`:
// --dev-toolkit, --doc, --toolkit-dir, the workspace or user default, then the
// running release). The attribute rules in `--part schema` come from the validator of
// the running CLI, which is the resolved toolkit's own CLI (§12.7). Read-only.
import { findPattern, listCatalogue, patternSchema, PATTERNS, readPatternGuide, guideTemplate } from '../../../core/src/catalogue/index.ts';
import { CliError, EXIT, type ParsedArgs, printJson, stringFlag } from '../cli-util.ts';
import { selectForSkill, type SkillOptions } from './skill.ts';

const USAGE = [
  'usage: visser catalogue list [--doc PATH] [--toolkit-dir DIR | --dev-toolkit DIR] [--json]',
  '       visser catalogue show NAME [--part guide|template|schema] [--doc PATH] [--toolkit-dir DIR | --dev-toolkit DIR] [--json]',
  `names: ${PATTERNS.map((p) => p.name).join(', ')}`,
].join('\n');

const PARTS = ['guide', 'template', 'schema'] as const;
type Part = (typeof PARTS)[number];

/**
 * The text form of `catalogue list`: one line per pattern with its question.
 * An escape hatch (`mermaid`) comes last, under a rule, with its title, so
 * that a reader does not take it for a catalogue answer (IMPROVEMENTS.md §6.2).
 */
function listText(entries: ReturnType<typeof listCatalogue>): string {
  const hatch = (name: string) => findPattern(name)?.escapeHatch === true;
  const main = entries.filter((e) => !hatch(e.name)).map((e) => `${e.name.padEnd(13)} ${e.question}\n`);
  const last = entries.filter((e) => hatch(e.name)).map((e) => `${e.name.padEnd(13)} ${e.title.replace(/ — .*$/, '')}: ${e.question}\n`);
  return [...main, ...(last.length > 0 && main.length > 0 ? [`${'-'.repeat(13)}\n`] : []), ...last].join('');
}

export async function runCatalogue(args: ParsedArgs, opts: SkillOptions = {}): Promise<number> {
  const [action, name, ...extra] = args.positional;
  const json = args.flags.has('json');
  if (action === 'list') {
    if (name !== undefined) throw new CliError('E_USAGE', USAGE, EXIT.invalid);
  } else if (action === 'show') {
    if (name === undefined || extra.length > 0) throw new CliError('E_USAGE', USAGE, EXIT.invalid);
    if (!findPattern(name)) throw new CliError('E_USAGE', `unknown catalogue pattern \`${name}\`\n${USAGE}`, EXIT.invalid);
  } else {
    throw new CliError('E_USAGE', USAGE, EXIT.invalid);
  }
  const part = (stringFlag(args, 'part') ?? 'guide') as Part;
  if (!PARTS.includes(part)) throw new CliError('E_USAGE', `--part must be guide, template, or schema\n${USAGE}`, EXIT.invalid);

  const found = selectForSkill(args, opts);
  const toolkit = { sha256: found.release.sha256, version: found.release.version, dir: found.release.dir };

  if (action === 'list') {
    const entries = listCatalogue(toolkit.dir);
    if (json) printJson('catalogue', { schema: 'visser-catalogue/1', toolkit, entries });
    else process.stdout.write(listText(entries) || 'this toolkit has no catalogue guides\n');
    return EXIT.ok;
  }

  const pattern = findPattern(name!)!;
  const guide = readPatternGuide(toolkit.dir, pattern.name);
  if (!guide) throw new CliError('E_TOOLKIT_MISSING', `toolkit ${toolkit.sha256} has no catalogue guide for ${pattern.name}`, EXIT.unavailable);
  let payload: { guide: string } | { template: string } | { tags: ReturnType<typeof patternSchema> };
  if (part === 'guide') payload = { guide: guide.text };
  else if (part === 'template') payload = { template: guideTemplate(guide.text) };
  else payload = { tags: patternSchema(pattern) };

  if (json) {
    printJson('catalogue', { schema: 'visser-catalogue/1', toolkit, entry: guide.entry, part, ...payload });
  } else if ('guide' in payload) {
    process.stdout.write(payload.guide.endsWith('\n') ? payload.guide : `${payload.guide}\n`);
  } else if ('template' in payload) {
    process.stdout.write(payload.template);
  } else {
    const lines: string[] = [];
    for (const t of payload.tags) {
      lines.push(`${t.tag}${t.parents ? ` (inside ${t.parents.length > 3 ? 'a component or entity' : t.parents.join(' or ')})` : ''}`);
      lines.push(`  required: ${Object.entries(t.required).map(([k, v]) => `${k} (${v})`).join(', ') || 'none'}`);
      lines.push(`  optional: ${Object.entries(t.optional).map(([k, v]) => `${k} (${v})`).join(', ') || 'none'}`);
      for (const [k, values] of Object.entries(t.enums)) lines.push(`  ${k}: ${values.join(' | ')}`);
    }
    process.stdout.write(`${lines.join('\n')}\n`);
  }
  return EXIT.ok;
}
