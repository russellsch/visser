// Minimal text edits to the frontmatter (§11.11): insert `retiredTargets`
// entries, and rewrite `docId` for a fork. The frontmatter is never
// reserialized; every edit is checked by parsing the result with the real YAML
// settings, validating it against the frontmatter schema, and comparing every
// other key with the original.
import { parseDocument, visit } from 'yaml';
import { HashError } from '../model/hash.ts';
import { validateAgainst } from '../model/schemas.ts';

export type RetiredEntry = { id: string; reason: string; replacement?: string };

const REASON_MAX = 200;

function fail(code: string, message: string): never {
  throw new HashError(code, code, message);
}

/** §11.11: a reason is at most 200 characters on one line, with no control characters. */
export function checkReason(reason: string): void {
  if (reason.length === 0) fail('E_USAGE', '--reason must not be empty');
  if (Array.from(reason).length > REASON_MAX) fail('E_USAGE', `--reason is longer than ${REASON_MAX} characters`);
  // C0, DEL, C1, and the Unicode line and paragraph separators all break "one line".
  if (/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(reason)) fail('E_USAGE', '--reason must be one line with no control characters');
  if (/[\ud800-\udfff]/.test(reason.replace(/[\ud800-\udbff][\udc00-\udfff]/g, ''))) fail('E_USAGE', '--reason contains a lone surrogate');
}

type Frontmatter = {
  bom: string;
  newline: string;
  lines: string[]; // frontmatter content lines, between the two `---` lines
  before: string; // text up to and including the opening `---` line ending
  after: string; // text from the closing `---` line to the end
};

function splitFrontmatter(text: string): Frontmatter {
  const bom = text.startsWith('\ufeff') ? '\ufeff' : '';
  const body = text.slice(bom.length);
  const newline = body.includes('\r\n') ? '\r\n' : '\n';
  const all = body.split(newline);
  if (all[0] !== '---') fail('E_SYNTAX', 'the document has no frontmatter');
  let close = -1;
  for (let i = 1; i < all.length; i++) {
    if (all[i] === '---') {
      close = i;
      break;
    }
  }
  if (close < 0) fail('E_SYNTAX', 'the frontmatter is not closed');
  return {
    bom,
    newline,
    lines: all.slice(1, close),
    before: bom + '---' + newline,
    after: all.slice(close).join(newline),
  };
}

function joinFrontmatter(fm: Frontmatter): string {
  return fm.before + (fm.lines.length > 0 ? fm.lines.join(fm.newline) + fm.newline : '') + fm.after;
}

/** Parse frontmatter content with the adapter's YAML settings (§5.2). */
function parseYaml(lines: string[]): Record<string, unknown> {
  const doc = parseDocument(lines.join('\n'), { schema: 'core', uniqueKeys: true, merge: false, prettyErrors: false });
  if (doc.errors.length > 0) fail('E_SYNTAX', `the edited frontmatter does not parse: ${doc.errors[0]!.message.split('\n')[0]}`);
  let alias = false;
  visit(doc, { Alias: () => { alias = true; return visit.BREAK; } });
  if (alias) fail('E_SYNTAX', 'the frontmatter uses YAML aliases');
  const value = doc.toJS({ maxAliasCount: 0 }) as unknown;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('E_SYNTAX', 'the frontmatter is not a mapping');
  return value as Record<string, unknown>;
}

const TOP_LEVEL_KEY = /^([A-Za-z_][A-Za-z0-9_-]*):(.*)$/;

function isTopLevel(line: string): boolean {
  return line.length > 0 && !/^[\s#]/.test(line);
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Check the edited frontmatter: parses, validates, and every key except `changed` is unchanged. */
function checkEdit(before: Record<string, unknown>, afterLines: string[], changed: string, expected: unknown): Record<string, unknown> {
  const after = parseYaml(afterLines);
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (key === changed) continue;
    if (!sameJson(before[key], after[key])) fail('E_SEMANTIC', `the frontmatter edit changed \`${key}\`; nothing was written`);
  }
  if (!sameJson(after[changed], expected)) fail('E_SEMANTIC', `the frontmatter edit did not produce the expected \`${changed}\`; nothing was written`);
  const schema = validateAgainst('frontmatter', after);
  if (!schema.ok) fail('E_SEMANTIC', `the edited frontmatter is not valid: ${schema.errors.join('; ')}`);
  return after;
}

/** JSON quoting keeps IDs such as `null`, `true`, and `on` strings in YAML. */
function entryLines(entry: RetiredEntry): string[] {
  const lines = [`  ${JSON.stringify(entry.id)}:`, `    reason: ${JSON.stringify(entry.reason)}`];
  if (entry.replacement !== undefined) lines.push(`    replacement: ${JSON.stringify(entry.replacement)}`);
  return lines;
}

/**
 * Insert `retiredTargets` entries with a minimal text edit (§11.11). The
 * existing mapping must be a top-level block mapping with two-space
 * indentation; any other shape is refused rather than rewritten.
 */
export function insertRetiredTargets(text: string, entries: RetiredEntry[]): string {
  if (entries.length === 0) return text;
  for (const entry of entries) checkReason(entry.reason);
  const fm = splitFrontmatter(text);
  const before = parseYaml(fm.lines);
  const existing = (before['retiredTargets'] ?? {}) as Record<string, unknown>;
  for (const entry of entries) {
    if (Object.hasOwn(existing, entry.id)) fail('E_SEMANTIC', `${entry.id} is already retired`);
  }
  const expected: Record<string, unknown> = { ...existing };
  for (const entry of entries) {
    expected[entry.id] = entry.replacement === undefined ? { reason: entry.reason } : { reason: entry.reason, replacement: entry.replacement };
  }
  const added = entries.flatMap(entryLines);

  const keyIndex = fm.lines.findIndex((line) => TOP_LEVEL_KEY.exec(line)?.[1] === 'retiredTargets');
  let lines: string[];
  if (keyIndex < 0) {
    lines = [...fm.lines, 'retiredTargets:', ...added];
  } else {
    const rest = TOP_LEVEL_KEY.exec(fm.lines[keyIndex]!)![2]!.trim();
    if (rest !== '' && !rest.startsWith('#')) {
      fail('E_SEMANTIC', 'rewrite `retiredTargets` in block style (one `  ID:` entry per line); retire does not edit other YAML shapes');
    }
    // The block runs until the next top-level line.
    let end = keyIndex + 1;
    while (end < fm.lines.length && !isTopLevel(fm.lines[end]!)) end++;
    const content = fm.lines.slice(keyIndex + 1, end).map((line, i) => ({ line, at: keyIndex + 1 + i }))
      .filter(({ line }) => line.trim() !== '' && !line.trim().startsWith('#'));
    if (content.length > 0 && !/^ {2}\S/.test(content[0]!.line)) {
      fail('E_SEMANTIC', 'rewrite `retiredTargets` in block style with two-space indentation; retire does not edit other YAML shapes');
    }
    const insertAt = content.length > 0 ? content[content.length - 1]!.at + 1 : keyIndex + 1;
    lines = [...fm.lines.slice(0, insertAt), ...added, ...fm.lines.slice(insertAt)];
  }
  checkEdit(before, lines, 'retiredTargets', expected);
  return joinFrontmatter({ ...fm, lines });
}

/** Rewrite the frontmatter `docId` value in place (fork, §11.5). */
export function rewriteDocId(text: string, docId: string): string {
  const fm = splitFrontmatter(text);
  const before = parseYaml(fm.lines);
  const indexes = fm.lines.map((line, i) => (TOP_LEVEL_KEY.exec(line)?.[1] === 'docId' ? i : -1)).filter((i) => i >= 0);
  if (indexes.length !== 1) fail('E_SEMANTIC', 'the frontmatter must have exactly one top-level `docId` line');
  const lines = [...fm.lines];
  // Replace only the value token: keep its quote style and any trailing comment.
  const line = fm.lines[indexes[0]!]!;
  const value = /^(docId:[ \t]*)(["']?)([0-9A-Fa-f-]+)\2(.*)$/.exec(line);
  lines[indexes[0]!] = value ? `${value[1]}${value[2]}${docId}${value[2]}${value[4]}` : `docId: ${docId}`;
  checkEdit(before, lines, 'docId', docId);
  return joinFrontmatter({ ...fm, lines });
}
